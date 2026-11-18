import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LocalStore} from './persistence.mjs';
import {EpisodePipeline,episodeKey} from './episode-pipeline.mjs';
import {BudgetLedger,PROCESSING_VERSION} from './openai-intelligence.mjs';
import {assessTranscript} from './transcripts.mjs';
import {queueFeatureRepair,repairOneFeature} from './intelligence-repair.mjs';
const dir=mkdtempSync(join(tmpdir(),'radio-feature-repair-')),file=join(dir,'db.sqlite');
let store=new LocalStore(file),calls=0,bad=false,unknown=false,blocked=false;
const feedUrl='https://owned.example/feed',episodeId='repair',key=episodeKey(feedUrl,episodeId);
const text='Researchers explain reliable evidence and source attribution in podcast conversations.';
const segments=[{id:'s1',startMs:0,endMs:60000,text},{id:'s2',startMs:60000,endMs:120000,text:'Researchers discuss accurate citations and source evidence.'}];
const transcript={episodeId,transcriptVersion:'owned-v1',segments,quality:assessTranscript({segments})};
const base={state:'PARTIAL_READY',completedAt:new Date().toISOString(),jobId:'existing-job',feedUrl,episodeId,transcript,processingVersion:PROCESSING_VERSION,
 brief:{episodeId,transcriptVersion:transcript.transcriptVersion,processingVersion:PROCESSING_VERSION,overview:text,detail:text,themes:['Evidence'],sourceSegmentIds:['s1'],mode:'extractive'},
 chapters:[{title:'Evidence',description:text,startMs:0,endMs:60000,sourceSegmentIds:['s1'],mode:'extractive'},{title:'Citations',description:segments[1].text,startMs:60000,endMs:120000,sourceSegmentIds:['s2']} ]};
const client={responses:{create:async request=>{calls++;if(unknown)throw Error('Provider connection lost');const schema=request.text.format.schema.properties;
 const brief=schema.overview.maxLength!==0;
 assert(request.input[0].content.includes('Never insert inline citation numbers'));
 return {id:'test-response-'+calls,output_text:JSON.stringify({overview:brief?(bad?'Researchers spent 999 dollars on evidence.':text):'',detail:brief?text:'',themes:brief?['Evidence']:[],sourceSegmentIndexes:brief?[1]:[],chapters:brief?[]:[{title:'Evidence',description:text,sourceSegmentIndexes:[1]}]}),usage:{input_tokens:100,output_tokens:100}};
}}};
const make=()=>new EpisodePipeline({store,ledger:new BudgetLedger({enabled:true},store),enabled:true,configured:true,client});
let pipeline=make();const originalDecision=pipeline.executionDecision.bind(pipeline);
pipeline.executionDecision=(...args)=>blocked?{canDispatch:false}:originalDecision(...args);
try {
 store.set('intelligence',key,base);store.set('usage-proof','unknown-old-request',{uncertain:true,usd:0.01});
 const request=queueFeatureRepair(pipeline,key);assert.deepEqual(queueFeatureRepair(pipeline,key),request);
 await repairOneFeature(pipeline,key);
 const first=pipeline.status(feedUrl,episodeId);assert.equal(first.featureStatus.brief.state,'READY');assert.equal(first.featureStatus.chapters.state,'PARTIAL_READY');
 assert.deepEqual(first.chapters,base.chapters);assert.deepEqual(first.transcript,base.transcript);assert.equal(first.jobId,base.jobId);
 // Simulate a worker restart with a saved provider response and an unfinished
 // publication. The response must be reused without another provider call.
 const saved=store.get('intelligence-repair',key);store.set('intelligence',key,base);store.set('intelligence-repair',key,{...saved,state:'PROCESSING',features:{brief:{state:'PROCESSING',attempt:1}}});
 store.close();store=new LocalStore(file);pipeline=make();const count=calls;
 await repairOneFeature(pipeline,key);assert.equal(calls,count);
 await repairOneFeature(pipeline,key);await repairOneFeature(pipeline,key);
 const ready=pipeline.status(feedUrl,episodeId);assert.equal(ready.state,'READY');assert.deepEqual(ready.chapters[1],base.chapters[1]);assert.deepEqual(store.get('usage-proof','unknown-old-request'),{uncertain:true,usd:0.01});
 const paid=calls;await repairOneFeature(pipeline,key);assert.equal(calls,paid);
 // A changed canonical source cannot receive old repair output.
 store.set('intelligence-repair',key,{...request,state:'QUEUED'});store.set('intelligence',key,{...base,transcript:{...transcript,transcriptVersion:'changed'}});
 await repairOneFeature(pipeline,key);assert.equal(store.get('intelligence-repair',key).state,'BLOCKED');assert.equal(calls,paid);
 // New distinct source/revision for negative and capacity tests; no successful
 // paid checkpoints or unresolved requests are deleted for a retry.
 async function fixture(id){const k=episodeKey(feedUrl,id);store.set('intelligence',k,{...base,episodeId:id,jobId:id,transcript:{...transcript,episodeId:id},brief:{...base.brief,episodeId:id},chapters:[base.chapters[1]]});queueFeatureRepair(pipeline,k);return k;}
 bad=true;const invalid=await fixture('invalid');await repairOneFeature(pipeline,invalid);assert.equal(store.get('intelligence-repair',invalid).features.brief.state,'REJECTED');assert.equal(pipeline.status(feedUrl,'invalid').featureStatus.brief.state,'PARTIAL_READY');bad=false;
 const capacity=await fixture('capacity');pipeline.ledger.baseControls.dailyUsd=0;await repairOneFeature(pipeline,capacity);assert.equal(store.get('intelligence-repair',capacity).state,'WAITING_FOR_CAPACITY');pipeline.ledger.baseControls.dailyUsd=5;await repairOneFeature(pipeline,capacity);assert.equal(pipeline.status(feedUrl,'capacity').featureStatus.brief.state,'READY');
 unknown=true;const lost=await fixture('lost');await repairOneFeature(pipeline,lost);const afterLost=calls;await repairOneFeature(pipeline,lost);assert.equal(calls,afterLost);assert.equal(store.get('intelligence-repair',lost).features.brief.state,'FAILED');assert(pipeline.ledger.usage.some(u=>u.jobId==='lost'&&u.uncertain));unknown=false;
 const revoked=await fixture('revoked');pipeline.executionDecision=()=>({canDispatch:false});await repairOneFeature(pipeline,revoked);assert.equal(store.get('intelligence-repair',revoked).state,'BLOCKED');assert.equal(calls,afterLost);
}finally{store.close();rmSync(dir,{recursive:true,force:true});}
console.log('Independent feature repair, source binding, restart reuse, budget resume, unsupported-claim abstention and unknown-outcome guards passed.');

