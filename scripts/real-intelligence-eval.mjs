import assert from "node:assert/strict";
import { loadCredentials } from "../config.mjs";

if (process.env.STARCAST_REAL_INTELLIGENCE_EVAL !== "1")
  throw Error(
    "Set STARCAST_REAL_INTELLIGENCE_EVAL=1 for the authorised single-episode paid verification.",
  );
loadCredentials();
const base = process.env.STARCAST_EVAL_BASE_URL || "http://127.0.0.1:4173";
const headers = {
  "content-type": "application/json",
  "x-star-cast-dev-token": process.env.STARCAST_DEV_INTELLIGENCE_TOKEN,
};
const feedUrl = "https://pythonbytes.fm/episodes/rss",
  episodeId = "af55f8d3-e804-4da9-aa70-575ebb410459";
async function get(path) {
  const r = await fetch(base + path, { headers });
  assert.ok(r.ok, "HTTP " + r.status);
  return r.json();
}
async function post(path, data) {
  const r = await fetch(base + path, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  assert.ok(r.ok, "HTTP " + r.status);
  return r.json();
}
const before = await get("/api/admin/intelligence");
assert.equal(before.controls.dailyUsd, 5);
assert.equal(before.controls.monthlyUsd, 25);
assert.equal(before.controls.dailyTranscriptionSeconds, 10800);
assert.equal(before.controls.maxEpisodeSeconds, 7200);
assert.equal(before.controls.enabled, true);
const catalogue = await get("/api/catalogue/search?q=Python%20Bytes");
assert.ok(catalogue.results.some((s) => s.name.includes("Python Bytes")));
const feed = await get(
  "/api/catalogue/feed?url=" + encodeURIComponent(feedUrl),
);
const episode = feed.feed.episodes.find((e) => e.id === episodeId);
assert.ok(episode);
assert.ok(episode.hasPublisherTranscript);
const preflight = await post("/api/intelligence/preflight", {
  feedUrl,
  episodeId,
});
assert.ok(
  preflight.withinLimit &&
    preflight.analysisEnabled &&
    preflight.hasPublisherTranscript,
);
assert.ok(preflight.durationMs >= 600000 && preflight.durationMs <= 1800000);
const started = Date.now(),
  first = await post("/api/intelligence/request", {
    feedUrl,
    episodeId,
    capability: "brief",
    allowAudio: false,
  });
let status = first.status;
while (
  status.processing !== false &&
  [
    "QUEUED",
    "PROCESSING",
    "PARTIAL_READY",
    "DISCOVERING",
    "TRANSCRIBING",
    "UNDERSTANDING",
    "ORGANISING",
  ].includes(status.state)
) {
  if (Date.now() - started > 180000)
    throw Error(
      "Evaluation timed out; inspect the existing job instead of restarting it.",
    );
  await new Promise((r) => setTimeout(r, 1500));
  status = (
    await get(
      "/api/intelligence/status?feedUrl=" +
        encodeURIComponent(feedUrl) +
        "&episodeId=" +
        encodeURIComponent(episodeId),
    )
  ).status;
}
assert.equal(status.state, "READY", JSON.stringify(status));
assert.ok(status.brief.overview);
assert.ok(status.chapters.length);
assert.equal(status.provenance.sourceType, "publisher_rss");
const moment = await post("/api/intelligence/moment", {
  feedUrl,
  episodeId,
  query: "profiling Python",
});
assert.ok(moment.moments.length);
assert.ok(
  moment.moments.every(
    (m) => m.startMs >= 0 && m.endMs <= preflight.durationMs + 1000,
  ),
);
const search = await post("/api/search/conversations", {
  query: "profiling Python",
});
assert.ok(search.matches.some((m) => m.episode.id === episodeId));
const second = await post("/api/intelligence/request", {
  feedUrl,
  episodeId,
  capability: "chapters",
});
assert.equal(second.status.cacheHit, true);
const after = await get("/api/admin/intelligence"),
  usage = after.usage.slice(before.usage.length);
console.log(
  JSON.stringify(
    {
      episode: {
        id: episodeId,
        title: episode.title,
        feedUrl,
        durationMs: preflight.durationMs,
      },
      state: status.state,
      provenance: status.provenance,
      brief: status.brief,
      chapters: status.chapters,
      moment: moment.moments[0],
      coverage: search.coverage,
      cache: {
        first: first.status.cacheHit,
        second: second.status.cacheHit,
        newProviderCalls: usage.length,
      },
      usage,
      processingMs: Date.now() - started,
      physicalDeviceVerified: false,
    },
    null,
    2,
  ),
);
