import assert from 'node:assert/strict';
import {LocalStore} from './persistence.mjs';
import {FollowedPreparation} from './followed-preparation.mjs';
import {SemanticSearch,DIMENSIONS,validSemanticIndex} from './semantic-search.mjs';
const store=new LocalStore(':memory:');
try {
 const prep=new FollowedPreparation({store});
 assert.deepEqual(prep.configuration(),{enabled:true,version:0},'New installations need no administrative activation');
 store.set('followed-preparation','configuration',{enabled:false,version:2});
 assert.equal(prep.configuration().enabled,false,'An explicit human pause survives the new default');
 const key='owned-index', index={version:'fixture',fingerprint:'owned-fixture-v1',segments:[{id:'one',text:'Original fixture evidence for semantic checkpoint recovery.'}]};
 store.set('search-index',key,index);
 const search=new SemanticSearch({store,requests:{canPersist:()=>true}});
 let calls=0;
 search.embed=async()=>{calls++;throw Error('BUDGET_LIMIT_BEFORE_PROVIDER');};
 await assert.rejects(search.build(index,{key}),/BUDGET_LIMIT/);
 assert.equal(store.get('semantic-index',key).state,'BUILDING');
 assert.equal(store.get('semantic-index',key).cursor,0);
 const restarted=new SemanticSearch({store,requests:{canPersist:()=>true}});
 restarted.embed=async texts=>{calls++;return texts.map(()=>Array(DIMENSIONS).fill(0.25));};
 const ready=await restarted.build(index,{key});
 assert(validSemanticIndex(ready,index));
 await restarted.build(index,{key});assert.equal(calls,2,'Completed checkpoint reuses the index without another paid batch');
 const restricted=new SemanticSearch({store,requests:{canPersist:()=>false}});
 await assert.rejects(restricted.build(index,{key}),/RIGHTS_REVOKED/);
}finally{store.close();}
console.log('Default automatic preparation, persisted human pause, first-batch recovery and index cache reuse passed.');

// Many listeners share one canonical latest-three demand window and job set.
const {RightsRegistry}=await import('./rights-registry.mjs');
const {BudgetLedger}=await import('./openai-intelligence.mjs');
const {IntelligenceTestMode}=await import('./intelligence-test-mode.mjs');
const {episodeKey}=await import('./episode-pipeline.mjs');
const shared=new LocalStore(':memory:');
try {
 const feed='https://owned.example/thousand-followers', rights=new RightsRegistry(shared), ledger=new BudgetLedger({enabled:true},shared);
 rights.set({feedUrl:feed,classification:'LICENSED',assessmentStatus:'APPROVED',canProcessForAi:true,canRetain:true});
 shared.transaction(()=>{for(let i=0;i<1000;i++){shared.set('installation',String(i),{id:String(i)});shared.set('follow',String(i),{owner:String(i),feedUrl:feed});}});
 const episodes=[1,2,3,4].map(i=>({id:String(i),publishedAt:`2026-01-0${i}T00:00:00Z`,audioUrl:`https://owned.example/${i}.mp3`,duration:'60',refs:[]}));
 let requests=0;
 const pipeline={status:(f,id)=>shared.get('intelligence',episodeKey(f,id)),request:async x=>{requests++;const j={state:'READY',completedAt:new Date().toISOString(),jobId:x.episodeId,episode:episodes.find(e=>e.id===x.episodeId)};shared.set('intelligence',episodeKey(x.feedUrl,x.episodeId),j);return j;}};
 const prep=new FollowedPreparation({store:shared,rights,ledger,testingMode:new IntelligenceTestMode(shared),pipeline,discover:async()=>episodes,assess:async(f,id)=>({episode:episodes.find(e=>e.id===id)}),enabled:()=>true,allowed:()=>true,inspect:()=>{}});
 await Promise.all([prep.refresh(),prep.refresh()]);
 assert.equal(prep.summary().snapshot.activeUsers,1000);assert.equal(prep.summary().uniqueEpisodes,3);
 assert.deepEqual(prep.rows().map(x=>x.episodeId).sort(),['2','3','4']);
 await Promise.all([prep.drain(),prep.drain()]);assert.equal(requests,3);
 await prep.drain();assert.equal(requests,3,'Repeated refresh/drain reuses globally completed work');
 let release,dispatched=false;
 prep.refreshing=new Promise(resolve=>{release=resolve;});
 prep.drain=async()=>{dispatched=true;};
 const opening=prep.encounter('0',feed,'4','opened');
 await Promise.resolve();assert.equal(dispatched,false,'An encounter waits for concurrent discovery instead of reporting before dispatch');
 release();await opening;assert(dispatched);

} finally {shared.close();}
console.log('1,000 listeners share exactly three canonical preparation jobs.');
