import assert from 'node:assert/strict';
import {proposeCompleteBreaks} from './ad-breaks.mjs';
import {LocalStore} from './persistence.mjs';
import {SkipService} from './skip-service.mjs';
import {executeVerifiedSkip} from './native/src/adSkipExecution.mjs';
const segments=[
 {id:'opening',startMs:10000,endMs:15000,text:'Our sponsor is Example.'},
 {id:'description',startMs:15000,endMs:25000,text:'It helps our team work together every day.'},
 {id:'offer',startMs:25000,endMs:35000,text:'Use code RADIO for a free trial.'},
 {id:'closing',startMs:35000,endMs:40000,text:'Thank you for supporting the show.'},
 {id:'return',startMs:40000,endMs:45000,text:'Back to the discussion about software.'},
];
const rules={opens:t=>/our sponsor/i.test(t),qualifies:t=>/free trial/.test(t),denies:t=>/not sponsored/i.test(t)};
const complete=proposeCompleteBreaks(segments,rules);assert.equal(complete.length,1);assert.equal(complete[0].endMs,40000);assert.deepEqual(complete[0].sourceSegmentIds,['opening','description','offer','closing']);assert(complete[0].reviewOnly);
assert.equal(proposeCompleteBreaks(segments.slice(0,4),rules).length,0,'no guessed editorial return');
assert.equal(proposeCompleteBreaks(segments.map((s,i)=>i===1?{...s,text:'This is not sponsored.'}:s),rules).length,0,'denial veto');
assert.equal(proposeCompleteBreaks(segments.map((s,i)=>i===1?{...s,startMs:19000}:s),rules).length,0,'unexplained gap veto');
assert.equal(proposeCompleteBreaks(segments.map((s,i)=>i===4?{...s,startMs:300000,endMs:305000}:s),rules).length,0,'bounded search');
assert.equal(proposeCompleteBreaks(segments.map((s,i)=>i===0?{...s,text:'We discuss Example products.'}:s),rules).length,0,'ordinary product discussion is not a sponsor opening');
const store=new LocalStore(':memory:');const job={state:'FAILED',episode:{id:'phase2',audioUrl:'https://owned.example/audio'},transcript:{segments,durationMs:60000,audioVariant:'owned',transcriptVersion:'phase2'}};
const service=new SkipService(store,{status:()=>job});service.inspect('https://owned.example/feed','phase2');const rows=store.all('skip-interval').map(([,r])=>r),proposal=rows.find(r=>r.reviewOnly);assert(proposal);assert.equal(proposal.qualifiesForAudioVerification,false);assert.equal(proposal.boundaryVerified,false);assert.equal(proposal.verificationState,'CANDIDATE');assert(proposal.confidence<.93);assert(service.inspect('https://owned.example/feed','phase2').analysisCacheHit);store.close();
const interval={id:'lease-test',startMs:1000,endMs:2000};let seeks=0;const base={interval,positionMs:1200,durationMs:10000,current:()=>true,getPosition:()=>1200,seek:async ms=>{seeks++;return ms;}};
for(const invalid of [{positionMs:NaN},{interval:{id:'bad',startMs:1000}},{interval:{id:'bad',startMs:-1,endMs:2000}},{interval:null}])await assert.rejects(executeVerifiedSkip({...base,...invalid,authorise:()=>{throw Error('must not authorise invalid bounds');}}),/Unsafe/);
for(const expiresAt of [undefined,null,NaN,Infinity,'2099',0])await assert.rejects(executeVerifiedSkip({...base,authorise:async()=>({id:interval.id,targetMs:2000,expiresAt})}),/Stale/);
await assert.rejects(executeVerifiedSkip({...base,authorise:async()=>null}),/Stale/);assert.equal(seeks,0);
const execution=await executeVerifiedSkip({...base,authorise:async()=>({id:interval.id,targetMs:2000,expiresAt:Date.now()+5000})});await Promise.all([execution.undo(),execution.undo()]);assert.equal(seeks,2);
console.log('Phase 2: evidence-bounded complete-break proposals stay review-only; editorial/denial/gap guards, cache reuse, malformed lease refusal, confirmed seek and deduplicated Undo pass.');
