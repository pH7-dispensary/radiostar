// Play the actual preserved publisher bytes through the shared native seek
// adapter and live AWS leases. This is Chromium evidence, not an iPhone claim.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {verifyAwsIdentity} from './aws-account-guard.mjs';
import {verifyReviewChain,currentReviews} from '../ad-skip-corpus.mjs';
import {verifyAudioRanges} from '../native/src/verifiedAudioRanges.mjs';
verifyAwsIdentity();
const [specPath,audioPath,outputPath]=process.argv.slice(2);
assert(specPath && audioPath && outputPath,'Use <spec.json> <exact-audio-file> <result.json>');
const spec=JSON.parse(readFileSync(specPath)),audioBytes=readFileSync(audioPath);
assert(audioBytes.length<=100*1024*1024,'Bounded desktop evaluation only; native cache limits remain unchanged');
assert.equal(createHash('sha256').update(audioBytes).digest('hex'),spec.audioContentHash);
verifyReviewChain(spec.events || []);
const labels=currentReviews(spec.events || [],{id:spec.corpusEpisodeId,audioContentHash:spec.audioContentHash}).labels;
const machineOnly=spec.requireHumanReview===false;
const c=JSON.parse(readFileSync('.starcast/cloud-connection.json')),a=JSON.parse(readFileSync('.starcast/cloud-admin.json')),device=JSON.parse(readFileSync('.starcast/translation-verification.json'));
assert.equal(c.url,'https://d3ri12f40b85i3.cloudfront.net');
const gateway={'content-type':'application/json','x-star-cast-dev-token':c.token};
const login=await fetch(c.url+'/api/admin/session',{method:'POST',headers:gateway,body:JSON.stringify({adminToken:a.token,emergency:true})});assert.equal(login.status,201);
const cookies=login.headers.getSetCookie().map(x=>x.split(';')[0]);
const admin={...gateway,cookie:cookies.join('; '),'x-star-cast-csrf':decodeURIComponent(cookies.find(x=>x.startsWith('starcast_admin_csrf=')).split('=').slice(1).join('='))};
const listener={'content-type':'application/json','x-star-cast-pilot-token':device.deviceToken,authorization:'Bearer '+device.credential};
async function api(path,input,headers=listener){const r=await fetch(c.url+path,{method:input?'POST':'GET',headers,body:input?JSON.stringify(input):undefined,signal:AbortSignal.timeout(20000)});const value=await r.json();assert(r.ok,`${path} ${r.status} ${value.error||''}`);return value;}
let browser,media;
const input={feedUrl:spec.feedUrl,episodeId:spec.episodeId,audioUrl:spec.audioUrl,audioVariantFingerprint:spec.audioContentHash};
try {
 assert((await api('/api/admin/ad-skip/pilot',null,admin)).configuration.active);
 const paidBefore=(await api('/api/admin/intelligence/testing',null,admin));
 await api('/api/listener/preferences',{adSkipEnabled:true,advert:true});
 const status=await api('/api/skips/status',input);
 assert(status.automaticSkipping);assert.equal(status.activeIntervals.length,1);
 const interval=status.activeIntervals[0],gold=labels.find(l=>l.kind==='advert'&&l.startMs===interval.startMs&&l.endMs===interval.endMs);
 if (!machineOnly) assert(gold,'Complete exact reviewed break required, not a shorter matched fragment');
 else {
  assert.equal(interval.startMs,spec.expectedMachineInterval.startMs);assert.equal(interval.endMs,spec.expectedMachineInterval.endMs);
  const operations=await api('/api/admin/ad-skip',null,admin);
  const recorded=operations.intervals.find(r=>r.id===interval.id);
  assert.equal(recorded.approvalSource,'AUTOMATED_AUDIO_VERIFICATION');assert(!recorded.evidenceSources.includes('human_review'));
 }
 assert.equal(status.variant.audioVariantFingerprint,spec.audioContentHash);
 const proofStart=performance.now();
 await verifyAudioRanges(status.variant,{nonce:randomUUID(),digest:async bytes=>createHash('sha256').update(new Uint8Array(bytes)).digest('hex')});
 const rangeProof={verified:true,verificationMs:performance.now()-proofStart,witnessBytes:status.variant.windows.reduce((n,w)=>n+w.end-w.start+1,0),fullSourceBytes:status.variant.contentLength,ifMatchEnforced:true};
 assert.equal((await api('/api/skips/status',{...input,audioVariantFingerprint:'0'.repeat(64)})).automaticSkipping,false);
 media=createServer((req,res)=>{
  if(req.url==='/adapter.mjs'){res.setHeader('content-type','text/javascript');return res.end(readFileSync('native/src/adSkipExecution.mjs'));}
  if(req.url==='/audio.mp3'){res.setHeader('content-type','audio/mpeg');return res.end(audioBytes);}
  res.setHeader('content-type','text/html');res.end('<title>Reviewed publisher audio acceptance</title><audio controls></audio>');
 });await new Promise(r=>media.listen(0,'127.0.0.1',r));
 const {chromium}=await import(process.env.RADIOSTAR_PLAYWRIGHT_MODULE||'playwright');
 browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage();
 await page.exposeFunction('authorise',row=>api('/api/skips/authorise',{...input,...row}));
 await page.exposeFunction('receipt',row=>api('/api/skips/events',{...input,eventId:randomUUID(),...row}));
 await page.goto(`http://127.0.0.1:${media.address().port}`);
 const playback=await page.evaluate(async({interval,hash})=>{
  const {executeVerifiedSkip}=await import('/adapter.mjs');const t0=performance.now();
  const bytes=await(await fetch('/audio.mp3')).arrayBuffer();const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');if(actual!==hash)throw Error('Played source differs');
  const audio=document.querySelector('audio');audio.src=URL.createObjectURL(new Blob([bytes],{type:'audio/mpeg'}));await new Promise((r,j)=>{audio.onloadedmetadata=r;audio.onerror=j;});
  const sourcePreparationMs=performance.now()-t0;let seeks=0;
  const seek=ms=>new Promise((r,j)=>{seeks++;const timer=setTimeout(()=>j(Error('Seek timeout')),3000);audio.addEventListener('seeked',()=>{clearTimeout(timer);r(audio.currentTime*1000);},{once:true});audio.currentTime=ms/1000;});
  const authStart=performance.now(),lease=await window.authorise({intervalId:interval.id,positionMs:0,prefetch:true}),authorisationMs=performance.now()-authStart;
  audio.playbackRate=1.5;const playStart=performance.now();await audio.play();const playStartupMs=performance.now()-playStart;
  const origin=audio.currentTime*1000;await window.receipt({intervalId:interval.id,kind:'skip_requested',positionMs:origin});
  const seekStart=performance.now();let attempt;
  const result=await executeVerifiedSkip({interval,positionMs:audio.currentTime*1000,durationMs:audio.duration*1000,current:()=>true,getPosition:()=>audio.currentTime*1000,authorise:async()=>lease,seek,onStage:(kind,{positionMs})=>{attempt=window.receipt({intervalId:interval.id,kind,positionMs,authorisationId:lease.authorisationId});}});
  const seekConfirmationMs=performance.now()-seekStart;await attempt;
  await window.receipt({intervalId:interval.id,kind:'automatic_skip',positionMs:result.positionMs,originMs:result.originMs,authorisationId:lease.authorisationId});
  // A confirmed seek can still be followed by decoder buffering. Observe real
  // clock advancement within a bounded window, without issuing another play.
  const after=audio.currentTime,continuationStart=performance.now();
  while(!audio.paused&&audio.currentTime<=after&&performance.now()-continuationStart<3000)await new Promise(r=>setTimeout(r,50));
  const continuing=!audio.paused&&audio.currentTime>after,continuationMs=performance.now()-continuationStart,advancedMs=(audio.currentTime-after)*1000,automaticSeeks=seeks;
  audio.pause();const beforeUndoSeeks=seeks,undoStart=performance.now();const restored=await Promise.all([result.undo(),result.undo()]);const undoMs=performance.now()-undoStart;
  await window.receipt({intervalId:interval.id,kind:'undo',positionMs:restored[0],authorisationId:lease.authorisationId});
  return {originMs:result.originMs,targetMs:result.positionMs,restoredMs:restored[0],continuing,continuationMs,advancedMs,pausedAfterUndo:audio.paused,rate:audio.playbackRate,automaticSeeks,undoSeeks:seeks-beforeUndoSeeks,sourcePreparationMs,authorisationMs,playStartupMs,seekConfirmationMs,undoMs,device:'Chromium using shared native adapter; not physical iPhone'};
 },{interval,hash:spec.audioContentHash});
 try {assert(playback.continuing&&playback.pausedAfterUndo);assert.equal(playback.rate,1.5);assert.equal(playback.automaticSeeks,1);assert.equal(playback.undoSeeks,1);assert(Math.abs(playback.restoredMs-playback.originMs)<=350);assert(Math.abs(playback.targetMs-interval.endMs)<=350);}
 catch(error){writeFileSync(outputPath+'.failed.json',JSON.stringify({at:new Date().toISOString(),passed:false,playback,error:error.message},null,2)+'\n');throw error;}
 const after=await api('/api/admin/intelligence/testing',null,admin);assert.deepEqual(after.configuration,paidBefore.configuration);assert.deepEqual(after.standardLimits,paidBefore.standardLimits);
 const result={at:new Date().toISOString(),source:'preserved exact publisher MP3; private S3 delivery verified with the native range verifier',audioContentHash:spec.audioContentHash,feedUrl:spec.feedUrl,episodeId:spec.episodeId,interval,review:gold?{id:gold.id,chainHash:spec.events.at(-1).hash,startMs:gold.startMs,endMs:gold.endMs}:null,approvalSource:machineOnly?'AUTOMATED_AUDIO_VERIFICATION':'HUMAN_REVIEW_PLUS_AUDIO',independentAccuracyEvidence:!machineOnly,rangeProof,playback,mismatchDenied:true,paidAllowanceUnchanged:true,physicalIphoneVerified:false};
 writeFileSync(outputPath,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
} finally {await browser?.close();if(media)await new Promise(r=>media.close(r));await fetch(c.url+'/api/admin/session',{method:'DELETE',headers:admin});}
