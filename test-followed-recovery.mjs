import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { LocalStore } from "./persistence.mjs";
import { BudgetLedger, PROCESSING_VERSION } from "./openai-intelligence.mjs";
import { EpisodePipeline, episodeKey } from "./episode-pipeline.mjs";
import { FollowedPreparation } from "./followed-preparation.mjs";
import { IntelligenceTestMode } from "./intelligence-test-mode.mjs";
import { RightsRegistry } from "./rights-registry.mjs";
import { assessTranscript } from "./transcripts.mjs";

const store = new LocalStore(":memory:"), feedUrl = "https://owned.example/feed";
const rights = new RightsRegistry(store), ledger = new BudgetLedger({ enabled: true }, store);
rights.set({ feedUrl, classification: "LICENSED", legalBasis: "Owned regression fixture", assessmentEvidence: [{ type: "OWNED", source: "test author", scope: "podcast", value: "fixture:phase2" }],
  canAcquireTranscript: true, canProcessForAi: true, canTranscribeAudio: true, canRetain: true, canDisplayDerivedIntelligence: true, canGenerateBrief: true, canGenerateChapters: true });
store.set("installation", "user", { id: "user" });
store.set("follow", "follow", { owner: "user", feedUrl });
let variant = "original", publisherCalls = 0, paidAudioCalls = 0, textCalls = 0, inspected = 0;
const episodes = () => ['cached','publisher','fallback'].map((id,i) => ({ id, title: id, showName: 'Owned fixture', audioUrl: `https://owned.example/${id}-${variant}.mp3`, duration: '60', publishedAt: `2026-01-0${3-i}T00:00:00Z`, refs: id === 'publisher' ? [{url:'https://owned.example/transcript.vtt',type:'text/vtt'}] : [] }));
const segments = [{id:'s1',startMs:0,endMs:60000,text:'Original fixture speech about reliable podcast analysis and careful source references explains the distinction between evidence and presentation. This source is owned by the test author.'}];
const transcript = { segments, sourceType:'publisher_rss', sourceUri:'https://owned.example/transcript.vtt', transcriptVersion:'v1', quality:assessTranscript({segments}) };
const testingMode = new IntelligenceTestMode(store), queued = [];
const pipeline = new EpisodePipeline({ store, ledger, rights, testingMode, enabled:true, configured:true, audioEnabled:true,
  queue:{enqueue:async job=>queued.push(job)}, resolveEpisode:async(_feed,id)=>episodes().find(e=>e.id===id),
  fetchTranscript:async()=>{publisherCalls++;return transcript;},
  audioFactory:async url=>({durationMs:60000,contentHash:createHash('sha256').update(url).digest('hex'),chunkFactory:async()=>Buffer.from('mock audio'),cleanup:async()=>{}}),
  onTranscriptReady:async()=>{inspected++;},
  client:{audio:{transcriptions:{create:async()=>{paidAudioCalls++;return {segments:[{start:0,end:60,text:segments[0].text}]};}}},responses:{create:async()=>{textCalls++;return {output_text:JSON.stringify({overview:segments[0].text,detail:segments[0].text,themes:['Evidence'],sourceSegmentIndexes:[1],chapters:[{title:'Evidence',description:'Original fixture speech about reliable podcast analysis and careful source references explains the distinction between evidence and presentation.',sourceSegmentIndexes:[1]}]}),usage:{input_tokens:100,output_tokens:100}};}}},
});
const prep = new FollowedPreparation({ store, pipeline, ledger, rights, testingMode, discover:async()=>episodes(), assess:async(_feed,id)=>({episode:episodes().find(e=>e.id===id)}), enabled:()=>true, allowed:()=>true, inspect:()=>{} });
const variantHash = id => createHash('sha256').update(episodes().find(e=>e.id===id).audioUrl).digest('hex');
store.set('transcript',`${episodeKey(feedUrl,'cached')}:${variantHash('cached')}`,transcript);
try {
  let summary = await prep.refresh({force:true});
  assert.equal(summary.acquisition.transcriptCacheHits,1);
  assert.equal(summary.acquisition.publisherReferencesUnverified,1);
  assert.equal(summary.acquisition.publisherTranscriptsFound,0,'references are not successful acquisition');
  assert.equal(summary.acquisition.requiringAudio,1);
  assert.equal(summary.estimate.knownUsd,0.042,'fallback cost included for unverified publisher source');
  prep.action({action:'activate',expectedVersion:0,confirmation:'CONFIRM',reason:'fixture'},{id:'test',role:'SUPER_ADMIN',source:'session'});
  for(let i=0;i<3;i++){await prep.drain();for(const job of queued.splice(0)) {await pipeline.executeQueued(job);await pipeline.executeQueued(job);}}
  summary=prep.summary();assert.equal(summary.counts.READY,3);assert.equal(paidAudioCalls,1);assert.equal(publisherCalls,1);assert.equal(textCalls,3);assert(inspected>=3);
  assert.equal(summary.acquisition.publisherTranscriptsFound,1);assert.equal(summary.estimate.knownUsd,0);
  await prep.refresh({force:true});await prep.drain();assert.equal(queued.length,0);
  variant='replacement';summary=await prep.refresh({force:true});
  assert(summary.rows.every(r=>r.sourceNeedsRefresh),'changed enclosure requires variant/source recheck');
  assert.equal(summary.acquisition.intelligenceCacheHits,0);
  assert.equal(summary.acquisition.transcriptCacheHits,0,'old variant cannot satisfy new audio');
  assert.equal(summary.counts.DISCOVERED,3);
  // Check the existing SQS recovery path, bounded backoff and unknown paid outcomes.
  const key=episodeKey(feedUrl,'fallback'), completed=pipeline.status(feedUrl,'fallback');
  const failed={...completed,state:'FAILED',code:'PROVIDER_TIMEOUT',retryable:true,platformProcessing:true,completedAt:new Date(Date.now()-180000).toISOString(),processingVersion:PROCESSING_VERSION};
  store.set('intelligence',key,failed);
  await pipeline.recoverQueued();assert.equal(queued.length,1);assert.equal(queued[0].jobId,failed.jobId,'resume same durable job');
  await pipeline.recoverQueued();assert.equal(queued.length,1,'redelivery does not duplicate outbox');queued.length=0;
  store.set('intelligence',key,{...failed,completedAt:new Date().toISOString()});await pipeline.recoverQueued();assert.equal(queued.length,0,'backoff prevents hot retry');
  store.set('intelligence',key,{...failed,recoveries:2});await pipeline.recoverQueued();assert.equal(queued.length,0,'retry cap');
  store.set('intelligence',key,{...failed,code:'PROVIDER_OUTCOME_UNKNOWN'});await pipeline.recoverQueued();assert.equal(queued.length,0,'unknown paid outcome never replayed');
  store.set('intelligence',key,{...failed,state:'BLOCKED',code:'BUDGET_LIMIT',resumeAfter:new Date(0).toISOString()});
  assert.equal(prep.summary().rows.find(r=>r.key===key).state,'BUDGET_PAUSED');
  store.set('intelligence',key,{...failed,state:'PROCESSING',completedAt:null,processingStage:'TRANSCRIBING',work:{completedChunks:1,totalChunks:2}});
  const progress=prep.summary().rows.find(r=>r.key===key);assert.equal(progress.state,'TRANSCRIBING');assert.equal(progress.work.completedChunks,1);assert.equal(progress.queuePosition,null);
  store.set('intelligence',key,failed);
  pipeline.client.audio.transcriptions.create=async()=>{paidAudioCalls++;return {segments:[]};};
  await pipeline.request({feedUrl,episodeId:'fallback',allowAudio:true,retry:true,trigger:'admin'});
  await pipeline.executeQueued(queued.at(-1));
  const invalid=pipeline.status(feedUrl,'fallback');assert.equal(invalid.code,'TRANSCRIPT_VALIDATION_FAILED');assert.equal(invalid.retryable,false);
  const paidBefore=paidAudioCalls;await pipeline.recoverQueued();assert.equal(paidAudioCalls,paidBefore,'invalid saved results are not blindly purchased again');
  queued.length=0;
  store.set('intelligence',key,{...failed,transcript:undefined,processingStage:'TRANSCRIBING',code:'ANALYSIS_FAILED',recoveries:2});
  await pipeline.recoverQueued();assert.equal(queued.length,1,'known pre-fix assembly failure gets one checkpoint-based repair');
  const repaired=store.get('intelligence',key);assert.equal(repaired.recoveries,2,'ordinary retry cap not reset');
  queued.length=0;store.set('intelligence',key,{...repaired,state:'FAILED',processingStage:'TRANSCRIBING',code:'ANALYSIS_FAILED',completedAt:new Date(0).toISOString()});
  await pipeline.recoverQueued();assert.equal(queued.length,0,'software repair cannot replay indefinitely');
} finally {store.close();}
console.log('Followed cache/publisher/audio handoff, variant safety, measured progress, SQS redelivery, bounded technical recovery and uncertain-outcome protection passed.');
