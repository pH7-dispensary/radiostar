import assert from "node:assert/strict";
import { createStarCastServer } from "./server.mjs";
import { LocalStore } from "./persistence.mjs";
import { RightsClassification } from "./rights-registry.mjs";
import { assessTranscript } from "./transcripts.mjs";
import { episodeKey } from "./episode-pipeline.mjs";
import { PROCESSING_VERSION } from "./openai-intelligence.mjs";

const feedUrl = "https://publisher.example/operations.xml";
const feed = `<?xml version="1.0"?><rss><channel><title>Research &amp; Practice</title><itunes:author>Fixture Publisher</itunes:author><itunes:image href="https://images.example/research.png"/><item><guid>authorised-episode</guid><title>Authorised &amp; grounded</title><pubDate>Tue, 20 Oct 2026 10:00:00 GMT</pubDate><itunes:duration>02:00</itunes:duration><enclosure url="https://publisher.example/authorised.mp3"/></item><item><guid>restricted-episode</guid><title>Needs assessment</title><pubDate>Mon, 19 Oct 2026 10:00:00 GMT</pubDate><itunes:duration>03:00</itunes:duration><enclosure url="https://publisher.example/restricted.mp3"/></item></channel></rss>`;
const transcript = {
  segments: [{ id: "s1", startMs: 0, endMs: 120_000, text: "A grounded discussion of research practice and evidence, including how teams evaluate sources, communicate uncertainty, and make decisions that remain accountable over time.", contentType: "conversation" }],
  transcriptVersion: "operations-fixture-v1", sourceType: "publisher_rss", sourceUri: "https://publisher.example/transcript.vtt", originalFormat: "text/vtt",
};
transcript.quality = assessTranscript(transcript);
const app = createStarCastServer({
  store: new LocalStore(":memory:"),
  env: { STARCAST_ADMIN_TOKEN: "admin-token", STARCAST_PAID_INTELLIGENCE: "enabled", OPENAI_API_KEY: "mock-key" },
  fetchFeed: async (url) => { assert.equal(url, feedUrl); return feed; },
  resolveEpisode: async (_feed, episodeId) => ({
    id: episodeId, title: episodeId === "authorised-episode" ? "Authorised & grounded" : "Needs assessment",
    showName: "Research & Practice", publisher: "Fixture Publisher", duration: episodeId === "authorised-episode" ? "02:00" : "03:00",
    audioUrl: `https://publisher.example/${episodeId}.mp3`, refs: [{ url: transcript.sourceUri, type: "text/vtt" }],
  }),
  fetchTranscript: async () => transcript,
  client: { responses: { create: async () => ({ output_text: JSON.stringify({ overview: "A grounded discussion of research practice and evidence.", themes: ["Research"], detail: "A grounded discussion of research practice and evidence.", sourceSegmentIndexes: [1], chapters: [{ title: "Research practice", description: "Grounded discussion.", sourceSegmentIndexes: [1] }] }), usage: { input_tokens: 10, output_tokens: 10 } }) } },
});
app.store.set("follow", "fixture-follow", { id: "fixture-follow", feedUrl, owner: "anonymous-listener", createdAt: new Date().toISOString(), intelligenceEnabled: true });
app.rights.set({
  feedUrl, episodeId: "authorised-episode", classification: RightsClassification.LICENSED, assessmentStatus: "APPROVED", explicitAuthorisation: true,
  canAcquireTranscript: true, canProcessForAi: true, canDisplayDerivedIntelligence: true, canRetain: true, canRegenerate: true,
  podcast: "Research & Practice", publisher: "Fixture Publisher", episodeTitle: "Authorised & grounded",
  licence: "https://creativecommons.org/licenses/by/4.0/", assessmentEvidence: [{ type: "PUBLISHER_LICENSE", source: "owned-test-fixture", value: "CC-BY fixture" }],
});
await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;
const headers = { "x-star-cast-admin-token": "admin-token", "content-type": "application/json" };
const get = (path) => fetch(base + path, { headers });
const post = (path, body) => fetch(base + path, { method: "POST", headers, body: JSON.stringify(body) });

