import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EpisodePipeline, episodeKey } from "./episode-pipeline.mjs";
import { BudgetLedger, defaultControls, PROCESSING_VERSION } from "./openai-intelligence.mjs";
import { LocalStore } from "./persistence.mjs";
import { RightsRegistry } from "./rights-registry.mjs";
import { IntelligencePolicyRegistry } from "./intelligence-policy.mjs";
import { assessTranscript } from "./transcripts.mjs";

const directory = mkdtempSync(join(tmpdir(), "starcast-stale-duration-"));
const file = join(directory, "test.sqlite");
let store = new LocalStore(file);
const feed = "https://publisher.example/recovery.xml";
const ledger = new BudgetLedger({ ...defaultControls, enabled: true }, store);
const rights = new RightsRegistry(store);
const intelligencePolicy = new IntelligencePolicyRegistry(store);
rights.set({ feedUrl: feed, classification: "LICENSED", assessmentStatus: "APPROVED", explicitAuthorisation: true, canAcquireTranscript: true, canProcessForAi: true, canDisplayDerivedIntelligence: true, canRetain: true, canRegenerate: true });
const transcript = { transcriptVersion: "recovery-v1", sourceType: "publisher_rss", sourceUri: "https://publisher.example/transcript.vtt", segments: [
  { id: "one", startMs: 0, endMs: 60_000, text: "Authorised publisher transcripts allow long podcast episodes to be analysed without downloading or transcribing the audio, preserving the original timing evidence." },
] };
transcript.quality = assessTranscript(transcript);
const resolveEpisode = async (_feed, id) => ({ id, duration: "180:00", audioUrl: `https://publisher.example/${id}.mp3`, refs: id === "publisher" ? [{ url: transcript.sourceUri, type: "text/vtt" }] : [] });
let calls = 0;
const pipeline = new EpisodePipeline({ store, ledger, rights, intelligencePolicy, enabled: true, configured: true, audioEnabled: true,
  resolveEpisode, fetchTranscript: async () => transcript,
  audioFactory: async () => { throw Error("Reassessment must never acquire audio."); },
  client: { responses: { create: async () => { calls++; return { output_text: JSON.stringify({ overview: "Authorised transcripts preserve evidence.", detail: "Publisher text can be reused without audio transcription.", themes: ["Transcript reuse"], sourceSegmentIndexes: [1], chapters: [{ title: "Reuse", description: "Using authorised text.", sourceSegmentIndexes: [1] }] }), usage: { input_tokens: 1, output_tokens: 1 } }; } } },
});
const seed = (id, extra = {}) => {
  const value = { state: "BLOCKED", code: "DURATION_LIMIT", reason: "Legacy duration gate", jobId: `old-${id}`, attempts: 2, retryable: false, processingVersion: PROCESSING_VERSION, feedUrl: feed, episodeId: id, startedAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:00:01.000Z", ...extra };
  store.set("intelligence", episodeKey(feed, id), value);
  return value;
};
try {
  seed("cached");
  const variant = createHash("sha256").update((await resolveEpisode(feed, "cached")).audioUrl).digest("hex");
  store.set("transcript", `${episodeKey(feed, "cached")}:${variant}`, transcript);
  assert.equal((await pipeline.preflight(feed, "cached")).requiresAudioConsent, false);
  const [first, duplicate] = await Promise.all([
    pipeline.request({ feedUrl: feed, episodeId: "cached", trigger: "automatic" }),
    pipeline.request({ feedUrl: feed, episodeId: "cached", allowAudio: true }),
  ]);
  assert.equal(first.jobId, duplicate.jobId, "concurrent reassessment resolves and queues exactly once");
  await Promise.all(pipeline.inflight.values());
  const ready = pipeline.status(feed, "cached");
  assert.equal(ready.state, "READY");
  assert.equal(ready.allowAudio, false);
  assert.equal(ready.reassessedFromJobId, "old-cached");
  assert.equal(ready.code, undefined, "new job must not inherit the old terminal failure");
  assert.notEqual(ready.completedAt, "2026-01-01T00:00:01.000Z");
  assert.equal(store.get("intelligence-history", "old-cached").code, "DURATION_LIMIT");
  assert.equal((await pipeline.request({ feedUrl: feed, episodeId: "cached" })).cacheHit, true);
  assert.equal(calls, 1);

  seed("publisher", { state: "FAILED" });
  await pipeline.request({ feedUrl: feed, episodeId: "publisher", trigger: "automatic" });
  await Promise.all(pipeline.inflight.values());
  assert.equal(pipeline.status(feed, "publisher").state, "READY");
  assert.equal(calls, 2);

  seed("no-source");
  await pipeline.request({ feedUrl: feed, episodeId: "no-source", trigger: "automatic" });
  await Promise.all(pipeline.inflight.values());
  const noSource = pipeline.status(feed, "no-source");
  assert.equal(noSource.code, "AUDIO_CONSENT_REQUIRED");
  assert.equal(noSource.transcriptChecks.publisherTranscriptChecked, true);
  assert.equal((await pipeline.request({ feedUrl: feed, episodeId: "no-source", trigger: "automatic" })).jobId, noSource.jobId, "unchanged automatic triggers cannot loop");

  seed("current", { transcriptChecks: { publisherTranscriptChecked: true, audioTranscriptionRequired: true } });
  assert.equal(pipeline.transcriptRecovery(feed, "current", await resolveEpisode(feed, "current")).eligible, false);
  assert.equal((await pipeline.request({ feedUrl: feed, episodeId: "current", trigger: "automatic" })).jobId, "old-current");
  seed("restricted");
  rights.set({ feedUrl: feed, episodeId: "restricted", classification: "DISPUTED", assessmentStatus: "REJECTED", rightsReserved: true });
  assert.equal(pipeline.transcriptRecovery(feed, "restricted", await resolveEpisode(feed, "restricted")).eligible, false);
  await pipeline.request({ feedUrl: feed, episodeId: "restricted", trigger: "automatic" });
  assert.equal(pipeline.status(feed, "restricted").jobId, "old-restricted");
  seed("paused");
  intelligencePolicy.set({ feedUrl: feed, episodeId: "paused", tier: "HIGH", reason: "Test operational suspension" });
  assert.equal(pipeline.transcriptRecovery(feed, "paused", await resolveEpisode(feed, "paused")).eligible, false);
  seed("budget");
  ledger.reserve({ id: "budget-exhaustion", usd: ledger.controls.dailyUsd - ledger.totals().day });
  assert.equal(pipeline.transcriptRecovery(feed, "budget", await resolveEpisode(feed, "budget")).eligible, false);
  assert.equal((await pipeline.request({ feedUrl: feed, episodeId: "budget", trigger: "automatic" })).jobId, "old-budget");
  assert.equal(calls, 2);
  assert.equal(ledger.controls.maxEpisodeSeconds, 7200);
  ledger.reconcile("budget-exhaustion", { usd: 0 });
  store.close();
  store = new LocalStore(file);
  assert.equal(store.get("intelligence-history", "old-cached").reason, "Legacy duration gate");
  assert.equal(store.get("intelligence", episodeKey(feed, "cached")).state, "READY");
} finally {
  store.close();
  rmSync(directory, { recursive: true, force: true });
}
console.log("Bounded stale duration recovery, concurrency, history persistence, rights, policy and budget gates passed");
