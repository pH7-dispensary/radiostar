import assert from "node:assert/strict";
import { LocalStore } from "./persistence.mjs";
import { SkipService } from "./skip-service.mjs";
import { ListenerService } from "./listener-service.mjs";

const store = new LocalStore(":memory:");
const feedUrl = "https://publisher.example/authorised-feed.xml";
const episodeId = "episode-1";
const audioUrl = "https://publisher.example/episode-1.mp3";
const pipeline = {
  status: () => ({
    state: "READY",
    episode: { audioUrl },
    transcript: {
      audioVariant: "cache-key-not-an-audio-fingerprint",
      transcriptVersion: "v1",
      segments: [{
        id: "candidate",
        startMs: 10_000,
        endMs: 25_000,
        text: "This episode is sponsored by Example. Use code STAR for a free trial.",
      }],
    },
  }),
};
const skip = new SkipService(store, pipeline, {
  automaticEnabled: () => true,
  canVerifyAudio: () => ({ allowed: true }),
  verifyAudio: async ({ candidates }) => ({
    state: "READY",
    variant: {
      requestedAudioUrl: audioUrl,
      deliveryUrl: audioUrl,
      etag: '"owned-fixture-v1"',
      contentLength: 42,
      audioVariantFingerprint: "actual-audio-content-hash",
      durationMs: 60000,
    },
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      boundaryVerified: true,
      startMs: 10_120,
      endMs: 24_880,
      boundaryFingerprint: "pcm-boundaries",
    })),
  }),
});

let status = skip.inspect(feedUrl, episodeId);
assert.equal(status.automaticSkipping, false, "inspection never trusts a transcript candidate");
await new Promise((resolve) => setImmediate(resolve));
status = skip.inspect(feedUrl, episodeId);
assert.equal(status.verifiedCount, 1, "only the actual-audio verifier can promote a candidate");
const listener = new ListenerService(store).register("a".repeat(64));
const preferences = { adSkipEnabled: true, advert: true, intro: false, title_sequence: false, preview: false, outro: false };
assert.equal(skip.playback(feedUrl, episodeId, { audioUrl, preferences }).automaticSkipping, false, "a URL alone never proves the played bytes");
const input = { audioUrl, preferences, listener, audioVariantFingerprint: "actual-audio-content-hash" };
assert.equal(skip.playback(feedUrl, episodeId, input).automaticSkipping, true);
const persisted=store.get('skip-interval',status.intervals[0].id);
store.set('skip-interval','overlapping-evidence',{...persisted,id:'overlapping-evidence',startMs:persisted.startMs+100,endMs:persisted.endMs-100});
assert.equal(skip.playback(feedUrl,episodeId,input).activeIntervals.length,1,'overlapping evidence must not produce a second executable skip after Undo');
store.set('skip-interval','overlapping-evidence',{...persisted,id:'overlapping-evidence',startMs:persisted.startMs+100,endMs:persisted.endMs-100,verificationState:'DISPUTED',disputed:true});
assert.equal(skip.playback(feedUrl,episodeId,input).activeIntervals.length,0,'a grouped break cannot bypass a disputed overlapping member');
store.delete('skip-interval','overlapping-evidence');
assert.equal(skip.playback(feedUrl, episodeId, { audioUrl: audioUrl + "?dynamic=1", preferences }).automaticSkipping, false, "a changed source URL is never treated as the verified variant");
const interval = status.intervals[0];
const lease = skip.authorise(listener, feedUrl, episodeId, { ...input, intervalId: interval.id, positionMs: 10_120 }, preferences);
skip.recordPlaybackEvent(listener, feedUrl, episodeId, {eventId: "requested-stage", intervalId: interval.id, kind: "skip_requested", positionMs: 10120});
skip.recordPlaybackEvent(listener, feedUrl, episodeId, {eventId: "attempted-stage", intervalId: interval.id, kind: "seek_attempted", positionMs: 10120, authorisationId: lease.authorisationId});
assert.equal(skip.operations().counts.automaticSkips, 0, "an attempted seek is not a success");
assert.throws(() => skip.recordPlaybackEvent({id: "other"}, feedUrl, episodeId, {eventId: "foreign-lease", intervalId: interval.id, kind: "seek_attempted", positionMs: 10120, authorisationId: lease.authorisationId}));
assert.deepEqual(skip.recordPlaybackEvent(listener, feedUrl, episodeId, { eventId: "automatic-skip-event", intervalId: interval.id, kind: "automatic_skip", positionMs: lease.targetMs, authorisationId: lease.authorisationId }), { recorded: true });
assert.deepEqual(skip.recordPlaybackEvent(listener, feedUrl, episodeId, { eventId: "undo-skip-event", intervalId: interval.id, kind: "undo", positionMs: 10_120, authorisationId: lease.authorisationId }), { recorded: true });
assert.equal(skip.operations().counts.automaticSkips, 1);
assert.equal(skip.operations().counts.undoEvents, 1);
skip.report(listener, feedUrl, episodeId, { eventId: "conversation-report", intervalId: interval.id, kind: "skipped_conversation" });
assert.equal(skip.playback(feedUrl, episodeId, { audioUrl, preferences }).automaticSkipping, false, "a disputed interval is immediately removed from execution");
assert.equal(skip.operations().release.productionAutomaticSkipping, false);
store.close();
console.log("ad skip verification, exact variant matching, event recording, and dispute suppression passed");
