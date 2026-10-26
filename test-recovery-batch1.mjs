import assert from "node:assert/strict";
import { LocalStore } from "./persistence.mjs";
import { RightsRegistry } from "./rights-registry.mjs";
import { IntelligencePolicyRegistry } from "./intelligence-policy.mjs";
import { assessPublisherRights, publisherRightsEvidence } from "./rights-assessment.mjs";
import { readyDiscovery } from "./ready-discovery.mjs";
const feedUrl = "https://publisher.example/feed.xml";
const license = '<podcast:license url="https://creativecommons.org/licenses/by/4.0/"/>';
const assess = (xml, episodeId = "episode") => ({ feedUrl, episodeId,
  ...assessPublisherRights({ feedUrl, evidence: publisherRightsEvidence({ feedUrl, channelXml: xml }) }) });
const notice = assess('<copyright>© All rights reserved</copyright>');
assert.equal(notice.blockerCode, "LEGAL_BASIS_NOT_ESTABLISHED");
assert.equal(notice.rightsReserved, false);
assert(notice.assessmentEvidence.some(e => e.type === "COPYRIGHT_NOTICE"));
assert.equal(assess('<rights>No AI processing</rights>').blockerCode, "PUBLISHER_RESTRICTION");
const store = new LocalStore(":memory:"), rights = new RightsRegistry(store);
const allows = feature => rights.evaluate({ feedUrl, episodeId: "episode", feature });
try {
  const stale = { ...notice, assessmentSource: "publisher-rss-v3", assessmentVersion: "publisher-rss-v3",
    blockerCode: "PUBLISHER_RESTRICTION", rightsReserved: true,
    assessmentEvidence: [{ type: "PUBLISHER_RESTRICTION", source: "publisher-rss", scope: "podcast", value: "© All rights reserved" }] };
  rights.set(stale);
  assert.equal(rights.assessAutomatic(notice).reused, false);
  assert.equal(allows("intelligence-processing").code, "LEGAL_BASIS_NOT_ESTABLISHED");
  assert(store.all("rights-audit").some(([,r]) => r.action === "automatic-notice-classification-corrected"));
  assert(rights.assessment(feedUrl,"episode").advisories.some(a => a.code === "EVIDENCE_INCOMPLETE" && /not a discovered prohibition/.test(a.reason)));
  // A documented channel grant covers missing automatic episode assessments.
  rights.set({ ...assess(license), episodeId: undefined });
  assert.equal(allows("intelligence-processing").allowed, true);
  assert.equal(new IntelligencePolicyRegistry(store).effective(feedUrl,"episode").tier,"ZERO");
  rights.assessAutomatic(assess('<copyright>All rights reserved. No public transcript distribution.</copyright>'));
  assert.equal(allows("intelligence-processing").allowed,true);
  assert.equal(allows("transcript-distribution").allowed,false);
  assert.equal(allows("transcript-distribution").code,"SCOPED_PUBLISHER_RESTRICTION");
  for (const feature of ["captions","translation-text","dubbing-audio","voice-cloning"]) assert.equal(allows(feature).allowed,false);
  assert(rights.assessment(feedUrl,"episode").evidence.some(e => e.type === "SCOPED_PUBLISHER_RESTRICTION"));
  rights.assessAutomatic(assess(license+'<rights>No text and data mining.</rights>'));
  assert.equal(allows("intelligence-processing").code,"SCOPED_PUBLISHER_RESTRICTION");
  assert(rights.assessment(feedUrl,"episode").evidence.some(e=>e.type==="TDM_RESERVATION"));
  rights.assessAutomatic(assess(license+'<rights>Do not transcribe audio.</rights>'));
  assert.equal(allows("audio-transcription").allowed,false);
  assert.equal(allows("intelligence-processing").allowed,true);
  // A human assessment and approved exception remain authoritative.
  rights.set({ ...assess(license), classification:"TDM_ELIGIBLE", explicitAuthorisation:false,
    assessmentSource:"documented-human-assessment", legalBasis:"Approved jurisdiction-specific fixture basis", assessmentStatus:"APPROVED" });
  rights.setPolicy({mode:"LITE",reason:"Fixture exception policy"});
  rights.assessAutomatic(notice);
  assert.equal(allows("intelligence-processing").allowed,true);
  rights.set({feedUrl,episodeId:"episode",classification:"DISPUTED",rightsReserved:true});
  rights.assessAutomatic(assess(license));
  assert.equal(allows("intelligence-processing").allowed,false);
  rights.suspend(feedUrl,"episode","Fixture takedown");
  assert.equal(rights.assessAutomatic(assess(license)).mandatory,true);
  // Human blanket restrictions cannot enter the legacy automatic repair path.
  rights.set({...stale,episodeId:"human",assessmentSource:"human-review"});
  assert.equal(rights.assessAutomatic({...notice,episodeId:"human"}).mandatory,true);
  rights.set({...stale,episodeId:"explicit",assessmentEvidence:[{type:"PUBLISHER_RESTRICTION",value:"All rights reserved. No AI."}]});
  assert.equal(rights.assessAutomatic({...notice,episodeId:"explicit"}).mandatory,true);
  // New episode-specific reservations are observed even under a channel grant.
  rights.assessAutomatic(assess('<rights>No AI processing.</rights>',"new-restricted"));
  assert.equal(rights.evaluate({feedUrl,episodeId:"new-restricted",feature:"intelligence-processing"}).allowed,false);
  // Discovery never trusts historical READY, leaks transcripts, or queues jobs.
  const job = (id, extra={}) => ({feedUrl,episodeId:id,state:"READY",episode:{id,title:id,showName:"Publisher",audioUrl:`https://publisher.example/${id}.mp3`,publishedAt:"2026-01-01",artworkUrl:"https://publisher.example/art.png"},transcript:{secret:"never deliver"},...extra});
  for (const id of ["cached","revoked","missing"]) store.set("intelligence",id,job(id));
  store.set("intelligence","fixture",job("fixture",{feedUrl:"https://publisher.example/fixtures/test.xml"}));
  let reads=0;
  const results = readyDiscovery({store,status:(feed,id)=>{reads++;return {state:id==="cached"?"READY":"UNAVAILABLE",availableFeatures:{brief:id==="cached",moments:false}};}});
  assert.deepEqual(results.episodes.map(e=>e.id),["cached"]);
  assert.equal(reads,3);
  assert(!JSON.stringify(results).includes("never deliver"));
} finally {store.close();}
console.log("Batch 1 notice correction, scoped reservations, inheritance, exception, holds, evidence and cache-only discovery passed");
