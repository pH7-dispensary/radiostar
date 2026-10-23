import assert from "node:assert/strict";
import { createStarCastServer } from "./server.mjs";
import { LocalStore } from "./persistence.mjs";
import { RightsClassification } from "./rights-registry.mjs";
import { assessTranscript } from "./transcripts.mjs";

const feedUrl = "https://publisher.example/authorised.xml", episodeId = "approved-episode";
const transcript = {
  segments: [
    { id: "one", startMs: 0, endMs: 60_000, text: "This conversation examines reliable research methods and how teams make decisions." },
    { id: "two", startMs: 60_000, endMs: 120_000, text: "This episode is sponsored by Fixture Coffee. Use code FIXTURE for twenty percent off." },
  ],
  transcriptVersion: "super-admin-fixture-v1",
  sourceType: "publisher_rss",
  sourceUri: "https://publisher.example/authorised.vtt",
  originalFormat: "text/vtt",
};
transcript.quality = assessTranscript(transcript);
const app = createStarCastServer({
  store: new LocalStore(":memory:"),
  env: {
    STARCAST_DEV_INTELLIGENCE_TOKEN: "device-token",
    STARCAST_ADMIN_TOKEN: "admin-token",
    STARCAST_PAID_INTELLIGENCE: "enabled",
    STARCAST_AUDIO_TRANSCRIPTION: "enabled",
    OPENAI_API_KEY: "mock-key",
  },
  resolveEpisode: async (_feed, id) => ({
    id,
    title: "Authorised fixture episode",
    showName: "Authorised fixture show",
    publisher: "Fixture publisher",
    duration: "2:00",
    audioUrl: "https://publisher.example/authorised.mp3",
    refs: [{ url: transcript.sourceUri, type: "text/vtt" }],
  }),
  fetchTranscript: async () => transcript,
  client: { responses: { create: async () => ({
    output_text: JSON.stringify({
      overview: "This conversation examines reliable research methods and how teams make decisions.",
      themes: ["Reliable research methods"],
      detail: "This conversation examines reliable research methods and how teams make decisions.",
      sourceSegmentIndexes: [1],
      chapters: [{ title: "Reliable research", description: "The speakers examine reliable research methods.", sourceSegmentIndexes: [1] }],
    }),
    usage: { input_tokens: 100, output_tokens: 100 },
  }) } },
});
await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;
const session = app.adminService.startSession({ id: "human-reviewer", role: "SUPER_ADMIN" });
const headers = {
  "content-type": "application/json",
  "x-star-cast-dev-token": "device-token",
  cookie: `starcast_admin=${session.id}`, "x-star-cast-csrf": session.csrf,
};
const post = (path, input) => fetch(base + path, { method: "POST", headers, body: JSON.stringify(input) });
try {
  const denied = await post("/api/intelligence/request", { feedUrl, episodeId, capability: "brief" });
  const deniedBody = await denied.json();
  assert.equal(deniedBody.status.code, "LEGAL_BASIS_NOT_ESTABLISHED", "a request receives the recorded assessment outcome rather than an absent-record refusal");
  assert.equal(deniedBody.status.rightsCode, "LEGAL_BASIS_NOT_ESTABLISHED", "the listener contract distinguishes an assessed lack of basis from a reservation");
  const blocked = await fetch(base + "/api/admin/rights/blocked-content", { headers });
  const blockedBody = await blocked.json();
  assert.equal(blocked.status, 200);
  assert.equal(blockedBody.groups.some((group) => group.feedUrl === feedUrl), true, "blocked operational work is visible to administration");
  const missingConfirmation = await post("/api/admin/rights/approve-process", {
    scope: "episode", feedUrl, episodeId, classification: "LICENSED",
    legalBasis: "Fixture publisher authorisation.", reason: "Validation coverage.",
  });
  const missingConfirmationBody = await missingConfirmation.json();
  assert.equal(missingConfirmation.status, 400, "an incomplete approval is rejected");
  assert.equal(missingConfirmationBody.code, "APPROVAL_INVALID", "approval validation is visible to the administrator");
  assert.match(missingConfirmationBody.error, /APPROVE & PROCESS/);
  app.rights.set({
    feedUrl, episodeId, classification: RightsClassification.RESTRICTED,
    rightsReserved: false, podcast: "Authorised fixture show",
  });
  const rightsSession = app.adminService.startSession({ id: "rights-admin", name: "Rights admin", role: "RIGHTS_ADMIN" });
  const nonSuper = await fetch(base + "/api/admin/rights/approve-process", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `starcast_admin=${rightsSession.id}; starcast_admin_csrf=${rightsSession.csrf}`,
      "x-star-cast-csrf": rightsSession.csrf,
    },
    body: JSON.stringify({ scope: "episode", feedUrl, episodeId }),
  });
  assert.equal(nonSuper.status, 403, "rights administrators cannot exercise the Super Admin processing override");
  const preview = await post("/api/admin/rights/approval-preview", {
    scope: "episode", feedUrl, episodeId, podcast: "Authorised fixture show",
    episodeTitle: "Authorised fixture episode", classification: "LICENSED",
    legalBasis: "Fixture publisher authorisation for bounded intelligence.",
    reason: "Verify the approved processing workflow.",
    canTranscribeAudio: false,
    confirmation: "APPROVE & PROCESS",
    basisType: "PUBLISHER_LICENCE", evidenceReference: "fixture:publisher-authorisation-v1", evidenceIssuer: "Fixture publisher",
    authorityConfirmed: true, selectedFeatures: ["brief", "chapters", "topics", "moments", "search", "advertisements"], territories: ["WORLDWIDE"],
    expectedAssessmentRevision: app.rights.assessmentRevision(feedUrl, episodeId),
  });
  const previewBody = await preview.json();
  assert.equal(preview.status, 200, JSON.stringify(previewBody));
  assert.equal(previewBody.summary.expectedNewJobs, 1);
  assert.equal(app.pipeline.status(feedUrl, episodeId), null, "preview creates no processing job");
  const approval = await post("/api/admin/rights/approve-process", { previewId: previewBody.previewId, confirmation: "APPROVE & PROCESS" });
  assert.equal(approval.status, 202);
  const approved = await approval.json();
  assert.ok(approved.jobs[0].jobId);
  const replay = await (await post("/api/admin/rights/approve-process", { previewId: previewBody.previewId, confirmation: "APPROVE & PROCESS" })).json();
  assert.equal(replay.jobs[0].jobId, approved.jobs[0].jobId, "replaying a confirmed preview is idempotent");
  await Promise.all(app.pipeline.inflight.values());
  const ready = app.pipeline.status(feedUrl, episodeId);
  assert.equal(ready.state, "READY", "approval starts the existing complete intelligence pipeline");
  assert.ok(ready.brief?.overview);
  assert.ok(ready.chapters?.length);
  assert.ok(app.pipeline.moments(feedUrl, episodeId, "research").length, "Find a Moment index is available from the canonical transcript");
  const approvedRights = app.rights.resolve(feedUrl, episodeId);
  assert.equal(approvedRights.canDisplayCaptions, false, "approval keeps captions independently gated");
  assert.equal(approvedRights.canGenerateDubbedAudio, false, "approval keeps dubbing independently gated");
  assert.ok(app.skips.inspect(feedUrl, episodeId).intervals.length, "completed transcript creates conservative Ad Skip candidates");
  const restrictedFeed = "https://publisher.example/reserved.xml";
  app.rights.set({ feedUrl: restrictedFeed, classification: RightsClassification.RESTRICTED, rightsReserved: true });
  app.rights.set({
    feedUrl: restrictedFeed, episodeId: "reserved-episode", classification: RightsClassification.LICENSED,
    canAcquireTranscript: true, canProcessForAi: true, canDisplayDerivedIntelligence: true, canRetain: true,
  });
  const rejected = await post("/api/admin/rights/approval-preview", {
    scope: "episode", feedUrl: restrictedFeed, episodeId: "reserved-episode",
    classification: "LICENSED", legalBasis: "Not applicable", reason: "Must fail", confirmation: "APPROVE & PROCESS",
  });
  assert.equal(rejected.status, 400, "Super Admin approval never bypasses a mandatory reservation");
} finally {
  await new Promise((resolve) => app.server.close(resolve));
  app.store.close();
}
console.log("Super Admin approval-to-intelligence workflow, safety gates and candidate creation passed");
