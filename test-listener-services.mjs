import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStore } from "./persistence.mjs";
import { ListenerService, unionDuration } from "./listener-service.mjs";
import { createStarCastServer } from "./server.mjs";
import { SkipService } from "./skip-service.mjs";
import {
  intervalDecision,
  syntheticSkipFixtures as f,
  defaults,
} from "./ad-skip.mjs";
import { evaluateSkipCases } from "./skip-evaluation.mjs";
import { episodeKey } from "./episode-pipeline.mjs";
import { PROCESSING_VERSION } from "./openai-intelligence.mjs";

const directory = mkdtempSync(join(tmpdir(), "starcast-listener-tests-"));
const path = join(directory, "fixture.sqlite");
let now = Date.UTC(2026, 9, 13),
  store = new LocalStore(path);
const service = new ListenerService(store, {
  now: () => now,
  friendBonusMinutes: 60,
});
const a = service.register("a".repeat(64)),
  b = service.register("b".repeat(64)),
  c = service.register("c".repeat(64));
assert.equal(service.register("a".repeat(64)).id, a.id);
assert.equal(service.authenticate("wrong"), null);
assert.equal(service.summary(a).monthlyMinutes, 600);
assert.throws(() => service.attribute(a, a.code));
service.attribute(b, a.code);
service.attribute(b, a.code);
assert.throws(() => service.attribute(b, c.code));
service.onboard(b);
assert.equal(service.summary(a).pendingReferrals, 1);
assert.throws(() => service.attribute(b, c.code));
service.preferences(a, { title_sequence: true });
assert.equal(service.summary(a).preferences.title_sequence, true);
assert.throws(() => service.preferences(a, { advert: "on" }));
assert.equal(
  service.follow(a, { feedUrl: "https://publisher.example/feed.xml", following: true }).following,
  true,
);
assert.deepEqual(service.followedFeeds(), ["https://publisher.example/feed.xml"]);
assert.equal(
  service.follow(a, { feedUrl: "https://publisher.example/feed.xml", following: false }).following,
  false,
);
assert.equal(
  unionDuration([
    [0, 10],
    [5, 15],
    [30, 40],
  ]),
  25,
);
let position = 0;
const tick = (eventId, playing = true, extra = {}) =>
  service.heartbeat(b, {
    eventId,
    sessionId: "fixture-session",
    episodeId: "fixture-episode",
    feedUrl: "https://publisher.example/feed.xml",
    positionMs: position,
    playing,
    speed: 1,
    ...extra,
  });
tick("starting-event");
for (let i = 0; i < 120; i++) {
  now += 15000;
  position += 15000;
  tick(`heartbeat-${i}`);
}
assert.equal(service.summary(b).pendingMinutes, 30);
assert.equal(service.summary(b).consumedMinutes, 0);
assert.equal(
  service.summary(a).monthlyMinutes,
  600,
  "untrusted timers cannot qualify",
);
tick("heartbeat-119");
assert.equal(service.summary(b).pendingMinutes, 30, "replays do not add usage");
now += 15000;
tick("pause-event-1", false);
now += 15000;
tick("pause-event-2", false);
position += 1000000;
now += 15000;
tick("seek-event-1");
assert.equal(service.summary(b).pendingMinutes, 30);
service.offline(b, {
  eventId: "offline-report",
  reports: [{ at: now, positionMs: 900000000, playing: true }],
});
assert.equal(service.summary(b).consumedMinutes, 0);
const sessionIds = store.all("listening-session").map(([id]) => id);
assert.throws(() =>
  service.reconcile({
    owner: b.id,
    eventId: "bad-receipt",
    actor: "fixture-verifier",
    subjectHash: "1".repeat(64),
    sessions: sessionIds,
    fraudApproved: false,
  }),
);
service.reconcile({
  owner: b.id,
  eventId: "friend-receipt",
  actor: "fixture-verifier",
  subjectHash: "1".repeat(64),
  sessions: sessionIds,
  fraudApproved: true,
});
assert.equal(
  service.summary(a).monthlyMinutes,
  600,
  "both identities must be independently verified",
);
assert.throws(() =>
  service.reconcile({
    owner: a.id,
    eventId: "duplicate-person",
    actor: "fixture-verifier",
    subjectHash: "1".repeat(64),
    sessions: [],
    fraudApproved: true,
  }),
);
service.reconcile({
  owner: a.id,
  eventId: "owner-receipt",
  actor: "fixture-verifier",
  subjectHash: "2".repeat(64),
  sessions: [],
  fraudApproved: true,
});
assert.equal(service.summary(a).monthlyMinutes, 900);
assert.equal(service.summary(a).qualifiedReferrals, 1);
assert.throws(() =>
  service.reconcile({
    owner: a.id,
    eventId: "identity-swap-attempt",
    actor: "fixture-verifier",
    subjectHash: "3".repeat(64),
    sessions: [],
    fraudApproved: true,
  }),
);
assert.equal(service.summary(b).consumedMinutes, 30);
assert.equal(service.summary(b).monthlyMinutes, 660);
service.reconcile({
  owner: a.id,
  eventId: "owner-receipt",
  actor: "fixture-verifier",
  subjectHash: "2".repeat(64),
  sessions: [],
  fraudApproved: true,
});
assert.equal(
  service.summary(a).monthlyMinutes,
  900,
  "duplicate verification cannot mint credits",
);
now = Date.UTC(2026, 10, 1);
assert.equal(
  service.summary(a).monthlyMinutes,
  900,
  "earned allowance recurs next month",
);
assert.equal(service.summary(b).consumedMinutes, 0);
assert.equal(
  service.summary(b).monthlyMinutes,
  600,
  "friend bonus is not permanent",
);
store.close();
store = new LocalStore(path);
const restarted = new ListenerService(store, { now: () => now });
assert.equal(restarted.summary(a).monthlyMinutes, 900);
assert.equal(restarted.authenticate("a".repeat(64)).id, a.id);

