import assert from "node:assert/strict";
import { createStarCastServer } from "./server.mjs";
import { LocalStore } from "./persistence.mjs";
import { PROCESSING_VERSION } from "./openai-intelligence.mjs";
import { episodeKey } from "./episode-pipeline.mjs";

const feedUrl = "https://publisher.example/feed.xml";
const episodeId = "rights-caption-episode";
const app = createStarCastServer({
  store: new LocalStore(":memory:"),
  env: {
    STARCAST_DEV_INTELLIGENCE_TOKEN: "device-test-token",
    STARCAST_ADMIN_TOKEN: "admin-test-token",
  },
});
app.store.set("intelligence", episodeKey(feedUrl, episodeId), {
  state: "READY",
  processingVersion: PROCESSING_VERSION,
  completedAt: new Date().toISOString(),
  episode: { feedUrl, id: episodeId, showName: "Rights show" },
  transcript: {
    segments: [
      { id: "one", startMs: 0, endMs: 12_000, text: "A short authorised caption." },
      { id: "two", startMs: 12_000, endMs: 28_000, speaker: "Guest", text: "A second short authorised caption." },
      { id: "three", startMs: 28_000, endMs: 55_000, text: "This should not be returned in the first window." },
    ],
  },
});
await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;
const device = { "content-type": "application/json", "x-star-cast-dev-token": "device-test-token" };
const post = (path, payload, headers = device) =>
  fetch(base + path, { method: "POST", headers, body: JSON.stringify(payload) });
try {
  const credential = "a".repeat(64);
  assert.equal((await post("/api/listener/register", { credential })).status, 200);
  const listenerHeaders = { ...device, authorization: `Bearer ${credential}` };
  assert.equal(
    (await post("/api/listener/heartbeat", {
      eventId: "caption-heartbeat-1",
      sessionId: "caption-session-1",
      feedUrl,
      episodeId,
      positionMs: 10_000,
      playing: true,
      speed: 1,
    }, listenerHeaders)).status,
    200,
  );
  const denied = await post("/api/captions/window", { feedUrl, episodeId, positionMs: 10_000 }, listenerHeaders);
  assert.equal(denied.status, 200);
  assert.equal((await denied.json()).available, false, "unassessed content cannot expose captions");
  const adminHeaders = { ...device, "x-star-cast-admin-token": "admin-test-token" };
  const rights = await post("/api/admin/rights", {
    feedUrl,
    episodeId,
    classification: "LICENSED",
    canAcquireTranscript: true,
    canProcessForAi: true,
    canTranscribeAudio: false,
    canDisplayCaptions: true,
    canDisplayDerivedIntelligence: true,
    canRetain: true,
    canRegenerate: true,
  }, adminHeaders);
  assert.equal(rights.status, 200);
  const report = await post("/api/reports", {
    eventId: "caption-report-1",
    category: "caption",
    feedUrl,
    episodeId,
    positionMs: 10_000,
    note: "Caption timing looked wrong.",
  }, listenerHeaders);
  assert.equal(report.status, 200);
  const reports = await fetch(base + "/api/admin/reports", { headers: adminHeaders });
  assert.equal(reports.status, 200);
  assert.equal((await reports.json()).reports.length, 1, "administrators can review bounded listener reports");
  const window = await post("/api/captions/window", { feedUrl, episodeId, positionMs: 10_000 }, listenerHeaders);
  assert.equal(window.status, 200);
  const caption = await window.json();
  assert.equal(caption.available, true);
  assert.equal(caption.segments.length, 3, "caption delivery only includes the short active window");
  assert.equal(caption.windowEndMs - caption.windowStartMs, 24_000, "caption duration is bounded");
  assert.equal((await post("/api/captions/window", { feedUrl, episodeId, positionMs: 400_000 }, listenerHeaders)).status, 403, "position validation prevents arbitrary extraction");
  const removed = await post("/api/admin/transcripts/delete", { feedUrl, episodeId, reason: "Rights-holder request" }, adminHeaders);
  assert.equal(removed.status, 200);
  assert.equal(app.pipeline.status(feedUrl, episodeId), null, "takedown purges intelligence cache");
  assert.equal((await post("/api/captions/window", { feedUrl, episodeId, positionMs: 10_000 }, listenerHeaders)).status, 200);
  assert.equal((await (await post("/api/captions/window", { feedUrl, episodeId, positionMs: 10_000 }, listenerHeaders)).json()).available, false);
  assert.equal((await post("/api/admin/rights", { feedUrl }, device)).status, 403, "administrator operations require a separate credential");
} finally {
  await new Promise((resolve) => app.server.close(resolve));
  app.store.close();
}
console.log("Rights registry, bounded authorised captions, and takedown purge checks passed");
