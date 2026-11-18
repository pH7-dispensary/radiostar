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
