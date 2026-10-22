/** Single playback adapter shared by the native runtime and real-audio tests. */
export async function executeVerifiedSkip({ interval, positionMs, durationMs, authorise, seek, current }) {
  if (!current() || !Number.isFinite(durationMs) || interval.endMs >= durationMs || positionMs < interval.startMs || positionMs >= interval.endMs) throw Error("Unsafe skip position");
  const lease = await authorise({ intervalId: interval.id, positionMs });
  if (!current() || lease.expiresAt <= Date.now() || lease.id !== interval.id || lease.targetMs !== interval.endMs) throw Error("Stale skip authorisation");
  const observed = await seek(lease.targetMs);
  if (!current() || !Number.isFinite(observed) || Math.abs(observed - lease.targetMs) > 350) throw Error("Seek destination was not confirmed");
  return { lease, positionMs: observed, durationMs: Math.max(0, observed - positionMs), undo: async () => {
    if (!current()) throw Error("Playback source changed");
    const restored = await seek(positionMs);
    if (!current() || !Number.isFinite(restored) || Math.abs(restored - positionMs) > 350) throw Error("Undo destination was not confirmed");
    return restored;
  } };
}
