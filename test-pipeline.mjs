import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStore } from "./persistence.mjs";
import {
  BudgetLedger,
  defaultControls,
  validateChapters,
} from "./openai-intelligence.mjs";
import { createStarCastServer } from "./server.mjs";
import { parseJsonTranscript, assessTranscript } from "./transcripts.mjs";
import { publicUrl } from "./safe-network.mjs";
import { transcribeOnDemand } from "./transcription.mjs";

const directory = await mkdtemp(join(tmpdir(), "starcast-test-")),
  path = join(directory, "state.sqlite");
const feedUrl = "https://publisher.example/feed.xml",
  episodeId = "episode-real-contract";
let calls = 0;
const segments = [
  {
    id: "s1",
    startMs: 0,
    endMs: 60_000,
    text: "Researchers discuss how energy and compute constrain scientific discovery. Reliable measurements matter when comparing progress.",
    contentType: "conversation",
  },
  {
    id: "s2",
    startMs: 60_000,
    endMs: 120_000,
    text: "They disagree about the right tradeoff between scaling compute and collecting higher quality data for scientific research.",
    contentType: "conversation",
  },
];
const transcript = {
  segments,
  quality: assessTranscript({ segments }),
  transcriptVersion: "test-v1",
  sourceType: "publisher_rss",
  originalFormat: "text/vtt",
  sourceUri: "https://publisher.example/transcript.vtt",
};
const client = {
  responses: {
    create: async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 25));
      return {
        output_text: JSON.stringify({
          overview: "Researchers discuss compute limits.",
          themes: ["Compute"],
          detail: "The discussion compares compute and data quality.",
          sourceSegmentIndexes: [1],
          chapters: [{ title: "Compute", sourceSegmentIndexes: [1] }],
        }),
        usage: { input_tokens: 100, output_tokens: 100 },
      };
    },
  },
};
const env = {
  OPENAI_API_KEY: "mock-not-a-key",
  STARCAST_DEV_INTELLIGENCE_TOKEN: "test-token",
  STARCAST_PAID_INTELLIGENCE: "enabled",
  STARCAST_AUDIO_TRANSCRIPTION: "enabled",
};
const resolveEpisode = async (_feed, id) => ({
  id,
  title: "Science discussion",
  showName: "Science",
  duration: id === "long" ? "168:00" : "2:00",
  audioUrl: "https://publisher.example/audio.mp3",
  refs: [{ url: transcript.sourceUri, type: "text/vtt" }],
});
const make = () =>
  createStarCastServer({
    store: new LocalStore(path),
    env,
    resolveEpisode,
    client,
    fetchTranscript: async () => transcript,
  });
let app = make();
await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
let base = "http://127.0.0.1:" + app.server.address().port;
const post = (route, input, auth = true) =>
  fetch(base + route, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(auth ? { "x-star-cast-dev-token": "test-token" } : {}),
    },
    body: JSON.stringify(input),
  });