// Real administrative HTTP authentication, role, CSRF, audit and idempotency.
const {createStarCastServer}=await import('./server.mjs');
const app=createStarCastServer({store:new LocalStore(':memory:'),env:{STARCAST_DEV_INTELLIGENCE_TOKEN:'test-device',STARCAST_ADMIN_TOKEN:'test-admin'}});
app.store.set('intelligence',key,base);app.pipeline.executionDecision=()=>({canDispatch:true});
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${app.server.address().port}/api/admin/intelligence/repair`;
const session=app.adminService.startSession({id:'repair-admin',role:'SUPER_ADMIN'}),readonly=app.adminService.startSession({id:'read-only',role:'READ_ONLY'});
const input={feedUrl,episodeId,reason:'Repair bounded fixture outputs',confirmation:'CONFIRM'};
const header={ 'content-type':'application/json','x-star-cast-dev-token':'test-device',cookie:`starcast_admin=${session.id}`,'x-star-cast-csrf':session.csrf};
const post=(headers,body=input)=>fetch(url,{method:'POST',headers,body:JSON.stringify(body)});
try {
 assert.equal((await post({'content-type':'application/json'})).status,403);
 assert.equal((await post({...header,'x-star-cast-csrf':''})).status,403);
 assert.equal((await post({...header,cookie:`starcast_admin=${readonly.id}`,'x-star-cast-csrf':readonly.csrf})).status,403);
 assert.equal((await post(header,{...input,confirmation:''})).status,400);
 const first=await post(header);assert.equal(first.status,202);const queued=await first.json();assert.equal(queued.repair.jobId,base.jobId);
 const second=await post(header);assert.deepEqual(await second.json(),queued);
 assert(app.store.all('admin-audit').some(([,a])=>a.action==='intelligence-feature-repair-requested'));
 app.pipeline.purgeEpisode(feedUrl,episodeId);assert.equal(app.store.get('intelligence-repair',key),null);
}finally{await new Promise(r=>app.server.close(r));app.store.close();}
console.log('Feature repair HTTP: protected Super Admin/CSRF only, bounded scope, audit, deduplication and legal purge passed.');

const recoveryStore=new LocalStore(':memory:');
try {
 const ledger=new BudgetLedger({enabled:true},recoveryStore),messages=[];
 const pipeline=new EpisodePipeline({store:recoveryStore,ledger,queue:{enqueue:async row=>messages.push(row)},enabled:true,configured:true});
 recoveryStore.set('intelligence',key,{...base,transcript:null,state:'FAILED',code:'TRANSCRIPT_VALIDATION_FAILED',processingStage:'TRANSCRIBING',platformProcessing:true,transcriptionAssemblyVersion:'chunk-boundaries-v2',work:{nextChunkSeconds:1200}});
 recoveryStore.set('transcription-checkpoint',key+':saved',{state:'READY',response:{segments:[]}});
 await pipeline.recoverQueued();assert.equal(messages.length,1);assert.equal(messages[0].jobId,base.jobId);assert.equal(recoveryStore.get('intelligence',key).state,'QUEUED');assert(recoveryStore.get('transcription-checkpoint',key+':saved'));
}finally{recoveryStore.close();}
console.log('Terminal drift recovery schedules the same job and preserves saved responses.');

// Multi-section synthesis must map references through the ORIGINAL section
// draft, even when its displayed brief was narrowed to an excerpt.
{
 const {generateLongFormIntelligence}=await import('./openai-intelligence.mjs');
 const s=new LocalStore(':memory:'),ledger=new BudgetLedger({enabled:true},s);let n=0;
 const first='This opening explains original source evidence. It describes careful attribution. It introduces the conversation.';
 const fact='Researchers use durable checkpoints to preserve completed work during interruptions.';
 const segments=Array.from({length:501},(_,i)=>({id:'source-'+i,text:i===0?first:i===1?fact:'Further discussion of original source evidence and attribution.',startMs:i*1000,endMs:(i+1)*1000}));
 try {
 const result=await generateLongFormIntelligence({transcript:{episodeId:'citations',transcriptVersion:'v1',segments,quality:{readiness:'FULL'}},ledger,requestId:'citation-repair:text',requestedFeatures:['brief'],checkpointStore:s,checkpointPrefix:'citation-repair',
 client:{responses:{create:async()=>{n++;return{usage:{input_tokens:100,output_tokens:100},output_text:JSON.stringify(n<3?{overview:'The researchers spent 991 dollars.',detail:'The researchers spent 991 dollars.',themes:[],sourceSegmentIndexes:n===1?[1,2]:[1],chapters:[]}:{overview:fact,detail:fact,themes:['Durable checkpoints'],sourceSegmentIndexes:[1],chapters:[]})};}}}});
 assert.equal(result.brief.overview,fact);assert(!result.brief.mode);assert(result.brief.sourceSegmentIds.includes('source-1'));assert.equal(n,3);
 }finally{s.close();}
}
console.log('Reduction preserves original source references after an intermediate fallback; strict final grounding remains enabled.');
{
 const {repairTranscriptAssembly}=await import('./intelligence-repair.mjs');
 const {createHash}=await import('node:crypto');
 const s=new LocalStore(':memory:'),ledger=new BudgetLedger({enabled:true},s),audioUrl='https://owned.example/assembly.mp3',variant=createHash('sha256').update(audioUrl).digest('hex'),hash='b'.repeat(64);
 const id='assembly',k=episodeKey(feedUrl,id),rows=[{id:'0-0',startMs:0,endMs:30000,text},{id:'0-2',startMs:60000,endMs:120000,text:segments[1].text}];
 const t={episodeId:id,transcriptVersion:'previous',sourceType:'on_demand_audio',model:'whisper-1',durationMs:120000,audioVariant:variant,audioContentHash:hash,segments:rows,quality:assessTranscript({segments:rows})};
 const j={...base,episodeId:id,episode:{id,feedUrl,audioUrl},transcript:t,work:{sourceContentHash:hash},brief:{...base.brief,episodeId:id,transcriptVersion:t.transcriptVersion,sourceSegmentIds:['0-0']},chapters:[{...base.chapters[1],startMs:60000,endMs:120000,sourceSegmentIds:['0-2']}]};
 const pipeline=new EpisodePipeline({store:s,ledger,enabled:true,configured:true,client:{audio:{transcriptions:{create:()=>assert.fail('Local assembly cannot purchase audio')}}}});
 try {
  s.set('intelligence',k,j);queueFeatureRepair(pipeline,k);const beforeAssembly=s.get('intelligence',k);
  const response={segments:[{start:0,end:30,text},{start:30,end:60,text:'A confidently decoded passage about source evidence.',no_speech_prob:.96,avg_logprob:-.4},{start:60,end:120,text:segments[1].text}]};
  s.set('transcription-checkpoint',`${k}:${hash}:whisper-1:120000:0`,{state:'READY',response});
  assert(await repairTranscriptAssembly(pipeline,k));const repaired=s.get('intelligence',k);
  assert.equal(repaired.jobId,j.jobId);assert.equal(repaired.transcript.segments.length,3);assert.deepEqual(repaired.chapters,j.chapters);assert.equal(ledger.usage.length,0);assert.equal(repaired.transcriptAssemblyRepair.paidTranscriptionRequests,0);
  assert.deepEqual(s.get('transcript',k+':assembly:previous'),t);assert.deepEqual(s.get('intelligence-repair-history',k+':assembly:previous').job,beforeAssembly);
  assert.deepEqual(s.get('transcription-checkpoint',`${k}:${hash}:whisper-1:120000:0`).response,response);
  assert.equal(await repairTranscriptAssembly(pipeline,k),false);
  s.set('intelligence',k,beforeAssembly);s.set('intelligence-repair',k,{...s.get('intelligence-repair',k),version:'older',state:'QUEUED',signature:'old'});
  s.set('transcription-checkpoint',`${k}:${hash}:whisper-1:120000:0`,{state:'READY',response:{segments:[{start:0,end:200,text}]}});
  const blocked=await repairOneFeature(pipeline,k);assert.equal(blocked.code,'ASSEMBLY_VALIDATION_FAILED');assert.equal(s.get('intelligence',k).transcript.transcriptVersion,'previous');assert.equal(ledger.usage.length,0);
  pipeline.purgeEpisode(feedUrl,id);assert.equal(s.get('intelligence-repair-history',k+':assembly:previous'),null);assert.equal(s.get('transcript',k+':assembly:previous'),null);
 }finally{s.close();}
}
console.log('Saved-response assembly restores confident speech locally, retains unaffected chapters/history and spends nothing.');

// A corrected source is distinct paid work; unchanged responses survive restart.
{
 const {generateLongFormIntelligence}=await import('./openai-intelligence.mjs');
 const s=new LocalStore(':memory:'),ledger=new BudgetLedger({enabled:true},s);let calls=0;
 const client={responses:{create:async()=>{calls++;return{usage:{input_tokens:10,output_tokens:10},output_text:JSON.stringify({overview:text,detail:text,themes:['Evidence'],sourceSegmentIndexes:[1],chapters:[]})};}}};
 const opts={transcript,ledger,client,requestId:'source-bound:text',requestedFeatures:['brief'],checkpointStore:s,checkpointPrefix:'source-bound'};
 try {
 await generateLongFormIntelligence(opts);
 const corrected={...opts,transcript:{...transcript,segments:[...segments,{id:'s3',text:'An additional recovered passage about evidence.',startMs:120000,endMs:150000}]}};
 await generateLongFormIntelligence(corrected);assert.equal(calls,2);
 await generateLongFormIntelligence(corrected);assert.equal(calls,2);
 assert.equal(ledger.usage.length,2);assert.notEqual(ledger.usage[0].id,ledger.usage[1].id);
 }finally{s.close();}
}
console.log('Changed source uses a distinct reservation; unchanged sources reuse saved paid responses.');

{
 const {briefReviewEvidence}=await import('./intelligence-repair.mjs');
 const {reviewClaims,validateClaims}=await import('./claim-grounding.mjs');
 const t={segments:[{id:'intro',text:'Welcome to a conversation about technology.'},{id:'evidence',text:'Durable checkpoints preserve completed transcription work after a worker restart.'}]};
 const value={brief:{overview:'Saved checkpoints allow interrupted transcription to resume.',detail:'Saved checkpoints allow interrupted transcription to resume.',themes:[],sourceSegmentIds:['intro']},chapters:[]};
 let reviews=0;
 const requests={request:async({invoke})=>invoke({responses:{create:async r=>{reviews++;const evidence=JSON.parse(r.input[1].content);assert(evidence.every(c=>c.sources.some(s=>s.id==='evidence')));return{output_text:JSON.stringify({claims:evidence.map(c=>({id:c.id,entailed:true,supportingSourceIds:['evidence']}))})};}}})};
 const reviewed=await reviewClaims(briefReviewEvidence(value,t),t,requests);assert(reviews);assert(validateClaims(reviewed,t).complete);assert.deepEqual(value.brief.sourceSegmentIds,['intro']);
 const refused=await reviewClaims(briefReviewEvidence(value,t),t,{request:async({invoke})=>invoke({responses:{create:async r=>({output_text:JSON.stringify({claims:JSON.parse(r.input[1].content).map(c=>({id:c.id,entailed:false,supportingSourceIds:[]}))})})}})});assert(!validateClaims(refused,t).complete);
}
console.log('Brief repair retrieves real canonical speech and still requires independent entailment; refusals remain partial.');
{
 const s=new LocalStore(':memory:');const p=new EpisodePipeline({store:s,ledger:new BudgetLedger({enabled:true},s),enabled:true,configured:true,client:{responses:{create:()=>assert.fail('Unknown legacy chapter must not replay')}}});
 try {
  const j={...base,brief:{...base.brief,mode:undefined},chapters:[base.chapters[0]]};s.set('intelligence',key,j);queueFeatureRepair(p,key);
  s.set('analysis-checkpoint',`${key}:missing-features-no-inline-citations-v1:chapter.0:1`,{state:'SENDING',requestId:'legacy-unknown'});
  const r=await repairOneFeature(p,key);assert.equal(r.features['chapter.0'].code,'PROVIDER_OUTCOME_UNKNOWN');assert.equal(p.ledger.usage.length,0);
 }finally{s.close();}
}
console.log('Unresolved legacy chapter requests remain blocked across source-key migration.');
// Section notes are internal unverified inputs. A brief-only reduction gets
// one final original-speech review, without buying redundant map reviews.
{
 const {generateLongFormIntelligence}=await import('./openai-intelligence.mjs');const s=new LocalStore(':memory:');let requests=0,reviews=0;
 const rows=Array.from({length:501},(_,i)=>({id:'x'+i,text,startMs:i*1000,endMs:(i+1)*1000}));
 try{await generateLongFormIntelligence({transcript:{...transcript,segments:rows},ledger:new BudgetLedger({enabled:true},s),requestId:'focused:text',requestedFeatures:['brief'],checkpointStore:s,checkpointPrefix:'focused',claimReviewer:async(v,t)=>{reviews++;assert.equal(t.segments.length,501);assert(v.brief.sourceSegmentIds.every(id=>rows.some(s=>s.id===id)));return v;},client:{responses:{create:async r=>{requests++;assert.equal(r.text.format.schema.properties.overview.maxLength,220);assert.equal(r.text.format.schema.properties.detail.maxLength,640);assert.equal(r.text.format.schema.properties.themes.maxItems,3);return{usage:{input_tokens:10,output_tokens:10},output_text:JSON.stringify({overview:text,detail:text,themes:['Evidence'],sourceSegmentIndexes:[1],chapters:[]})};}}}});assert.equal(requests,3);assert.equal(reviews,1);}finally{s.close();}
}
console.log('Focused briefs enforce output bounds and verify original speech once after internal map reduction.');
{
 const {reviewClaims,validateClaims}=await import('./claim-grounding.mjs');
 const t={segments:[{id:'short',text:'Yes.'},{id:'long',text:'Durable checkpoints preserve completed transcription work after a worker restart.'}]},v={brief:{overview:'Saved checkpoints allow interrupted transcription to resume.',detail:'',themes:[],sourceSegmentIds:['short','long']},chapters:[]};
 const keys=[];const requests={request:async({key,invoke})=>{keys.push(key);if(keys.length===1)return{output_text:JSON.stringify({claims:[{id:'brief.overview.0',entailed:true,supportingSourceIds:['short','long']}]})};return invoke({responses:{create:async r=>{assert.deepEqual(r.text.format.schema.properties.claims.items.properties.supportingSourceIds.items.enum,['long']);return{output_text:JSON.stringify({claims:[{id:'brief.overview.0',entailed:true,supportingSourceIds:['long']}]})};}}});}};
 const fixed=await reviewClaims(v,t,requests);assert(validateClaims(fixed,t).complete);assert.equal(keys.length,2);assert.equal(keys[1],keys[0]+':eligible-source-ids-v1');
 let n=0;const unknown=await reviewClaims(v,t,{request:async()=>{n++;throw Object.assign(Error('Unknown previous outcome'),{code:'PROVIDER_OUTCOME_UNKNOWN'});}});assert.equal(n,1);assert(!validateClaims(unknown,t).complete);
}
console.log('Old completed short-source selections get one schema-correct recheck; unknown outcomes cannot be replayed.');
{
 const {completeBriefDetail}=await import('./openai-intelligence.mjs');const first='The speakers discuss Linux servers and source attribution. ';
 const fragment='The discussion continues with '+ 'accurate evidence '.repeat(35)+'and a';
 assert.equal(completeBriefDetail(first+fragment),first.trim());assert.equal(completeBriefDetail(first+fragment.replace(/and a$/,'res')),first.trim());assert.equal(completeBriefDetail(first.repeat(12)),first.repeat(12));assert.equal(completeBriefDetail('A complete detail without terminal punctuation'),'A complete detail without terminal punctuation');
}
console.log('Length-capped dangling detail is omitted without inventing a sentence or changing complete prose.');
