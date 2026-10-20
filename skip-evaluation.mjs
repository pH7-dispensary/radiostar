import {
  intervalDecision,
  PlaybackIntelligenceController,
  defaults,
} from "./ad-skip.mjs";
export const acceptance = Object.freeze({
  minimumEpisodes: 30,
  minimumVerifiedAdverts: 1000,
  minimumPrecision: 0.995,
  maximumConversationSkips: 0,
  maximumP95BoundaryErrorMs: 500,
  maximumVariantMismatchSkips: 0,
  requiredUndoSuccessRate: 1,
});
/** Isolated annotated evaluation, never enables production flags or upgrades candidates. */
export function evaluateSkipCases(cases, { realWorld = false } = {}) {
  let truePositive = 0,
    falsePositive = 0,
    missed = 0,
    mismatches = 0,
    undoPassed = 0,
    skips = 0;
  const boundaries = [],
    episodes = new Set();
  for (const item of cases) {
    if (
      typeof item.expectedSkip !== "boolean" ||
      typeof item.episodeId !== "string"
    )
      throw Error("Annotated expectations and episode identity are required.");
    episodes.add(item.episodeId);
    const flags = {
      ...defaults.flags,
      ad_skip: "on",
      intro_skip: "on",
      title_sequence_skip: "on",
      preview_skip: "on",
      outro_skip: "on",
    };
    const result = intervalDecision({ ...item, flags });
    if (result.skip) {
      skips++;
      if (item.expectedSkip) truePositive++;
      else falsePositive++;
      if (item.interval.audioVariantFingerprint !== item.variantFingerprint)
        mismatches++;
      if (Number.isFinite(item.expectedEndMs))
        boundaries.push(
          Math.abs(
            result.seekToMs - defaults.boundaryPaddingMs - item.expectedEndMs,
          ),
        );
      const seeks = [],
        controller = new PlaybackIntelligenceController({
          engine: { seek: (ms) => seeks.push(ms) },
          flags,
        });
      controller.onProgress({ ...item, intervals: [item.interval] });
      if (
        controller.undo() &&
        seeks.at(-1) === Math.max(0, item.positionMs)
      )
        undoPassed++;
    } else if (item.expectedSkip) missed++;
  }
  boundaries.sort((a, b) => a - b);
  const precision = skips ? truePositive / skips : null,
    p95BoundaryErrorMs = boundaries.length
      ? boundaries[Math.ceil(boundaries.length * 0.95) - 1]
      : null,
    undoSuccessRate = skips ? undoPassed / skips : null;
  return {
    cohort: realWorld ? "annotated_real_world" : "synthetic_fixtures",
    episodes: episodes.size,
    cases: cases.length,
    truePositive,
    falsePositive,
    missed,
    precision,
    p95BoundaryErrorMs,
    variantMismatchSkips: mismatches,
    undoSuccessRate,
    complaintRate: null,
    productionEnabled: false,
    acceptanceMet:
      realWorld &&
      episodes.size >= acceptance.minimumEpisodes &&
      truePositive >= acceptance.minimumVerifiedAdverts &&
      precision >= acceptance.minimumPrecision &&
      falsePositive === 0 &&
      boundaries.length === skips &&
      p95BoundaryErrorMs <= acceptance.maximumP95BoundaryErrorMs &&
      mismatches === 0 &&
      undoSuccessRate === 1,
  };
}
