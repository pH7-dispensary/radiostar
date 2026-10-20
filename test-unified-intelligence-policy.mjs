import assert from "node:assert/strict";
import { createStarCastServer } from "./server.mjs";
import { LocalStore } from "./persistence.mjs";
import { RightsClassification } from "./rights-registry.mjs";
import { assessTranscript } from "./transcripts.mjs";

const feedUrl = "https://publisher.example/unified-policy.xml";
const feed = `<?xml version="1.0"?><rss><channel><title>Unified &amp; policy fixture</title><itunes:author>Fixture Publisher</itunes:author><item><guid>ready-source</guid><title>Publisher source</title><pubDate>Tue, 20 Oct 2026 10:00:00 GMT</pubDate><itunes:duration>05:00</itunes:duration><podcast:transcript url="https://publisher.example/ready.vtt" type="text/vtt"/><enclosure url="https://publisher.example/ready.mp3"/></item><item><guid>restricted-source</guid><title>Unassessed source</title><pubDate>Mon, 19 Oct 2026 10:00:00 GMT</pubDate><itunes:duration>05:00</itunes:duration><enclosure url="https://publisher.example/restricted.mp3"/></item></channel></rss>`;
const transcript = { segments: [{ id: "source-1", startMs: 0, endMs: 90_000, text: "A publisher transcript makes this policy fixture grounded, searchable, and suitable for a bounded no-cost processing request." }], transcriptVersion: "unified-policy-v1", sourceType: "publisher_rss", sourceUri: "https://publisher.example/ready.vtt", originalFormat: "text/vtt" };
transcript.quality = assessTranscript(transcript);
const app = createStarCastServer({
  store: new LocalStore(":memory:"),
  env: { STARCAST_ADMIN_TOKEN: "admin-token", STARCAST_PAID_INTELLIGENCE: "enabled", OPENAI_API_KEY: "mock-key" },
  fetchFeed: async () => feed,
  resolveEpisode: async (_feed, id) => ({ id, title: id, showName: "Unified & policy fixture", publisher: "Fixture Publisher", duration: "05:00", audioUrl: `https://publisher.example/${id}.mp3`, refs: id === "ready-source" ? [{ url: transcript.sourceUri, type: "text/vtt" }] : [] }),
  fetchTranscript: async () => transcript,
  client: { responses: { create: async () => ({ output_text: JSON.stringify({ overview: "Grounded fixture intelligence.", themes: ["Policy"], detail: "Grounded fixture intelligence.", sourceSegmentIndexes: [1], chapters: [{ title: "Policy", description: "Grounded.", sourceSegmentIndexes: [1] }] }), usage: { input_tokens: 1, output_tokens: 1 } }) } },
});
app.store.set("follow", "unified-policy-follow", { id: "unified-policy-follow", feedUrl, owner: "fixture", createdAt: new Date().toISOString(), intelligenceEnabled: true });
app.rights.set({ feedUrl, episodeId: "ready-source", classification: RightsClassification.LICENSED, assessmentStatus: "APPROVED", explicitAuthorisation: true, canAcquireTranscript: true, canProcessForAi: true, canDisplayDerivedIntelligence: true, canRetain: true, canRegenerate: true, podcast: "Unified & policy fixture", publisher: "Fixture Publisher" });
await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;
const headers = { "content-type": "application/json", "x-star-cast-admin-token": "admin-token" };
const get = (path, extra = {}) => fetch(base + path, { headers: { ...headers, ...extra } });
const post = (path, value, extra = {}) => fetch(base + path, { method: "POST", headers: { ...headers, ...extra }, body: JSON.stringify(value) });

