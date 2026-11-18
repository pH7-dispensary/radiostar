import assert from 'node:assert/strict';
import {LocalStore} from './persistence.mjs';
import {BudgetLedger,PROCESSING_VERSION,generateLongFormIntelligence} from './openai-intelligence.mjs';
import {reviewClaims,validateClaims,claimBinding,claimsForResult,GROUNDING_VERSION} from './claim-grounding.mjs';
import {transcribeOnDemand,planAudioSegments,prepareAudio,initialiseAudioStaging,AUDIO_STAGING_VERSION} from './transcription.mjs';
import {mkdtemp,mkdir,writeFile,readdir,utimes,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import ffmpeg from 'ffmpeg-static';
import {EpisodePipeline,episodeKey} from './episode-pipeline.mjs';
import {SemanticSearch,DIMENSIONS} from './semantic-search.mjs';
import {featureExecution} from './intelligence-delivery.mjs';
import {discoverPublisherTranscriptRefs} from './transcripts.mjs';
import {parseFeed} from './catalogue-feed.mjs';

const store=new LocalStore(':memory:'),ledger=new BudgetLedger({enabled:true},store);
const text='Original fixture discussion explains reliable global timestamps, durable checkpoints, independent feature delivery and strict shared spending controls.';
const feedUrl='https://owned.example/engine.xml',episodeId='engine',key=episodeKey(feedUrl,episodeId);
let calls=0,progress;
const options={episodeId,audioUrl:'https://owned.example/engine.mp3',durationMs:2401000,authorised:true,ledger,checkpointStore:store,checkpointPrefix:'engine:hash',requestId:'engine:audio',
  chunkFactory:async part=>({part}),client:{audio:{transcriptions:{create:async({file})=>{calls++;return {segments:[{start:0,end:Math.min(10,(file.part.endMs-file.part.startMs)/1000),text}]};}}}},onProgress:p=>{progress=p;}};
try {
  await assert.rejects(transcribeOnDemand({...options,shouldYield:()=>true}),e=>e.code==='PROCESSING_YIELD');
  assert.equal(calls,2);assert.equal(progress.nextChunkSeconds,3);
  assert.equal(store.all('transcription-checkpoint').filter(([,r])=>r.state==='READY').length,2);
  // Only three seconds remain; a fixed 1,200-second preflight must not block it.
  ledger.reserve({id:'other-work',usd:.8397,kind:'transcription',seconds:8397});ledger.reconcile('other-work',{usd:.8397,seconds:8397});
  assert.equal(ledger.capacity({usd:.0003,seconds:3,kind:'transcription'}).available,true);
  await transcribeOnDemand(options);assert.equal(calls,3);assert.equal(progress.completedChunks,3);
  assert.equal(ledger.totals().transcriptionSeconds,10800);
  const wait=ledger.capacity({usd:.0001,seconds:1,kind:'transcription'});
  assert.equal(wait.reason,'DAILY_AUDIO');assert.equal(new Date(wait.resumeAfter).getUTCHours(),0);
  assert.equal(ledger.capacity({usd:.0001,seconds:1,kind:'transcription'},Date.parse(wait.resumeAfter)).available,true);
  assert.equal(featureExecution({state:'BLOCKED',code:'BUDGET_LIMIT',resumeAfter:wait.resumeAfter}).transcript.state,'WAITING_FOR_CAPACITY');
  const partial=featureExecution({state:'FAILED',retryable:true,featureStatus:{brief:{state:'READY'},chapters:{state:'PARTIAL_READY'}}});
  assert.equal(partial.brief.state,'READY');assert.equal(partial.chapters.completeness,'PARTIAL');assert.equal(partial.topics.state,'RETRY_SCHEDULED');
  const plans=planAudioSegments({durationMs:14400000});
  assert.equal(plans.length,13);assert.equal(plans.at(-1).endMs,14400000);
  assert(plans.slice(1).every((p,i)=>plans[i].endMs-p.startMs===1000));
  assert.equal(plans.reduce((n,p)=>n+(p.endMs-p.startMs)/1000,0),14412);
}finally{store.close();}

// Known rejected calls can retry; transport uncertainty cannot be repurchased.
for(const status of [429,undefined]) {
 const s=new LocalStore(':memory:'),l=new BudgetLedger({enabled:true},s);let attempted=0;
 try {
  const o={...options,durationMs:60000,ledger:l,checkpointStore:s,checkpointPrefix:'rejection:hash',client:{audio:{transcriptions:{create:async()=>{attempted++;if(attempted===1)throw Object.assign(Error('provider unavailable'),{status});return{segments:[{start:0,end:60,text}]};}}}}};
  await assert.rejects(transcribeOnDemand(o),e=>e.code===(status===429?'PROVIDER_RATE_LIMIT':'PROVIDER_OUTCOME_UNKNOWN'));
  if(status===429){assert.equal(l.usage.length,0);await transcribeOnDemand(o);assert.equal(attempted,2);assert.equal(l.usage.length,1);}
  else{await assert.rejects(transcribeOnDemand(o),e=>e.code==='PROVIDER_OUTCOME_UNKNOWN');assert.equal(attempted,1);assert.equal(l.usage[0].uncertain,true);}
 }finally{s.close();}
}

// No followed audience is needed to finish already accepted indexing work.
const s=new LocalStore(':memory:'),l=new BudgetLedger({enabled:true},s);
try {
 const pipeline=new EpisodePipeline({store:s,ledger:l,queue:{enqueue:async()=>{}},enabled:true,configured:true,resolveEpisode:async()=>({})});
 const t={episodeId,transcriptVersion:'v1',segments:[{id:'s1',text,startMs:0,endMs:60000}],quality:{readiness:'FULL'}};
 s.set('intelligence',key,{feedUrl,episodeId,episode:{feedUrl,id:episodeId},jobId:'accepted',state:'PARTIAL_READY',completedAt:new Date().toISOString(),platformProcessing:true,processingVersion:PROCESSING_VERSION,transcript:t});
 const semantic=new SemanticSearch({store:s,requests:{canPersist:()=>true}});let embedded=0;
 semantic.embed=async texts=>{embedded++;return texts.map(()=>Array(DIMENSIONS).fill(.25));};pipeline.semanticSearch=semantic;
 await pipeline.recoverQueued();assert.equal(s.get('semantic-index',key).state,'READY');assert.equal(embedded,1);
 await pipeline.recoverQueued();assert.equal(embedded,1,'completed index must not repeat paid embedding');
 const index=s.get('search-index',key);s.delete('semantic-index',key);
 semantic.embed=async()=>{throw Object.assign(Error('budget'),{code:'BUDGET_LIMIT',capacity:{resumeAfter:'2099-01-01T00:00:00Z'}});};
 await assert.rejects(semantic.build(index,{key}));assert.equal(s.get('semantic-index',key).executionState,'WAITING_FOR_CAPACITY');
 await pipeline.recoverQueued();assert.equal(pipeline.status(feedUrl,episodeId).featureStatus.search.state,'READY','lexical search survives semantic capacity wait');
}finally{s.close();}
console.log('Engine capacity tail/rollover, four-hour coverage, fair checkpoint yield, rate-limit/unknown outcome, independent feature persistence and audience-independent index recovery passed.');

const page='https://publisher.example/episode';
const refs=await discoverPublisherTranscriptRefs(page,{fetchText:async(url,limit)=>{assert.equal(limit,512000);return {url,text:'<a href="/ccdn?filename=/episode.srt">Download subtitles</a><a href="https://127.0.0.1/private.vtt">Transcript</a><a href="/episode.txt">Transcript</a><a href="/about">Transcription policy</a><a href="/random.vtt">Unrelated</a>'};}});
assert.deepEqual(refs.map(r=>r.type),['application/x-subrip','text/plain']);
assert.equal(refs[0].discoveredFrom,page);
const parsed=parseFeed('<rss><channel><title>Owned</title><item><guid>one</guid><title>One</title><link>'+page+'</link><enclosure url="https://publisher.example/one.mp3" type="audio/mpeg" /></item></channel></rss>',feedUrl);
assert.equal(parsed.episodes[0].webUrl,page);assert.equal(parsed.episodes[0].duration,'');

const probeStore=new LocalStore(':memory:'),probeLedger=new BudgetLedger({enabled:true},probeStore);
try {
 let probed=0,paid=0;
 const pipeline=new EpisodePipeline({store:probeStore,ledger:probeLedger,enabled:true,configured:true,audioEnabled:true,
  resolveEpisode:async()=>({id:'unknown-duration',duration:'',audioUrl:'https://owned.example/missing-duration.mp3',refs:[]}),
  audioFactory:async(_url,limit,{signal})=>{assert.equal(limit,14400);assert(signal);probed++;return{durationMs:60000,contentHash:'d'.repeat(64),chunkFactory:async()=>Buffer.from('mock'),cleanup:async()=>{}};},
  client:{audio:{transcriptions:{create:async()=>{paid++;return{segments:[{start:0,end:60,text}]};}}},responses:{create:async()=>({output_text:JSON.stringify({overview:text,detail:text,themes:['durable checkpoints'],sourceSegmentIndexes:[1],chapters:[{title:'Durable checkpoints',description:text,sourceSegmentIndexes:[1]}]}),usage:{input_tokens:100,output_tokens:100}})}}});
 await pipeline.request({feedUrl,episodeId:'unknown-duration',allowAudio:true,platformProcessing:true,trigger:'automatic'});await Promise.all(pipeline.inflight.values());
 assert.equal(probed,1);assert.equal(paid,1);const result=pipeline.status(feedUrl,'unknown-duration');assert.equal(result.state,'READY');assert.equal(result.work.verifiedSourceDurationMs,60000);assert.equal(result.episode.duration,'60');
} finally {probeStore.close();}
console.log('RSS episode-page discovery, unsafe/unrelated links, and bounded actual-duration probing without RSS duration passed.');

const staging=await mkdtemp(join(tmpdir(),'engine-staging-test-'));
try {
 let downloads=0;
 await assert.rejects(prepareAudio('https://owned.example/audio.mp3',14400,{stagingRoot:staging,diskInfo:async()=>({bavail:1024**3,bsize:1}),download:async()=>{downloads++;}}),e=>e.code==='AUDIO_STAGING_CAPACITY');
 assert.equal(downloads,0);assert.deepEqual(await readdir(staging),[],'failed acquisition removes staging');
 const audio=await prepareAudio('https://owned.example/audio.mp3',14400,{stagingRoot:staging,download:async(_url,path)=>{
  await promisify(execFile)(ffmpeg,['-v','error','-f','lavfi','-i','sine=frequency=440:duration=1','-f','mp3',path]);return {url:'https://owned.example/audio.mp3'};
 }});
 assert(audio.path.startsWith(staging));assert(audio.durationMs>=1000&&audio.durationMs<1200);
 const chunk=await audio.chunkFactory({index:0,startMs:0,endMs:audio.durationMs});assert(chunk.size>0);
 await audio.cleanup();assert.deepEqual(await readdir(staging),[]);
 await assert.rejects(prepareAudio('https://owned.example/corrupt.mp3',14400,{stagingRoot:staging,download:async(_url,path)=>{await writeFile(path,'corrupt audio');}}));
 assert.deepEqual(await readdir(staging),[],'corrupt audio is removed before any provider call');
 for(const [name,pid]of [['starcast-audio-dead',2147483647],['starcast-audio-live',process.pid],['preserve-data',2147483647]]){
  const dir=join(staging,name);await mkdir(dir);await writeFile(join(dir,'owner.json'),JSON.stringify({kind:AUDIO_STAGING_VERSION,pid}));await utimes(dir,new Date(0),new Date(0));
 }
 await initialiseAudioStaging(staging);
 assert.deepEqual((await readdir(staging)).sort(),['preserve-data','starcast-audio-live']);
}finally{await rm(staging,{recursive:true,force:true});}
const stagingStore=new LocalStore(':memory:'),stagingLedger=new BudgetLedger({enabled:true},stagingStore);
try {
 const pipeline=new EpisodePipeline({store:stagingStore,ledger:stagingLedger,queue:{enqueue:async()=>{}},enabled:true,configured:true,resolveEpisode:async()=>({})});
 stagingStore.set('intelligence',key,{feedUrl,episodeId,jobId:'prepaid-staging-failure',state:'FAILED',code:'ANALYSIS_FAILED',attempts:2,retryable:false,platformProcessing:true,processingStage:'PREPARING_AUDIO',completedAt:new Date().toISOString()});
 await pipeline.recoverQueued();assert.equal(stagingStore.get('intelligence',key).state,'QUEUED');assert.equal(stagingStore.get('intelligence',key).audioStagingVersion,AUDIO_STAGING_VERSION);
 stagingStore.set('intelligence',key,{...stagingStore.get('intelligence',key),state:'FAILED',code:'ANALYSIS_FAILED',processingStage:'PREPARING_AUDIO',retryable:false});
 await pipeline.recoverQueued();assert.equal(stagingStore.get('intelligence',key).state,'FAILED','software migration is one-time, not infinite retry');
}finally{stagingStore.close();}
console.log('Disk-backed bounded audio, low capacity refusal, corrupt audio cleanup, dead-owner cleanup and one-time unpaid staging recovery passed.');

const longEvidence={segments:Array.from({length:1500},(_,i)=>({id:'s'+i,text:i===749?'The study did not establish that the proposed treatment prevented illness.':'Ordinary source discussion provides surrounding context and qualifications. '.repeat(4)}))};
const disputed={brief:{overview:'The treatment prevented illness.',sourceSegmentIds:longEvidence.segments.map(s=>s.id)}};
let reviewedWindows=0;
const denied=await reviewClaims(disputed,longEvidence,{request:async options=>{
 return options.invoke({responses:{create:async body=>{
  const evidence=JSON.parse(body.input[1].content);assert(Buffer.byteLength(body.input[1].content)<20000);assert(evidence[0].sources.some(s=>s.id==='s749'));assert(evidence[0].sources.some(s=>s.id==='s748'));assert(evidence[0].sources.some(s=>s.id==='s750'));assert.equal(evidence[0].coverage.kind,'SELECTED_SOURCE_WINDOWS');reviewedWindows++;
  return {output_text:JSON.stringify({claims:evidence.map(c=>({id:c.id,entailed:false,supportingSourceIds:[]}))})};
 }}});
}});
assert.equal(reviewedWindows,1);assert.equal(validateClaims(denied,longEvidence).complete,false,'selected evidence never converts a contradiction into permission to publish');
const original={brief:{overview:'Checkpoint recovery protects completed work.',sourceSegmentIds:['proof']}};
const proof={segments:[{id:'proof',text:'Completed processing is retained through checkpoint recovery.'}]};
const claim=claimsForResult(original)[0];original.claimReview={version:GROUNDING_VERSION,claims:[{id:claim.id,binding:claimBinding(claim,proof),entailed:true,quotes:[{segmentId:'proof',text:proof.segments[0].text}]}]};
const reused=await reviewClaims(original,proof,{request:async()=>{throw Error('Verified unchanged claim must not be purchased again');}});
assert.equal(validateClaims(reused,proof).complete,true);
for(const selected of [['proof'],['unknown'],['proof','proof'],[]]) {
 const checked=await reviewClaims({...original,claimReview:undefined},proof,{request:async options=>options.invoke({responses:{create:async body=>{
  assert(body.text.format.schema.properties.claims.items.required.includes('supportingSourceIds'));
  assert(!body.text.format.schema.properties.claims.items.properties.quotes);
  assert.deepEqual(body.text.format.schema.properties.claims.items.properties.supportingSourceIds.items.enum,['proof']);
  assert.deepEqual(body.text.format.schema.properties.claims.items.properties.id.enum,[claim.id]);
  return {status:'completed',output_text:JSON.stringify({claims:[{id:claim.id,entailed:true,supportingSourceIds:selected}]})};
 }}})});
 assert.equal(validateClaims(checked,proof).complete,selected.length===1&&selected[0]==='proof');
 if(selected.length===1&&selected[0]==='proof')assert.deepEqual(checked.claimReview.claims[0].quotes,[{segmentId:'proof',text:proof.segments[0].text}]);
}
const reduceStore=new LocalStore(':memory:'),reduceLedger=new BudgetLedger({enabled:true},reduceStore);let generations=0,reviewStages=0;
try {
 const transcript={episodeId:'reduce-proof',transcriptVersion:'v1',quality:{readiness:'FULL'},segments:Array.from({length:501},(_,i)=>({id:'s'+i,startMs:i*1000,endMs:i*1000+900,text:'Original speech describes reliable checkpoint recovery and cautious evidence handling.'}))};
 const result=await generateLongFormIntelligence({transcript,ledger:reduceLedger,requestId:'reduce-proof',checkpointStore:reduceStore,checkpointPrefix:'reduce-proof',
  client:{responses:{create:async body=>{generations++;if(generations===3)assert(body.input[1].content.includes('Unverified section notes'));
   return{output_text:JSON.stringify({overview:'The fabricated result guarantees success for every listener.',detail:'The fabricated result guarantees success for every listener.',themes:['recovery'],sourceSegmentIndexes:[1],chapters:[{title:'Checkpoint recovery',description:'Original speech describes reliable checkpoint recovery and cautious evidence handling.',sourceSegmentIndexes:[1]}]}),usage:{input_tokens:100,output_tokens:100}};}}},
  claimReviewer:async(value,source)=>{assert(source.segments.every(s=>!s.id.startsWith('map-')),'synthetic reduction notes are never accepted as independent evidence');reviewStages++;return value;}});
 assert.equal(generations,3);assert.equal(reviewStages,3);assert(result.partialResult);assert(!result.brief.overview.includes('guarantees'));
}finally{reduceStore.close();}
console.log('Bounded original-source review, contradiction abstention, unchanged-verdict reuse and safe final synthesis rebinding passed.');

const reviewStore=new LocalStore(':memory:'),reviewLedger=new BudgetLedger({enabled:true},reviewStore);
try {
 const pipeline=new EpisodePipeline({store:reviewStore,ledger:reviewLedger,queue:{enqueue:async()=>{}},enabled:true,configured:true,resolveEpisode:async()=>({})});pipeline.claimReviewer=async v=>v;
 const job={feedUrl,episodeId,jobId:'cached-review',state:'PARTIAL_READY',platformProcessing:true,completedAt:new Date().toISOString(),brief:{mode:'extractive'},work:{totalBatches:2}};
 reviewStore.set('intelligence',key,job);reviewStore.set('followed-demand',key,{inWindow:true});
 await pipeline.recoverQueued();assert.equal(reviewStore.get('intelligence',key).state,'PARTIAL_READY','no automatic regeneration without saved provider responses');
 for(const stage of ['map-0','map-1','reduce'])reviewStore.set('analysis-checkpoint',key+':signature:'+stage,{state:'READY',response:{}});
 await pipeline.recoverQueued();assert.equal(reviewStore.get('intelligence',key).state,'QUEUED');
 const queued=reviewStore.get('intelligence',key);reviewStore.set('intelligence',key,{...queued,state:'PARTIAL_READY',completedAt:new Date().toISOString()});
 await pipeline.recoverQueued();assert.equal(reviewStore.get('intelligence',key).state,'PARTIAL_READY','cached-review repair is bounded to one replay');
}finally{reviewStore.close();}

const variantStore=new LocalStore(':memory:'),variantLedger=new BudgetLedger({enabled:true},variantStore);let variantPaid=0,cleaned=0;
try {
 const audioUrl='https://owned.example/variant.mp3',deliveryUrl='https://cdn.example/exact-variant.mp3';
 variantStore.set('intelligence',key,{feedUrl,episodeId,jobId:'paused-variant',processingVersion:PROCESSING_VERSION,state:'BLOCKED',code:'BUDGET_LIMIT',resumeAfter:'2020-01-01T00:00:00Z',attempts:0,platformProcessing:true,episode:{id:episodeId,feedUrl,audioUrl,duration:'60'},audioSource:{audioUrl,deliveryUrl,hash:'a'.repeat(64)},work:{nextChunkSeconds:60}});
 const pipeline=new EpisodePipeline({store:variantStore,ledger:variantLedger,enabled:true,configured:true,audioEnabled:true,resolveEpisode:async()=>({id:episodeId,feedUrl,audioUrl,duration:'60',refs:[]}),
  audioFactory:async url=>{assert.equal(url,deliveryUrl);return{durationMs:60000,contentHash:'b'.repeat(64),chunkFactory:async()=>Buffer.from('unused'),cleanup:async()=>{cleaned++;}};},
  client:{audio:{transcriptions:{create:async()=>{variantPaid++;throw Error('Mismatched audio must never be purchased');}}}}});
 await pipeline.request({feedUrl,episodeId,allowAudio:true,platformProcessing:true,trigger:'automatic'});await Promise.all(pipeline.inflight.values());
 assert.equal(pipeline.status(feedUrl,episodeId).code,'AUDIO_VARIANT_CHANGED');assert.equal(variantPaid,0);assert.equal(cleaned,1);
}finally{variantStore.close();}
console.log('Pinned audio source reuse and changed-variant refusal preserve existing paid work without repurchasing it.');