const feed = "https://example.org/feed",
  episodeId = "test-episode";
const value = {
  transcript: {
    audioVariant: "audio-url-hash-not-fingerprint",
    contentHash: "test-hash",
    segments: [
      { id: "brand", text: "I like Apple computers.", startMs: 0, endMs: 1000 },
      {
        id: "sponsor",
        text: "This episode is sponsored by Test. Use code TEST for a free trial.",
        startMs: 1000,
        endMs: 10000,
      },
    ],
  },
};
const skip = new SkipService(store, { status: () => value });
assert.equal(
  skip.inspect(feed, episodeId).intervals.length,
  1,
  "brand conversation is not a candidate",
);
const interval = skip.inspect(feed, episodeId).intervals[0];
assert.equal(interval.verificationState, "CANDIDATE");
assert.equal(skip.inspect(feed, episodeId).automaticSkipping, false);
skip.report(a, feed, episodeId, {
  eventId: "false-positive",
  intervalId: interval.id,
  kind: "skipped_conversation",
});
skip.report(a, feed, episodeId, {
  eventId: "positive-review",
  intervalId: interval.id,
  kind: "good",
});
assert.equal(
  skip.inspect(feed, episodeId).intervals[0].verificationState,
  "DISPUTED",
);
assert.equal(store.all("skip-feedback").length, 2);
skip.report(a, feed, episodeId, {
  eventId: "different-event-same-vote",
  intervalId: interval.id,
  kind: "good",
});
assert.equal(
  store.all("skip-feedback").length,
  2,
  "one listener cannot manufacture repeated votes",
);
value.transcript.transcriptVersion = "changed-source";
assert.ok(
  skip
    .inspect(feed, episodeId)
    .intervals.every((i) => i.verificationState === "DISPUTED"),
  "new transcript versions do not reinstate disputed boundaries",
);
skip.report(a, feed, episodeId, {
  eventId: "positive-review",
  intervalId: interval.id,
  kind: "good",
});
assert.equal(store.all("skip-feedback").length, 2);
assert.throws(() =>
  skip.report(a, feed, "different", {
    eventId: "wrong-episode",
    intervalId: interval.id,
    kind: "good",
  }),
);
const decision = (interval) =>
  intervalDecision({
    interval,
    variantFingerprint: f.variantA,
    positionMs: 700000,
    flags: { ...defaults.flags, ad_skip: "on" },
  });