try {
  assert.equal((await fetch(base + "/api/admin/intelligence/policies")).status, 403, "policy catalogue remains private");
  const catalogue = await (await get("/api/admin/intelligence/policies")).json();
  assert.equal(catalogue.global.level.label, "OPEN", "stable ZERO storage tier is presented as OPEN");
  assert.equal(catalogue.global.inheritingPodcastCount, 1, "global read model counts only known inherited podcasts");

  const detail = await (await get(`/api/admin/podcasts/detail?feedUrl=${encodeURIComponent(feedUrl)}`)).json();
  const authorised = detail.episodes.find((episode) => episode.id === "ready-source");
  const restricted = detail.episodes.find((episode) => episode.id === "restricted-source");
  assert.equal(detail.policySummary.primaryAction.type, "PREPARE", "unprocessed eligible content has one contextual primary action");
  assert.equal(authorised.effectivePolicy.level.label, "OPEN");
  assert.equal(authorised.features.find((feature) => feature.name === "Automatic Ad Skip").state, "DISABLED", "automatic skipping stays disabled until an administrator enables the controlled rollout and independent evidence exists");
  assert.equal(restricted.features.find((feature) => feature.name === "Episode brief").state, "RESTRICTED", "the matrix distinguishes a rights restriction from a queue state");

  const previewResponse = await post("/api/admin/intelligence/policy-impact", { feedUrl, tier: "HIGH", applyToExisting: true, applyToFuture: true, maxEpisodes: 2 });
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  assert.equal(preview.current.level.label, "OPEN");
  assert.equal(preview.proposed.level.label, "PAUSED");
  assert.equal(preview.summary.affectedEpisodes, 2);
  assert.ok(Object.hasOwn(preview.budget, "dailyRemainingUsd"), "preview reports actual ledger headroom");
  assert.equal(app.pipeline.status(feedUrl, "ready-source"), null, "a preview never creates a job");

  const paused = await post("/api/admin/intelligence/policies", { scope: "podcast", feedUrl, tier: "HIGH", applyToExisting: false, applyToFuture: true, expectedVersion: detail.futurePolicy.version, reason: "Verify a channel pause.", confirmation: "SAVE POLICY" });
  assert.equal(paused.status, 202);
  const pausedBody = await paused.json();
  assert.equal(pausedBody.policy.level.label, "PAUSED");
  const pausedDetail = await (await get(`/api/admin/podcasts/detail?feedUrl=${encodeURIComponent(feedUrl)}`)).json();
  assert.equal(pausedDetail.policySummary.primaryAction.type, "RESUME");
  assert.equal(pausedDetail.episodes.find((episode) => episode.id === "ready-source").state, "PAUSED");

  const stale = await post("/api/admin/intelligence/policies", { scope: "podcast", feedUrl, tier: "LOW", applyToExisting: false, applyToFuture: true, expectedVersion: 99, reason: "This must be stale.", confirmation: "SAVE POLICY" });
  assert.equal(stale.status, 409, "effective-policy version checks protect concurrent changes");

  const override = await post("/api/admin/intelligence/policies", { scope: "episode", feedUrl, episodeId: "ready-source", tier: "MEDIUM", applyToExisting: false, applyToFuture: false, expectedVersion: pausedBody.policy.version, reason: "Monitor this one episode.", confirmation: "SAVE POLICY" });
  assert.equal(override.status, 202);
  const overridden = await (await get(`/api/admin/episodes/detail?feedUrl=${encodeURIComponent(feedUrl)}&episodeId=ready-source`)).json();
  assert.equal(overridden.episode.policy.source, "episode");
  assert.equal(overridden.episode.effectivePolicy.level.label, "MANAGED");

  const reset = await post("/api/admin/intelligence/policies/reset", { scope: "episode", feedUrl, episodeId: "ready-source", expectedVersion: overridden.episode.policy.version, reason: "Return to channel policy.", confirmation: "RESET POLICY" });
  assert.equal(reset.status, 200);
  assert.equal((await reset.json()).effective.source, "podcast", "reset removes the scoped override while retaining audit history");

  const prepare = await post("/api/admin/intelligence/policies", { scope: "podcast", feedUrl, tier: "LOW", applyToExisting: true, applyToFuture: true, maxEpisodes: 1, includeAuthorisedAudio: false, expectedVersion: pausedBody.policy.version, reason: "Prepare the bounded publisher-transcript fixture.", confirmation: "SAVE POLICY" });
  assert.equal(prepare.status, 202);
  const prepared = await prepare.json();
  assert.equal(prepared.createdJobs.length, 1, "policy application returns only actual queued job IDs");
  assert.equal(prepared.jobs[0].episodeId, "ready-source");
  await Promise.all(app.pipeline.inflight.values());
  assert.equal(app.pipeline.status(feedUrl, "ready-source").state, "READY");
  assert.equal(app.ledger.totals().transcriptionSeconds, 0, "authorised publisher text does not consume audio-transcription budget");
  assert.ok(app.adminService.audit().some((entry) => entry.action === "intelligence-policy-changed" && Array.isArray(entry.newState?.jobsCreated) && entry.newState.jobsCreated.length === 1), "policy audit carries the bounded actual job result");
} finally {
  await new Promise((resolve) => app.server.close(resolve));
  app.store.close();
}
console.log("Unified intelligence policy workflow, preview, override reset and bounded processing passed");
