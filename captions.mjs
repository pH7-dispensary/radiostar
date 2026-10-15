/** A short playback-bound window; never a paginated transcript representation. */
export function captionWindow(transcript, positionMs, windowMs = 24_000) {
  if (!transcript?.segments?.length || !Number.isFinite(positionMs) || positionMs < 0)
    return { available: false, segments: [] };
  const from = Math.max(0, Math.floor(positionMs) - 2_000);
  const until = from + windowMs;
  const segments = transcript.segments
    .filter((segment) =>
      Number.isFinite(segment.startMs) &&
      Number.isFinite(segment.endMs) &&
      segment.endMs > from &&
      segment.startMs < until,
    )
    .slice(0, 12)
    .map(({ id, startMs, endMs, speaker, text }) => ({
      id,
      startMs,
      endMs,
      speaker: speaker || undefined,
      text,
    }));
  return {
    available: segments.length > 0,
    windowStartMs: from,
    windowEndMs: until,
    segments,
  };
}
