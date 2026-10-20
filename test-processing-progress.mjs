import assert from "node:assert/strict";
import { LocalStore } from "./persistence.mjs";
import { createStarCastServer } from "./server.mjs";
import { episodeKey, listenerProcessingStatus } from "./episode-pipeline.mjs";
import { RightsClassification } from "./rights-registry.mjs";
import { assessTranscript } from "./transcripts.mjs";
import { PROCESSING_VERSION } from "./openai-intelligence.mjs";

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const feedUrl = "https://publisher.example/progress.xml";
const episodeId = "progress-episode";
const feed = `<?xml version="1.0"?><rss><channel><title>Progress &amp; Evidence</title><itunes:author>Radio Star fixture</itunes:author><item><guid>${episodeId}</guid><title>Preparation &amp; delivery</title><pubDate>Tue, 20 Oct 2026 10:00:00 GMT</pubDate><itunes:duration>02:00</itunes:duration><enclosure url="https://publisher.example/progress.mp3"/></item></channel></rss>`;
const transcript = {
  sourceType: "publisher_rss",
  sourceUri: "https://publisher.example/progress.vtt",
  originalFormat: "text/vtt",
  transcriptVersion: "progress-v1",
  segments: [
    { id: "s1", startMs: 0, endMs: 60_000, text: "This fixture verifies that measured preparation stages become visible to an authorised Radio Star listener without exposing a transcript.", contentType: "conversation" },
    { id: "s2", startMs: 60_000, endMs: 120_000, text: "The discussion explains queue recovery, grounded intelligence and automatic delivery when processing is ready.", contentType: "conversation" },
  ],
};
transcript.quality = assessTranscript(transcript);

const app = createStarCastServer({
  store: new LocalStore(":memory:"),
  env: {
    STARCAST_DEV_INTELLIGENCE_TOKEN: "progress-listener",
    STARCAST_ADMIN_TOKEN: "progress-admin",
    STARCAST_PAID_INTELLIGENCE: "enabled",
    OPENAI_API_KEY: "mock-key",
  },
  fetchFeed: async (url) => { assert.equal(url, feedUrl); return feed; },
  resolveEpisode: async (_feed, id) => {
    await wait(16);
    return { id, title: "Preparation & delivery", showName: "Progress & Evidence", publisher: "Radio Star fixture", duration: "02:00", audioUrl: "https://publisher.example/progress.mp3", refs: [{ url: transcript.sourceUri, type: "text/vtt" }] };
  },
  fetchTranscript: async () => transcript,
  client: { responses: { create: async () => {
    await wait(80);
    return { output_text: JSON.stringify({ overview: "The fixture explains measured preparation stages.", themes: ["Preparation"], detail: "The conversation covers queued work, transcript acquisition and grounded delivery.", sourceSegmentIndexes: [1], chapters: [{ title: "Preparation", description: "Measured work stages.", sourceSegmentIndexes: [1, 2] }] }), usage: { input_tokens: 10, output_tokens: 10 } };
  } } },
});
app.rights.set({
  feedUrl,
  episodeId,
  classification: RightsClassification.LICENSED,
  assessmentStatus: "APPROVED",
  explicitAuthorisation: true,
  canAcquireTranscript: true,
  canProcessForAi: true,
  canDisplayDerivedIntelligence: true,
  canRetain: true,
  canRegenerate: true,
});

// ETA becomes visible only after comparable measured publisher-transcript jobs.
for (let index = 0; index < 3; index++) {
  const id = `historical-${index}`;
  app.store.set("intelligence", episodeKey(feedUrl, id), {
    state: "READY", jobId: `historical-job-${index}`, feedUrl, episodeId: id,
    processingVersion: PROCESSING_VERSION, processingMs: 90_000 + index * 10_000,
    startedAt: new Date(Date.now() - 180_000).toISOString(), completedAt: new Date(Date.now() - 80_000).toISOString(),
    provenance: { sourceType: "publisher_rss" },
    lifecycle: [{ stage: "ANALYSING", at: new Date(Date.now() - 180_000 - index * 10_000).toISOString() }],
    episode: { id, duration: "02:00", feedUrl },
    transcript, brief: { overview: "Historical fixture", themes: ["Fixture"], detail: "Measured history." }, chapters: [],
  });
}

await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;
const listenerHeaders = { "content-type": "application/json", "x-star-cast-dev-token": "progress-listener" };
const adminHeaders = { "x-star-cast-admin-token": "progress-admin" };
const statusUrl = `/api/intelligence/status?${new URLSearchParams({ feedUrl, episodeId })}`;
const request = () => fetch(base + "/api/intelligence/request", { method: "POST", headers: listenerHeaders, body: JSON.stringify({ feedUrl, episodeId, capability: "brief", trigger: "automatic" }) });

