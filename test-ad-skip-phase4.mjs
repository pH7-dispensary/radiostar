import assert from 'node:assert/strict';
import { LocalStore } from './persistence.mjs';
import { SkipService } from './skip-service.mjs';
import { episodeKey } from './episode-pipeline.mjs';
import { adSkipStatusText } from './native/src/adSkipStatus.mjs';

const feed='https://publisher.example/phase4',episode='owned',key=episodeKey(feed,episode);
const transcript={audioVariant:'variant-1',audioContentHash:'a'.repeat(64),transcriptVersion:'one',durationMs:180000,segments:[
 {id:'s1',startMs:10000,endMs:18000,text:'This show is made possible by Example.'},
 {id:'s2',startMs:18000,endMs:28000,text:'Get started at example.com and use the code RADIO.'},
 {id:'s3',startMs:40000,endMs:50000,text:'We compared three laptops and preferred the lightweight one.'},
 {id:'s4',startMs:60000,endMs:70000,text:'We are not sponsored by Example. They advertise a free trial but this is editorial criticism.'},
]};
let value={state:'UNDERSTANDING',feedUrl:feed,episodeId:episode,episode:{audioUrl:'https://publisher.example/audio'},transcript};
const store=new LocalStore(':memory:');const pipeline={status:()=>value};
let calls=0,clock=Date.now(),allowed=true;
const make=verifyAudio=>new SkipService(store,pipeline,{clock:()=>clock,canVerifyAudio:()=>({allowed}),verifyAudio});
let service=make(async()=>{calls++;throw Error('temporary network failure');});
service.inspect(feed,episode);await service.inflight.get(key);
assert.equal(calls,1);
const rows=store.all('skip-interval').map(([,v])=>v);
assert(rows.some(r=>r.qualifiesForAudioVerification&&r.evidence[0].sourceSegmentIds.join(',')==='s1,s2'));
assert(!rows.some(r=>r.evidence[0].sourceSegmentIds.includes('s3')),'ordinary product discussion is not an advert');
assert(rows.some(r=>r.verificationState==='REJECTED'&&r.evidence[0].sourceSegmentIds.includes('s4')));
const before=JSON.stringify(store.get('skip-analysis',key));
const original=store.set.bind(store);let writes=0;store.set=(...args)=>{writes++;return original(...args);};
service.inspect(feed,episode);assert.equal(writes,0,'polls reuse unchanged candidate analysis and respect retry cooldown');
assert.equal(JSON.stringify(store.get('skip-analysis',key)),before);
service=make(async()=>{calls++;throw Error('retry still failed');});
service.inspect(feed,episode);assert.equal(service.inflight.size,0,'cooldown survives process/service restart');
clock+=60001;service.inspect(feed,episode);await service.inflight.get(key);assert.equal(calls,2);
clock+=60001;service.inspect(feed,episode);assert.equal(calls,2,'same source has a finite network retry budget');
const failed=store.get('skip-audio-verification',key);
store.set('skip-audio-verification',key,{...failed,state:'PROCESSING'});
service=make(async()=>{calls++;return {};});service.inspect(feed,episode);
assert.equal(store.get('skip-audio-verification',key).code,'VERIFICATION_RETRY_EXHAUSTED');assert.equal(calls,2,'repeated worker death cannot reset attempts');

// A new bound source gets its own bounded attempt; an in-flight old response
// must not publish intervals after that source is superseded.
value={...value,transcript:{...transcript,transcriptVersion:'two',audioContentHash:'b'.repeat(64)}};
let finish;service=make(async({candidates})=>{calls++;await new Promise(r=>{finish=r;});return{state:'READY',variant:{audioVariantFingerprint:'b'.repeat(64),durationMs:180000},candidates:candidates.map(c=>({id:c.id,startMs:c.startMs,endMs:c.endMs,boundaryVerified:true,boundaryFingerprint:'pcm'}))};});
service.inspect(feed,episode);await new Promise(r=>setImmediate(r));assert.equal(calls,3);
value={...value,transcript:{...value.transcript,transcriptVersion:'three',audioContentHash:'c'.repeat(64)}};
finish();await service.inflight.get(key);assert.equal(store.get('skip-audio-verification',key).code,'SOURCE_CHANGED');
assert(!store.all('skip-interval').some(([,v])=>v.verificationState==='VERIFIED'));

