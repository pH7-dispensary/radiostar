export const Verification = Object.freeze({
  CANDIDATE: "CANDIDATE",
  UNVERIFIED: "UNVERIFIED",
  VARIANT_MATCHED: "VARIANT_MATCHED",
  COMMUNITY_SUPPORTED: "COMMUNITY_SUPPORTED",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
  DISPUTED: "DISPUTED",
});
export const SkipType = Object.freeze({
  ADVERT: "advert",
  INTRO: "intro",
  TITLE: "title_sequence",
  PREVIEW: "preview",
  OUTRO: "outro",
});
export const defaults = Object.freeze({
  minimumEvidence: 2,
  minimumConfidence: 0.93,
  boundaryPaddingMs: 300,
  suppressAfterManualSeekMs: 10_000,
  flags: {
    ad_skip: "off",
    intro_skip: "off",
    title_sequence_skip: "off",
    preview_skip: "off",
    outro_skip: "off",
  },
});
export function intervalDecision({
  interval,
  variantFingerprint,
  positionMs,
  durationMs = interval?.durationMs,
  flags = defaults.flags,
  lastManualSeekAt = 0,
  now = Date.now(),
}) {
  if (!interval || interval.verificationState !== Verification.VERIFIED)
    return { skip: false, reason: "unverified" };
  if (
    !Number.isFinite(positionMs) ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0 ||
    !Number.isFinite(interval.startMs) ||
    !Number.isFinite(interval.endMs) ||
    interval.startMs < 0 ||
    interval.endMs <= interval.startMs ||
    interval.endMs + defaults.boundaryPaddingMs > durationMs ||
    interval.boundaryVerified !== true
  )
    return { skip: false, reason: "unsafe_boundary" };
  if (
    !variantFingerprint ||
    !interval.audioVariantFingerprint ||
    interval.audioVariantFingerprint !== variantFingerprint
  )
    return { skip: false, reason: "variant_mismatch" };
  const flagKey =
    interval.type === SkipType.ADVERT ? "ad_skip" : `${interval.type}_skip`;
  if (flags[flagKey] !== "on") return { skip: false, reason: "feature_off" };
  const independent = new Set(
    (Array.isArray(interval.evidence) ? interval.evidence : [])
      .filter(
        (e) =>
          e &&
          [
            "transcript",
            "fingerprint",
            "structure",
            "human_review",
            "listener_consensus",
            "cross_episode",
          ].includes(e.source) &&
          Number.isFinite(e.confidence) &&
          e.confidence >= defaults.minimumConfidence,
      )
      .map((e) => (e.source === "cross_episode" ? "transcript" : e.source)),
  );
  if (
    !Number.isFinite(interval.confidence) ||
    interval.confidence > 1 ||
    interval.confidence < defaults.minimumConfidence ||
    independent.size < defaults.minimumEvidence ||
    !independent.has("fingerprint")
  )
    return { skip: false, reason: "insufficient_evidence" };
  if (
    interval.disputed ||
    now - lastManualSeekAt < defaults.suppressAfterManualSeekMs
  )
    return { skip: false, reason: "user_intent" };
  if (positionMs < interval.startMs || positionMs >= interval.endMs)
    return { skip: false, reason: "outside_interval" };
  return {
    skip: true,
    seekToMs: interval.endMs + defaults.boundaryPaddingMs,
    savedMs: interval.endMs - interval.startMs,
    type: interval.type,
  };
}
export class PlaybackIntelligenceController {
  constructor({ engine, flags }) {
    this.engine = engine;
    this.flags = flags;
    this.manualSeekAt = 0;
    this.lastSkip = null;
  }
  onManualSeek() {
    this.manualSeekAt = Date.now();
  }
  onProgress({ positionMs, variantFingerprint, intervals, durationMs }) {
    let interval = intervals.find(
      (x) => positionMs >= x.startMs && positionMs <= x.endMs,
    );
    let result = intervalDecision({
      interval,
      variantFingerprint,
      positionMs,
      durationMs,
      flags: this.flags,
      lastManualSeekAt: this.manualSeekAt,
    });
    if (result.skip) {
      this.lastSkip = {
        interval,
        preSkipPosition: positionMs,
        skipTimestamp: Date.now(),
      };
      this.engine.seek(result.seekToMs);
      return result;
    }
    return result;
  }
  undo() {
    if (!this.lastSkip) return false;
    // Undo must restore the listener's exact prior position, not a guessed
    // interval edge.  Treat it as manual intent so the same interval cannot
    // immediately fire again while the listener reviews it.
    this.engine.seek(Math.max(0, this.lastSkip.preSkipPosition));
    this.lastSkip = null;
    this.onManualSeek();
    return true;
  }
}
export function feedback(interval, kind) {
  if (kind === "skipped_conversation") {
    return {
      ...interval,
      verificationState: Verification.DISPUTED,
      disputed: true,
      confidence: Math.min(interval.confidence, 0.5),
    };
  }
  if (kind === "good") {
    return {
      ...interval,
      positiveFeedback: (interval.positiveFeedback || 0) + 1,
    };
  }
  return { ...interval, missedReports: (interval.missedReports || 0) + 1 };
}
export const syntheticSkipFixtures = {
  variantA: "fixture-variant-a",
  variantB: "fixture-variant-b",
  clearAdvert: {
    boundaryVerified: true,
    durationMs: 900000,
    id: "ad-1",
    type: SkipType.ADVERT,
    startMs: 691000,
    endMs: 774000,
    audioVariantFingerprint: "fixture-variant-a",
    confidence: 0.98,
    verificationState: Verification.VERIFIED,
    evidence: [
      { source: "transcript", signal: "cta", confidence: 0.98 },
      { source: "fingerprint", signal: "variant_match", confidence: 1 },
    ],
    disputed: false,
  },
  brandConversation: {
    id: "not-ad",
    type: SkipType.ADVERT,
    startMs: 774000,
    endMs: 830000,
    audioVariantFingerprint: "fixture-variant-a",
    confidence: 0.65,
    verificationState: Verification.CANDIDATE,
    evidence: [
      { source: "transcript", signal: "brand_mention", confidence: 0.65 },
    ],
    disputed: false,
  },
  intro: {
    boundaryVerified: true,
    durationMs: 900000,
    id: "intro-1",
    type: SkipType.INTRO,
    startMs: 0,
    endMs: 42000,
    audioVariantFingerprint: "fixture-variant-a",
    confidence: 0.97,
    verificationState: Verification.VERIFIED,
    evidence: [
      { source: "fingerprint", signal: "recurring_theme", confidence: 0.99 },
      { source: "structure", signal: "opening", confidence: 0.96 },
    ],
    disputed: false,
  },
};
