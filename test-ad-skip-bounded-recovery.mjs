import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { acquireAudioPrefix, prepareAdAudioWindow, AD_WINDOW_MAX_BYTES } from './bounded-audio.mjs';
import { prepareAdSkipOpening } from './ad-skip-source.mjs';
import { verifyAdSkipAudio } from './ad-skip-verification.mjs';
import { SkipService } from './skip-service.mjs';
import { LocalStore } from './persistence.mjs';
import { BudgetLedger, defaultControls } from './openai-intelligence.mjs';
import { transcribeOnDemand } from './transcription.mjs';
import { matchDeliveredPrefix } from './native/src/deliveredAudioProof.mjs';
import { EpisodePipeline, episodeKey } from './episode-pipeline.mjs';
import { RightsRegistry } from './rights-registry.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpeg from 'ffmpeg-static';

const directory = await mkdtemp(join(tmpdir(),'starcast-bounded-test-'));
const digest = b => createHash('sha256').update(b).digest('hex');
const url='https://owned.example/four-hour.mp3',feed='https://owned.example/feed.xml';
let sequence=0;
try {
  const bounded = async ({status=206,headers={},chunks=[Buffer.alloc(16,3)],maxBytes=16,signal}={}) => {
    const response=Readable.from(chunks); response.statusCode=status; response.headers=headers;
    const path=join(directory,`range-${sequence++}`);
    const result=await acquireAudioPrefix(url,path,{maxBytes,signal,openStream:async(u,_n,_trail,options)=>{
      assert.equal(u,url);assert.equal(options.range,`bytes=0-${maxBytes-1}`);return {response,url};
    }});
    assert(response.destroyed);assert((await readFile(path)).length<=maxBytes);return result;
  };
  const ranged=await bounded({headers:{'content-range':'bytes 0-15/500000000','content-length':'16'}});
  assert.equal(ranged.bytes,16);assert.equal(ranged.delivery.acquisition.rangeHonoured,true);
  assert.equal(ranged.contentHash,digest(Buffer.alloc(16,3)));
  const ignored=await bounded({status:200,headers:{'content-length':'500000000'},chunks:[Buffer.alloc(10,1),Buffer.alloc(10,1),Buffer.alloc(10,1)]});
  assert.equal(ignored.bytes,16);assert.equal(ignored.delivery.acquisition.streamingFallback,true);
  assert.equal((await bounded({status:200,headers:{},chunks:[Buffer.alloc(32,2)]})).bytes,16,'unknown length remains capped');
  assert.equal((await bounded({headers:{'content-range':'bytes 0-15/*'}})).bytes,16);
  assert.equal((await bounded({headers:{'content-range':'bytes 0-15/16','etag':'W/"weak"'}})).completeSource,true);
  for(const headers of [{'content-range':'bytes 1-16/99'},{'content-range':'bytes 0-16/99'},{'content-range':'bytes 0-15/99','content-length':'999'},{'content-range':'bytes 0-15/99','content-encoding':'gzip'}]) await assert.rejects(bounded({headers}));
  await assert.rejects(bounded({headers:{'content-range':'bytes 0-15/99'},chunks:[Buffer.alloc(8)]}),/interrupted/);
  const aborted=new AbortController();aborted.abort();await assert.rejects(bounded({signal:aborted.signal}),/abort/i);
  const fixture=await readFile('fixtures/ad-skip-owned-v1.mp3'),hash=digest(fixture);
  const acquired=await prepareAdAudioWindow(url,{acquire:async(_url,path)=>{
    await writeFile(path,fixture);return {contentHash:hash,bytes:fixture.length,completeSource:true,delivery:{url,headers:{contentLength:fixture.length}}};
  }});
  assert.equal(acquired.windowProof.byteLength,fixture.length);assert(acquired.durationMs>49000&&acquired.durationMs<51000);
  const proof=await verifyAdSkipAudio({audioUrl:url,expectedContentHash:hash,preparedAudio:acquired,maxSeconds:14400,
    candidates:[{id:'break',startMs:15000,endMs:35000},{id:'outside',startMs:49000,endMs:55000}]});
  assert.equal(proof.state,'READY');assert.equal(proof.variant.etag,null);assert.equal(proof.variant.windowProof.sha256,hash);
  assert(proof.candidates[0].boundaryVerified);assert.equal(proof.candidates[1].boundaryVerified,false);
  assert.equal((await verifyAdSkipAudio({audioUrl:url,expectedContentHash:'f'.repeat(64),preparedAudio:acquired,candidates:[]})).state,'DYNAMIC_VARIANT');
  const native={match:async(bytes,sha)=>bytes===fixture.length&&sha===hash,current:()=>true};
  assert.equal(await matchDeliveredPrefix(proof.variant,native),hash);
  assert.equal(await matchDeliveredPrefix(proof.variant,{...native,match:async()=>false}),null);
  let active=true;assert.equal(await matchDeliveredPrefix(proof.variant,{match:async()=>{active=false;return true;},current:()=>active}),null,'source switch during proof fails closed');
  assert.equal(await matchDeliveredPrefix({...proof.variant,windowProof:{...proof.variant.windowProof,byteLength:AD_WINDOW_MAX_BYTES+1}},native),null);
  assert.equal(await matchDeliveredPrefix({...proof.variant,audioVariantFingerprint:'a'.repeat(64)},native),null);
  const vbrPath=join(directory,'owned-vbr.mp3');
  await promisify(execFile)(ffmpeg,['-nostdin','-v','error','-stream_loop','3','-i','fixtures/ad-skip-owned-v1.mp3','-t','200','-c:a','libmp3lame','-q:a','4',vbrPath],{timeout:30000});
  const vbrBytes=await readFile(vbrPath);
  assert(vbrBytes.length<AD_WINDOW_MAX_BYTES);
  const vbr=await prepareAdAudioWindow(url,{acquire:async(_url,path)=>{await writeFile(path,vbrBytes);return {bytes:vbrBytes.length,contentHash:digest(vbrBytes),completeSource:true,delivery:{url,headers:{}}};}});
  assert(vbr.windowProof.byteLength<vbrBytes.length,'A complete low-bitrate source still gets an exact opening-only prefix');
  assert.equal(vbr.windowProof.coverageEndMs,180000);assert.equal(vbr.contentHash,digest(vbrBytes.subarray(0,vbr.windowProof.byteLength)));
  await vbr.cleanup();
  const store=new LocalStore(':memory:');
  let preparations=0,release;
  const transcript={segments:[{id:'opening',startMs:0,endMs:10000,text:'Welcome to an ordinary editorial discussion.'}],transcriptVersion:'owned',audioContentHash:hash,audioVariant:hash,durationMs:acquired.durationMs};
  const pipeline={status:()=>null,rights:{evaluate:({feature})=>({allowed:feature!=='intelligence-processing'})}};
  const options={canVerifyAudio:()=>true,prepareSource:async()=>{preparations++;await new Promise(r=>release=r);return {transcript,preparedAudio:{cleanup:async()=>{}}};}};
  const first=new SkipService(store,pipeline,options),second=new SkipService(store,pipeline,options);
  first.inspect(feed,'over-four-hours',{episode:{id:'over-four-hours',audioUrl:url,duration:18001}});
  second.inspect(feed,'over-four-hours');await new Promise(r=>setImmediate(r));assert.equal(preparations,1,'atomic cross-service source deduplication');
  release();await Promise.all(first.sourceInflight.values());
  assert(first.inspect(feed,'over-four-hours').transcriptAvailable);assert.equal(first.source(feed,'over-four-hours').episode.audioUrl,url);
  assert.equal(store.all('intelligence').length,0,'no Brief/Chapters/Search prerequisite');
  assert.equal(store.all('skip-source').length,1);
  const blocked=new SkipService(store,{status:()=>null,rights:{evaluate:()=>({allowed:false,code:'TAKEDOWN'})}},options);
  assert.equal(blocked.inspect(feed,'restricted',{episode:{audioUrl:url}}).code,'TAKEDOWN');assert.equal(preparations,1);
  let failureCalls=0;
  const failure=new SkipService(store,pipeline,{canVerifyAudio:()=>true,prepareSource:async()=>{
    failureCalls++;throw Object.assign(Error('Provider outcome is unknown.'),{code:'PROVIDER_OUTCOME_UNKNOWN'});
  }});
  failure.inspect(feed,'uncertain',{episode:{audioUrl:url}});await Promise.all(failure.sourceInflight.values());
  assert.equal(failure.inspect(feed,'uncertain').state,'FAILED');
  const afterRestart=new SkipService(store,pipeline,{canVerifyAudio:()=>true,clock:()=>Date.now()+86400000,prepareSource:async()=>{failureCalls++;}});
  afterRestart.inspect(feed,'uncertain');await Promise.all(afterRestart.sourceInflight.values());assert.equal(failureCalls,1,'uncertain provider outcomes are never repaid automatically');
  const blockedWindow=new SkipService(store,pipeline,{prepareSource:async()=>{throw Error('must not acquire');},canVerifyAudio:()=>({allowed:false,code:'FEATURE_NOT_AUTHORISED',reason:'Bounded transcription is not permitted.'})});
  assert.equal(blockedWindow.inspect(feed,'no-audio-permission',{episode:{audioUrl:url}}).code,'FEATURE_NOT_AUTHORISED');

  // Real registry feature separation: ad-only evidence does not grant general
  // intelligence, captions or voice rights, and an explicit restriction wins.
  const rights=new RightsRegistry(store);
  rights.set({feedUrl:feed,episodeId:'ad-only',classification:'LICENSED',assessmentStatus:'APPROVED',explicitAuthorisation:true,
    licence:'Owned fixture: bounded internal audio and advert detection only',assessmentEvidence:[{type:'OWNED',source:'owned test fixture',value:'Fixture owner authorises only bounded transcription and advert detection'}],
    canTranscribeAudio:true,canRetain:true,canDetectAdvertisements:true,canProcessForAi:false,canDisplayCaptions:false});
  assert(rights.evaluate({feedUrl:feed,episodeId:'ad-only',feature:'ad-detection'}).allowed);
  assert(rights.evaluate({feedUrl:feed,episodeId:'ad-only',feature:'audio-transcription'}).allowed);
  assert(!rights.evaluate({feedUrl:feed,episodeId:'ad-only',feature:'intelligence-processing'}).allowed);

  // Reusing an exact cached window is free even with no provider budget.
  const cacheLedger=new BudgetLedger({enabled:false},store), origin=episodeKey(feed,'cache-owner');
  store.set('skip-window-transcript',hash,{transcript:{...transcript,windowProof:acquired.windowProof,coverageStartMs:0,coverageEndMs:acquired.windowProof.coverageEndMs},origins:[origin]});
  const reused=await prepareAdSkipOpening({feedUrl:feed,episodeId:'cache-reader',audioUrl:url,ledger:cacheLedger,store,authorised:()=>true,
    audioFactory:async()=>({...acquired,cleanup:async()=>{}}),transcribe:async()=>{throw Error('Cache reuse must not call a paid provider.');}});
  assert(reused.cacheReused);assert(store.get('skip-window-transcript',hash).origins.includes(episodeKey(feed,'cache-reader')));
  EpisodePipeline.prototype.purgeEpisode.call({store},feed,'cache-owner');
  assert.equal(store.get('skip-window-transcript',hash),null,'rights removal deletes shared derivative cache');
  await acquired.cleanup();store.close();

  // A four-hour canonical job pauses at the unchanged THREE-hour daily budget,
  // then resumes durable chunks on the next budget day without paying twice.
  const database=join(directory,'resume.sqlite');let checkpoints=new LocalStore(database),ledger=new BudgetLedger({enabled:true},checkpoints);
  assert.deepEqual([ledger.controls.maxEpisodeSeconds,ledger.controls.dailyUsd,ledger.controls.monthlyUsd,ledger.controls.dailyTranscriptionSeconds],[14400,5,25,10800]);
  let calls=0;
  const run=()=>transcribeOnDemand({episodeId:'four-hours',audioUrl:url,durationMs:14400000,ledger,authorised:true,requestId:'four-hour-standard',checkpointStore:checkpoints,checkpointPrefix:'four-hour-source',chunkFactory:async()=>Buffer.from('mock'),client:{audio:{transcriptions:{create:async()=>{calls++;return {segments:[{start:0,end:5,text:'Owned fixture speech about durable evidence, correct global timestamps and preserving source references during a long podcast discussion.'}]};}}}}});
  await assert.rejects(run(),/daily transcription duration budget/);assert.equal(calls,9);assert.equal(ledger.totals().transcriptionSeconds,10800);
  assert.equal(ledger.reservations.size,0);checkpoints.close();checkpoints=new LocalStore(database);ledger=new BudgetLedger({enabled:true},checkpoints);
  const prior=checkpoints.get('budget','ledger');prior.usage=prior.usage.map(row=>({...row,at:new Date(Date.now()-86400000).toISOString()}));checkpoints.set('budget','ledger',prior);
  const result=await run();assert.equal(calls,13);assert.equal(result.durationMs,14400000);assert(result.segments.at(-1).startMs>14000000);
  const before=calls;await run();assert.equal(calls,before,'completed checkpoints are reused');assert.equal(ledger.reservations.size,0);
  assert.equal(defaultControls.maxEpisodeSeconds,14400);checkpoints.close();

  const jobStore=new LocalStore(':memory:'),jobLedger=new BudgetLedger({enabled:true},jobStore),jobRights=new RightsRegistry(jobStore);
  jobRights.set({feedUrl:feed,classification:'LICENSED',assessmentStatus:'APPROVED',explicitAuthorisation:true,
    licence:'Owned fixture processing',assessmentEvidence:[{type:'OWNED',source:'owned test fixture',value:'All fixture analysis and display authorised'}],
    canAcquireTranscript:true,canProcessForAi:true,canDisplayDerivedIntelligence:true,canRetain:true,canRegenerate:true,canTranscribeAudio:true});
  let jobCalls=0,downloads=0;
  const words='Owned fixture explains durable processing and bounded audio chunks. Source evidence remains attached to original timing while completed work is reused after restart. Budgets remain server authoritative and rights remain independently enforced.';
  const job=new EpisodePipeline({store:jobStore,ledger:jobLedger,rights:jobRights,enabled:true,configured:true,audioEnabled:true,
    resolveEpisode:async()=>({id:'four-hour-job',duration:14400,audioUrl:url,refs:[]}),
    audioFactory:async(_url,ceiling)=>{assert.equal(ceiling,14400);downloads++;return {durationMs:14400000,contentHash:'d'.repeat(64),cleanup:async()=>{},chunkFactory:async part=>({span:(part.endMs-part.startMs)/1000})};},
    client:{audio:{transcriptions:{create:async({file})=>{jobCalls++;return {segments:[{start:0,end:file.span,text:words}]};}}},
      responses:{create:async()=>({output_text:JSON.stringify({overview:words,detail:words,themes:['Durable processing'],sourceSegmentIndexes:[1],chapters:[{title:'Durable processing',description:words,sourceSegmentIndexes:[1]}]}),usage:{input_tokens:1,output_tokens:1}})}}});
  jobStore.set('intelligence',episodeKey(feed,'four-hour-job'),{feedUrl:feed,episodeId:'four-hour-job',jobId:'old-two-hour-limit',state:'BLOCKED',code:'DURATION_LIMIT',durationPolicySeconds:7200,attempts:0,transcriptChecks:{publisherTranscriptChecked:true}});
  await job.request({feedUrl:feed,episodeId:'four-hour-job',trigger:'automatic',platformProcessing:true,allowAudio:true});
  await Promise.all(job.inflight.values());
  assert.equal(jobCalls,9,'the pipeline admits four-hour sources and pauses after three standard-budget hours');
  assert.equal(job.status(feed,'four-hour-job').code,'BUDGET_LIMIT');
  const used=jobStore.get('budget','ledger');used.usage=used.usage.map(row=>({...row,at:new Date(Date.now()-86400000).toISOString()}));jobStore.set('budget','ledger',used);
  const paused=jobStore.get('intelligence',episodeKey(feed,'four-hour-job'));jobStore.set('intelligence',episodeKey(feed,'four-hour-job'),{...paused,resumeAfter:new Date(Date.now()-1000).toISOString()});
  await job.request({feedUrl:feed,episodeId:'four-hour-job',trigger:'automatic',platformProcessing:true,allowAudio:true});await Promise.all(job.inflight.values());
  assert.equal(jobCalls,13);assert.equal(downloads,2,'a resumed full transcript reacquires source identity but reuses paid chunks');
  assert.equal(job.status(feed,'four-hour-job').state,'READY');
  assert.equal(jobLedger.reservations.size,0);jobStore.close();
  console.log('Bounded range/streaming acquisition, weak/missing ETag, exact delivered-prefix proof, variants, source switching, transcript independence, atomic claims, restrictions and four-hour standard-budget restart passed.');
} finally {await rm(directory,{recursive:true,force:true});}
