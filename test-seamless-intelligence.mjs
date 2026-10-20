import assert from "node:assert/strict";
import { LocalStore } from "./persistence.mjs";
import {
  BudgetLedger,
  defaultControls,
  PROCESSING_VERSION,
} from "./openai-intelligence.mjs";
import {
  EpisodePipeline,
  episodeKey,
  publicIntelligence,
} from "./episode-pipeline.mjs";
import { assessTranscript } from "./transcripts.mjs";
import { createIntelligenceSession } from "./native/src/intelligenceSession.mjs";
import { groundResult } from "./grounded-result.mjs";

const feed = "https://publisher.example/feed.xml";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const segments = Array.from({ length: 65 }, (_, i) => ({
  id: `segment-${i}`,
  startMs: i * 1000,
  endMs: (i + 1) * 1000,
  text: "A test fixture about science and reliable research methods, not a real podcast result.",
}));
const transcript = {
  segments,
  quality: assessTranscript({ segments }),
  transcriptVersion: "test-v1",
  sourceType: "publisher_rss",
};
const response = {
  output_text: JSON.stringify({
    overview: "Fixture overview.",
    themes: ["Science"],
    detail: "Fixture detail.",
    sourceSegmentIndexes: [1],
    chapters: [{ title: "Science", sourceSegmentIndexes: [1, 2] }],
  }),
  usage: { input_tokens: 100, output_tokens: 100 },
};
let calls = 0,
  audioCalls = 0;
const make = (options = {}) => {
  const store = new LocalStore(":memory:");
  const ledger = new BudgetLedger({ ...defaultControls, enabled: true }, store);
  return new EpisodePipeline({
    store,
    ledger,
    configured: true,
    enabled: true,
    audioEnabled: true,
    resolveEpisode: async (_feed, id) => ({
      id,
      duration: id === "long" ? "168:00" : "2:00",
      audioUrl: `https://publisher.example/${id}.mp3`,
      refs: id === "audio" ? [] : [{ url: "https://publisher.example/t.vtt" }],
    }),
    fetchTranscript: async () => transcript,
    audioFactory: async () => {
      audioCalls++;
      throw Error("Automatic audio must never run");
    },
    client: {
      responses: {
        create: async () => {
          calls++;
          await delay(20);
          return response;
        },
      },
    },
    ...options,
  });
};
const p = make();
const ungrounded = {
  state: "READY",
  processingVersion: PROCESSING_VERSION,
  completedAt: new Date().toISOString(),
  attempts: 2,
  transcript,
  brief: {
    overview: "The 2023 research prize.",
    themes: ["Research"],
    detail: "It was awarded in 2023.",
    sourceSegmentIds: ["segment-0"],
  },
  chapters: [
    { title: "2023 Prize", description: "Invented year." },
    { title: "Science", description: "Source discussion." },
  ],
};
const guarded = groundResult(ungrounded, transcript);
assert.equal(guarded.partialResult, true);
assert.equal(guarded.brief.mode, "extractive");
assert.ok(!guarded.brief.overview.includes("2023"));
assert.equal(guarded.chapters.length, 1);
assert.equal(
  guarded.brief.overview,
  `“${segments
    .slice(0, 2)
    .map((s) => s.text)
    .join(" ")}”`,
);
p.store.set("intelligence", episodeKey(feed, "legacy"), ungrounded);
const migrated = p.status(feed, "legacy");
assert.equal(migrated.state, "PARTIAL_READY");
assert.equal(publicIntelligence(migrated).processing, false);
assert.equal(publicIntelligence({ state: "UNAVAILABLE" }).state, "UNAVAILABLE");
assert.equal(migrated.attempts, 2, "source repair must not reset retries");
new EpisodePipeline({ store: p.store, ledger: p.ledger });
assert.equal(
  p.status(feed, "legacy").state,
  "PARTIAL_READY",
  "completed partial results survive restart",
);
const initial = await Promise.all(
  Array.from({ length: 10 }, () =>
    p.request({
      feedUrl: feed,
      episodeId: "publisher",
      trigger: "automatic",
      allowAudio: true,
    }),
  ),
);
assert.equal(new Set(initial.map((x) => x.jobId)).size, 1);
await delay(5);
assert.equal(p.status(feed, "publisher").state, "PARTIAL_READY");
assert.equal(
  publicIntelligence(p.status(feed, "publisher")).transcript,
  undefined,
);
assert.equal(
  publicIntelligence(p.status(feed, "publisher")).episode.audioUrl,
  undefined,
  "public job state exposes safe episode identity but never an enclosure URL",
);
assert.equal(p.internalTranscriptPage(feed, "publisher").segments.length, 60);
assert.equal(p.internalTranscriptPage(feed, "publisher", 60).segments.length, 5);
assert.ok(p.moments(feed, "publisher", "science").length);
await Promise.all(p.inflight.values());
assert.equal(calls, 1);
assert.equal(p.status(feed, "publisher").state, "READY");
await p.request({
  feedUrl: feed,
  episodeId: "publisher",
  trigger: "automatic",
});
assert.equal(calls, 1);
await p.request({
  feedUrl: feed,
  episodeId: "audio",
  trigger: "automatic",
  allowAudio: true,
});
await Promise.all(p.inflight.values());
assert.equal(p.status(feed, "audio").state, "BLOCKED");
assert.equal(p.status(feed, "audio").requiresAudioConsent, true);
assert.equal(audioCalls, 0);
const consentJob = p.status(feed, "audio").jobId;
await p.request({
  feedUrl: feed,
  episodeId: "audio",
  trigger: "automatic",
  allowAudio: true,
});
assert.equal(
  p.status(feed, "audio").jobId,
  consentJob,
  "reopening never retries a blocked episode",
);
await p.request({ feedUrl: feed, episodeId: "long", trigger: "automatic" });
await Promise.all(p.inflight.values());
assert.equal(p.status(feed, "long").code, "DURATION_LIMIT");
assert.equal(calls, 1);
p.ledger.reserve({ id: "exhaust-budget", usd: 4.999 });
await p.request({ feedUrl: feed, episodeId: "budget", trigger: "automatic" });
await Promise.all(p.inflight.values());
assert.equal(p.status(feed, "budget").state, "BLOCKED");
assert.equal(p.status(feed, "budget").code, "BUDGET_LIMIT");
assert.equal(calls, 1);
p.store.close();

