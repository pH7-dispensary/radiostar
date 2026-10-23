import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStore } from "./persistence.mjs";
import { RightsRegistry } from "./rights-registry.mjs";
import { createReviewFixture, feedUrl } from "./test-phase3-fixture.mjs";

const directory = mkdtempSync(join(tmpdir(), "starcast-rights-review-"));
const path = join(directory, "review.sqlite");
const { app, providerCalls } = createReviewFixture(new LocalStore(path));
await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const reviewerSession = app.adminService.startSession({ id: "human-reviewer", role: "SUPER_ADMIN" });
const headers = { "content-type": "application/json", cookie: `starcast_admin=${reviewerSession.id}`, "x-star-cast-csrf": reviewerSession.csrf, "x-star-cast-dev-token": "phase3-test-listener" };
const post = async (route, input, auth = headers) => {
  const response = await fetch(origin + route, { method: "POST", headers: auth, body: JSON.stringify(input) });
  return { status: response.status, body: await response.json() };
};
const get = async (route) => (await fetch(origin + route, { headers })).json();
const inputFor = (episodeId) => ({
  scope: episodeId ? "episode" : "podcast", feedUrl, ...(episodeId ? { episodeId } : {}),
  classification: "LICENSED", basisType: "OWNED", evidenceIssuer: "Radio Star fixture owner",
  evidenceReference: "fixture:original-owned-research-v1", legalBasis: "Owned fixture text for software verification.",
  reason: "Verify a documented bounded approval.", authorityConfirmed: true,
  territories: ["WORLDWIDE"], selectedFeatures: ["brief", "chapters", "topics", "moments", "search"],
  applyToFuture: true, maxEpisodes: 2, tier: "LOW",
  expectedAssessmentRevision: app.rights.assessmentRevision(feedUrl, episodeId || ""),
});
try {
  const invalid = await post("/api/admin/rights/approval-preview", { ...inputFor(), evidenceReference: "" });
  assert.equal(invalid.status, 400);
  assert.equal(providerCalls(), 0);
  assert.equal((await post("/api/admin/rights", { feedUrl, classification: "LICENSED", canProcessForAi: true })).status, 409, "legacy endpoint cannot grant unreviewed core processing");
  const session = app.adminService.startSession({ id: "readonly", role: "READ_ONLY", name: "Reader" });
  const auth = { "content-type": "application/json", cookie: `starcast_admin=${session.id}`, "x-star-cast-csrf": session.csrf };
  assert.equal((await post("/api/admin/rights/approval-preview", inputFor(), auth)).status, 403);
  const superSession = app.adminService.startSession({ id: "super-session", role: "SUPER_ADMIN", name: "Super reviewer" });
  assert.equal((await post("/api/admin/rights/approval-preview", inputFor(), { "content-type": "application/json", cookie: `starcast_admin=${superSession.id}` })).status, 403, "CSRF required");
  const preview = await post("/api/admin/rights/approval-preview", inputFor());
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.summary.affected, 3);
  assert.equal(preview.body.summary.stillRestricted, 1);
  assert.equal(preview.body.summary.expectedNewJobs, 2);
  assert.equal(providerCalls(), 0, "preview is not paid processing");
  // New episode restriction invalidates the entire reviewed impact snapshot.
  app.rights.suspend(feedUrl, "owned-two", "Fixture dispute after preview.");
  assert.equal((await post("/api/admin/rights/approve-process", { previewId: preview.body.previewId, confirmation: "APPROVE & PROCESS" })).status, 400);
  const reviewed = await post("/api/admin/rights/approval-preview", inputFor());
  assert.equal(reviewed.body.summary.expectedNewJobs, 1);
  const approved = await post("/api/admin/rights/approve-process", { previewId: reviewed.body.previewId, confirmation: "APPROVE & PROCESS" });
  assert.equal(approved.status, 202, JSON.stringify(approved.body));
  assert.equal(approved.body.jobs.length, 1);
  await Promise.all(app.pipeline.inflight.values());
  assert.equal(app.pipeline.status(feedUrl, "owned-one").state, "READY");
  assert.equal(app.pipeline.status(feedUrl, "owned-two"), null, "episode dispute wins over channel approval");
  assert.equal(providerCalls(), 1);
  const replay = await post("/api/admin/rights/approve-process", { previewId: reviewed.body.previewId, confirmation: "APPROVE & PROCESS" });
  assert.equal(replay.body.jobs[0].jobId, approved.body.jobs[0].jobId);
  assert.equal(providerCalls(), 1);
  assert.equal(app.rights.evaluate({ feedUrl, episodeId: "future", feature: "intelligence-processing" }).allowed, true);
  for (const feature of ["captions", "translation-text", "dubbing-audio", "voice-cloning", "ad-detection"])
    assert.equal(app.rights.evaluate({ feedUrl, episodeId: "future", feature }).allowed, false, feature);
  assert.equal(app.intelligencePolicy.effective(feedUrl, "future").tier, "LOW");
  assert.ok(app.adminService.audit().some((row) => row.action === "structured-rights-approved"));
  const readonlyReview = await get(`/api/admin/rights/review?${new URLSearchParams({ feedUrl })}`);
  assert.equal(readonlyReview.history.length, 1);
  assert.equal(readonlyReview.record.approvalAssessment.evidenceReference, "fixture:original-owned-research-v1");
  const revoke = await post("/api/admin/rights/revoke-approval", { feedUrl, expectedAssessmentRevision: readonlyReview.revision, reason: "End fixture approval.", confirmation: "REVOKE APPROVAL" });
  assert.equal(revoke.status, 200);
  const listener = await get(`/api/intelligence/status?${new URLSearchParams({ feedUrl, episodeId: "owned-one" })}`);
  assert.equal(listener.status.code, "APPROVAL_REVOKED");
  assert.equal(listener.status.brief, undefined, "revocation hides cached intelligence");
  assert.ok(Object.values(listener.status.availableFeatures).every((value) => value === false), "revocation does not advertise ready features");
  const detail = await get(`/api/admin/episodes/detail?${new URLSearchParams({ feedUrl, episodeId: "owned-one" })}`);
  assert.equal(detail.episode.features.find((feature) => feature.name === "Episode brief").state, "RESTRICTED", "cached output is not READY after revocation");
  assert.equal(app.pipeline.search("research").matches.length, 0);
  assert.deepEqual(app.pipeline.moments(feedUrl, "owned-one", "research"), []);
  assert.equal((await post("/api/admin/rights", { feedUrl, classification: "LICENSED", canProcessForAi: true })).status, 409, "legacy editor cannot erase structured revocation");
  assert.equal(app.rights.evaluate({ feedUrl, episodeId: "owned-two", feature: "intelligence-processing" }).code, "TAKEDOWN_OR_SUSPENSION");
  // Nested operations must roll back together, including audit writes.
  assert.throws(() => app.store.transaction(() => {
    app.store.set("fixture-atomic", "outer", {});
    app.store.transaction(() => app.store.set("fixture-atomic", "inner", {}));
    throw Error("rollback");
  }), /rollback/);
  assert.deepEqual(app.store.all("fixture-atomic"), []);
} finally {
  await new Promise((resolve) => app.server.close(resolve));
  app.store.close();
}
const reopened = new LocalStore(path);
try {
  const registry = new RightsRegistry(reopened);
  assert.equal(registry.evaluate({ feedUrl, episodeId: "future", feature: "intelligence-processing" }).code, "APPROVAL_REVOKED", "revocation survives restart");
  assert.equal(reopened.all("rights-review-history").length, 2);
  let now = Date.now();
  const scoped = new RightsRegistry(reopened, { now: () => now });
  const another = "https://fixture.example/scoped.xml";
  const approvalInput = {
    feedUrl: another, classification: "LICENSED", basisType: "OWNED", legalBasis: "Original fixture", reason: "Scope testing", confirmation: "APPROVE & PROCESS",
    evidenceReference: "fixture:scope-evidence", evidenceIssuer: "Fixture owner", authorityConfirmed: true,
    selectedFeatures: ["brief"], territories: ["WORLDWIDE"], coveredEpisodeIds: ["covered"], applyToFuture: false,
    expiresAt: new Date(now + 10000).toISOString(), expectedAssessmentRevision: scoped.assessmentRevision(another),
  };
  scoped.approveProcessing(approvalInput);
  assert.equal(scoped.evaluate({ feedUrl: another, episodeId: "covered", feature: "episode-brief" }).allowed, true);
  assert.equal(scoped.evaluate({ feedUrl: another, episodeId: "future", feature: "intelligence-processing" }).allowed, false);
  assert.equal(scoped.evaluate({ feedUrl: another, episodeId: "covered", feature: "conversation-search" }).allowed, false);
  now += 20000;
  assert.equal(scoped.evaluate({ feedUrl: another, episodeId: "covered", feature: "intelligence-processing" }).code, "APPROVAL_EXPIRED");
  const restricted = { ...approvalInput, expiresAt: null, territories: ["GB"], expectedAssessmentRevision: scoped.assessmentRevision(another) };
  scoped.approveProcessing(restricted);
  assert.equal(scoped.evaluate({ feedUrl: another, episodeId: "covered", feature: "intelligence-processing" }).code, "TERRITORY_REVIEW_REQUIRED");
  const prohibited = "https://fixture.example/prohibited.xml";
  scoped.set({ feedUrl: prohibited, classification: "LICENSED", canProcessForAi: true, canRetain: true, blockerCode: "LEGAL_PROHIBITION" });
  assert.equal(scoped.evaluate({ feedUrl: prohibited, feature: "intelligence-processing" }).code, "LEGAL_PROHIBITION");
  assert.throws(() => scoped.approveProcessing({ ...approvalInput, feedUrl: prohibited, expiresAt: null, expectedAssessmentRevision: scoped.assessmentRevision(prohibited) }), /mandatory/);
} finally { reopened.close(); rmSync(directory, { recursive: true }); }
console.log("Structured review, scope, expiry, mandatory holds, replay, revocation, cache gating, CSRF, persistence and atomicity passed.");
