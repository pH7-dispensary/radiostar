// Isolated owned-audio browser acceptance. No production writes or paid providers.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { LocalStore } from "../persistence.mjs";
import { createStarCastServer } from "../server.mjs";
import { IntelligenceTestMode } from "../intelligence-test-mode.mjs";
import { episodeKey } from "../episode-pipeline.mjs";
import { adSkipFixture } from "../ad-skip-fixture.mjs";
import { verifyAdSkipAudio } from "../ad-skip-verification.mjs";
import { publisherRightsEvidence, assessPublisherRights } from "../rights-assessment.mjs";

import { PROCESSING_VERSION } from "../openai-intelligence.mjs";

const store = new LocalStore(":memory:"), app = createStarCastServer({ store, env: { STARCAST_ADMIN_TOKEN: "fixture-admin", STARCAST_DEV_INTELLIGENCE_TOKEN: "fixture-device" } });
const credential = "test-pilot-installation-credential-".repeat(2);
const listener = app.listeners.register(credential);
const ordinaryCredential = "ordinary-installation-credential-".repeat(2);
const ordinaryListener=app.listeners.register(ordinaryCredential);
app.listeners.preferences(ordinaryListener,{adSkipEnabled:true,advert:true});
store.set('feature-flag','adSkip',{id:'adSkip',state:'PRIVATE_BETA',rolloutPercent:100});
store.set("pilot-device", "owned-pilot-fixture", { listenerId: listener.id, expiresAt: new Date(Date.now() + 86400000).toISOString() });
const testing = new IntelligenceTestMode(store);
const configuration = testing.set({ enabled: true, adSkipPilotEnabled: true, listenerIds: [listener.id], expectedVersion: 0, reason: "Owned evaluation", confirmation: "ENABLE TESTING" }, "fixture-admin");
assert.equal(testing.adSkipPreparationAllowed(),true,"shared verification does not need the winning listener's context");
const feedUrl = "https://owned.example/feed.xml", episodeId = adSkipFixture.episodeId, audioUrl = "https://owned.example/audio.mp3", manifest = adSkipFixture.manifest();
const rights = { feedUrl, classification: "LICENSED", legalBasis: "Original authored fixture", assessmentEvidence: [{ type: "OWNED", source: "fixture author", value: "Original test script and generated audio" }], canProcessForAi: true, canRetain: true, canDisplayDerivedIntelligence: true, canTranscribeAudio: true, canDetectAdvertisements: true };
app.rights.set(rights);
store.set("intelligence", episodeKey(feedUrl, episodeId), { state: "READY", feedUrl, episodeId, testingContext: testing.context(listener.id), episode: { audioUrl }, transcript: { audioVariant: "owned-source", audioContentHash: manifest.audioContentHash, durationMs: manifest.durationMs, transcriptVersion: "owned-v1", segments: manifest.segments.map((row, i) => ({ ...row, id: `s${i}` })) } });
store.set("intelligence", episodeKey(feedUrl, episodeId), { ...store.get("intelligence", episodeKey(feedUrl, episodeId)), processingVersion: PROCESSING_VERSION, groundingVersion: "fixture-only" });
app.skips.verifyAudio = input => verifyAdSkipAudio({ ...input, audioFactory: async () => ({ path: "fixtures/ad-skip-owned-v1.mp3", durationMs: manifest.durationMs, delivery: { url: audioUrl, headers: { etag: `"${manifest.audioContentHash}"`, contentLength: manifest.contentLength } }, cleanup: async () => {} }) });
app.skips.inspect(feedUrl, episodeId); await Promise.all(app.skips.inflight.values());
const inspection = app.skips.inspect(feedUrl, episodeId);
assert.equal(inspection.verifiedCount, 1, JSON.stringify({ inspection, verification: app.skips.verification(episodeKey(feedUrl, episodeId)) }));
assert.equal(inspection.intervals.filter(row => row.type === "advert").length, 1, "ordinary product discussion is not an advertisement");
app.listeners.preferences(listener, { adSkipEnabled: true, advert: true });
await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const input = { feedUrl, episodeId, audioUrl, audioVariantFingerprint: manifest.audioContentHash };
const call = (path, value, token = credential) => fetch(origin + path, { method: "POST", headers: { authorization: `Bearer ${token}`, "x-star-cast-dev-token": "fixture-device", "content-type": "application/json" }, body: JSON.stringify(value) });

