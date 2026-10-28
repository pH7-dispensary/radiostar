// Explicit operator maintenance for a previously acquired, licensed audio
// variant. No model calls, listener grants, or public audio distribution.
import assert from 'node:assert/strict';
import {readFileSync,createReadStream,statSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {LocalStore} from '../persistence.mjs';
import {RightsRegistry} from '../rights-registry.mjs';
import {AdminService} from '../admin-service.mjs';
import {IntelligenceTestMode} from '../intelligence-test-mode.mjs';
import {IntelligencePolicyRegistry} from '../intelligence-policy.mjs';
import {SkipService} from '../skip-service.mjs';
import {verifyAdSkipAudio} from '../ad-skip-verification.mjs';
import {episodeKey} from '../episode-pipeline.mjs';
import {fetchPublicText} from '../safe-network.mjs';
import {verifyReviewChain} from '../ad-skip-corpus.mjs';

const [action,specPath,audioPath]=process.argv.slice(2);
assert(['stage','verify'].includes(action) && specPath && audioPath,'Use stage|verify <spec.json> <exact-audio-file>');
const identity=JSON.parse(execFileSync('aws',['sts','get-caller-identity','--region','eu-west-2','--output','json'],{encoding:'utf8'}));
assert.equal(identity.Account,'208096650030');
const spec=JSON.parse(readFileSync(specPath)),hash=createHash('sha256');
for await(const part of createReadStream(audioPath))hash.update(part);
assert.equal(hash.digest('hex'),spec.audioContentHash);assert.equal(statSync(audioPath).size,spec.contentLength);
assert.equal(spec.transcript.audioContentHash,spec.audioContentHash);
assert.equal(spec.transcript.complete,false,'This importer only supports bounded source evidence');
assert(spec.transcript.coverageStartMs===0 && spec.transcript.coverageEndMs<=180000 && spec.durationMs<=7200000);
verifyReviewChain(spec.events || []);
const store=new LocalStore('/var/lib/starcast/backend.sqlite'),rights=new RightsRegistry(store),admin=new AdminService(store),mode=new IntelligenceTestMode(store),policy=new IntelligencePolicyRegistry(store);
const key=episodeKey(spec.feedUrl,spec.episodeId),actor={id:identity.Arn,role:'SUPER_ADMIN',name:'Authenticated AWS maintenance operator'};
try {
 if(action==='stage') {
  assert(!store.get('skip-source',key),'Existing source must be reviewed before replacement');
  // Use the existing evidence/permissions engine. Require a publisher-issued
  // licence fetched now, not an operator statement of ownership.
  assert.equal(spec.licenceUrl,'https://creativecommons.org/licenses/by-sa/4.0/');
  const evidence=await fetchPublicText(spec.permissionEvidence);
  const text=typeof evidence==='string'?evidence:evidence.text;
  assert(/Our shows are licensed under/i.test(text) && /Creative Commons BY-SA 4\.0/.test(text),'Publisher licence not found');
  const evidenceHash=createHash('sha256').update(text).digest('hex');
  store.transaction(()=>{
   const previous=rights.resolve(spec.feedUrl,spec.episodeId);
   rights.approveProcessing({feedUrl:spec.feedUrl,episodeId:spec.episodeId,publisher:spec.publisher,podcast:'Licensed podcast audio evaluation',episodeTitle:spec.title,classification:'LICENSED',basisType:'PUBLISHER_LICENCE',legalBasis:'Publisher-issued CC BY-SA 4.0; private source-aligned advert evaluation. Original attribution and licence retained.',reason:'Replay licensed source through the private Ad Skip pilot; machine evidence remains separate from human annotation.',confirmation:'APPROVE & PROCESS',evidenceReference:spec.permissionEvidence,evidenceIssuer:spec.publisher,authorityConfirmed:true,selectedFeatures:['transcription','advertisements'],territories:['WORLDWIDE'],expectedAssessmentRevision:rights.assessmentRevision(spec.feedUrl,spec.episodeId)},{actor:actor.id});
   const source={feedUrl:spec.feedUrl,episodeId:spec.episodeId,audioUrl:spec.audioUrl,episode:{id:spec.episodeId,feedUrl:spec.feedUrl,audioUrl:spec.audioUrl,title:spec.title},state:'READY',attempts:0,transcript:spec.transcript,importedAt:new Date().toISOString(),provenance:{publisher:spec.publisher,sourcePage:spec.sourcePage,licence:spec.licence,licenceUrl:spec.licenceUrl,evidenceReference:spec.permissionEvidence,evidenceHash}};
   store.set('skip-source',key,source);
   admin.appendAudit({actor,action:'licensed-ad-audio-source-imported',resource:key,previousState:previous,newState:{audioContentHash:spec.audioContentHash,evidenceHash,coverageEndMs:spec.transcript.coverageEndMs},reason:'Existing licensed audio and local machine transcript reused. No independent review or acoustic verification inferred.'});
  });
  console.log(JSON.stringify({staged:true,audioContentHash:spec.audioContentHash,sourceKey:key,modelCostUsd:0}));
 } else {
  assert(mode.adSkipPreparationAllowed(),'An active separately authorised pilot is required');
  const allowed=()=>mode.adSkipPreparationAllowed() && policy.allows(spec.feedUrl,spec.episodeId,'adCandidates').allowed && ['intelligence-processing','audio-transcription','ad-detection'].every(feature=>rights.evaluate({feature,feedUrl:spec.feedUrl,episodeId:spec.episodeId}).allowed);
  const service=new SkipService(store,{status:()=>store.get('intelligence',key),rights},{canVerifyAudio:allowed,verifyAudio:verifyAdSkipAudio});
  const bucket='starcast-phase1-208096650030-eu-west-2',objectKey=`seed/ad-skip-p0/${spec.audioContentHash}.mp3`;
  const head=JSON.parse(execFileSync('aws',['s3api','head-object','--bucket',bucket,'--key',objectKey,'--region','eu-west-2','--output','json'],{encoding:'utf8'}));
  assert.equal(head.ContentLength,spec.contentLength);
  const checkDirectory=mkdtempSync(join(tmpdir(),'starcast-source-proof-'));
  try {
   const path=join(checkDirectory,'object.mp3');
   execFileSync('aws',['s3api','get-object','--bucket',bucket,'--key',objectKey,'--if-match',head.ETag,'--region','eu-west-2',path],{stdio:'pipe'});
   const digest=createHash('sha256');for await(const bytes of createReadStream(path))digest.update(bytes);
   assert.equal(digest.digest('hex'),spec.audioContentHash,'The pinned S3 representation must match the entire hash-bound source');
  } finally {rmSync(checkDirectory,{recursive:true});}
  const preparedAudio={path:audioPath,durationMs:spec.durationMs,delivery:{url:`https://${bucket}.s3.eu-west-2.amazonaws.com/${objectKey}`,headers:{contentLength:spec.contentLength,etag:head.ETag}}};
  service.inspect(spec.feedUrl,spec.episodeId,{preparedAudio});await Promise.all(service.inflight.values());
  const status=service.inspect(spec.feedUrl,spec.episodeId);
  assert.equal(status.verifiedCount,1,JSON.stringify(status));
  const verification=service.verification(key),current=store.all('skip-interval').map(([,v])=>v).filter(v=>v.episodeKey===key&&v.verificationState==='VERIFIED'&&!v.disputed);
  assert(allowed());
  const checked=await verifyAdSkipAudio({audioUrl:spec.audioUrl,expectedContentHash:spec.audioContentHash,preparedAudio,candidates:current,maxSeconds:7200});
  assert(allowed() && checked.state==='READY' && checked.variant.windows.length,'Exact stream witnesses are required for this large cached source');
  for(const row of current)assert(checked.candidates.some(c=>c.id===row.id&&c.boundaryVerified&&c.startMs===row.startMs&&c.endMs===row.endMs),'Reverification must preserve the approved exact interval');
  store.set('skip-audio-verification',key,{...verification,variant:{...checked.variant,privateCache:{bucket,key:objectKey}}});
  admin.appendAudit({actor,action:'ad-source-audio-verified',resource:key,newState:{audioContentHash:spec.audioContentHash,verified:status.verifiedCount},reason:'Exact cached source and measured acoustic boundary; human annotation is used only when actually present.'});
  console.log(JSON.stringify({status,verification:service.verification(key)}));
 }
}finally{store.close();}
