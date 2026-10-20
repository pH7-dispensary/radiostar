import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { LocalStore } from "./persistence.mjs";
import { BudgetLedger, generateLongFormIntelligence } from "./openai-intelligence.mjs";
import { testingLimits } from "./intelligence-test-mode.mjs";
import { transcribeOnDemand } from "./transcription.mjs";
const [stage, path, stop] = process.argv.slice(2);
if (stage) {
  const store = new LocalStore(path), ledger = new BudgetLedger({ enabled: true }, store, () => testingLimits);
  const count = () => { const n = store.get("test-provider-calls", stage) || 0; store.set("test-provider-calls", stage, n + 1); };
  const text = "Original fixture speech explaining grounded intelligence, careful accounting and reliable source references for podcast listeners. ";
  if (stage === "audio") await transcribeOnDemand({ episodeId: "restart", audioUrl: "https://owned.example/source.mp3", durationMs: 14400000, ledger, requestId: "audio", authorised: true, checkpointStore: store, checkpointPrefix: "episode:verified-audio-hash", chunkFactory: async () => Buffer.from("mock"), client: { audio: { transcriptions: { create: async () => { count(); return { segments: [{ start: 0, end: 10, text }] }; } } } }, onProgress: ({ completedChunks }) => { if (stop && completedChunks === 2) process.kill(process.pid, "SIGTERM"); } });
  else {
    const transcript = { episodeId: "restart", transcriptVersion: "restart-v1", durationMs: 14400000, segments: Array.from({ length: 600 }, (_, i) => ({ id: `s${i}`, startMs: i * 24000, endMs: (i + 1) * 24000, text: text.repeat(10) })) };
    await generateLongFormIntelligence({ transcript, ledger, requestId: "text", checkpointStore: store, checkpointPrefix: "episode", client: { responses: { create: async ({ input }) => { count(); const n = input[1].content.split("\n").filter((line) => /^source \d+/.test(line)).length; return { status: "completed", output_text: JSON.stringify({ overview: "Reliable podcast evidence is discussed.", detail: "The speakers discuss grounded intelligence and accounting.", themes: ["Evidence"], sourceSegmentIndexes: [1], chapters: [{ title: "Evidence", description: "Careful source attribution", sourceSegmentIndexes: [1, n] }] }), usage: { input_tokens: 100, output_tokens: 100 } }; } } }, onProgress: ({ completedBatches }) => { if (stop && completedBatches === 2) process.kill(process.pid, "SIGTERM"); } });
  }
  store.close();
} else {
  const directory = await mkdtemp(join(tmpdir(), "starcast-process-restart-")), path = join(directory, "state.sqlite");
  try {
    for (const stage of ["audio", "text"]) {
      const killed = spawnSync(process.execPath, [fileURLToPath(import.meta.url), stage, path, "stop"], { encoding: "utf8" });
      assert.equal(killed.signal, "SIGTERM", killed.stderr);
      let store = new LocalStore(path); assert.equal(store.get("test-provider-calls", stage), 2); store.close();
      const resumed = spawnSync(process.execPath, [fileURLToPath(import.meta.url), stage, path], { encoding: "utf8" });
      assert.equal(resumed.status, 0, resumed.stderr);
      store = new LocalStore(path);
      const checkpoints = store.all(stage === "audio" ? "transcription-checkpoint" : "analysis-checkpoint");
      assert.equal(store.get("test-provider-calls", stage), checkpoints.length, "completed paid stages were not replayed after a killed process");
      assert.equal(store.get("budget", "ledger").reservations.length, 0);
      store.close();
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
  console.log("SIGTERM and fresh-process recovery passed for four-hour transcription and hierarchical analysis; no duplicate paid mock calls.");
}
