import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import {
  createDiagnosticCapture,
  safeSleepDiagnostics,
} from "./native/src/nativeDiagnostics.mjs";
import {
  positionSnapshot,
  recoveredSleepPosition,
} from "./native/src/playbackRecovery.mjs";
const source = {
  feedUrl: "https://fixture.invalid/feed",
  episodeId: "a",
  url: "https://fixture.invalid/audio",
};
const sleep = {
  state: "PAUSED",
  sourceKey: JSON.stringify([source.feedUrl, source.episodeId, source.url]),
  positionMs: 5000,
  completedAt: 200,
};
assert.equal(
  recoveredSleepPosition(positionSnapshot(source, 1000, 1, 100), sleep),
  5000,
);
// A later seek must survive restart; the previous untimestamped write reverted it.
assert.equal(
  recoveredSleepPosition(positionSnapshot(source, 9000, 1.5, 300), sleep),
  9000,
);
assert.equal(
  recoveredSleepPosition(positionSnapshot(source, 9000, 1.5, 300), {
    ...sleep,
    completedAt: 400,
    sourceKey: "other",
  }),
  9000,
);
for (const state of ["CANCELLED", "INTERRUPTED", "ARMED"])
  assert.equal(
    recoveredSleepPosition(positionSnapshot(source, 9000, 1, 100), {
      ...sleep,
      state,
    }),
    9000,
  );
assert.equal(
  recoveredSleepPosition(positionSnapshot(source, 9000, 1, 100), {
    ...sleep,
    positionMs: NaN,
  }),
  9000,
);
let now = 100;
const capture = createDiagnosticCapture({ now: () => ++now });
capture.record("play_requested");
assert.equal(capture.snapshot().events.length, 0);
capture.start();
capture.record("play_requested", {
  url: "secret",
  title: "private",
  token: "credential",
  positionMs: 10,
  elapsedMs: Infinity,
});
assert.deepEqual(capture.snapshot().events.at(-1), {
  at: 104,
  event: "play_requested",
  positionMs: 10,
});
capture.record("untrusted", { positionMs: 3 });
assert.equal(capture.snapshot().events.length, 2);
for (let i = 0; i < 250; i++)
  capture.record("automatic_seek_confirmed", { positionMs: i });
assert.equal(capture.snapshot().events.length, 200);
const copy = capture.snapshot();
copy.events[0].positionMs = -1;
assert.notEqual(capture.snapshot().events[0].positionMs, -1);
assert.equal(copy.audiblePlayback, "NOT_MEASURED");
capture.clear();
assert.equal(capture.enabled(), false);
assert.equal(capture.snapshot().events.length, 0);
assert.deepEqual(
  safeSleepDiagnostics({
    ...sleep,
    sourceJSON: "secret",
    id: "private",
    reason: "sensitive",
    kind: "ai",
    deadlineAt: Infinity,
    deadlineDriftMs: 12,
    pauseConfirmedAt: 200,
  }),
  {
    positionMs: 5000,
    completedAt: 200,
    pauseConfirmedAt: 200,
    deadlineDriftMs: 12,
    state: "PAUSED",
    kind: "ai",
  },
);
// Exercise the actual bridge's backward-compatible metadata method, without Expo.
const ts = readFileSync("native/src/nativeSleep.ts", "utf8").replace(
  /import \{ requireOptionalNativeModule \} from [^;]+;/,
  "const requireOptionalNativeModule=()=>globalThis.__phase3Native;",
);
async function bridge(mock, id) {
  globalThis.__phase3Native = mock;
  return import(
    "data:text/javascript;base64," +
      Buffer.from(stripTypeScriptTypes(ts) + "\n//" + id).toString("base64")
  );
}
assert.deepEqual(await (await bridge(null, 1)).readNativeBuildMetadata(), {
  nativeBuild: "UNAVAILABLE",
  appVersion: "UNAVAILABLE",
});
assert.deepEqual(
  await (
    await bridge(
      {
        buildMetadata: async () =>
          JSON.stringify({ nativeBuild: "14", appVersion: "1.0.0" }),
      },
      2,
    )
  ).readNativeBuildMetadata(),
  { nativeBuild: "14", appVersion: "1.0.0" },
);
assert.deepEqual(
  await (
    await bridge(
      {
        buildMetadata: async () =>
          JSON.stringify({ nativeBuild: "secret", appVersion: "url" }),
      },
      3,
    )
  ).readNativeBuildMetadata(),
  { nativeBuild: "UNAVAILABLE", appVersion: "UNAVAILABLE" },
);
delete globalThis.__phase3Native;
console.log(
  "Phase 3: restart chronology, source isolation, privacy allowlists, bounded opt-in capture and native build metadata passed.",
);

let changes = 0;
const shared = createDiagnosticCapture();
const unsubscribe = shared.subscribe(() => changes++);
shared.start();
shared.record("play_requested");
shared.clear();
assert.equal(changes, 2);
unsubscribe();
shared.start();
assert.equal(changes, 2);
