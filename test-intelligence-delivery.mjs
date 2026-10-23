import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {LocalStore} from "./persistence.mjs";
import {EpisodePipeline,episodeKey,publicIntelligence,listenerProcessingStatus} from "./episode-pipeline.mjs";
import {BudgetLedger,PROCESSING_VERSION} from "./openai-intelligence.mjs";
import {assessTranscript} from "./transcripts.mjs";
import {buildSearchIndex,deliveryValidation} from "./intelligence-delivery.mjs";
import {SkipService} from "./skip-service.mjs";
import {intelligenceCapabilities} from "./native/src/intelligencePresentation.mjs";
import {createIntelligenceSession} from "./native/src/intelligenceSession.mjs";

const dir=mkdtempSync(join(tmpdir(),"radio-delivery-")),path=join(dir,"db.sqlite"),feedUrl="https://owned.example/feed";
let store=new LocalStore(path),calls=0,fetches=0,hold=null,release=null;
const segments=[{id:"s1",startMs:0,endMs:60000,text:"Owned fixture: researchers explain reliable evidence and source attribution in podcast conversations. This is a test recording, not a claim about any public episode."},
  {id:"s2",startMs:60000,endMs:120000,text:"Our sponsor is Example. Use code SAVE for a free trial."}];
const transcript={transcriptVersion:"owned-v1",sourceType:"publisher_rss",segments,quality:assessTranscript({segments})};
const response=(invalid=false)=>({output_text:JSON.stringify({overview:"Researchers discuss reliable evidence.",detail:"The original discussion explains source attribution and reliable evidence.",themes:["Evidence"],sourceSegmentIndexes:[1],chapters:[{title:"Evidence and attribution",description:"The research discussion.",sourceSegmentIndexes:[invalid?999:1]}]}),usage:{input_tokens:100,output_tokens:100}});
const options=()=>({store,ledger:new BudgetLedger({enabled:true},store),enabled:true,configured:true,
  resolveEpisode:async(_f,id)=>({id,title:id,showName:"Owned delivery fixture",feedUrl,duration:"120",audioUrl:`https://owned.example/${id}.mp3`,refs:[{url:"https://owned.example/source.vtt"}]}),
  fetchTranscript:async()=>{fetches++;return transcript;},client:{responses:{create:async()=>{calls++;if(hold)await hold;return response();}}}});
