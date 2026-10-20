// Reuses persisted job lifecycle events. No synthetic progress or provider-time
// multiplier: estimates require recent, comparable successful work.
export function processingRoute(job) {
  if (job?.cacheHit || job?.transcriptChecks?.cacheHit) return "cache";
  if (job?.provenance?.sourceType === "on_demand_audio" || job?.transcriptChecks?.audioTranscriptionRequired) return "audio";
  if (job?.provenance?.sourceType) return "publisher";
  return null;
}
export function processingTiming(job) {
  const events = job?.lifecycle || [];
  const stages = {};
  for (let i = 0; i < events.length - 1; i++) {
    const ms = Date.parse(events[i + 1].at) - Date.parse(events[i].at);
    if (events[i].stage && Number.isFinite(ms) && ms >= 0)
      stages[events[i].stage] = (stages[events[i].stage] || 0) + ms;
  }
  return { route: processingRoute(job), queueWaitMs: stages.QUEUED ?? null, stageDurationsMs: stages };
}
const duration = (job) => {
  const parts = String(job?.episode?.duration || "").split(":").map(Number);
  return parts.length <= 3 && parts.every((value) => Number.isFinite(value) && value >= 0)
    ? parts.reduce((n, value) => n * 60 + value, 0) * 1000 : 0;
};
export function measuredProcessingEstimate(job, history, now = Date.now()) {
  // Queue depth alone cannot establish worker availability/leases. Withhold a
  // queue ETA until that evidence is supplied by a durable worker contract.
  if (!job || job.completedAt || ["QUEUED", "BLOCKED", "FAILED", "CANCELLED", "UNAVAILABLE"].includes(job.state)) return null;
  const route = processingRoute(job);
  const stage = job.processingStage;
  const start = job.lifecycle?.find((event) => event.stage === stage)?.at;
  if (!route || !stage || !start) return null;
  const elapsed = Math.max(0, now - Date.parse(start));
  const targetDuration = duration(job);
  const samples = history.filter((sample) =>
    sample.jobId !== job.jobId && sample.state === "READY" &&
    processingRoute(sample) === route && sample.processingVersion === job.processingVersion &&
    Date.parse(sample.completedAt) <= now && Date.parse(sample.completedAt) > now - 30 * 86400_000 &&
    (route !== "audio" || (targetDuration > 0 && duration(sample) >= targetDuration / 2 && duration(sample) <= targetDuration * 2)),
  ).sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt)).slice(0, 40)
    .map((sample) => {
      const stageStart = sample.lifecycle?.find((event) => event.stage === stage)?.at;
      return Date.parse(sample.completedAt) - Date.parse(stageStart || "");
    }).filter((ms) => Number.isFinite(ms) && ms > elapsed).sort((a, b) => a - b);
  if (samples.length < 3 || !Number.isFinite(elapsed)) return null;
  const minimumMs = Math.max(1, samples[Math.floor((samples.length - 1) * 0.1)] - elapsed);
  const maximumMs = samples[Math.ceil((samples.length - 1) * 0.9)] - elapsed;
  // Widely dispersed samples do not support a useful listener promise.
  if (maximumMs / minimumMs > 5) return null;
  return {
    route, stage, sampleCount: samples.length, minimumMs, maximumMs,
    confidence: samples.length >= 10 ? "high" : "medium",
    updatedAt: new Date(now).toISOString(),
    label: `Usually ready in ${Math.max(1, Math.ceil(minimumMs / 60000))}–${Math.max(1, Math.ceil(maximumMs / 60000))} minutes.`,
    estimatedCompletionAt: new Date(now + maximumMs).toISOString(),
  };
}