try {
  assert.equal((await get("/api/admin/podcasts")).status, 200, "administrator can read the operations catalogue");
  assert.equal((await fetch(base + "/api/admin/podcasts")).status, 403, "catalogue records are not public");
  const catalogue = await (await get("/api/admin/podcasts?q=fixture&page=1&pageSize=1&sort=title")).json();
  assert.equal(catalogue.total, 1);
  assert.equal(catalogue.items[0].title, "Research & Practice", "RSS metadata is decoded and used for the podcast name");
  assert.equal(catalogue.items[0].followerCount, 1, "listener-followed sources are included in the operational catalogue");
  assert.match(catalogue.items[0].canonicalFeedId, /^[a-f0-9]{16}$/);

  const detail = await (await get(`/api/admin/podcasts/detail?feedUrl=${encodeURIComponent(feedUrl)}`)).json();
  assert.equal(detail.episodePage.total, 2, "episode detail is sourced from the current publisher feed");
  const restricted = detail.episodes.find((episode) => episode.id === "restricted-episode");
  assert.equal(restricted.state, "UNAVAILABLE");
  assert.equal(restricted.code, "LEGAL_BASIS_NOT_ESTABLISHED", "missing evidence is represented as a specific legal-basis restriction, not a processing delay");
  const authorised = detail.episodes.find((episode) => episode.id === "authorised-episode");
  assert.equal(authorised.action.type, "PREPARE");
  assert.equal(authorised.features.find((feature) => feature.name === "Captions").state, "RESTRICTED", "caption rights remain independently gated and are distinguished from processing availability");

  const preview = await post("/api/admin/intelligence/policy-impact", { feedUrl, tier: "HIGH", maxEpisodes: 3 });
  assert.equal(preview.status, 200);
  assert.equal((await preview.json()).impacts.length, 2, "policy impact previews are bounded and do not queue work");
  assert.equal(app.pipeline.status(feedUrl, "authorised-episode"), null);

  app.store.set("intelligence", episodeKey(feedUrl, "authorised-episode"), {
    state: "BLOCKED", code: "DURATION_LIMIT", reason: "Legacy duration gate", attempts: 2,
    jobId: "historical-duration", processingVersion: PROCESSING_VERSION, feedUrl, episodeId: "authorised-episode",
    startedAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:00:01.000Z",
  });
  const historical = await (await get(`/api/admin/episodes/detail?feedUrl=${encodeURIComponent(feedUrl)}&episodeId=authorised-episode`)).json();
  assert.equal(historical.episode.action.type, "REASSESS");
  assert.equal(historical.episode.recovery.historicalFailure.code, "DURATION_LIMIT");
  assert.equal(historical.processing.elapsedMs, 1000, "terminal duration does not grow with the clock");

  const prepared = await post("/api/admin/episodes/prepare", { feedUrl, episodeId: "authorised-episode" });
  assert.equal(prepared.status, 202, "an eligible, explicitly requested episode enters the existing pipeline");
  assert.equal((await prepared.json()).audioTranscription, "NOT_REQUESTED", "routine admin preparation does not opt into paid audio transcription");
  await Promise.all(app.pipeline.inflight.values());
  const episode = await (await get(`/api/admin/episodes/detail?feedUrl=${encodeURIComponent(feedUrl)}&episodeId=authorised-episode`)).json();
  assert.equal(episode.episode.state, "READY");
  assert.equal(episode.processingHistory.length, 2, "previous failure is retained after preparation");
  assert.equal(episode.episode.features.find((feature) => feature.name === "Episode brief").state, "READY");
  assert.ok(episode.timeline.some((item) => item.type === "PROCESSING_COMPLETED"), "timeline contains only recorded lifecycle events");
  assert.equal(episode.episode.transcript.sourceUri, transcript.sourceUri, "operations users may inspect transcript provenance without receiving transcript text");

  const denied = await post("/api/admin/episodes/prepare", { feedUrl, episodeId: "restricted-episode" });
  assert.equal(denied.status, 409);
  assert.match((await denied.json()).error, /legal basis|rights assessment/i, "the preparation endpoint preserves the independent rights boundary");
} finally {
  await new Promise((resolve) => app.server.close(resolve));
  app.store.close();
}
console.log("Admin podcast and episode operations catalogue passed");
