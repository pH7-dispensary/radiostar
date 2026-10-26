import assert from "node:assert/strict";
import { createStarCastServer } from "./server.mjs";
import { LocalStore } from "./persistence.mjs";
import { RightsClassification } from "./rights-registry.mjs";
import { assessTranscript } from "./transcripts.mjs";

const feedUrl = "https://publisher.example/policy-show.xml", episodeId = "episode-one", secondEpisode = "episode-two";
const transcript = { segments: [{ id: "one", startMs: 0, endMs: 60_000, text: "A real publisher transcript supports grounded intelligence, searchable moments, reliable source references, and safe policy-engine verification without fabricating any evidence." }], transcriptVersion: "policy-fixture-v1", sourceType: "publisher_rss", sourceUri: "https://publisher.example/policy.vtt", originalFormat: "text/vtt" };
transcript.quality = assessTranscript(transcript);
const app = createStarCastServer({
  store: new LocalStore(":memory:"),
  env: { STARCAST_DEV_INTELLIGENCE_TOKEN: "device-token", STARCAST_ADMIN_TOKEN: "admin-token", STARCAST_PAID_INTELLIGENCE: "enabled", OPENAI_API_KEY: "mock-key", RADIOSTAR_TRANSLATE_BETA: "INTERNAL_TESTING" },
  resolveEpisode: async (_feed, id) => ({ id, title: id, showName: "Policy fixture show", publisher: "Fixture publisher", duration: "1:00", audioUrl: `https://publisher.example/${id}.mp3`, refs: [{ url: transcript.sourceUri, type: "text/vtt" }] }),
  fetchTranscript: async () => transcript,
  client: { responses: { create: async () => ({ output_text: JSON.stringify({ overview: transcript.segments[0].text, themes: ["Policy"], detail: transcript.segments[0].text, sourceSegmentIndexes: [1], chapters: [{ title: "Policy", description: transcript.segments[0].text, sourceSegmentIndexes: [1] }] }), usage: { input_tokens: 1, output_tokens: 1 } }) } },
});
await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;
const session = app.adminService.startSession({ id: "human-reviewer", role: "SUPER_ADMIN" });
const headers = { "content-type": "application/json", cookie: `starcast_admin=${session.id}`, "x-star-cast-csrf": session.csrf, "x-star-cast-dev-token": "device-token" };
const post = (path, input, extra = {}) => fetch(base + path, { method: "POST", headers: { ...headers, ...extra }, body: JSON.stringify(input) });
try {
  app.rights.set({ feedUrl, classification: RightsClassification.LICENSED, explicitAuthorisation: true, canAcquireTranscript: true, canProcessForAi: true, canDisplayDerivedIntelligence: true, canDisplayCaptions: true, canTranslateText: true, canGenerateDubbedAudio: true, canCacheTranslatedAudio: true, canDistributeTranslation: true, canRetain: true, podcast: "Policy fixture show", publisher: "Fixture publisher" });
  const globalHighPolicy = await post("/api/admin/intelligence/policies", { scope: "global", tier: "HIGH", reason: "Verify the global hold.", confirmation: "SAVE POLICY" });
  assert.equal(globalHighPolicy.status, 202);
  const globalHigh = await post("/api/intelligence/request", { feedUrl, episodeId, capability: "brief" });
  assert.equal((await globalHigh.json()).status.code, "INTELLIGENCE_POLICY_HIGH", "HIGH pauses new processing");
  const rightsSession = app.adminService.startSession({ id: "rights", name: "Rights", role: "RIGHTS_ADMIN" });
  const denied = await fetch(base + "/api/admin/intelligence/policies", { method: "POST", headers: { "content-type": "application/json", cookie: `starcast_admin=${rightsSession.id}; starcast_admin_csrf=${rightsSession.csrf}`, "x-star-cast-csrf": rightsSession.csrf }, body: JSON.stringify({ scope: "podcast", feedUrl, tier: "LOW", reason: "Must fail", confirmation: "SAVE POLICY" }) });
  assert.equal(denied.status, 403, "only Super Admin can alter intelligence automation");
  const low = await post("/api/admin/intelligence/policies", { scope: "podcast", feedUrl, tier: "LOW", applyToExisting: false, applyToFuture: true, reason: "Licensed fixture core intelligence.", confirmation: "SAVE POLICY" });
  assert.equal(low.status, 202);
  assert.equal(app.intelligencePolicy.effective(feedUrl, secondEpisode).tier, "LOW", "future episodes inherit podcast policy");
  assert.equal(app.intelligencePolicy.allows(feedUrl, episodeId, "captions").allowed, false, "LOW keeps captions behind its separate operational tier");
  const queued = await post("/api/intelligence/request", { feedUrl, episodeId, capability: "brief" });
  assert.equal((await queued.json()).status.state, "QUEUED");
  await Promise.all(app.pipeline.inflight.values());
  assert.equal(app.pipeline.status(feedUrl, episodeId).state, "READY", "LOW permits authorised core intelligence");
  const episodeHigh = await post("/api/admin/intelligence/policies", { scope: "episode", feedUrl, episodeId: secondEpisode, tier: "HIGH", applyToExisting: false, applyToFuture: false, reason: "Hold this episode.", confirmation: "SAVE POLICY" });
  assert.equal(episodeHigh.status, 202);
  assert.equal(app.intelligencePolicy.effective(feedUrl, secondEpisode).tier, "HIGH", "episode policy overrides the channel");
  assert.equal(app.intelligencePolicy.effective(feedUrl, "unconfigured-future").tier, "LOW", "episode policy does not change future inheritance");
  const held = await post("/api/intelligence/request", { feedUrl, episodeId: secondEpisode, capability: "brief" });
  assert.equal((await held.json()).status.code, "INTELLIGENCE_POLICY_HIGH");
  const medium = await post("/api/admin/intelligence/policies", { scope: "episode", feedUrl, episodeId: secondEpisode, tier: "MEDIUM", applyToExisting: false, applyToFuture: false, reason: "Permit authorised optional features.", confirmation: "SAVE POLICY" });
  assert.equal(medium.status, 202);
  assert.equal(app.intelligencePolicy.allows(feedUrl, secondEpisode, "captions").allowed, true, "MEDIUM enables captions only after rights independently permit them");
  assert.equal(app.translation.eligible(feedUrl, secondEpisode), true, "MEDIUM permits private dubbing only when all translation rights already exist");
  const catalogue = await fetch(base + "/api/admin/intelligence/policies", { headers });
  const body = await catalogue.json();
  assert.equal(catalogue.status, 200);
  assert.equal(body.podcasts.some((podcast) => podcast.feedUrl === feedUrl && podcast.policy.tier === "LOW"), true, "catalogue reports effective podcast policy");
  assert.ok(body.audit.length >= 3, "policy history is persisted");
  const rollbackInput = { feedUrl, episodeId: secondEpisode, version: 1, reason: "Restore episode hold.", confirmation: "ROLLBACK POLICY", expectedVersion: app.intelligencePolicy.effective(feedUrl, secondEpisode).version };
  assert.equal((await post("/api/admin/intelligence/policies/rollback", { ...rollbackInput, confirmation: "" })).status, 400);
  assert.equal((await post("/api/admin/intelligence/policies/rollback", { ...rollbackInput, expectedVersion: 0 })).status, 409);
  const rollback = await post("/api/admin/intelligence/policies/rollback", rollbackInput);
  assert.equal(rollback.status, 200, "Super Admin can roll back an operational episode policy");
  assert.equal(app.intelligencePolicy.effective(feedUrl, secondEpisode).tier, "HIGH");
  const restrictedEpisode = "episode-three";
  app.rights.suspend(feedUrl, restrictedEpisode, "Takedown");
  await post("/api/admin/intelligence/policies", { scope: "episode", feedUrl, episodeId: restrictedEpisode, tier: "ZERO", applyToExisting: false, applyToFuture: false, reason: "Cannot override takedown.", confirmation: "SAVE POLICY" });
  const reserved = await post("/api/intelligence/request", { feedUrl, episodeId: restrictedEpisode, capability: "brief" });
  assert.equal((await reserved.json()).status.code, "TAKEDOWN_OR_SUSPENSION", "ZERO never bypasses a takedown");
} finally {
  await new Promise((resolve) => app.server.close(resolve));
  app.store.close();
}
console.log("Mega Admin intelligence tiers, inheritance, operational gates, rollback and rights safety passed");
