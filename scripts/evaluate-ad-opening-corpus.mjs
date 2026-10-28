// Reuse pinned audio and local ASR. Machine proposals never modify reviews.json.
import assert from 'node:assert/strict';
import {readFile,writeFile,copyFile,stat,readdir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {LocalStore} from '../persistence.mjs';
import {SkipService} from '../skip-service.mjs';
import {verifyAdSkipAudio} from '../ad-skip-verification.mjs';
import {corpusDirectory,currentReviews,verifyReviewChain} from '../ad-skip-corpus.mjs';
const root=corpusDirectory(),asrRoot=process.argv[2];assert(asrRoot,'Supply the directory of source-hashed machine opening transcripts.');
const apply=process.argv.includes('--prepare-review');
const verifyAudio=process.argv.includes('--verify-audio');
const outputArgument=process.argv.indexOf('--output');
const outputPath=outputArgument<0?'evals/ad-skip-generalisation-phase2.json':process.argv[outputArgument+1];
assert(outputPath&&!outputPath.startsWith('--'),'Supply a path after --output.');
const manifest=JSON.parse(await readFile(join(root,'manifest.json'))),events=JSON.parse(await readFile(join(root,'reviews.json')));verifyReviewChain(events);
const reviewDigest=createHash('sha256').update(await readFile(join(root,'reviews.json'))).digest('hex');
const baselinePath=join(root,'manifest-before-source-openings.json');
if(apply){try{await stat(baselinePath);}catch(e){if(e.code!=='ENOENT')throw e;await copyFile(join(root,'manifest.json'),baselinePath);}}
const baseline=await readFile(baselinePath,'utf8').then(JSON.parse).catch(()=>manifest);
const rows=[],queue=[],durations=[],windowEvaluations=[];
for(const ep of manifest.episodes){
 const h=createHash('sha256');for await(const b of createReadStream(join(root,ep.audioPath)))h.update(b);assert.equal(h.digest('hex'),ep.audioContentHash);
 const raw=await readFile(join(asrRoot,ep.id+'.json'),'utf8'),transcript=JSON.parse(raw);
 assert.equal(transcript.audioContentHash,ep.audioContentHash);assert.equal(transcript.independent,false);assert(transcript.coverageEndMs<=180000);
 const store=new LocalStore(':memory:'),service=new SkipService(store,{status:()=>({state:'TRANSCRIPT_READY',episode:{audioUrl:ep.audioUrl},transcript})},{canVerifyAudio:()=>verifyAudio,verifyAudio:verifyAudio?verifyAdSkipAudio:null});
 const t=performance.now();service.inspect(ep.feedUrl,ep.episodeId,verifyAudio?{preparedAudio:{path:join(root,ep.audioPath),durationMs:transcript.durationMs,delivery:{url:ep.audioUrl,headers:{}}}}:{});const analysisMs=performance.now()-t;durations.push(analysisMs);
 await Promise.all(service.inflight.values());
 const verification=service.verification((await import('../episode-pipeline.mjs')).episodeKey(ep.feedUrl,ep.episodeId));
 const candidates=store.all('skip-interval').map(([,v])=>({...v,evaluationOrigin:'hash-bound-opening',independent:false,audioContentHash:ep.audioContentHash,transcriptAlignment:'HASH_BOUND_MACHINE_OPENING',reviewStatus:'UNREVIEWED'})).filter(v=>v.type==='advert');store.close();
 const previous=baseline.episodes.find(e=>e.id===ep.id).candidates;
 const complete=candidates.filter(c=>c.openingBreak),review=currentReviews(events,ep);
 rows.push({id:ep.id,audioContentHash:ep.audioContentHash,baselineCandidates:previous.length,machineOpeningCandidates:candidates.length,completeOpeningProposals:complete.map(c=>({id:c.id,startMs:c.startMs,endMs:c.endMs,proposedEndMs:c.proposedEndMs,verificationState:c.verificationState,approvalSource:c.approvalSource,acousticPause:c.acousticPause,independent:false})),humanLabels:review.labels.length,fullEpisodeReviewed:review.complete,analysisMs,verificationMs:verification?.verificationDurationMs,coverage:{startMs:0,endMs:transcript.coverageEndMs},candidateEvidence:candidates.map(c=>({id:c.id,startMs:c.startMs,endMs:c.endMs,openingBreak:c.openingBreak,reviewOnly:c.reviewOnly,confidence:c.confidence,decisionReason:c.decisionReason}))});
 for(const c of complete){if(review.labels.some(l=>l.kind==='advert'&&l.startMs===0&&Math.abs(l.endMs-c.endMs)<=1500))continue;
  queue.push({id:ep.id,rank:previous.some(c=>c.type==='advert'&&c.startMs<180000)?2:1,priorityReason:'Optional quality review',audioContentHash:ep.audioContentHash,startMs:0,endMs:Math.min(transcript.coverageEndMs,c.nextSpeechMs+8000),proposedStartMs:c.startMs,proposedEndMs:c.endMs,candidateIds:[c.id],question:'Optional: inspect the sponsor closing and editorial transition. Routine processing does not wait for this review.',independent:false,status:'OPTIONAL_REVIEW',automaticState:c.verificationState});
 }
 if(!complete.length)queue.push({id:ep.id,rank:candidates.length?3:4,priorityReason:candidates.length?'Uncertain complete boundary':'Potential negative example',audioContentHash:ep.audioContentHash,startMs:0,endMs:Math.min(120000,transcript.coverageEndMs),candidateIds:candidates.map(c=>c.id),question:'Optional quality review. Insufficient machine evidence leaves this window unskipped without requiring an owner action.',independent:false,status:'OPTIONAL_REVIEW'});
 if(apply){await writeFile(join(root,ep.id+'-opening.json'),raw,{mode:0o600});ep.openingTranscriptHash=createHash('sha256').update(raw).digest('hex');ep.openingCoverageEndMs=transcript.coverageEndMs;ep.candidates=[...ep.candidates.filter(c=>c.evaluationOrigin!=='hash-bound-opening'),...candidates];ep.reviewWindows=[...ep.reviewWindows.filter(w=>w.evaluationOrigin!=='hash-bound-opening'),...queue.filter(q=>q.id===ep.id).map(q=>({...q,evaluationOrigin:'hash-bound-opening',reason:q.question}))];}
}
queue.sort((a,b)=>a.rank-b.rank||a.id.localeCompare(b.id));
const windowsArgument=process.argv.indexOf('--windows');
if(windowsArgument>=0){
 const directory=process.argv[windowsArgument+1],files=(await readdir(directory)).filter(n=>/^[a-z0-9-]+\.json$/.test(n));assert(files.length<=20);
 for(const name of files){const raw=await readFile(join(directory,name),'utf8'),t=JSON.parse(raw),ep=manifest.episodes.find(e=>e.audioContentHash===t.audioContentHash);assert(ep && t.independent===false && t.coverageEndMs-t.coverageStartMs<=300000);
  const store=new LocalStore(':memory:'),engine=new SkipService(store,{status:()=>({state:'TRANSCRIPT_READY',episode:{audioUrl:ep.audioUrl},transcript:t})});const start=performance.now();engine.inspect(ep.feedUrl,ep.episodeId);const analysisMs=performance.now()-start;const candidates=store.all('skip-interval').map(([,v])=>({...v,evaluationOrigin:'hash-bound-window',independent:false,audioContentHash:ep.audioContentHash,transcriptAlignment:'HASH_BOUND_MACHINE_WINDOW',reviewStatus:'UNREVIEWED'})).filter(c=>c.type==='advert');store.close();
  windowEvaluations.push({id:ep.id,audioContentHash:ep.audioContentHash,startMs:t.coverageStartMs,endMs:t.coverageEndMs,candidates:candidates.map(c=>({id:c.id,startMs:c.startMs,endMs:c.endMs,reviewOnly:c.reviewOnly})),analysisMs,independent:false});
  if(apply){const path='review-'+name;await writeFile(join(root,path),raw,{mode:0o600});ep.reviewTranscripts=[...(ep.reviewTranscripts||[]).filter(w=>w.path!==path),{path,sha256:createHash('sha256').update(raw).digest('hex'),startMs:t.coverageStartMs,endMs:t.coverageEndMs}];ep.candidates=[...ep.candidates.filter(c=>!(c.evaluationOrigin==='hash-bound-window'&&c.startMs>=t.coverageStartMs&&c.endMs<=t.coverageEndMs)),...candidates];}
 }
}
if(apply){const previous=JSON.parse(await readFile(join(root,'review-clips.json'),'utf8'));await writeFile(join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');await writeFile(join(root,'review-clips.json'),JSON.stringify([...queue,...previous.filter(q=>q.startMs>=180000)],null,2)+'\n');}
assert.equal(createHash('sha256').update(await readFile(join(root,'reviews.json'))).digest('hex'),reviewDigest,'Human annotations must remain byte-identical');
const result={at:new Date().toISOString(),sourceHashesVerified:rows.length,baselineCandidates:rows.reduce((n,r)=>n+r.baselineCandidates,0),machineOpeningCandidates:rows.reduce((n,r)=>n+r.machineOpeningCandidates,0),completeOpeningProposals:rows.reduce((n,r)=>n+r.completeOpeningProposals.length,0),humanLabels:rows.reduce((n,r)=>n+r.humanLabels,0),fullyReviewedEpisodes:rows.filter(r=>r.fullEpisodeReviewed).length,corpusPrecision:null,corpusRecall:null,falsePositiveRate:null,reason:'One independent interval label; no complete episode labels. Machine-only proposals cannot establish accuracy.',processingCostUsd:0,model:'local faster-whisper/base.en',analysisP95Ms:durations.sort((a,b)=>a-b)[Math.ceil(durations.length*.95)-1],nodePeakRssKiB:process.resourceUsage().maxRSS,reviewAuditSha256:reviewDigest,reviewQueue:queue,episodes:rows};
result.windowEvaluations=windowEvaluations;
await writeFile(outputPath,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({episodes:rows.length,baselineCandidates:result.baselineCandidates,openingCandidates:result.machineOpeningCandidates,completeProposals:result.completeOpeningProposals,humanLabels:result.humanLabels,reviewItems:queue.length,analysisP95Ms:result.analysisP95Ms}));
