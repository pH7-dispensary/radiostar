import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createStarCastServer } from "./server.mjs";
import { LocalStore } from "./persistence.mjs";
import { episodeKey } from "./episode-pipeline.mjs";
import { EpisodePipeline } from "./episode-pipeline.mjs";
import { BudgetLedger } from "./openai-intelligence.mjs";
import { latestPublishedEpisodes } from "./followed-preparation.mjs";
import { IntelligenceTestMode } from "./intelligence-test-mode.mjs";

const published = (id, day, extra = {}) => ({ id, publishedAt: `2026-01-${day}T00:00:00Z`, audioUrl: `https://owned.example/${id}.mp3`, ...extra });
assert.deepEqual(latestPublishedEpisodes([
  published('old', '01'), published('third', '02'), published('second', '03'), published('newest', '04'),
  published('newest', '04'), published('withdrawn', '05', { withdrawn: true }), published('deleted', '06', { deleted: true }),
  published('bad-date', '07', { publishedAt: 'not a date' }), published('no-audio', '08', { audioUrl: null }),
  published('future', '09', { publishedAt: '2099-01-01' }),
]).map(e => e.id), ['newest', 'second', 'third']);

const store = new LocalStore(":memory:"), feeds = ["https://owned.example/a.xml", "https://owned.example/b.xml"];
let latest = 3, audioCalls = 0, textCalls = 0;
const text = "Our original software fixture discusses reliable evidence, careful source review, accountable spending and accurately timed podcast intelligence for listeners.";
const app = createStarCastServer({ store,
  env: { STARCAST_PAID_INTELLIGENCE: "enabled", STARCAST_AUDIO_TRANSCRIPTION: "enabled", OPENAI_API_KEY: "mock-only", STARCAST_DEV_INTELLIGENCE_TOKEN: "device", STARCAST_ADMIN_TOKEN: "admin" },
  fetchFeed: async () => `<rss><channel><title>Owned fixture</title>${Array.from({length: 125}, (_,i) => `<item><guid>old-${i}</guid><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate><enclosure url="https://owned.example/old-${i}.mp3"/></item>`).join('')}${Array.from({length: 4}, (_,i) => latest-i).reverse().map(i => `<item><guid>episode-${i}</guid><title>Original ${i}</title><pubDate>${new Date(Date.UTC(2026,0,20+i)).toUTCString()}</pubDate><itunes:duration>60</itunes:duration><enclosure url="https://owned.example/${i}.mp3"/></item>`).join("")}</channel></rss>`,
  resolveEpisode: async (feed,id) => ({id,title:id,showName:"Owned fixture",duration:"60",audioUrl:`https://owned.example/${feed.endsWith('a.xml')?'a':'b'}/${id}.mp3`,refs:[]}),
  audioFactory: async audioUrl => ({durationMs:60_000,contentHash:createHash('sha256').update(audioUrl).digest('hex'),chunkFactory:async()=>Buffer.from('owned mock audio'),cleanup:async()=>{}}),
  client: { audio: { transcriptions: { create: async () => { audioCalls++; return {segments:[{start:0,end:60,text}]}; } } }, responses: { create: async () => { textCalls++; return {status:"completed",output_text:JSON.stringify({overview:text,detail:text,themes:["Evidence"],sourceSegmentIndexes:[1],chapters:[{title:"Evidence",description:"Grounded review",sourceSegmentIndexes:[1]}]}),usage:{input_tokens:100,output_tokens:100}}; } } },
});
const grant = feedUrl => app.rights.set({feedUrl,classification:"LICENSED",legalBasis:"Original owned test fixture",assessmentEvidence:[{type:"OWNED",source:"test author",scope:"podcast",value:"fixture:owned"}],canAcquireTranscript:true,canProcessForAi:true,canTranscribeAudio:true,canDisplayDerivedIntelligence:true,canGenerateBrief:true,canGenerateChapters:true,canGenerateTopics:true,canSearchMoments:true,canSearchConversations:true,canDetectAdvertisements:true,canRetain:true});
feeds.forEach(grant);
app.rights.set({feedUrl:feeds[1],episodeId:"episode-2",classification:"DISPUTED",rightsReserved:true});
const user = app.listeners.register("ordinary-user-credential-at-least-32-characters");
const other = app.listeners.register("other-user-credential-at-least-32-characters");
for(const listener of [user,other]) for(const feedUrl of feeds) app.listeners.follow(listener,{feedUrl,following:true});
const actor={id:"test-admin",role:"SUPER_ADMIN",source:"session"}, prep=app.followedPreparation;
const settle = async () => { for(let i=0;i<5;i++){await prep.drain();await Promise.all(app.pipeline.inflight.values());} };
await new Promise(r=>app.server.listen(0,"127.0.0.1",r));
const origin=`http://127.0.0.1:${app.server.address().port}`;
try {
  assert.throws(()=>prep.action({action:"activate",reason:"test",confirmation:"CONFIRM",expectedVersion:0},actor),/Estimate/);
  let releaseDiscovery;
  const discoveryGate=new Promise(resolve=>{releaseDiscovery=resolve;}), discover=prep.discover;
  prep.discover=async feed=>{await discoveryGate;return discover(feed);};
  try {
    const accepted=await fetch(origin+'/api/admin/intelligence/followed',{method:'POST',headers:{'x-star-cast-admin-token':'admin','content-type':'application/json'},body:JSON.stringify({action:'estimate'}),signal:AbortSignal.timeout(2000)});
    assert.equal(accepted.status,202);assert.equal((await accepted.json()).refreshInProgress,true);assert.equal(audioCalls,0);
  } finally {releaseDiscovery();}
  await prep.refreshing;prep.discover=discover;
  const estimate=await prep.refresh({force:true});
  app.adminService.setFeatureFlag({id:'adSkip',state:'PRIVATE_BETA',rolloutPercent:100,reason:'Authorised fixture verification'},actor);
  assert.equal(estimate.snapshot.activeUsers,2);assert.equal(estimate.snapshot.feeds,2);assert.equal(estimate.uniqueEpisodes,6);assert.equal(audioCalls,0);
  assert.equal(estimate.counts.REVIEW_REQUIRED,1);assert(estimate.estimate.knownUsd>0);
  assert.equal(estimate.acquisition.requiringAudio,6);assert.equal(estimate.acquisition.eligibleRequiringAudio,5);
  assert.equal(estimate.budget.remainingDailyUsd,5);
  assert.deepEqual(estimate.rows.filter(r=>r.feedUrl===feeds[0]).map(r=>r.episodeId),['episode-3','episode-2','episode-1']);
  await prep.refresh({force:true,newlyFollowed:feeds[0]});
  assert.equal(prep.summary().rows.find(r=>r.feedUrl===feeds[0]&&r.rank===0).priority,70,'new follow never outranks opened content');
  assert.throws(()=>prep.action({action:"activate",reason:"test"},{role:"READ_ONLY"}),/Super/);
  prep.action({action:"activate",reason:"Authorised test",confirmation:"CONFIRM",expectedVersion:0},actor);
  await settle();
  assert.equal(prep.summary().counts.READY,5);assert.equal(audioCalls,5);assert.equal(textCalls,5);
  await prep.refresh({force:true});await settle();assert.equal(audioCalls,5,"shared follows and refresh must reuse completed results");
  assert.equal(prep.summary().acquisition.intelligenceCacheHits,5);
  assert.equal(prep.summary().acquisition.transcriptCacheHits,5);
  assert.equal(prep.summary().estimate.eligibleKnownUsd,0);
  const completed=app.pipeline.status(feeds[0],'episode-3');
  assert.equal(completed.work.completedChunks,1);assert.equal(completed.work.completedBatches,1,'chunk and analysis progress both survive final handoff');
  await prep.encounter(user.id,feeds[0],'episode-3','playing');
  await prep.encounter(user.id,feeds[0],'episode-3','opened');
  await prep.encounter(other.id,feeds[0],'episode-3','opened');
  await prep.refresh({force:true});assert.equal(prep.summary().rows.find(r=>r.key===episodeKey(feeds[0],'episode-3')).priority,100,'open and scheduled refresh cannot downgrade playing priority');
  const normalDiscovery=prep.discover;prep.discover=async feed=>{if(feed===feeds[0])throw Error('temporary RSS outage');return normalDiscovery(feed);};
  const outage=await prep.refresh({force:true});assert.equal(outage.snapshot.errors.length,1);assert.equal(outage.uniqueEpisodes,6,'feed outage preserves the known window');
  prep.discover=normalDiscovery;await prep.refresh({force:true});assert.equal(prep.summary().snapshot.errors.length,0);
  latest=4;await prep.refresh({force:true});await settle();
  assert.equal(prep.summary().uniqueEpisodes,6);assert.equal(audioCalls,7,"only new publications process");
  assert(app.pipeline.status(feeds[0],"episode-1").brief,"historical intelligence retained");
  app.listeners.follow(user,{feedUrl:feeds[1],following:false});
  await prep.refresh({force:true});assert.equal(prep.summary().snapshot.feeds,2,'another follower retains shared demand');
  app.listeners.follow(other,{feedUrl:feeds[1],following:false});
  await prep.refresh({force:true});assert.equal(prep.summary().uniqueEpisodes,3,'last unfollow removes future demand, not cached intelligence');
  assert(app.pipeline.status(feeds[1],'episode-3').brief);
  const ready=await(await fetch(origin+'/api/intelligence/status?'+new URLSearchParams({feedUrl:feeds[0],episodeId:"episode-4"}),{headers:{'x-star-cast-dev-token':'device',authorization:'Bearer ordinary-user-credential-at-least-32-characters'}})).json();
  assert.equal(ready.status.state,"READY");assert(ready.status.brief);assert.equal(ready.status.transcript,undefined);
  const denied=await fetch(origin+'/api/admin/intelligence/followed',{method:'POST',headers:{'x-star-cast-dev-token':'device','content-type':'application/json'},body:JSON.stringify({action:'activate'})});assert.equal(denied.status,403);
  const forged=await fetch(origin+'/api/intelligence/request',{method:'POST',headers:{'x-star-cast-dev-token':'device','content-type':'application/json'},body:JSON.stringify({feedUrl:feeds[0],episodeId:'forged',capability:'brief',trigger:'automatic',platformProcessing:true,testingContext:{platform:true,version:1},allowAudio:true})});
  assert.equal(forged.status,202);await Promise.all(app.pipeline.inflight.values());assert.equal(audioCalls,7);assert.equal(app.pipeline.status(feeds[0],'forged').code,'AUDIO_CONSENT_REQUIRED');
  const key=episodeKey(feeds[0],'episode-4');prep.action({key,action:'pause',reason:'test pause'},actor);assert.equal(prep.summary().rows.find(r=>r.key===key).state,'PAUSED');prep.action({key,action:'prioritise',reason:'test priority'},actor);assert.equal(prep.summary().rows.find(r=>r.key===key).priority,95);
  prep.action({action:'suspend',reason:'rollback test',confirmation:'CONFIRM',expectedVersion:1},actor);
  latest=5;await prep.refresh({force:true});await settle();assert.equal(audioCalls,7);
  const pausedFollow=await fetch(origin+'/api/listener/follow',{method:'POST',headers:{'x-star-cast-dev-token':'device',authorization:'Bearer ordinary-user-credential-at-least-32-characters','content-type':'application/json'},body:JSON.stringify({feedUrl:feeds[0],following:true})});
  assert.equal((await pausedFollow.json()).processing.code,'AUTOMATIC_PREPARATION_DISABLED','platform pause must not fall back to legacy paid preparation');
  app.listeners.privacy(other,{intelligenceEnabled:false});assert.equal(prep.listeners().length,1);
  assert.equal(app.skips.automaticEnabled(user),false,'following and a global beta flag alone do not enrol an Ad Skip tester');
  store.set('pilot-device','followed-skip-tester',{listenerId:user.id,expiresAt:new Date(Date.now()+86400000).toISOString()});
  new IntelligenceTestMode(store).set({enabled:true,adSkipPilotEnabled:true,listenerIds:[user.id],expectedVersion:0,confirmation:'ENABLE TESTING',reason:'Explicit cached-skip tester fixture'},actor.id);
  assert.equal(app.skips.automaticEnabled(user),true,'pausing preparation does not disable verified cached skips');prep.action({action:'activate',reason:'test',confirmation:'CONFIRM',expectedVersion:2},actor);assert.equal(app.skips.automaticEnabled(user),true);assert.equal(app.skips.automaticEnabled(null),false);
  const budgetKey=episodeKey(feeds[0],'capacity-wait'), queued=[];
  store.set('intelligence',budgetKey,{jobId:'capacity-job',feedUrl:feeds[0],episodeId:'capacity-wait',state:'BLOCKED',code:'BUDGET_LIMIT',platformProcessing:true,testingContext:{platform:true,version:999},priority:95,allowAudio:true,attempts:1,resumeAfter:new Date(0).toISOString(),completedAt:new Date().toISOString()});
  const ledger=store.get('budget','ledger');ledger.usage.push({id:'test-exhaustion',usd:5,at:new Date().toISOString(),kind:'text'});store.set('budget','ledger',ledger);
  const restart=new EpisodePipeline({store,ledger:new BudgetLedger({enabled:true},store),testingMode:{limits:()=>({})},queue:{enqueue:async job=>queued.push(job)}});
  await restart.recoverQueued();assert.equal(queued.length,0,'expired allowance falls back to base ceiling, never extends it');
  const saved=store.get('budget','ledger');saved.usage.find(v=>v.id==='test-exhaustion').at='2026-01-01T00:00:00.000Z';store.set('budget','ledger',saved);
  store.set('intelligence',budgetKey,{...store.get('intelligence',budgetKey),resumeAfter:new Date(0).toISOString()});
  await restart.recoverQueued();assert.equal(queued.length,1);assert.equal(queued[0].priority,95);assert.equal(queued[0].jobId,'capacity-job');
  await restart.recoverQueued();assert.equal(queued.length,1,'durable capacity resume deduplicates outbox');
} finally { await new Promise(r=>app.server.close(r));store.close(); }
console.log('Platform preparation: two ordinary users, two feeds, latest-three dedup, automatic Whisper, cached READY, new publication, retained history, native status, privacy, RBAC, forged authority and rollback passed.');