// Queue waits must recheck permissions before touching publisher audio.
service=make(async()=>{calls++;return{state:'READY'};});let release;
service.verificationTail=new Promise(r=>{release=r;});service.inspect(feed,episode);allowed=false;release();await service.inflight.get(key);
assert.equal(calls,3);assert.equal(store.get('skip-audio-verification',key).code,'AUDIO_VERIFICATION_NOT_AUTHORISED');
store.close();
const rejectedStore=new LocalStore(':memory:');
const rejectedService=new SkipService(rejectedStore,{status:()=>({...value,transcript:{...transcript,segments:[transcript.segments[3]]}})});
assert.equal(rejectedService.inspect(feed,episode).state,'NO_VERIFIED_INTERVALS','rejected editorial cues must not be advertised as usable candidates');
rejectedStore.close();
const offerStore=new LocalStore(':memory:');
const offerTranscript={...transcript,segments:[
 {id:'url',startMs:1000,endMs:2500,text:'Example dot com slash radio.'},
 {id:'offer',startMs:2500,endMs:5000,text:'Go there to get a one hundred dollar credit towards your new account.'},
 {id:'editorial',startMs:10000,endMs:13000,text:'We compared the new account pricing at example.com with its competition.'},
 {id:'mobile',startMs:20000,endMs:25000,text:'Start by going to radio dot example calm.'},
 {id:'signup',startMs:25000,endMs:30000,text:'Check your phone and create an account to choose your plan.'},
 {id:'denial',startMs:40000,endMs:45000,text:'This is not an advertisement. Go to example.com and create an account.'},
]};
const offerService=new SkipService(offerStore,{status:()=>({...value,transcript:offerTranscript})});
offerService.inspect(feed,episode);
const offers=offerStore.all('skip-interval').map(([,v])=>v);
assert(offers.some(v=>v.qualifiesForAudioVerification&&v.evidence[0].sourceSegmentIds.join(',')==='url,offer'));
assert(offers.some(v=>v.qualifiesForAudioVerification&&v.evidence[0].sourceSegmentIds.join(',')==='mobile,signup'));
assert(!offers.some(v=>v.qualifiesForAudioVerification&&v.evidence[0].sourceSegmentIds.includes('editorial')));
assert(!offers.some(v=>v.qualifiesForAudioVerification&&v.evidence[0].sourceSegmentIds.includes('denial')));
offerStore.close();
const upgradeStore=new LocalStore(':memory:');let upgrades=0;
const upgradeService=new SkipService(upgradeStore,{status:()=>({...value,episode:{audioUrl:'https://publisher.example/audio'},transcript:{...transcript,segments:transcript.segments.slice(0,2)}})},{canVerifyAudio:()=>true,verifyAudio:async({candidates})=>{upgrades++;return{state:'READY',variant:{audioVariantFingerprint:'a'.repeat(64),durationMs:180000},candidates:candidates.map(c=>({id:c.id,boundaryVerified:false}))};}});
upgradeService.inspect(feed,episode);await upgradeService.inflight.get(key);
upgradeService.inspect(feed,episode);assert.equal(upgrades,1,'unchanged unverified results do not cause repeated downloads');
upgradeStore.set('skip-audio-verification',key,{...upgradeStore.get('skip-audio-verification',key),verifierVersion:'legacy',inputKey:'legacy'});
upgradeService.inspect(feed,episode);await upgradeService.inflight.get(key);
upgradeService.inspect(feed,episode);assert.equal(upgrades,2,'version upgrade gets one bounded reevaluation, without reinstating disputes');
upgradeStore.close();
assert.match(adSkipStatusText({state:'CANDIDATES_FOUND'},true),/awaiting verification/);
assert.match(adSkipStatusText({state:'READY',verifiedCount:1,automaticSkipping:true},false),/is off/);
assert.equal(adSkipStatusText({state:'READY',verifiedCount:1,automaticSkipping:true},true),'Ad Skip ready');
assert.match(adSkipStatusText({state:'READY',code:'AUDIO_VARIANT_CHANGED'},true),/normal playback/);
console.log('Phase 4: cached contextual detection, bounded restart recovery, stale source fencing and queued rights revocation passed (mocked audio, no accuracy claim).');