const partial = make({
  client: {
    responses: {
      create: async () => ({
        ...response,
        output_text: JSON.stringify({
          ...JSON.parse(response.output_text),
          overview: "An unsupported 2023 event.",
        }),
      }),
    },
  },
});
await partial.request({ feedUrl: feed, episodeId: "partial" });
await Promise.all(partial.inflight.values());
assert.equal(partial.status(feed, "partial").state, "PARTIAL_READY");
assert.equal(
  publicIntelligence(partial.status(feed, "partial")).processing,
  false,
);
assert.equal(
  (await partial.request({ feedUrl: feed, episodeId: "partial" })).cacheHit,
  true,
);
assert.equal(
  partial.ledger.usage.length,
  1,
  "partial results do not trigger hidden repair calls",
);
partial.store.close();

const timeout = make({
  jobTimeoutMs: 10,
  client: {
    responses: {
      create: async () => {
        await delay(35);
        return response;
      },
    },
  },
});
await timeout.request({ feedUrl: feed, episodeId: "slow" });
await delay(18);
assert.equal(timeout.status(feed, "slow").code, "TIMEOUT");
await timeout.request({ feedUrl: feed, episodeId: "slow", retry: true });
assert.equal(
  timeout.inflight.size,
  1,
  "late provider work cannot be duplicated",
);
await Promise.all(timeout.inflight.values());
assert.equal(
  timeout.status(feed, "slow").code,
  "TIMEOUT",
  "late completion cannot overwrite terminal deadline",
);
assert.equal(
  timeout.ledger.usage.length,
  1,
  "actual late response is still accounted",
);
timeout.store.close();
const restart = make();
restart.store.set("intelligence", episodeKey(feed, "restart"), {
  state: "PARTIAL_READY",
  attempts: 1,
  processingVersion: PROCESSING_VERSION,
});
new EpisodePipeline({ store: restart.store, ledger: restart.ledger });
assert.equal(restart.status(feed, "restart").code, "INTERRUPTED");
restart.store.close();

