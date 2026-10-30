// Read-only production inputs; all processing records live in an isolated store.
// Run from the deployed application root with <database> <spec.json>.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const root=process.cwd();
const {LocalStore}=await import(root+'/persistence.mjs');
const {RightsRegistry}=await import(root+'/rights-registry.mjs');
const {episodeKey}=await import(root+'/episode-pipeline.mjs');
const {SkipService}=await import(root+'/skip-service.mjs');
const {prepareAdAudioWindow}=await import(root+'/bounded-audio.mjs');
const {prepareProgressiveAudioWindow}=await import(root+'/progressive-audio.mjs');
const {verifyAdSkipAudio}=await import(root+'/ad-skip-verification.mjs');
const {signedAdSkipVariant}=await import(root+'/ad-skip-source.mjs');
const spec=JSON.parse(readFileSync(process.argv[3])),db=new DatabaseSync(process.argv[2],{readOnly:true}),store=new LocalStore(':memory:');
let acquired;
try {
 const get=(kind,id)=>{const row=db.prepare('SELECT payload FROM records WHERE kind=? AND id=?').get(kind,id);return row?JSON.parse(row.payload):null;};
 for(const row of db.prepare("SELECT kind,id,payload FROM records WHERE kind LIKE 'rights%'").all())store.set(row.kind,row.id,JSON.parse(row.payload));
 const key=episodeKey(spec.feedUrl,spec.episodeId),source=get('skip-source',key),verification=get('skip-audio-verification',key);
 assert.equal(source.transcript.audioContentHash,spec.parentAudioContentHash);
 assert.equal(verification.variant.audioVariantFingerprint,spec.parentAudioContentHash);
 const rights=new RightsRegistry(store);
 for(const feature of ['audio-transcription','ad-detection'])assert(rights.evaluate({...spec,feature}).allowed,`Existing ${feature} permission required`);
 const variant=await signedAdSkipVariant(verification.variant,{bucket:verification.variant.privateCache.bucket});
 acquired=await prepareAdAudioWindow(variant.deliveryUrl);
 assert.equal(acquired.contentHash,spec.prefixSha256,'Actual acquired bytes must equal the locally pinned parent prefix');
 assert(acquired.delivery.acquisition.bytes<=8*1024*1024);
 const transcript={...source.transcript,audioContentHash:acquired.contentHash,audioVariant:acquired.contentHash,windowProof:acquired.windowProof,
  durationMs:acquired.durationMs,provenance:{...source.transcript.provenance,parentAudioContentHash:spec.parentAudioContentHash}};
 const service=new SkipService(store,{status:()=>null,rights},{prepareSource:async()=>({transcript,preparedAudio:{...acquired,cleanup:async()=>{}}}),
  verifyAudio:verifyAdSkipAudio,canVerifyAudio:({operation})=>['ad-detection',...(operation==='transcribe-window'?['audio-transcription']:[])].every(feature=>rights.evaluate({...spec,feature}).allowed)});
 service.inspect(spec.feedUrl,spec.episodeId,{episode:{...source.episode,audioUrl:source.audioUrl}});
 await Promise.all(service.sourceInflight.values());
 const status=service.inspect(spec.feedUrl,spec.episodeId);
 const intervals=status.intervals.filter(v=>v.verificationState==='VERIFIED');
 assert.equal(store.all('intelligence').length,0);assert.equal(status.state,'READY');assert.equal(intervals.length,1);
 assert.deepEqual({startMs:intervals[0].startMs,endMs:intervals[0].endMs},spec.expectedInterval);
 const progressive=[];
 if(spec.progressive) {
   let cursor=acquired.cursor;
   for(let index=0;index<spec.progressive.windows;index++) {
     const window=await prepareProgressiveAudioWindow(variant.deliveryUrl,{cursor});
     try {
       assert(window.delivery.acquisition.bytes<=8*1024*1024);
       progressive.push({acquisition:window.delivery.acquisition,proof:window.windowProof});
       cursor=window.cursor;
     } finally {await window.cleanup();}
   }
   const last=progressive.at(-1).proof;
   assert.equal(last.sha256,spec.progressive.sha256);
   assert.equal(last.chainHash,spec.progressive.chainHash);
   assert.equal(last.byteEnd,spec.progressive.byteEnd);
 }
 console.log(JSON.stringify({at:new Date().toISOString(),deployedRuntime:true,productionDataModified:false,canonicalIntelligenceRequired:false,
  cachedSourceTranscriptReused:true,rightsAllowed:true,paidCalls:0,modelCostUsd:0,acquisition:acquired.delivery.acquisition,windowProof:acquired.windowProof,intervals,progressive}));
} finally {await acquired?.cleanup();store.close();db.close();}