try {
  for (const path of [
    "/continue",
    "/.env",
    "/.git/config",
    "/native/.env",
    "/.starcast/development.sqlite",
  ])
    assert.equal((await fetch(base + path)).status, 404);
  const input = { feedUrl, episodeId, capability: "brief" };
  assert.equal(
    (await post("/api/intelligence/request", input, false)).status,
    403,
  );
  assert.equal(calls, 0);
  const responses = await Promise.all(
    Array.from({ length: 10 }, () => post("/api/intelligence/request", input)),
  );
  assert.ok(responses.every((r) => [200, 202].includes(r.status)));
  await Promise.all(app.pipeline.inflight.values());
  assert.equal(calls, 1, "concurrent requests share one provider call");
  assert.equal(app.pipeline.status(feedUrl, episodeId).state, "READY");
  assert.equal(
    (await (await post("/api/intelligence/request", input)).json()).status
      .cacheHit,
    true,
  );
  assert.equal(calls, 1);
  const page = await post("/api/intelligence/transcript", {
    feedUrl,
    episodeId,
  });
  assert.equal(page.status, 200);
  assert.equal((await page.json()).segments[0].id, "s1");
  assert.equal(
    (await post("/api/intelligence/transcript", { feedUrl, episodeId }, false))
      .status,
    403,
  );
  assert.ok(
    app.pipeline.moments(feedUrl, episodeId, "compute")[0].startMs >= 0,
  );
  assert.equal(
    app.pipeline.search("compute", { feedUrls: [] }).coverage.processedEpisodes,
    0,
  );
  assert.equal(app.pipeline.search("compute").matches.length, 2);
  await post("/api/intelligence/request", { ...input, episodeId: "long" });
  await Promise.all(app.pipeline.inflight.values());
  assert.equal(app.pipeline.status(feedUrl, "long").code, "DURATION_LIMIT");
  assert.equal(calls, 1);
  await new Promise((r) => app.server.close(r));
  app.store.close();
  app = make();
  assert.equal(app.pipeline.status(feedUrl, episodeId).state, "READY");
  assert.equal(app.ledger.usage.length, 1);
  assert.equal((await app.pipeline.request(input)).cacheHit, true);

  const ledgerA = new BudgetLedger(
      { ...defaultControls, enabled: true },
      app.store,
    ),
    otherStore = new LocalStore(path),
    ledgerB = new BudgetLedger(
      { ...defaultControls, enabled: true },
      otherStore,
    );
  ledgerA.reserve({
    id: "audio-a",
    usd: 0.72,
    kind: "transcription",
    seconds: 7200,
  });
  assert.throws(
    () =>
      ledgerB.reserve({
        id: "audio-b",
        usd: 0.72,
        kind: "transcription",
        seconds: 7200,
      }),
    /duration/,
  );
  assert.throws(
    () => ledgerA.reserve({ id: "audio-a", usd: 0.1 }),
    /Duplicate/,
  );
  assert.throws(() => ledgerA.reserve({ id: "negative", usd: -1 }), /Invalid/);
  otherStore.close();
  const parsed = parseJsonTranscript({
    segments: [
      { startMs: 1000, endMs: 2000, text: "Milliseconds stay milliseconds." },
    ],
  });
  assert.equal(parsed[0].startMs, 1000);
  assert.equal(
    validateChapters(
      [{ startMs: 1, endMs: 120_000, sourceSegmentIds: ["s1"] }],
      transcript,
    ).length,
    0,
  );
  for (const url of [
    "https://172.16.0.1/a",
    "https://[::1]/a",
    "https://127.0.0.1/a",
    "https://100.64.0.1/a",
    "https://user:pass@example.com/a",
  ])
    assert.equal(publicUrl(url), null);

  const audioLedger = new BudgetLedger({ ...defaultControls, enabled: true });
  let audioCalls = 0;
  const audioClient = {
    audio: {
      transcriptions: {
        create: async (request) => {
          assert.equal(request.model, "whisper-1");
          assert.equal(request.response_format, "verbose_json");
          audioCalls++;
          return { segments: [{ start: 0, end: 60, text: segments[0].text }] };
        },
      },
    },
  };
  const audio = await transcribeOnDemand({
    episodeId,
    audioUrl: "https://publisher.example/audio.mp3",
    durationMs: 60_000,
    chunkFactory: async () => new Blob(["audio"]),
    client: audioClient,
    ledger: audioLedger,
    requestId: "audio",
    authorised: true,
  });
  assert.equal(audioCalls, 1);
  assert.equal(audio.segments[0].endMs, 60_000);
  assert.equal(audioLedger.usage[0].usd, 0.006);
  console.log(
    "pipeline, HTTP security, restart, concurrent budget, timestamp and mocked transcription checks passed",
  );
} finally {
  if (app.server.listening) await new Promise((r) => app.server.close(r));
  app.store.close();
  await rm(directory, { recursive: true, force: true });
}