const {createServer}=await import('node:http');
const {readFileSync,writeFileSync}=await import('node:fs');
const {chromium}=await import(process.env.RADIOSTAR_PLAYWRIGHT_MODULE || 'playwright');
const media=createServer((req,res)=>{
 if(req.url==='/adapter.mjs'){res.setHeader('content-type','text/javascript');res.end(readFileSync('native/src/adSkipExecution.mjs'));}
 else if(req.url==='/audio.mp3'){res.setHeader('content-type','audio/mpeg');res.end(readFileSync('fixtures/ad-skip-owned-v1.mp3'));}
 else {res.setHeader('content-type','text/html');res.end('<audio controls></audio>');}
});
await new Promise(resolve=>media.listen(0,'127.0.0.1',resolve));
let browser;
try {
 const response=await call('/api/skips/status',input);assert.equal(response.status,200);const status=await response.json();assert(status.automaticSkipping);
 const interval=status.activeIntervals[0];
 browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage();
 await page.exposeFunction('authorise',async row=>{const r=await call('/api/skips/authorise',{...input,...row});assert.equal(r.status,200);return r.json();});
 await page.exposeFunction('receipt',async row=>{const r=await call('/api/skips/events',{...input,...row});assert.equal(r.status,200);return r.json();});
 await page.goto(`http://127.0.0.1:${media.address().port}`);
 const result=await page.evaluate(async ({interval,hash})=>{
  const {executeVerifiedSkip}=await import('/adapter.mjs');
  const bytes=await(await fetch('/audio.mp3')).arrayBuffer();
  const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');if(actual!==hash)throw Error('Variant mismatch');
  const audio=document.querySelector('audio');audio.src=URL.createObjectURL(new Blob([bytes],{type:'audio/mpeg'}));
  await new Promise((resolve,reject)=>{audio.onloadedmetadata=resolve;audio.onerror=reject;});
  let seeks=0;
  const seek=ms=>new Promise((resolve,reject)=>{seeks++;const timeout=setTimeout(()=>reject(Error('Seek timeout')),3000);audio.addEventListener('seeked',()=>{clearTimeout(timeout);resolve(audio.currentTime*1000);},{once:true});audio.currentTime=ms/1000;});
  await seek(interval.startMs-1000);audio.playbackRate=1.5;
  const start=performance.now();await audio.play();const playPromiseMs=performance.now()-start;
  const lease=await window.authorise({intervalId:interval.id,positionMs:audio.currentTime*1000,prefetch:true});
  await new Promise(resolve=>{const poll=()=>audio.currentTime*1000>=interval.startMs?resolve():setTimeout(poll,10);poll();});
  const positionMs=audio.currentTime*1000;
  const skipped=await executeVerifiedSkip({interval,positionMs,durationMs:audio.duration*1000,current:()=>true,getPosition:()=>audio.currentTime*1000,authorise:async()=>lease,seek});
  await window.receipt({intervalId:interval.id,eventId:'browser-batch6-skip',kind:'automatic_skip',positionMs:skipped.positionMs,originMs:skipped.originMs,authorisationId:lease.authorisationId});
  audio.pause(); // Undo must preserve pause and 1.5x and needs no further authorisation.
  const beforeUndoSeeks=seeks;const restored=await Promise.all([skipped.undo(),skipped.undo()]);
  await window.receipt({intervalId:interval.id,eventId:'browser-batch6-undo',kind:'undo',positionMs:restored[0],authorisationId:lease.authorisationId});
  return {audioHash:hash,interval,originMs:skipped.originMs,targetMs:skipped.positionMs,skippedDurationMs:skipped.durationMs,restoredMs:restored[0],undoSeeks:seeks-beforeUndoSeeks,paused:audio.paused,rate:audio.playbackRate,playPromiseMs,device:'Chromium, not a physical iPhone'};
 },{interval,hash:manifest.audioContentHash});
 assert.equal(result.undoSeeks,1);assert(result.paused);assert.equal(result.rate,1.5);assert(Math.abs(result.restoredMs-result.originMs)<=350);
 assert.equal(app.skips.operations().counts.automaticSkips,1);assert.equal(app.skips.operations().counts.undoEvents,1);
 writeFileSync('evals/recovery-batch6-playback.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>media.close(resolve));await new Promise(resolve=>app.server.close(resolve));store.close();}