assert.equal(
  decision({
    ...f.clearAdvert,
    evidence: [{ source: "transcript" }, { source: "transcript" }],
  }).skip,
  false,
);
assert.equal(decision({ ...f.clearAdvert, startMs: NaN }).skip, false);
assert.equal(decision({ ...f.clearAdvert, confidence: NaN }).skip, false);
assert.equal(decision({ ...f.clearAdvert, durationMs: undefined }).skip, false);
assert.equal(
  decision({ ...f.clearAdvert, boundaryVerified: undefined }).skip,
  false,
);
assert.equal(decision({ ...f.clearAdvert, evidence: {} }).skip, false);
assert.equal(
  decision({ ...f.clearAdvert, boundaryVerified: false }).skip,
  false,
);
assert.equal(evaluateSkipCases([]).precision, null);
const structure = new SkipService(store, {
  status: () => ({
    transcript: {
      audioVariant: "fixture-structure",
      durationMs: 100000,
      segments: [
        {
          id: "intro",
          text: "Hello and welcome to Example.",
          startMs: 0,
          endMs: 5000,
        },
        { id: "title", text: "[theme music]", startMs: 5000, endMs: 10000 },
        {
          id: "preview",
          text: "Coming up next, a conversation about science.",
          startMs: 10000,
          endMs: 15000,
        },
        {
          id: "outro",
          text: "Thanks for listening.",
          startMs: 90000,
          endMs: 95000,
        },
      ],
    },
  }),
});
const structuralCandidates = structure.inspect(feed, "fixture-structure");
assert.deepEqual(structuralCandidates.intervals.map((i) => i.type).sort(), [
  "intro",
  "outro",
  "preview",
  "title_sequence",
]);
assert.ok(
  structuralCandidates.intervals.every(
    (i) => i.verificationState === "CANDIDATE",
  ),
);
const evaluation = evaluateSkipCases([
  {
    episodeId,
    interval: f.clearAdvert,
    variantFingerprint: f.variantA,
    positionMs: 700000,
    expectedSkip: true,
    expectedEndMs: 774000,
  },
  {
    episodeId,
    interval: f.brandConversation,
    variantFingerprint: f.variantA,
    positionMs: 780000,
    expectedSkip: false,
  },
]);
assert.equal(evaluation.precision, 1);
assert.equal(evaluation.undoSuccessRate, 1);
assert.equal(evaluation.acceptanceMet, false);

const app = createStarCastServer({
  store,
  env: { STARCAST_DEV_INTELLIGENCE_TOKEN: "test-only-device" },
});
store.set("intelligence", episodeKey(feed, "paged"), {
  state: "READY",
  completedAt: new Date().toISOString(),
  processingVersion: PROCESSING_VERSION,
  groundingVersion: "fixture",
  transcript: {
    segments: Array.from({ length: 121 }, (_, i) => ({
      id: `s${i}`,
      text:
        i === 120
          ? "A scientific needle beyond the initial page."
          : "Earlier conversation.",
      startMs: i === 0 ? null : i * 1000,
      endMs: i === 0 ? null : (i + 1) * 1000,
    })),
  },
});
const initial = app.pipeline.internalTranscriptPage(feed, "paged");
assert.equal(initial.segments.length, 60);
assert.equal(initial.nextOffset, 60);
assert.equal(initial.segments[0].startMs, null, "untimed text remains untimed");
const searched = app.pipeline.internalTranscriptPage(feed, "paged", 0, "SCIENTIFIC");
assert.equal(searched.total, 1);
assert.equal(searched.segments[0].id, "s120");
assert.equal(searched.nextOffset, null);
await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;
const call = (path, payload, credential, device = true) =>
  fetch(base + path, {
    method: payload ? "POST" : "GET",
    headers: {
      "content-type": "application/json",
      ...(device ? { "x-star-cast-dev-token": "test-only-device" } : {}),
      ...(credential ? { authorization: `Bearer ${credential}` } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
assert.equal((await call("/api/listener/summary")).status, 401);
assert.equal(
  (await call("/api/listener/summary", undefined, "a".repeat(64), false))
    .status,
  403,
);
assert.equal(
  (await call("/api/listener/summary", undefined, "wrong")).status,
  401,
);
assert.equal(
  (await call("/api/listener/summary", undefined, "a".repeat(64))).status,
  200,
);
assert.equal(
  (
    await call(
      "/api/listener/qualify",
      { owner: a.id, monthlyMinutes: 99999 },
      "a".repeat(64),
    )
  ).status,
  400,
);
assert.equal(
  (
    await call("/api/listener/summary", undefined, "a".repeat(64)).then((r) =>
      r.json(),
    )
  ).monthlyMinutes,
  900,
);
assert.equal((await fetch(base + `/invite/${a.code}`)).status, 200);
assert.equal((await fetch(base + "/continue")).status, 404);
await new Promise((resolve) => app.server.close(resolve));
store.close();
rmSync(directory, { recursive: true }); // Exact mkdtemp-created fixture directory only.
console.log(
  "listener auth, pending usage, fraud boundary, recurring rewards, restart, skip feedback and evaluation checks passed",
);
