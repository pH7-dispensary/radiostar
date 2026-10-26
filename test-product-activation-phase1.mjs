import assert from 'node:assert/strict';
import {LocalStore} from './persistence.mjs';
import {FollowedPreparation} from './followed-preparation.mjs';
import {BudgetLedger} from './openai-intelligence.mjs';
import {IntelligenceTestMode} from './intelligence-test-mode.mjs';
import {RightsRegistry} from './rights-registry.mjs';
import {IntelligencePolicyRegistry} from './intelligence-policy.mjs';
import {episodeKey} from './episode-pipeline.mjs';
const store=new LocalStore(':memory:'),ledger=new BudgetLedger({enabled:true},store),rights=new RightsRegistry(store),policy=new IntelligencePolicyRegistry(store),testingMode=new IntelligenceTestMode(store);
const feed='https://owned.example/canonical',alias='https://owned.example/old';
rights.set({feedUrl:feed,classification:'LICENSED',legalBasis:'Original test fixture',assessmentEvidence:[{type:'OWNED',source:'test author',value:'Original fixture'}],canProcessForAi:true,canAcquireTranscript:true,canTranscribeAudio:true,canRetain:true});
for(const id of ['a','b']){store.set('installation',id,{id});store.set('follow',id,{owner:id,feedUrl:id==='a'?alias:feed});}
let outage=true,requests=[],inspections=0;const episode=id=>({id,title:id,publishedAt:`2026-01-0${4-Number(id)}T00:00:00Z`,duration:'60',audioUrl:`https://owned.example/${id}.mp3`,refs:[]});
const pipeline={status:(f,id)=>store.get('intelligence',episodeKey(f,id)),request:async input=>{requests.push(input);const job={...input,jobId:'job-'+input.episodeId,state:'QUEUED'};store.set('intelligence',episodeKey(input.feedUrl,input.episodeId),job);return job;}};
const prep=new FollowedPreparation({store,ledger,rights,testingMode,pipeline,resolveFeedIdentity:f=>f===alias?feed:f,canonicalFeed:async()=>feed,discover:async()=>['1','2','3'].map(episode),assess:async(f,id)=>{if(outage&&id==='1')throw Error('Temporary publisher outage');return {episode:episode(id)};},enabled:()=>true,allowed:(f,id)=>policy.allows(f,id).allowed,inspect:()=>{inspections++;}});
try{
 assert.equal(policy.global().tier,'ZERO');
 store.set('followed-demand','retired',{key:'retired',feedUrl:feed,episodeId:'retired',inWindow:true,createdAt:new Date().toISOString()});
 let result=await prep.refresh({force:true});assert.equal(result.uniqueEpisodes,3);assert.equal(result.snapshot.activeUsers,2);assert.equal(result.snapshot.feeds,1);assert.equal(result.snapshot.errors.length,1);assert.equal(result.rows.find(r=>r.episodeId==='1').state,'WAITING');assert.equal(result.rows.find(r=>r.episodeId==='2').eligible,true);
 assert.equal(store.get('followed-demand','retired').inWindow,false,'An isolated assessment failure does not retain an obsolete fourth episode');
 prep.action({action:'activate',expectedVersion:0,reason:'Owned fixture activation',confirmation:'CONFIRM'},{id:'human',source:'session',role:'SUPER_ADMIN'});
 await prep.drain();assert.deepEqual(requests.map(r=>r.episodeId),['2','3']);assert(requests.every(r=>r.feedUrl===feed&&r.allowAudio&&r.platformProcessing&&r.trigger==='automatic'));assert.equal(policy.records().length,0,'Automatic evidence cannot write operational pauses');
 // Finished partial outputs are cache hits, not a demand for paid regeneration.
 for(const id of ['2','3'])store.set('intelligence',episodeKey(feed,id),{...pipeline.status(feed,id),state:'PARTIAL_READY',completedAt:new Date().toISOString(),episode:episode(id),transcript:{segments:[{text:'owned transcript'}]}});
 requests=[];await prep.refresh({force:true});await prep.drain();assert.equal(requests.length,0);assert(inspections>=2);result=prep.summary();assert.equal(result.acquisition.intelligenceCacheHits,2);assert.equal(result.counts.PARTIAL_READY,2);assert.equal(result.estimate.knownUsd,0,'unassessed missing duration is unknown, not a guessed charge');assert.equal(result.estimate.unknownEpisodes,1);
 outage=false;await prep.refresh({force:true});await prep.drain();assert.deepEqual(requests.map(r=>r.episodeId),['1'],'Recovered evidence proceeds without a new human approval');
 // Retaining only the historical alias must not remove the canonical window.
 store.delete('follow','b');assert.equal(prep.summary().uniqueEpisodes,3);
 const changed=episode('2');changed.audioUrl='https://owned.example/replaced.mp3';const originalAssess=prep.assess;prep.assess=async(f,id)=>({episode:id==='2'?changed:episode(id)});await prep.refresh({force:true});assert(prep.summary().rows.find(r=>r.episodeId==='2').sourceNeedsRefresh);prep.assess=originalAssess;
 // A human pause persists, while stale derived PAUSED rows recover once the
 // actual human policy is OPEN. Neither status operation grants rights.
 const key=episodeKey(feed,'3'),row=store.get('followed-demand',key);store.set('followed-demand',key,{...row,state:'PAUSED'});assert.equal(prep.summary().rows.find(r=>r.key===key).state,'PARTIAL_READY');store.set('followed-demand',key,{...row,state:'PAUSED',paused:true});assert.equal(prep.summary().rows.find(r=>r.key===key).state,'PAUSED');
 assert.equal(ledger.usage.length,0);assert.equal(policy.audit().length,0);
}finally{store.close();}
console.log('Activation: per-episode failure isolation, canonical multi-listener dispatch, partial cache reuse, recovery, source changes and human-only pauses passed.');
