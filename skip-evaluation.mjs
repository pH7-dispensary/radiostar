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
  const boundaries = [], starts = [], coverage = [], labels = new Set(),
    episodes = new Set();
  for (const item of cases) {
    if (
      typeof item.expectedSkip !== "boolean" ||
      typeof item.episodeId !== "string"
    )
      throw Error("Annotated expectations and episode identity are required.");
    episodes.add(item.episodeId);
    if (realWorld) {
      const label = item.annotation;
      if (!/^[a-f0-9]{64}$/.test(item.audioContentHash || "") || item.audioContentHash !== item.variantFingerprint ||
          !label?.id || !label.reviewer || !label.evidenceReference || !Number.isFinite(Date.parse(label.reviewedAt)) || label.independent !== true ||
          (item.expectedSkip && (!Number.isFinite(item.expectedStartMs) || !Number.isFinite(item.expectedEndMs) || item.expectedStartMs < 0 || item.expectedEndMs <= item.expectedStartMs)))
        throw Error("Real-world cases require hash-bound independent labels and both boundaries.");
      const id = `${item.audioContentHash}:${label.id}`;
      if (labels.has(id)) throw Error("Duplicate real-world label would inflate the denominator.");
      labels.add(id);
    }
    const flags = {
      ...defaults.flags,
      ad_skip: "on",
      intro_skip: "on",
      title_sequence_skip: "on",
      preview_skip: "on",
      outro_skip: "on",
    };
    const result = item.interval ? intervalDecision({ ...item, flags }) : { skip: false };
    if (item.expectedSkip && Number.isFinite(item.expectedStartMs) && Number.isFinite(item.expectedEndMs))
      coverage.push(result.skip ? Math.max(0, Math.min(item.interval.endMs,item.expectedEndMs)-Math.max(item.interval.startMs,item.expectedStartMs))/(item.expectedEndMs-item.expectedStartMs) : 0);
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
      if (Number.isFinite(item.expectedStartMs)) starts.push(Math.abs(item.interval.startMs-item.expectedStartMs));
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
  starts.sort((a,b) => a-b);
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
    labelledAdvertisements: cases.filter(item => item.expectedSkip).length,
    recall: truePositive + missed ? truePositive / (truePositive + missed) : null,
    meanLabelledBreakCoverage: coverage.length ? coverage.reduce((sum,n)=>sum+n,0)/coverage.length : null,
    p95StartErrorMs: starts.length ? starts[Math.ceil(starts.length*.95)-1] : null,
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
      starts.length === skips && starts[Math.ceil(starts.length*.95)-1] <= acceptance.maximumP95BoundaryErrorMs &&
      p95BoundaryErrorMs <= acceptance.maximumP95BoundaryErrorMs &&
      mismatches === 0 &&
      undoSuccessRate === 1,
  };
}
