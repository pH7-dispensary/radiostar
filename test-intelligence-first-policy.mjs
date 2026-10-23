import assert from "node:assert/strict";
import { createReviewFixture, feedUrl } from "./test-phase3-fixture.mjs";
import { episodeKey } from "./episode-pipeline.mjs";
import { assessPublisherRights, publisherRightsEvidence } from "./rights-assessment.mjs";

const { app, providerCalls } = createReviewFixture();
await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const tokenHeaders = { "content-type": "application/json", "x-star-cast-admin-token": "phase3-test-admin", "x-star-cast-dev-token": "phase3-test-listener" };
const post = (path, value, headers = tokenHeaders) => fetch(origin + path, { method: "POST", headers, body: JSON.stringify(value) });
const get = async (path) => (await fetch(origin + path, { headers: tokenHeaders })).json();
const query = id => new URLSearchParams({ feedUrl, episodeId: id });
const grant = (extra = {}) => app.rights.set({ feedUrl, classification: "LICENSED", assessmentStatus: "APPROVED", explicitAuthorisation: true,
  legalBasis: "Owned fixture internal processing authorisation.", assessmentEvidence: [{ type: "OWNED", source: "fixture-owner", scope: "podcast", value: "fixture:original-owned-content" }],
  canAcquireTranscript: true, canTranscribeAudio: true, canProcessForAi: true, canRetain: true, canDisplayDerivedIntelligence: true, canDetectAdvertisements: true, ...extra });
