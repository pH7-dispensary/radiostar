import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { LocalStore } from "./persistence.mjs";
import { createStarCastServer } from "./server.mjs";
import { IntelligenceTestMode } from "./intelligence-test-mode.mjs";

const store = new LocalStore(":memory:");
const listenerId = "existing-internal", token = "existing-pilot-credential-at-least-32-characters";
store.set("installation", "existing", { id: listenerId });
store.set("pilot-device", createHash("sha256").update(token).digest("hex"), { listenerId, expiresAt: new Date(Date.now() + 10 * 86400000).toISOString() });
const mode = new IntelligenceTestMode(store);
mode.set({ enabled: true, expectedVersion: 0, listenerIds: [listenerId], confirmation: "ENABLE TESTING", reason: "Automated authorised integration test" }, "fixture-super-admin");
let audioCalls = 0, textCalls = 0;
const feedUrl = "https://owned.example/feed.xml", text = "The original owned test conversation discusses reliable source evidence, careful cost accounting, and truthful podcast intelligence with validated timestamps.";
const app = createStarCastServer({ store, env: { STARCAST_PAID_INTELLIGENCE: "enabled", STARCAST_AUDIO_TRANSCRIPTION: "enabled", OPENAI_API_KEY: "mock-only", STARCAST_DEV_INTELLIGENCE_TOKEN: "ordinary-device", STARCAST_ADMIN_TOKEN: "test-admin" },
  resolveEpisode: async (_feed, id) => ({ id, title: "Original owned audio", showName: "Owned test", duration: "01:00", audioUrl: `https://owned.example/${id}.mp3`, refs: [] }),
  audioFactory: async () => ({ durationMs: 60_000, contentHash: "exact-fixture-bytes", chunkFactory: async () => Buffer.from("mock audio"), cleanup: async () => {} }),
  client: { audio: { transcriptions: { create: async () => { audioCalls++; return { segments: [{ start: 0, end: 60, text }] }; } } }, responses: { create: async () => { textCalls++; return { status: "completed", output_text: JSON.stringify({ overview: text, detail: text, themes: ["Evidence"], sourceSegmentIndexes: [1], chapters: [{ title: "Evidence", description: text, sourceSegmentIndexes: [1] }] }), usage: { input_tokens: 100, output_tokens: 100 } }; } } },
});
app.rights.set({ feedUrl, classification: "LICENSED", legalBasis: "Original software test fixture", assessmentEvidence: [{ type: "OWNED", source: "Fixture author", value: "fixture:original-audio-v1", scope: "podcast" }], canAcquireTranscript: true, canProcessForAi: true, canTranscribeAudio: true, canDisplayDerivedIntelligence: true, canGenerateBrief: true, canGenerateChapters: true, canGenerateTopics: true, canSearchMoments: true, canSearchConversations: true, canRetain: true });
app.rights.set({ feedUrl, episodeId: "restricted", classification: "DISPUTED", rightsReserved: true });
await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const status = async (id, headers) => (await (await fetch(`${origin}/api/intelligence/status?${new URLSearchParams({ feedUrl, episodeId: id })}`, { headers })).json()).status;
try {
  await status("ordinary", { "x-star-cast-dev-token": "ordinary-device" });
  assert.equal(audioCalls, 0);
  const first = await status("eligible", { "x-star-cast-pilot-token": token });
  assert(["QUEUED", "ACQUIRING_TRANSCRIPT", "TRANSCRIBING", "ANALYSING", "READY"].includes(first.state), JSON.stringify(first));
  await Promise.all(app.pipeline.inflight.values());
  const ready = await status("eligible", { "x-star-cast-pilot-token": token });
  assert.equal(ready.state, "READY"); assert(ready.brief); assert(ready.chapters.length);
  assert.equal(audioCalls, 1); assert.equal(textCalls, 1);
  assert.equal(ready.testingContext, undefined);
  await status("restricted", { "x-star-cast-pilot-token": token });
  assert.equal(audioCalls, 1); assert.equal(store.all("intelligence-attention").length, 1);
  const forged = await fetch(origin + "/api/intelligence/request", { method: "POST", headers: { "x-star-cast-dev-token": "ordinary-device", "content-type": "application/json" }, body: JSON.stringify({ feedUrl, episodeId: "forged", capability: "brief", trigger: "automatic", testingContext: { listenerId, version: 1 }, allowAudio: true }) });
  assert.equal(forged.status, 202);
  await Promise.all(app.pipeline.inflight.values()); assert.equal(audioCalls, 1, "ordinary client cannot forge accelerated authority");
  assert.equal(app.pipeline.status(feedUrl, "forged").code, "AUDIO_CONSENT_REQUIRED");
  app.pipeline.purgeEpisode(feedUrl, "eligible");
  assert.equal(store.all("transcription-checkpoint").length, 0);
  assert.equal(store.all("analysis-checkpoint").length, 0);
} finally { await new Promise((resolve) => app.server.close(resolve)); store.close(); }
console.log("Existing enrolled tester automatically reaches READY; ordinary devices, forged context, disputed content and checkpoint deletion remain protected.");