let serverState = { state: "NOT_REQUESTED" },
  requests = 0,
  reads = 0;
const api = {
  status: async () => {
    reads++;
    await delay(2);
    return serverState;
  },
  request: async (_feed, _id, options) => {
    requests++;
    assert.equal(options.allowAudio, false);
    return (serverState = { state: "PROCESSING" });
  },
};
const session = createIntelligenceSession(api, feed, "one", { pollMs: 4 });
let stop = session.watch(false);
await delay(5);
assert.equal(requests, 0, "opening before activation is read-only");
stop();
stop = session.watch(true);
await delay(5);
assert.equal(requests, 1);
await Promise.all([session.request(), session.request()]);
assert.equal(requests, 1, "Brief and Explore share the running job");
stop();
serverState = { state: "READY", brief: { overview: "Cached" } };
stop = session.watch(true);
await delay(8);
assert.equal(session.getSnapshot().status.state, "READY");
assert.equal(requests, 1, "navigation restores, not restarts");
stop();
const relaunched = createIntelligenceSession(api, feed, "one");
stop = relaunched.watch(true);
await delay(5);
stop();
assert.equal(relaunched.getSnapshot().status.state, "READY");
assert.equal(requests, 1, "app relaunch reads persisted results");
serverState = { state: "PROCESSING" };
const paused = createIntelligenceSession(api, feed, "pause", { pollMs: 3 });
stop = paused.watch(true);
await delay(5);
paused.stopWaiting();
const before = reads;
await delay(15);
assert.equal(reads, before);
assert.equal(paused.getSnapshot().paused, true);
stop();
let offlineReads = 0;
const offline = createIntelligenceSession(
  {
    ...api,
    status: async () => {
      if (++offlineReads > 1) throw Error("offline");
      return { state: "PROCESSING" };
    },
  },
  feed,
  "offline",
  { pollMs: 3 },
);
stop = offline.watch(true);
await delay(40);
stop();
assert.equal(offlineReads, 4);
assert.equal(offline.getSnapshot().paused, true);
const stale = createIntelligenceSession(
  {
    ...api,
    status: async () => ({
      state: "PROCESSING",
      deadlineAt: new Date(0).toISOString(),
    }),
  },
  feed,
  "deadline",
);
stop = stale.watch(true);
await delay(5);
stop();
assert.equal(stale.getSnapshot().paused, true);
let partialReads = 0;
const partialSession = createIntelligenceSession(
  {
    ...api,
    status: async () => {
      partialReads++;
      return {
        state: "PARTIAL_READY",
        processing: false,
        brief: { overview: "Source excerpt" },
      };
    },
  },
  feed,
  "partial",
  { pollMs: 3 },
);
stop = partialSession.watch(true);
await delay(20);
stop();
assert.equal(
  partialReads,
  1,
  "completed partial results must not poll indefinitely",
);
const activationRace = createIntelligenceSession(
  {
    ...api,
    status: async () => {
      await delay(10);
      return { state: "NOT_REQUESTED" };
    },
  },
  feed,
  "race",
);
const stopFirst = activationRace.watch(false);
stopFirst();
stop = activationRace.watch(true);
await delay(18);
stop();
assert.equal(activationRace.getSnapshot().status.state, "PROCESSING");
console.log(
  "Seamless intelligence: automatic publisher-only processing, shared jobs, partial transcript, budgets, deadlines, recovery, activation and bounded polling passed.",
);