try {
  const accepted = await request();
  assert.equal(accepted.status, 202, "the accepted durable job is acknowledged before worker completion");
  const acceptedBody = await accepted.json();
  assert.ok(acceptedBody.status.jobId, "a real persisted job id is returned");
  const duplicate = await request();
  assert.equal((await duplicate.json()).status.jobId, acceptedBody.status.jobId, "duplicate requests reuse the accepted job");

  await wait(35);
  const active = (await (await fetch(base + statusUrl, { headers: listenerHeaders })).json()).status;
  assert.equal(active.state, "ANALYSING", "the listener sees the actual provider-analysis stage");
  assert.equal(active.processingStage, "ANALYSING");
  assert.equal(active.canonicalEpisodeId, app.pipeline.status(feedUrl, episodeId) ? active.canonicalEpisodeId : null);
  assert.ok(active.estimatedCompletion?.sampleCount >= 3, "ETA is shown only from measured comparable history");
  assert.equal(active.availableFeatures.brief, false, "features remain unavailable until persisted intelligence exists");
  assert.equal(active.nextAction, "KEEP_LISTENING");

  await Promise.all(app.pipeline.inflight.values());
  const ready = (await (await fetch(base + statusUrl, { headers: listenerHeaders })).json()).status;
  assert.equal(ready.state, "READY");
  assert.equal(ready.processing, false);
  const completedRecord = app.pipeline.status(feedUrl, episodeId);
  assert.ok(completedRecord.timing.stageDurationsMs.ANALYSING > 0);
  assert.equal(completedRecord.timing.estimates.length, 1, "first stage estimate survives completion for accuracy review");
  assert.ok(completedRecord.timing.estimates[0].actualRemainingMs >= 0);
  assert.equal(ready.availableFeatures.brief, true);
  assert.equal(ready.nextAction, "VIEW_INTELLIGENCE");
  assert.equal(ready.transcript, undefined, "the status API never exposes full transcript text");

  const events = app.pipeline.eventsFor(feedUrl, episodeId);
  assert.deepEqual(events.map((event) => event.type), ["JOB_QUEUED", "WORKER_STARTED", "TRANSCRIPT_CACHE_CHECK", "TRANSCRIPT_ACQUISITION", "AI_ANALYSIS", "SEARCH_INDEX", "INTELLIGENCE_READY"]);
  assert.equal(events.some((event) => event.type === "AUDIO_TRANSCRIPTION"), false, "publisher transcripts never claim audio transcription");
  assert.ok(events.every((event) => event.previousState !== undefined && event.state && event.at && event.processingVersion), "each transition is attributable and versioned");

  const detail = await (await fetch(base + `/api/admin/episodes/detail?${new URLSearchParams({ feedUrl, episodeId })}`, { headers: adminHeaders })).json();
  assert.equal(detail.episode.canonicalEpisodeId, ready.canonicalEpisodeId, "admin and listener resolve one canonical episode identity");
  assert.equal(detail.processing.state, ready.state, "admin and listener share the status projection");
  assert.equal(detail.processing.failureCode, null, "admin keeps the durable terminal code separate from a READY record");
  assert.equal(detail.processing.audioTranscriptionRequired, false, "admin records that a publisher transcript avoided audio fallback");
  assert.equal(detail.processing.transcriptChecks.cacheChecked, true);
  assert.equal(detail.processing.transcriptChecks.publisherTranscriptChecked, true);
  assert.equal(detail.processing.transcriptChecks.publisherTranscriptFound, true);
  assert.ok(detail.timeline.some((event) => event.eventType === "AI_ANALYSIS"), "admin timeline is sourced from durable lifecycle events");
  assert.ok(detail.timeline.some((event) => event.type === "PROCESSING_COMPLETED"), "existing Admin completion compatibility remains tied to the READY event");

  assert.equal(listenerProcessingStatus({ state: "BLOCKED", code: "BUDGET_LIMIT" }).state, "BUDGET_PAUSED");
  assert.equal(listenerProcessingStatus({ state: "BLOCKED", code: "RIGHTS_RESTRICTED" }).state, "UNAVAILABLE");
  assert.equal(listenerProcessingStatus({ state: "CANCELLED", code: "CANCELLED" }).state, "CANCELLED");
} finally {
  await new Promise((resolve) => app.server.close(resolve));
  app.store.close();
}

console.log("Authoritative processing status, lifecycle, ETA evidence, identity parity and automatic result delivery passed");
