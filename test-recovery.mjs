import assert from "node:assert/strict";
import { LocalStore } from "./persistence.mjs";
import {
  BudgetLedger,
  defaultControls,
  generateEpisodeIntelligence,
  PROCESSING_VERSION,
} from "./openai-intelligence.mjs";
import { EpisodePipeline, episodeKey } from "./episode-pipeline.mjs";
import { AiSleepEngine } from "./sleep.mjs";

const store = new LocalStore(":memory:"),
  ledger = new BudgetLedger({ ...defaultControls, enabled: true }, store),
  feed = "https://example.org/rss";
store.set("intelligence", episodeKey(feed, "interrupted"), {
  state: "UNDERSTANDING",
  attempts: 1,
  processingVersion: PROCESSING_VERSION,
});
ledger.reserve({ id: "lost-response", usd: 0.03 });
const pipeline = new EpisodePipeline({
  store,
  ledger,
  resolveEpisode: async () => ({
    duration: "10:00",
    audioUrl: "https://example.org/a.mp3",
    refs: [],
  }),
  enabled: true,
  audioEnabled: true,
  configured: true,
});
assert.equal(pipeline.status(feed, "interrupted").code, "INTERRUPTED");
assert.equal(ledger.usage[0].uncertain, true);
assert.equal(ledger.usage[0].usd, 0.03);
await pipeline.request({ feedUrl: feed, episodeId: "no-consent" });
await Promise.all(pipeline.inflight.values());
assert.equal(
  pipeline.status(feed, "no-consent").code,
  "AUDIO_CONSENT_REQUIRED",
);
assert.equal(ledger.usage.length, 1);
const transcript = {
  segments: [
    {
      id: "a",
      startMs: null,
      endMs: null,
      text: "This is a real shape for an untimed publisher transcript, represented by a fixture solely for testing. It provides text without precise timestamps.",
    },
  ],
};
const client = {
  responses: {
    create: async () => ({
      output_text: JSON.stringify({
        overview: transcript.segments[0].text,
        themes: ["Publisher transcript"],
        detail: transcript.segments[0].text,
        sourceSegmentIndexes: [1],
        chapters: [
          {
            title: "Publisher transcript",
            startMs: 0,
            endMs: 100,
            sourceSegmentIndexes: [1],
          },
        ],
      }),
      usage: { input_tokens: 50, output_tokens: 50 },
    }),
  },
};
const result = await generateEpisodeIntelligence({
  transcript,
  ledger,
  requestId: "untimed",
  client,
});
assert.equal(result.chapters.length, 0);
assert.deepEqual(
  result.brief.sourceSegmentIds,
  ["a"],
  "bounded source numbers resolve to canonical IDs",
);
await assert.rejects(
  () =>
    generateEpisodeIntelligence({
      transcript,
      ledger,
      requestId: "invalid-reference",
      client: {
        responses: {
          create: async () => ({
            output_text: JSON.stringify({
              overview: "No invented reference.",
              themes: [],
              detail: "Invalid source fixture.",
              sourceSegmentIndexes: [2],
              chapters: [],
            }),
            usage: { input_tokens: 20, output_tokens: 20 },
          }),
        },
      },
    }),
  /source validation/,
);
await assert.rejects(() =>
  generateEpisodeIntelligence({
    transcript,
    ledger,
    requestId: "failed-response",
    client: {
      responses: {
        create: async () => {
          throw Error("timeout");
        },
      },
    },
  }),
);
assert.equal(ledger.usage.at(-1).uncertain, true);
assert.ok(ledger.usage.at(-1).usd > 0);
const empty = new AiSleepEngine();
empty.start();
empty.recordSession();
assert.equal(
  empty.history[0].preferredEstimateMs,
  null,
  "absence of extensions does not become a learning label",
);
const sleep = new AiSleepEngine();
sleep.start();
const onset = sleep.session.predictedSleepOnsetAt;
sleep.extend(5);
sleep.extend(15);
assert.equal(sleep.session.predictedSleepOnsetAt, onset);
assert.equal(sleep.session.extensionMs, 1200000);
sleep.recordSession();
const learned = new AiSleepEngine({ history: sleep.history });
learned.start();
assert.ok(
  learned.session.preferredMinimumMs > learned.session.predictedSleepOnsetMs,
);
store.close();
console.log(
  "interrupted jobs, consent, uncertain costs, untimed text and separate sleep learning checks passed",
);

const audioStore = new LocalStore(":memory:"),
  audioLedger = new BudgetLedger(
    { ...defaultControls, enabled: true },
    audioStore,
  );
let prepared = 0,
  transcribed = 0,
  cleaned = 0;
const audioPipeline = new EpisodePipeline({
  store: audioStore,
  ledger: audioLedger,
  enabled: true,
  audioEnabled: true,
  configured: true,
  resolveEpisode: async () => ({
    duration: "0:40", // RSS omits inserted audio; the delivered variant is 60 seconds.
    audioUrl: "https://example.org/shared-audio.mp3",
    refs: [],
  }),
  audioFactory: async () => {
    prepared++;
    await new Promise((r) => setTimeout(r, 20));
    return {
      durationMs: 60000,
      chunkFactory: async () => new Blob(["test"]),
      cleanup: async () => {
        cleaned++;
      },
    };
  },
  client: {
    ...client,
    audio: {
      transcriptions: {
        create: async () => {
          transcribed++;
          return {
            segments: [
              { start: 0, end: 60, text: transcript.segments[0].text },
            ],
          };
        },
      },
    },
  },
});
await Promise.all(
  ["first", "second"].map((episodeId) =>
    audioPipeline.request({ feedUrl: feed, episodeId, allowAudio: true }),
  ),
);
await Promise.all(audioPipeline.inflight.values());
assert.equal(prepared, 1);
assert.equal(transcribed, 1);
assert.equal(cleaned, 1);
assert.equal(
  audioLedger.usage.filter((x) => x.kind === "transcription").length,
  1,
);
assert.equal(audioPipeline.status(feed, "first").state, "READY");
assert.equal(audioPipeline.status(feed, "first").transcript.durationMs, 60000);
assert.equal(
  audioPipeline.status(feed, "first").quality.readiness,
  "FULLY_READY",
);
assert.equal(audioPipeline.status(feed, "second").state, "READY");
audioStore.close();
console.log(
  "shared audio acquisition and paid transcription deduplication passed",
);
