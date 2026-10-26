/** Single playback adapter shared by the native runtime and real-audio tests. */
export async function executeVerifiedSkip({ interval, positionMs, durationMs, authorise, seek, current, getPosition = () => positionMs, onStage = () => {} }) {
  if (!current() || !interval || !Number.isFinite(positionMs) || !Number.isFinite(durationMs) || !Number.isFinite(interval.startMs) || !Number.isFinite(interval.endMs) || interval.startMs < 0 || interval.endMs <= interval.startMs || interval.endMs >= durationMs || positionMs < interval.startMs || positionMs >= interval.endMs) throw Error("Unsafe skip position");
  const lease = await authorise({ intervalId: interval.id, positionMs });
  if (!current() || !lease || !Number.isFinite(lease.expiresAt) || lease.expiresAt <= Date.now() || lease.id !== interval.id || lease.targetMs !== interval.endMs) throw Error("Stale skip authorisation");
  const beforeSeek = getPosition();
  if (!Number.isFinite(beforeSeek) || beforeSeek < interval.startMs || beforeSeek >= interval.endMs) throw Object.assign(Error("Playback left the advert while authorising"), { code: "INTERVAL_PASSED" });
  onStage("seek_attempted", { lease, positionMs: beforeSeek });
  const observed = await seek(lease.targetMs);
  if (!current() || !Number.isFinite(observed) || Math.abs(observed - lease.targetMs) > 350) throw Error("Seek destination was not confirmed");
  let undoTask;
  return { lease, originMs: beforeSeek, positionMs: observed, durationMs: Math.max(0, observed - beforeSeek), undo: () => undoTask ||= (async () => {
    if (!current()) throw Error("Playback source changed");
    const restored = await seek(beforeSeek);
    if (!current() || !Number.isFinite(restored) || Math.abs(restored - beforeSeek) > 350) throw Error("Undo destination was not confirmed");
    return restored;
  })().catch(error => { undoTask = null; throw error; }) };
}
