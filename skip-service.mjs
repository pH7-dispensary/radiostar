import { createHash } from "node:crypto";
import { episodeKey } from "./episode-pipeline.mjs";
import { feedback, Verification } from "./ad-skip.mjs";
import { ListenerError } from "./listener-service.mjs";
const hash = (s) => createHash("sha256").update(s).digest("hex");

export class SkipService {
  constructor(store, pipeline) {
    this.store = store;
    this.pipeline = pipeline;
  }
  inspect(feed, episode) {
    const value = this.pipeline.status(feed, episode),
      key = episodeKey(feed, episode);
    const transcript = value?.transcript;
    const existingIntervals = this.store.all("skip-interval").map(([, v]) => v);
    const previousIntervals = existingIntervals.filter(
      (v) => v.episodeKey === key,
    );
    if (transcript)
      for (const segment of transcript.segments) {
        if (
          !Number.isFinite(segment.startMs) ||
          !Number.isFinite(segment.endMs) ||
          segment.endMs <= segment.startMs
        )
          continue;
        const text = segment.text;
        const sponsorship =
          /\b(sponsored by|sponsor of|our sponsors?|brought to you by|thanks to .{1,50} for sponsoring)\b/i.test(
            text,
          );
        const cta =
          /\b(promo code|discount code|use code|free trial|percent off|% off|visit .{1,60} to|go to .{1,60} for)\b/i.test(
            text,
          );
        const early = segment.startMs < 180000;
        const late =
          Number.isFinite(transcript.durationMs) &&
          segment.startMs > transcript.durationMs * 0.8;
        const type =
          sponsorship || cta
            ? "advert"
            : early && /\[(?:opening |theme |intro )music\]/i.test(text)
              ? "title_sequence"
              : (early || late) &&
                  /\b(coming up (?:next|on)|in (?:our|the) next episode)\b/i.test(
                    text,
                  )
                ? "preview"
                : early &&
                    /\b(hello and welcome to|welcome back to (?:the|our))\b/i.test(
                      text,
                    )
                  ? "intro"
                  : late &&
                      /\b(thanks? (?:you )?for listening|that'?s all for (?:today|this episode))\b/i.test(
                        text,
                      )
                    ? "outro"
                    : null;
        if (!type) continue;
        const id = hash(
          `${key}:${transcript.transcriptVersion || transcript.contentHash}:${segment.id}`,
        );
        if (this.store.get("skip-interval", id)) continue; // Never reinstate a disputed/rejected interval.
        const disputed = previousIntervals.some(
          (v) =>
            v.disputed &&
            v.audioVariant === transcript.audioVariant &&
            v.startMs < segment.endMs &&
            v.endMs > segment.startMs,
        );
        this.store.set("skip-interval", id, {
          id,
          episodeKey: key,
          type,
          startMs: segment.startMs,
          endMs: segment.endMs,
          audioVariant: transcript.audioVariant,
          audioVariantFingerprint: null,
          confidence: disputed ? 0.5 : sponsorship && cta ? 0.8 : 0.55,
          verificationState: disputed
            ? Verification.DISPUTED
            : Verification.CANDIDATE,
          disputed,
          processingVersion: "transcript-candidates-v2",
          evidence: [
            {
              source: "transcript",
              signal: sponsorship
                ? "sponsorship_language"
                : cta
                  ? "offer_call_to_action"
                  : `${type}_language`,
              sourceSegmentIds: [segment.id],
              provenance: value.provenance,
            },
            ...existingIntervals
              .filter(
                (v) =>
                  v.episodeKey !== key &&
                  v.publisherFeed === feed &&
                  v.excerpt === text.slice(0, 600) &&
                  text.length >= 80,
              )
              .slice(0, 1)
              .map((v) => ({
                source: "cross_episode",
                originFamily: "transcript",
                signal: "repeated_publisher_text",
                confidence: 0.7,
                referenceIntervalId: v.id,
              })),
          ],
          publisherFeed: feed,
          boundaryVerified: false,
          excerpt: text.slice(0, 600),
          createdAt: new Date().toISOString(),
        });
      }
    const intervals = this.store
      .all("skip-interval")
      .map(([, v]) => v)
      .filter(
        (v) =>
          v.episodeKey === key && v.audioVariant === transcript?.audioVariant,
      );
    return {
      automaticSkipping: false,
      transcriptAvailable: !!transcript,
      preferencesOnly: true,
      intervals: intervals.map(
        ({ id, type, startMs, endMs, verificationState, excerpt }) => ({
          id,
          type,
          startMs,
          endMs,
          verificationState,
          excerpt,
        }),
      ),
      verifiedCount: intervals.filter(
        (v) =>
          v.verificationState === Verification.VERIFIED &&
          v.boundaryVerified &&
          !v.disputed &&
          !!v.audioVariantFingerprint,
      ).length,
    };
  }
  report(listener, feed, episode, { eventId, intervalId, kind, positionMs }) {
    if (
      typeof eventId !== "string" ||
      !/^[a-zA-Z0-9_-]{8,120}$/.test(eventId) ||
      !["good", "skipped_conversation", "missed"].includes(kind)
    )
      throw new ListenerError("Choose valid skip feedback.");
    const key = episodeKey(feed, episode),
      reportId = hash(`${listener.id}:${eventId}`);
    this.store.transaction(() => {
      if (this.store.get("skip-feedback", reportId)) return;
      const interval =
        typeof intervalId === "string"
          ? this.store.get("skip-interval", intervalId)
          : null;
      if (kind !== "missed" && (!interval || interval.episodeKey !== key))
        throw new ListenerError("This interval is unavailable.");
      if (interval && interval.episodeKey !== key)
        throw new ListenerError(
          "This interval belongs to a different episode.",
        );
      if (
        kind === "missed" &&
        (!Number.isFinite(positionMs) ||
          positionMs < 0 ||
          positionMs > 24 * 3600000)
      )
        throw new ListenerError("A valid report position is required.");
      const voteKey = hash(
        `${listener.id}:${key}:${interval?.id || Math.floor(positionMs / 10000)}:${kind}`,
      );
      if (this.store.get("skip-vote", voteKey)) return;
      this.store.set("skip-vote", voteKey, { reportId });
      if (interval)
        this.store.set("skip-interval", interval.id, feedback(interval, kind));
      this.store.set("skip-feedback", reportId, {
        owner: listener.id,
        intervalId: interval?.id || null,
        episodeKey: key,
        kind,
        positionMs: kind === "missed" ? positionMs : null,
        createdAt: new Date().toISOString(),
        provenance: "listener_report",
      });
    });
    return this.inspect(feed, episode);
  }
}