try {
  assert.equal(app.intelligencePolicy.effective(feedUrl, "owned-one").tier, "ZERO");
  const missing = await app.pipeline.request({ feedUrl, episodeId: "owned-one", trigger: "automatic" });
  assert.equal(missing.code, "LEGAL_BASIS_NOT_ESTABLISHED");
  const assessed = app.rights.resolve(feedUrl, "owned-one");
  assert(assessed.id, "even direct pipeline requests automatically assess missing records");
  await app.pipeline.request({ feedUrl, episodeId: "owned-one", trigger: "automatic" });
  assert.equal(app.rights.resolve(feedUrl, "owned-one").version, assessed.version, "identical evidence is not reassessed in a loop");
  assert.equal(providerCalls(), 0);
  assert.equal(app.rights.assessment(feedUrl, "owned-one").advisories[0].blocking, false);
  assert.equal(app.intelligencePolicy.effective(feedUrl).tier, "ZERO", "risk findings never pause operational policy");

  grant();
  assert.equal(app.rights.resolve(feedUrl, "owned-one").episodeId, null, "documented channel grant supersedes automatic unresolved evidence without duplicate episode approval");
  assert.equal(app.rights.evaluate({ feedUrl, episodeId: "future", feature: "intelligence-processing" }).allowed, true);
  assert.equal(app.rights.evaluate({ feedUrl, episodeId: "restricted", feature: "intelligence-processing" }).allowed, false, "episode restriction wins");
  const key = episodeKey(feedUrl, "owned-one");
  app.store.set("intelligence", key, { feedUrl, episodeId: "owned-one", state: "FAILED", code: "RIGHTS_RESTRICTED", reason: "Historical missing assessment", jobId: "old-refusal", attempts: 2, retryable: false });
  const status = await get(`/api/intelligence/status?${query("owned-one")}`);
  assert.equal(status.status.state, "NOT_REQUESTED");
  assert.equal(status.status.code, null, "old refusal is not the current blocker");
  assert.equal(status.status.operationalPolicy, "OPEN");
  assert.equal(status.status.processingEligibility, "ELIGIBLE");
  const requests = await Promise.all(Array.from({ length: 5 }, () => app.pipeline.request({ feedUrl, episodeId: "owned-one", trigger: "automatic" })));
  assert.equal(new Set(requests.map(value => value.jobId)).size, 1, "reassessment retains concurrent deduplication");
  await Promise.all(app.pipeline.inflight.values());
  assert.equal(app.pipeline.status(feedUrl, "owned-one").state, "READY");
  assert.equal(app.pipeline.status(feedUrl, "owned-one").reassessedFromJobId, "old-refusal");
  assert.equal(providerCalls(), 1);

  grant({ episodeId: "owned-two", canDisplayDerivedIntelligence: false, reservedFeatures: ["transcript-distribution", "captions"] });
  for (const feature of ["transcript-acquisition", "audio-transcription", "intelligence-processing", "ad-detection"])
    assert.equal(app.rights.evaluate({ feedUrl, episodeId: "owned-two", feature }).allowed, true, feature);
  for (const feature of ["intelligence-display", "transcript-distribution", "captions", "translation-text", "dubbing-audio", "voice-cloning", "automatic-skipping"])
    assert.equal(app.rights.evaluate({ feedUrl, episodeId: "owned-two", feature }).allowed, false, feature);
  await app.pipeline.request({ feedUrl, episodeId: "owned-two", trigger: "automatic" });
  await Promise.all(app.pipeline.inflight.values());
  assert.equal(app.pipeline.status(feedUrl, "owned-two").state, "READY", "internal analysis does not require display permission");
  const privateStatus = await get(`/api/intelligence/status?${query("owned-two")}`);
  assert.equal(privateStatus.status.brief, undefined, "internal results never leak through listener responses");
  assert.equal(privateStatus.status.processingExecution, "READY");
  assert.equal(privateStatus.status.state, "UNAVAILABLE", "display restriction remains honest and independent");
  const internalDetail = await get(`/api/admin/episodes/detail?${query("owned-two")}`);
  assert.equal(internalDetail.episode.state, "READY");
  assert.match(internalDetail.episode.reason, /listener display is not authorised/);
  // Candidate inspection executes at transcript readiness even if summary
  // generation fails. It never asserts that automatic skipping is safe.
  const onTranscriptReady = app.pipeline.onTranscriptReady;
  let inspections = 0;
  app.pipeline.onTranscriptReady = async value => { inspections++; await onTranscriptReady(value); };
  const provider = app.pipeline.client.responses.create;
  app.pipeline.client.responses.create = async () => { throw Object.assign(Error("Mock provider failure"), { status: 503 }); };
  await app.pipeline.request({ feedUrl, episodeId: "summary-failure", trigger: "automatic" });
  await Promise.all(app.pipeline.inflight.values());
  assert.equal(app.pipeline.status(feedUrl, "summary-failure").state, "FAILED");
  assert.equal(inspections, 1, "ad detection does not wait for successful brief generation");
  assert.equal(app.intelligencePolicy.effective(feedUrl).tier, "ZERO");
  app.pipeline.client.responses.create = provider;
  grant({ episodeId: "internal-block", reservedFeatures: ["intelligence-processing"] });
  assert.equal((await app.pipeline.request({ feedUrl, episodeId: "internal-block" })).code, "SCOPED_PUBLISHER_RESTRICTION");
  app.rights.suspend(feedUrl, "owned-two", "Fixture takedown");
  assert.equal((await app.pipeline.request({ feedUrl, episodeId: "owned-two" })).code, "TAKEDOWN_OR_SUSPENSION");

  const evidence = publisherRightsEvidence({ feedUrl, channelXml: '<podcast:license url="https://creativecommons.org/licenses/by/4.0/"/><rights>No public transcript distribution</rights>' });
  const automatic = assessPublisherRights({ feedUrl, evidence });
  assert.equal(automatic.canTranscribeAudio, true);
  assert(automatic.reservedFeatures.includes("transcript-distribution"));
  // Use a separate feed because a human channel grant must stay authoritative.
  const otherFeed = "https://fixture.example/stale.xml";
  app.rights.assessAutomatic({ ...automatic, feedUrl: otherFeed, episodeId: "stale", assessmentVersion: "old", assessmentSource: "publisher-rss-old" });
  assert.equal(app.rights.assessAutomatic({ ...automatic, feedUrl: otherFeed, episodeId: "stale" }).reused, false);
  assert.equal(app.rights.assessAutomatic({ ...automatic, feedUrl: otherFeed, episodeId: "stale" }).reused, true);
  const reviewedFeed = "https://fixture.example/reviewed.xml";
  const previousReview = app.rights.set({ feedUrl: reviewedFeed, classification: "RESTRICTED", blockerCode: "LEGAL_BASIS_NOT_ESTABLISHED", assessmentSource: "super-admin-technical-review", assessmentEvidence: [{ type: "EVIDENCE_REVIEW_NO_BASIS", source: "reviewer", value: "No evidence at previous review" }] });
  assert.equal(app.rights.assessAutomatic({ ...assessPublisherRights({ feedUrl: reviewedFeed }), feedUrl: reviewedFeed, episodeId: "later" }).reused, true, "no new evidence cannot change a human review");
  assert.equal(app.rights.assessAutomatic({ ...automatic, feedUrl: reviewedFeed, episodeId: "later" }).reused, false, "new publisher grant can resolve a historical missing-evidence finding");
  assert.equal(app.rights.resolve(reviewedFeed).id, previousReview.id, "original human channel record is preserved");

  const change = { scope: "podcast", feedUrl, tier: "HIGH", confirmation: "SAVE POLICY", reason: "Human pause fixture" };
  const denied = await post("/api/admin/intelligence/policies", change);
  assert.notEqual(denied.status, 202, "automation token cannot change operational policy");
  assert.equal(app.intelligencePolicy.effective(feedUrl).tier, "ZERO");
  const session = app.adminService.startSession({ id: "human-super-admin", role: "SUPER_ADMIN" });
  const headers = { "content-type": "application/json", cookie: `starcast_admin=${session.id}`, "x-star-cast-csrf": session.csrf };
  assert.equal((await post("/api/admin/intelligence/policies", change, { ...headers, "x-star-cast-csrf": "wrong" })).status, 403);
  assert.equal((await post("/api/admin/intelligence/policies", change, headers)).status, 202);
  assert.equal(app.intelligencePolicy.effective(feedUrl).tier, "HIGH");
  assert(app.intelligencePolicy.audit().some(row => row.actor === "human-super-admin" && row.previousTier === "ZERO" && row.tier === "HIGH"));
  const readOnly = app.adminService.startSession({ id: "read-only", role: "READ_ONLY" });
  assert.equal((await post("/api/admin/intelligence/policies/reset", { feedUrl, confirmation: "RESET POLICY" }, { ...headers, cookie: `starcast_admin=${readOnly.id}`, "x-star-cast-csrf": readOnly.csrf })).status, 403);
  const review = await get(`/api/admin/rights/review?${query("owned-one")}`);
  assert(review.features["transcript-acquisition"] && Array.isArray(review.advisories));
  assert.equal(app.ledger.totals().transcriptionSeconds, 0, "mock publisher cache processing spends no audio allowance");
} finally { await new Promise(resolve => app.server.close(resolve)); app.store.close(); }
console.log("Intelligence-first assessment, channel reuse, feature isolation, stale-failure recovery, dedup, advisories and human session controls passed.");
