import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { stripTypeScriptTypes } from "node:module";
import {
  catalogueCategories,
  recentFollowedEpisodes,
  rememberSearch,
} from "./native/src/discoverData.mjs";

// Exercise the actual TypeScript bridge with an isolated storage adapter.
const documents = new Map();
globalThis.__sleepFixtureStorage = {
  readLocalDocument: async (key) => documents.get(key) || null,
  writeLocalDocument: async (key, value) => {
    documents.set(key, value);
  },
};
const source = readFileSync("native/src/sleepBridge.ts", "utf8")
  .replace(
    '"../../sleep.mjs"',
    JSON.stringify(pathToFileURL(process.cwd() + "/sleep.mjs").href),
  )
  .replace(
    'import { readLocalDocument, writeLocalDocument } from "./localStorage";',
    "const { readLocalDocument, writeLocalDocument } = globalThis.__sleepFixtureStorage;",
  );
const js = stripTypeScriptTypes(source, { mode: "transform" });
const { NativeSleepTimer, NativeAiSleepBridge } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
let pauses = 0;
const timer = new NativeSleepTimer(async () => {
  pauses++;
});
for (const minutes of [5, 10, 15, 20, 30, 45, 60, 90]) {
  const start = Date.now();
  timer.start({ kind: "minutes", minutes });
  assert.ok(Math.abs(timer.endAt - start - minutes * 60000) < 100);
  await timer.check(timer.endAt - 1);
  assert.equal(pauses, 0);
  timer.cancel();
}
timer.start({ kind: "minutes", minutes: 5 });
const deadline = timer.endAt;
timer.onEpisodeEnd();
assert.equal(
  timer.endAt,
  deadline,
  "ordinary episode completion must not cancel a fixed timer",
);
await Promise.all([
  timer.check(deadline + 60000),
  timer.check(deadline + 60000),
]);
assert.equal(pauses, 1, "delayed foreground check pauses exactly once");
timer.start({ kind: "end_of_episode" });
timer.cancel();
timer.onEpisodeEnd();
assert.equal(pauses, 1);
assert.throws(() => timer.start({ kind: "minutes", minutes: -1 }), /supported/);
const ready = async (bridge) => {
  for (let i = 0; i < 20 && !bridge.ready; i++)
    await new Promise((resolve) => setImmediate(resolve));
  assert.ok(bridge.ready);
};
let now = Date.UTC(2026, 9, 20, 22),
  fades = 0;
const ai = new NativeAiSleepBridge(
  async () => {
    fades++;
    return 600000;
  },
  () => now,
);
await ready(ai);
ai.start(10000, "owned-source");
assert.equal(ai.session.earliestPauseAt, now + 20 * 60000);
ai.extend(15);
assert.equal(ai.session.earliestPauseAt, now + 35 * 60000);
assert.equal(await ai.tick(20000, true), "OBSERVING");
assert.equal(fades, 0, "minimum protection never triggers a fade");
const interrupted = new NativeAiSleepBridge(async () => {
  throw Error("must not resume");
});
await ready(interrupted);
assert.equal(interrupted.interrupted, true);
assert.equal(interrupted.session, null);
ai.stop();
assert.equal(ai.session, null);
// Accelerated algorithm clock, not a UI-only simulated pause.
ai.engine.settings = {
  ...ai.engine.settings,
  minimumObservationMs: 0,
  defaultSleepOnsetMs: 0,
  confidenceThreshold: 0,
  confirmationMs: 0,
  graceMs: 0,
};
ai.engine.history = [];
ai.start(0, "owned-source");
for (let i = 0; i < 8 && ai.engine.state !== "PAUSED"; i++) {
  now += 60000;
  await ai.tick(600000, true);
}
assert.equal(ai.engine.state, "PAUSED");
assert.equal(fades, 1);
const restored = new NativeAiSleepBridge(async () => 0);
await ready(restored);
assert.deepEqual(restored.recovered, {
  sourceKey: "owned-source",
  lastHeard: 300000,
  pausedAt: 600000,
});
assert.equal(
  restored.session,
  null,
  "recovery never resurrects background inference",
);
restored.feedback("early");
assert.equal(
  restored.engine.history.at(-1).kind,
  "early",
  "morning feedback survives app restart",
);
let finish;
const interruptedFade = new NativeAiSleepBridge(
  () =>
    new Promise((resolve) => {
      finish = resolve;
    }),
  () => now,
);
await ready(interruptedFade);
interruptedFade.engine.settings = { ...ai.engine.settings };
interruptedFade.engine.history = [];
interruptedFade.start(0, "another-source");
const ticks = [];
for (let i = 0; i < 8 && !finish; i++) {
  now += 60000;
  ticks.push(interruptedFade.tick(600000, true));
  await Promise.resolve();
}
assert.ok(finish);
interruptedFade.stop();
finish(600000);
await Promise.all(ticks);
assert.equal(
  interruptedFade.engine.state,
  "OFF",
  "late fade completion cannot resurrect a cancelled session",
);
assert.equal(interruptedFade.recovered, null);
const shows = [
  { id: "a", name: "A", feedUrl: "https://a.example/rss", topic: "Science" },
  { id: "b", name: "B", feedUrl: "https://b.example/rss", topic: "Science" },
];
const episodes = recentFollowedEpisodes(
  {
    following: shows,
    feedEpisodes: {
      a: [
        {
          id: "same",
          title: "First",
          audioUrl: "a",
          publishedAt: "2026-10-19",
        },
        { id: "same", audioUrl: "a", publishedAt: "2026-10-19" },
        { id: "invalid", audioUrl: "a", publishedAt: "bad" },
      ],
      b: [
        {
          id: "same",
          title: "Other feed",
          audioUrl: "b",
          publishedAt: "2026-10-20",
        },
        { id: "future", audioUrl: "b", publishedAt: "2100-01-01" },
      ],
    },
  },
  now,
);
assert.equal(episodes.length, 2);
assert.equal(episodes[0].showName, "B");
assert.deepEqual(catalogueCategories(shows), ["Science"]);
assert.deepEqual(rememberSearch(["Science", "books"], "science", true), [
  "science",
  "books",
]);
assert.deepEqual(rememberSearch(["private"], "new", false), []);
assert.equal(
  rememberSearch(["a", "b", "c", "d", "e", "f"], "latest", true).length,
  6,
);
delete globalThis.__sleepFixtureStorage;
console.log(
  "Native sleep timer accuracy/cancellation, session recovery, late fade safety and truthful Discover data passed.",
);
