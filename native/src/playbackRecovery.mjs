// One timestamp policy for explicit position writes and native sleep recovery.
export function positionSnapshot(
  source,
  positionMs,
  speed,
  savedAt = Date.now(),
) {
  return { source, savedAt, snapshot: { positionMs, speed } };
}
export function recoveredSleepPosition(stored, sleep) {
  const key = JSON.stringify([
    stored.source.feedUrl || "",
    stored.source.episodeId,
    stored.source.url,
  ]);
  return sleep?.state === "PAUSED" &&
    sleep.sourceKey === key &&
    Number.isFinite(sleep.positionMs) &&
    sleep.positionMs >= 0 &&
    Number.isFinite(sleep.completedAt) &&
    sleep.completedAt > (stored.savedAt || 0)
    ? sleep.positionMs
    : stored.snapshot.positionMs;
}
