import assert from "node:assert/strict";
import { intelligencePresentation } from "./native/src/intelligencePresentation.mjs";
import { playbackPresentation } from "./native/src/playbackPresentation.mjs";
import { createIntelligenceSession } from "./native/src/intelligenceSession.mjs";
import { measuredProcessingEstimate, processingTiming } from "./processing-estimate.mjs";

const now = Date.now();
for (const state of ["CHECKING", "QUEUED", "TRANSCRIBING", "ANALYSING", "INDEXING"]) {
  const view = intelligencePresentation({ state, processing: true });
  assert.equal(view.processing, true, state);
  assert.equal(view.eta, null, "missing evidence never invents an estimate");
}
for (const state of ["READY", "UNAVAILABLE", "FAILED", "BUDGET_PAUSED"]) {
  assert.equal(intelligencePresentation({ state }).processing, false);
}
assert.equal(intelligencePresentation(null).processing, false, "unknown state never animates processing");
assert.equal(intelligencePresentation({ state: "UNAVAILABLE", processingStage: "ANALYSING", processing: true }).processing, false, "terminal state wins over stale stage");
assert.equal(intelligencePresentation({ state: "ANALYSING" }, { error: "network" }).state, "WAITING");
assert.equal(intelligencePresentation({ state: "FAILED", retryable: false }).action, null);
assert.equal(intelligencePresentation({ state: "FAILED", retryEligible: true }).action, "retry");
assert.match(intelligencePresentation({ state: "UNAVAILABLE", code: "LEGAL_BASIS_NOT_ESTABLISHED" }).explanation, /hasn't been established/);
assert.doesNotMatch(intelligencePresentation({ state: "UNAVAILABLE", code: "LEGAL_BASIS_NOT_ESTABLISHED", reason: "secret stack trace" }).explanation, /publisher has|secret/);
assert.equal(intelligencePresentation({ state: "BLOCKED", code: "BUDGET_LIMIT" }).state, "BUDGET_PAUSED");
assert.equal(intelligencePresentation({ state: "READY" }, { enabled: false }).ready, true);
assert.equal(intelligencePresentation({ state: "UNAVAILABLE", code: "LEGAL_BASIS_NOT_ESTABLISHED", requiresAudioConsent: true }).action, null, "audio consent cannot resolve a rights blocker");
assert.equal(intelligencePresentation({ state: "UNAVAILABLE", code: "AUDIO_CONSENT_REQUIRED", requiresAudioConsent: true }).action, "audio");
assert.match(intelligencePresentation({ state: "FAILED", code: "PROVIDER_TIMEOUT", availabilityCode: "PROVIDER_FAILURE" }).explanation, /didn't respond in time/, "retain the specific durable reason");

const job = {
  jobId: "current", state: "PARTIAL_READY", processingStage: "ANALYSING",
  processingVersion: "test", provenance: { sourceType: "publisher_rss" },
  episode: { duration: "30:00" },
  lifecycle: [{ stage: "QUEUED", at: new Date(now - 20000).toISOString() }, { stage: "ANALYSING", at: new Date(now - 10000).toISOString() }],
};
const history = [180000, 210000, 240000].map((ms, index) => ({
  ...job, state: "READY", jobId: `previous-${index}`, completedAt: new Date(now - 60000).toISOString(),
  lifecycle: [{ stage: "ANALYSING", at: new Date(now - 60000 - ms).toISOString() }],
}));
assert.equal(measuredProcessingEstimate(job, history.slice(0, 2), now), null);
assert.equal(measuredProcessingEstimate({ ...job, state: "QUEUED" }, history, now), null);
assert.equal(measuredProcessingEstimate(job, history.map((entry) => ({ ...entry, state: "FAILED" })), now), null);
assert.equal(measuredProcessingEstimate(job, history.map((entry) => ({ ...entry, processingVersion: "old" })), now), null);
const eta = measuredProcessingEstimate(job, history, now);
assert.equal(eta.minimumMs, 170000);
assert.equal(eta.maximumMs, 230000);
assert.equal(eta.confidence, "medium");
assert.equal(measuredProcessingEstimate(job, history, now + 5000).maximumMs, 225000, "ETA updates using elapsed stage time");
assert.equal(measuredProcessingEstimate(job, history, now + 250000), null, "overdue samples cannot promise zero minutes");
assert.equal(intelligencePresentation({ state: "ANALYSING", estimatedCompletion: eta }, { now }).eta, "Usually ready in 3–4 minutes.");
assert.equal(intelligencePresentation({ state: "UNAVAILABLE", estimatedCompletion: eta }, { now }).eta, null);
assert.equal(intelligencePresentation({ state: "ANALYSING", estimatedCompletion: eta }, { now: now + 100000 }).eta, null);
assert.equal(processingTiming(job).queueWaitMs, 10000);
const audioJob = { ...job, provenance: { sourceType: "on_demand_audio" }, episode: { duration: "90:00" } };
assert.equal(measuredProcessingEstimate(audioJob, history.map((entry) => ({ ...entry, provenance: audioJob.provenance, episode: { duration: "10:00" } })), now), null);

assert.equal(playbackPresentation({}, { connecting: true }).state, "CONNECTING");
assert.equal(playbackPresentation({ isBuffering: true }, { hasSource: true }).state, "BUFFERING");
assert.equal(playbackPresentation({ playing: true }, { hasSource: true }).state, "PLAYING");
assert.equal(playbackPresentation({ playing: false }, { hasSource: true }).state, "PAUSED");
assert.equal(playbackPresentation({ playing: true, error: "native error" }, { hasSource: true }).state, "FAILED");
assert.equal(playbackPresentation({ error: "stale" }, { connecting: true, hasSource: true }).state, "CONNECTING");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let reads = 0, requests = 0, state = { state: "ANALYSING", processing: true }, offline = false;
const api = {
  status: async () => { reads++; if (offline) throw Error("offline"); return state; },
  request: async () => { requests++; return state; },
};
const session = createIntelligenceSession(api, "feed", "episode", { pollMs: 5 });
const player = session.watch(true);
const detail = session.watch(true);
await delay(15);
detail();
const before = reads;
await delay(20);
assert.ok(reads > before, "closing the detail view leaves player polling alive");
offline = true;
await delay(70);
assert.equal(session.getSnapshot().paused, true);
assert.equal(intelligencePresentation(session.getSnapshot().status, session.getSnapshot()).processing, false);
offline = false;
state = { state: "READY", processing: false, brief: { overview: "Authorised fixture" } };
await session.refresh();
assert.equal(session.getSnapshot().status.state, "READY", "network recovery delivers ready content without a paid request");
const afterReady = reads;
await delay(20);
assert.equal(reads, afterReady, "terminal status stops polling");
player();
const restarted = createIntelligenceSession(api, "feed", "episode");
const stop = restarted.watch(true);
await delay(10);
stop();
assert.equal(restarted.getSnapshot().status.state, "READY");
assert.equal(requests, 0, "restarts and recovery read existing results");
console.log("Native status, measured ETA, shared polling recovery and audio state contracts passed");
assert.equal(intelligencePresentation({ state: "UNAVAILABLE", availabilityState: "REVIEW_REQUIRED", code: "LEGAL_BASIS_NOT_ESTABLISHED" }).state, "REVIEW_REQUIRED");
assert.equal(intelligencePresentation({ state: "TRANSCRIBING", processing: true, work: { completedChunks: 2, totalChunks: 13 } }).progress, "2 of 13 audio chunks complete.");
assert.equal(intelligencePresentation({ state: "TRANSCRIBING", processing: true, work: { completedChunks: 99, totalChunks: 13 } }).progress, null);
