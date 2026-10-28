import assert from 'node:assert/strict';
import {LocalStore} from './persistence.mjs';
import {SkipService} from './skip-service.mjs';
import {prepareAdSkipOpening,signedAdSkipVariant} from './ad-skip-source.mjs';
import {proposeCompleteBreaks} from './ad-breaks.mjs';
import {proposeOpeningBreaks} from './ad-breaks.mjs';
import {IntelligenceTestMode} from './intelligence-test-mode.mjs';
import {appendReviewEvent} from './ad-skip-corpus.mjs';
import {episodeKey} from './episode-pipeline.mjs';
import {createStarCastServer} from './server.mjs';
import {verifyAdSkipAudio} from './ad-skip-verification.mjs';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const segments=[
 {id:'sponsor',startMs:0,endMs:2000,text:'This episode is brought to you by Example.'},
 {id:'description',startMs:2500,endMs:6000,text:'The service helps our team with their backups.'},
 {id:'offer',startMs:6500,endMs:11000,text:'Use the promo code RADIO for a free trial.'},
 {id:'close',startMs:11500,endMs:15000,text:'Thank you for supporting us.'},
 {id:'editorial',startMs:23000,endMs:27000,text:'Hello, friends, and welcome back to the show.'},
];
const digest='a'.repeat(64), feed='https://owned.example/rss', episode='opening', url='https://owned.example/audio.mp3';
const rules={opens:t=>/brought to you by/.test(t),qualifies:t=>/promo code/.test(t),denies:t=>/not sponsored/.test(t)};
for(const text of ['You have one unheard message.',"This week, we're going to respond to criticism of operating systems."]){const proposals=proposeOpeningBreaks([...segments.slice(0,4),{id:'scene',startMs:15100,endMs:21000,text},segments[4]],rules);assert.equal(proposals.length,1);assert.equal(proposals[0].endMs,15000,'editorial cold open must never be swallowed while waiting for a welcome');assert(!proposals[0].sourceSegmentIds.includes('scene'));assert(proposals[0].reviewOnly);}
for(const closing of ['Back to the show and its editorial discussion.',"That's all for this episode."]){const middle=segments.slice(0,4).map(s=>({...s,startMs:s.startMs+300000,endMs:s.endMs+300000}));const proposals=proposeCompleteBreaks([...middle,{id:'second',startMs:316000,endMs:319000,text:'Also brought to you by a second provider. Use the promo code SECOND.'},{id:'return',startMs:320000,endMs:325000,text:closing}],rules);assert.equal(proposals.length,1);assert.equal(proposals[0].endMs,319000);assert(proposals[0].reviewOnly);assert(!proposals[0].sourceSegmentIds.includes('return'));}
const privateVariant={audioVariantFingerprint:digest,etag:'"strong"',windows:[{start:0,end:1,sha256:digest}],privateCache:{bucket:'private-test',key:`seed/ad-skip-evaluation/${digest}.mp3`}};
const signed=await signedAdSkipVariant(privateVariant,{bucket:'private-test',client:{},sign:async(_c,command,opts)=>{assert.equal(command.input.Key,privateVariant.privateCache.key);assert.equal(opts.expiresIn,7200);return 'https://private.example/signed';}});assert.equal(signed.deliveryUrl,'https://private.example/signed');assert.equal(signed.privateCache,undefined);
for(const bad of [{...privateVariant,privateCache:{bucket:'another-account',key:privateVariant.privateCache.key}},{...privateVariant,privateCache:{bucket:'private-test',key:'backups/private.sqlite'}},{...privateVariant,windows:[]}])await assert.rejects(signedAdSkipVariant(bad,{bucket:'private-test'}),/unavailable/);
const store=new LocalStore(':memory:');
let transcript={segments,audioContentHash:digest,audioVariant:digest,transcriptVersion:'test-opening',durationMs:60000};
const pipeline={status:()=>({episode:{audioUrl:url},transcript})};
let verifies=0;
const service=new SkipService(store,pipeline,{canVerifyAudio:()=>true,verifyAudio:async({candidates})=>{verifies++;assert(candidates.every(x=>x.openingBreak && x.independentReview));return {state:'READY',candidates:[],variant:null};}});
service.inspect(feed,episode);assert.equal(verifies,0,'partial CTA never becomes a complete opening skip');
let opening=store.all('skip-interval').map(([,v])=>v).find(x=>x.openingBreak);
assert.equal(opening.startMs,0);assert.equal(opening.endMs,15000);assert(opening.reviewOnly);assert.equal(opening.qualifiesForAudioVerification,false);
// Synthetic annotations are test-only; no real human accuracy claim.
const annotation={id:'synthetic',kind:'advert',startMs:0,endMs:15400,independent:true,reviewer:'Synthetic test reviewer',audioContentHash:digest,evidenceReference:'test-only',version:1};
const events=[appendReviewEvent([],{action:'annotation',episodeId:episode,audioContentHash:digest,annotation,version:1})];
const input={feedUrl:feed,episodeId:episode,corpusEpisodeId:episode,audioContentHash:digest,events,confirmation:'CONFIRM',reason:'Synthetic regression'};
const actor={role:'SUPER_ADMIN',source:'session',id:'test'};
for(const bad of [{role:'READ_ONLY',source:'session'},{role:'SUPER_ADMIN',source:'token'}])assert.throws(()=>service.attachReview(input,bad));
assert.throws(()=>service.attachReview({...input,audioContentHash:'b'.repeat(64)},actor));
assert.throws(()=>service.attachReview({...input,events:[{...events[0],hash:'forged'}]},actor));
service.attachReview(input,actor);service.inspect(feed,episode);await Promise.all(service.inflight.values());assert.equal(verifies,1);
opening=store.all('skip-interval').map(([,v])=>v).find(x=>x.openingBreak);assert(opening.qualifiesForAudioVerification);assert.equal(opening.independentReview.endMs,15400);
// Routine approval is machine-driven; it must not manufacture human labels.
const autoStore=new LocalStore(':memory:');let autoCalls=0;
const autoSegments=segments.map(s=>s.id==='close'?{...s,text:'Visit example.com for this offer.'}:s);
const auto=new SkipService(autoStore,{status:()=>({episode:{audioUrl:url},transcript:{...transcript,segments:autoSegments}})},{canVerifyAudio:()=>true,automaticEnabled:()=>true,verifyAudio:async({candidates})=>{autoCalls++;assert.equal(candidates.length,1);const c=candidates[0];assert(c.openingBreak && !c.reviewOnly && !c.independentReview);return {state:'READY',variant:{audioVariantFingerprint:digest,durationMs:60000,deliveryUrl:url},candidates:[{id:c.id,startMs:0,endMs:15400,boundaryVerified:true,approvalSource:'AUTOMATED_AUDIO_VERIFICATION',acousticPause:{startMs:14900,endMs:15900},boundaryFingerprint:digest}]};}});
auto.inspect(feed,episode);await Promise.all(auto.inflight.values());assert.equal(autoCalls,1);
const autoOpening=autoStore.all('skip-interval').map(([,v])=>v).find(r=>r.openingBreak);
assert.equal(autoOpening.verificationState,'VERIFIED');assert.equal(autoOpening.approvalSource,'AUTOMATED_AUDIO_VERIFICATION');assert(!autoOpening.evidence.some(e=>e.source==='human_review'));assert.equal(autoStore.all('skip-human-review').length,0);
auto.review({id:autoOpening.id,action:'suspend',expectedState:'VERIFIED',reason:'Complaint regression',confirmation:'CONFIRM'},actor);auto.inspect(feed,episode);await Promise.all(auto.inflight.values());assert.equal(autoCalls,1,'complaint suspension cannot be automatically reinstated');autoStore.close();
const midStore=new LocalStore(':memory:'),mid=new SkipService(midStore,{status:()=>({episode:{audioUrl:url},transcript:{...transcript,durationMs:900000,segments:[...autoSegments.slice(0,4).map(s=>({...s,startMs:s.startMs+300000,endMs:s.endMs+300000})),{id:'return',startMs:317000,endMs:320000,text:'Back to the show and its editorial discussion.'}]}})});
mid.inspect(feed,episode);const midIntervals=midStore.all('skip-interval').map(([,r])=>r),whole=midIntervals.find(r=>r.breakCandidate&&r.automaticBreakEvidence);assert(whole?.qualifiesForAudioVerification&&!whole.reviewOnly);assert(midIntervals.filter(r=>r.id!==whole.id&&r.startMs>=whole.startMs&&r.endMs<=whole.endMs).every(r=>!r.qualifiesForAudioVerification&&r.partialCommercialBreak),'full commercial break supersedes shorter CTA fragments');midStore.close();
// Real PCM tone/silence fixture tests acoustic qualification, not real-world accuracy.
const temp=await mkdtemp(join(tmpdir(),'radio-opening-'));
try{
 const rate=8000,seconds=8,data=Buffer.alloc(rate*seconds*2),header=Buffer.alloc(44);
 for(let i=0;i<rate*seconds;i++)data.writeInt16LE(i>=3*rate&&i<4*rate?0:Math.round(12000*Math.sin(i*2*Math.PI*440/rate)),i*2);
 header.write('RIFF');header.writeUInt32LE(36+data.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(rate,24);header.writeUInt32LE(rate*2,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(data.length,40);
 const bytes=Buffer.concat([header,data]),path=join(temp,'tone.wav'),hash=createHash('sha256').update(bytes).digest('hex');await writeFile(path,bytes);
 const candidate={id:'machine',startMs:0,endMs:3100,nextSpeechMs:5000,openingBreak:true,qualifiesForAudioVerification:true,automaticOpeningEvidence:{version:'commercial-opening-v1'}};
 const preparedAudio={path,durationMs:8000,delivery:{url,headers:{}}};
 const proof=await verifyAdSkipAudio({audioUrl:url,expectedContentHash:hash,candidates:[candidate,{...candidate,id:'speech',endMs:2000},{...candidate,id:'uncertain',automaticOpeningEvidence:null},{...candidate,id:'editorial',nextSpeechMs:3300}],preparedAudio});
 assert.equal(proof.candidates[0].boundaryVerified,true);assert(proof.candidates[0].endMs>=3490&&proof.candidates[0].endMs<=3510);assert.equal(proof.candidates[0].approvalSource,'AUTOMATED_AUDIO_VERIFICATION');assert(proof.candidates.slice(1).every(c=>!c.boundaryVerified));
 assert.equal((await verifyAdSkipAudio({audioUrl:url,expectedContentHash:digest,candidates:[candidate],preparedAudio})).state,'DYNAMIC_VARIANT');
}finally{await rm(temp,{recursive:true,force:true});}
for(const firstText of ['Hello and welcome to the show.','We discuss sponsors and how advertising works.','This is not sponsored.']) {
 const isolated=new LocalStore(':memory:');const negative=new SkipService(isolated,{status:()=>({episode:{audioUrl:url},transcript:{...transcript,segments:[{...segments[0],text:firstText},...segments.slice(1)]}})});
 negative.inspect(feed,episode);assert.equal(isolated.all('skip-interval').some(([,v])=>v.openingBreak),false);isolated.close();
}
for(const text of ['Our sponsor is mentioned in an editorial discussion of advertising and promo codes.','Our sponsor Example invited us to pay them a visit.','Our sponsor Example says do not sign up for the free trial.','A guest recommends a new product, which we discuss today.','Please follow this podcast and visit the show notes.']){
 const s=new LocalStore(':memory:'),engine=new SkipService(s,{status:()=>({episode:{audioUrl:url},transcript:{...transcript,segments:[{id:'negative',startMs:0,endMs:15000,text}]}})});engine.inspect(feed,episode);assert(!s.all('skip-interval').some(([,r])=>r.qualifiesForAudioVerification),text);s.close();
}
const unbound=new LocalStore(':memory:');let preparations=0,release;
const unboundJob={episode:{audioUrl:url},transcript:{...transcript,audioContentHash:null,audioVariant:'publisher'}};
const recovering=new SkipService(unbound,{status:()=>unboundJob},{canVerifyAudio:()=>true,prepareSource:async()=>{preparations++;await new Promise(r=>release=r);return {transcript,preparedAudio:{cleanup:async()=>{}}};}});
recovering.inspect(feed,episode);recovering.inspect(feed,episode);await new Promise(r=>setImmediate(r));assert.equal(preparations,1);release();await Promise.all(recovering.sourceInflight.values());assert.equal(recovering.inspect(feed,episode).audioAlignment,'HASH_BOUND');assert.equal(unboundJob.transcript.audioContentHash,null,'publisher transcript is never relabelled as audio aligned');
recovering.inspect(feed,episode);assert.equal(preparations,1,'source cache reused');
const ledger={controls:{enabled:true,dailyUsd:5,monthlyUsd:25,dailyTranscriptionSeconds:10800,maxEpisodeSeconds:7200,transcriptionModel:'whisper-1'},refresh(){},totals:()=>({day:0,month:0,transcriptionSeconds:0})};
let calls=0,cleaned=0;
const options={episodeId:episode,audioUrl:url,ledger,store,client:{},authorised:()=>true,audioFactory:async()=>({contentHash:digest,durationMs:4000000,cleanup:async()=>cleaned++}),transcribe:async input=>{calls++;assert.equal(input.durationMs,180000);assert(input.checkpointPrefix.includes(digest));input.beforePaid();return {segments,transcriptVersion:'mock'};}};
const acquired=await prepareAdSkipOpening(options);assert.equal(calls,1);assert.equal(acquired.transcript.complete,false);assert.equal(acquired.transcript.durationMs,4000000);await acquired.preparedAudio.cleanup();
await assert.rejects(prepareAdSkipOpening({...options,audioFactory:async()=>({contentHash:digest,durationMs:7200001,cleanup:async()=>cleaned++})}),/limits/);assert.equal(calls,1,'opening window cannot evade full episode cap');
await assert.rejects(prepareAdSkipOpening({...options,ledger:{...ledger,totals:()=>({day:5,month:0,transcriptionSeconds:0})}}),/budget/);assert.equal(calls,1);
const mode=new IntelligenceTestMode(store,{now:()=>100000});store.set('installation','tester',{id:'tester'});store.set('pilot-device','tester',{listenerId:'tester',expiresAt:new Date(500000).toISOString()});
mode.setAdSkipPilot({enabled:true,listenerIds:['tester'],expiresAt:new Date(400000).toISOString(),expectedVersion:0,confirmation:'ENABLE AD SKIP PILOT',reason:'Separate safety pilot'},'test');assert(mode.adSkipAllowed('tester'));assert(mode.adSkipPreparationAllowed());assert(!mode.allowed('tester'));assert.deepEqual(mode.limits(mode.context('tester')),{},'no accelerated allowance');
assert(!mode.adSkipAllowed('ordinary'));store.set('pilot-device','tester',{listenerId:'tester',expiresAt:new Date(99999).toISOString()});assert(!mode.adSkipAllowed('tester'));assert(!mode.adSkipPreparationAllowed());
const httpStore=new LocalStore(':memory:'),app=createStarCastServer({store:httpStore,env:{STARCAST_ADMIN_TOKEN:'test-admin',STARCAST_DEV_INTELLIGENCE_TOKEN:'test-device'}});
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
try{
 const endpoint=`http://127.0.0.1:${app.server.address().port}/api/admin/ad-skip/pilot`;
 assert.equal((await fetch(endpoint)).status,403);
 for(const role of ['READ_ONLY','OPERATIONS_ADMIN','SUPER_ADMIN']){
  const session=app.adminService.startSession({id:role,role,name:role});
  const body=JSON.stringify({enabled:false,expectedVersion:0,confirmation:'DISABLE AD SKIP PILOT',reason:'HTTP regression'});
  const headers={'content-type':'application/json',cookie:`starcast_admin=${session.id}`};
  assert.equal((await fetch(endpoint,{method:'POST',headers,body})).status,403,'CSRF required');
  const response=await fetch(endpoint,{method:'POST',headers:{...headers,'x-star-cast-csrf':session.csrf},body});
  assert.equal(response.status,role==='SUPER_ADMIN'?200:403);
 }
 assert.equal(httpStore.all('intelligence-test-mode').length,0,'HTTP pilot controls cannot create a paid allowance');
}finally{await new Promise(r=>app.server.close(r));httpStore.close();}
store.close();unbound.close();
console.log('Opening break, editorial negatives, immutable hash-bound review, deduplicated source acquisition, full-source cap and separate pilot limits passed.');
