import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { durationMs } from "../../episode-pipeline.mjs";

const { url, token } = JSON.parse(readFileSync(".starcast/cloud-connection.json", "utf8"));
const { token: adminToken } = JSON.parse(readFileSync(".starcast/cloud-admin.json", "utf8"));
assert.match(url, /^https:\/\/[a-z0-9]+\.cloudfront\.net$/);
assert.equal(typeof adminToken, "string");
assert.ok(adminToken.length >= 32, "A local owner-only administrator credential is required.");
const paid = process.argv.includes("--paid");
const headers = { "content-type": "application/json", "x-star-cast-dev-token": token };
async function request(path, data) {
  const response = await fetch(url + path, {
    headers: {
      ...headers,
      ...(path.startsWith("/api/admin/")
        ? { "x-star-cast-admin-token": adminToken }
        : {}),
    },
    ...(data ? { method: "POST", body: JSON.stringify(data) } : {}),
    signal: AbortSignal.timeout(25000),
  });
  assert.ok(response.ok, `${path}: HTTP ${response.status}`);
  return response.json();
}
const before = await request("/api/admin/intelligence");
for (const [name, value] of Object.entries({dailyUsd:5,monthlyUsd:25,dailyTranscriptionSeconds:10800,maxEpisodeSeconds:14400}))
  assert.equal(before.controls[name], value);
assert.equal(before.reservations.length, 0);
assert.equal((await fetch(url + "/api/catalogue/search?q=Python")).status, 403);
assert.equal((await fetch(url + "/api/admin/intelligence")).status, 403);
const catalogue = await request("/api/catalogue/search?q=Python%20Bytes");
assert.ok(catalogue.results.some(s => s.name.includes("Python Bytes")));
let feedUrl = url + "/fixtures/approved-test-feed.xml";
const statusOf = async (targetFeedUrl, id) => (await request("/api/intelligence/status?feedUrl=" + encodeURIComponent(targetFeedUrl) + "&episodeId=" + encodeURIComponent(id))).status;
let episode = { id: "starcast-approved-test-episode-v1", title: "Star Cast approved test episode", duration: "12:00" };
assert.equal((await statusOf(feedUrl, episode.id)).state, "READY", "The authorised transcript fixture is listener-ready");
if (paid) {
  assert.equal(before.controls.enabled, true);
  assert.equal(before.controls.audioAnalysisEnabled, true);
  assert.ok(before.totals.day < 4.5 && before.totals.month < 24.5, "Budget headroom required");
  // Exactly one new publisher-transcript episode. Never consent to paid audio here.
  feedUrl = "https://pythonbytes.fm/episodes/rss";
  const feed = (await request("/api/catalogue/feed?url=" + encodeURIComponent(feedUrl))).feed;
  episode = null;
  for (const candidate of feed.episodes.filter(e => e.hasPublisherTranscript && durationMs(e.duration) >= 600000 && durationMs(e.duration) <= 1800000).slice(0, 12)) {
    if ((await statusOf(feedUrl, candidate.id)).state === "NOT_REQUESTED") { episode = candidate; break; }
  }
  assert.ok(episode, "No unprocessed 10–30 minute publisher-transcript episode available");
  const preflight = await request("/api/intelligence/preflight", { feedUrl, episodeId: episode.id });
  assert.ok(preflight.withinLimit && preflight.analysisEnabled && preflight.hasPublisherTranscript);
  console.log({ liveEpisode: episode.title, durationMs: preflight.durationMs, audioConsent: false, processing: "starting" });
  await request("/api/intelligence/request", { feedUrl, episodeId: episode.id, capability: "brief", allowAudio: false });
}
let status = await statusOf(feedUrl, episode.id);
const started = Date.now();
while (status.processing || status.state === "QUEUED") {
  assert.ok(Date.now() - started < 180000, "Poll deadline reached: inspect existing job, do not retry automatically");
  await new Promise(r => setTimeout(r, 2500));
  status = await statusOf(feedUrl, episode.id);
}
assert.equal(status.state, "READY", JSON.stringify({state:status.state,code:status.code,reason:status.reason}));
assert.equal(status.provenance.sourceType, "publisher_rss");
assert.ok(status.brief.overview && status.chapters.length);
assert.ok(status.chapters.every(c => c.sourceSegmentIds.length && c.startMs >= 0 && c.endMs > c.startMs && c.endMs <= durationMs(episode.duration) + 1000));
const query = paid ? status.brief.themes[0] : "rights review";
const moments = await request("/api/intelligence/moment", { feedUrl, episodeId: episode.id, query });
assert.ok(moments.moments.length, "Grounded moment retrieval returned evidence");
const search = await request("/api/search/conversations", {query, feedUrls:[feedUrl]});
assert.ok(search.matches.some(m => m.episode.id === episode.id));
if (paid) {
  const cached = await request("/api/intelligence/request", {feedUrl,episodeId:episode.id,capability:"chapters",allowAudio:false});
  assert.equal(cached.status.cacheHit, true);
}
const after = await request("/api/admin/intelligence");
const usage = after.usage.slice(before.usage.length);
assert.equal(after.reservations.length, 0);
assert.ok(usage.every(x => x.kind === "text" && !x.failed && !x.uncertain));
assert.equal(usage.length, paid ? 1 : 0);
const report = { at:new Date().toISOString(),api:url,paidVerification:paid,episode:{id:episode.id,title:episode.title,duration:episode.duration},state:status.state,overview:status.brief.overview,chapters:status.chapters.length,provenance:status.provenance,moment: moments.moments[0],coverage:search.coverage,usage,totals:after.totals,physicalIPhoneVerified:false };
writeFileSync(paid ? ".starcast/aws-live-verification.json" : ".starcast/aws-cache-verification.json", JSON.stringify(report, null, 2), {mode:0o600});
console.log(JSON.stringify(report, null, 2));