let pipeline=new EpisodePipeline(options()),skips=new SkipService(store,pipeline);
pipeline.onTranscriptReady=({episodeId})=>skips.inspect(feedUrl,episodeId);
try {
  hold=new Promise(r=>release=r);
  await pipeline.request({feedUrl,episodeId:"one",trigger:"automatic"});
  while(!calls)await new Promise(r=>setTimeout(r,1));
  const early=pipeline.status(feedUrl,"one");
  assert.equal(early.featureStatus.search.state,"READY");assert.equal(early.featureStatus.brief.state,"ANALYSING");
  assert.equal(pipeline.search("reliable evidence").matches.length,1,"search works before summary completes");
  assert.equal(store.get("skip-analysis",episodeKey(feedUrl,"one")).candidateCount,1,"ad handoff before summary");
  assert.equal(store.all("skip-interval")[0][1].verificationState,"CANDIDATE","transcript evidence is not independent audio verification");
  release();await Promise.all(pipeline.inflight.values());hold=null;
  const ready=pipeline.status(feedUrl,"one");assert.equal(ready.state,"READY");
  assert.equal(ready.featureStatus.topics.state,"READY");assert(ready.topics.every(t=>t.sourceSegmentIds.includes("s1")&&t.startMs===0));
  assert.equal(pipeline.moments(feedUrl,"one","zebras on venus").length,0);
  assert.equal(pipeline.moments(feedUrl,"one","reliable evidence")[0].episode.id,"one");
  assert.equal(publicIntelligence(ready).transcript,undefined);
  const paid=calls,usd=pipeline.ledger.totals().month;
  await Promise.all([pipeline.request({feedUrl,episodeId:"one"}),pipeline.request({feedUrl,episodeId:"one"})]);assert.equal(calls,paid);
  // Index failure is isolated; retrying the local stage never buys analysis.
  store.delete("search-index",episodeKey(feedUrl,"one"));
  const realSet=store.set.bind(store);store.set=(kind,...args)=>{if(kind==="search-index")throw Error("temporary disk write failure");return realSet(kind,...args);};
  const partial=pipeline.status(feedUrl,"one");assert.equal(partial.state,"PARTIAL_READY");assert(partial.brief);assert.equal(partial.featureStatus.search.code,"INDEXING_FAILED");
  store.set=realSet;assert.equal(pipeline.status(feedUrl,"one").state,"READY");assert.equal(calls,paid);assert.equal(pipeline.ledger.totals().month,usd);
  store.close();store=new LocalStore(path);pipeline=new EpisodePipeline(options());
  assert.equal(pipeline.search("reliable evidence").matches.length,1,"persisted index survives process-store restart");assert.equal(calls,paid);
  // A cached canonical transcript enters the same pipeline, without a fetch.
  const cacheAudio="https://owned.example/cached.mp3",variant=createHash("sha256").update(cacheAudio).digest("hex");
  store.set("transcript",`${episodeKey(feedUrl,"cached")}:${variant}`,transcript);
  const beforeFetch=fetches;await pipeline.request({feedUrl,episodeId:"cached",trigger:"automatic"});await Promise.all(pipeline.inflight.values());assert.equal(fetches,beforeFetch);assert.equal(pipeline.status(feedUrl,"cached").state,"READY");
  pipeline.client.responses.create=async()=>{calls++;return response(true);};
  await pipeline.request({feedUrl,episodeId:"partial",trigger:"automatic"});await Promise.all(pipeline.inflight.values());
  const invalid=pipeline.status(feedUrl,"partial");assert.equal(invalid.state,"PARTIAL_READY");assert.equal(invalid.featureStatus.brief.state,"READY");assert.equal(invalid.featureStatus.chapters.state,"FAILED");assert.equal(invalid.featureStatus.search.state,"READY");assert.equal(listenerProcessingStatus(invalid).state,"PARTIAL_READY");
  assert(intelligenceCapabilities({...publicIntelligence(invalid),availableFeatures:{brief:true,moments:true}}).brief);
  // Bad brief citations cannot hide valid chapters or turn into a fake brief.
  pipeline.client.responses.create=async()=>{calls++;const r=response();const p=JSON.parse(r.output_text);p.sourceSegmentIndexes=[999];r.output_text=JSON.stringify(p);return r;};
  await pipeline.request({feedUrl,episodeId:"bad-brief",trigger:"automatic"});await Promise.all(pipeline.inflight.values());
  const bad=pipeline.status(feedUrl,"bad-brief");assert.equal(bad.state,"PARTIAL_READY");assert(!bad.brief);assert.equal(bad.featureStatus.chapters.state,"READY");
  const untimed={...transcript,episodeId:"untimed",segments:segments.map(({id,text})=>({id,text}))};
  const idx=buildSearchIndex(untimed,{feedUrl,episodeId:"untimed",processingVersion:PROCESSING_VERSION});assert(idx.segments.every(s=>s.startMs===null));
  assert.equal(deliveryValidation({episodeId:"untimed"},idx).features.moments.code,"UNTIMED_TRANSCRIPT");
  assert.throws(()=>buildSearchIndex(untimed,{feedUrl,episodeId:"different"}),/identity/);
  const key=episodeKey(feedUrl,"one");pipeline.purgeEpisode(feedUrl,"one");assert.equal(store.get("search-index",key),null,"legal purge includes derived index");
  const total=calls;pipeline.rights={evaluate:()=>({allowed:false})};assert.equal(pipeline.search("evidence").matches.length,0);assert.equal(pipeline.moments(feedUrl,"cached","evidence").length,0);assert.equal(calls,total);
  // Existing native observer receives readiness without another request.
  let reads=0,requests=0;
  const session=createIntelligenceSession({status:async()=>++reads<2?{state:"BUDGET_PAUSED",processing:false}:{state:"READY",brief:ready.brief,availableFeatures:{brief:true,moments:true}},request:async()=>{requests++;throw Error("unexpected paid request");}},feedUrl,"one",{pollMs:2,recoveryPollMs:2});
  const stop=session.watch(true);for(let i=0;i<50&&session.getSnapshot().status?.state!=="READY";i++)await new Promise(r=>setTimeout(r,2));
  assert.equal(session.getSnapshot().status.state,"READY");assert.equal(requests,0);stop();
} finally {store.close();rmSync(dir,{recursive:true,force:true});}
console.log("Persisted grounded delivery, partial isolation, cache/index repair, ad handoff, rights purge and automatic native READY passed.");
