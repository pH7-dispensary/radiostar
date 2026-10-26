/** Join only already qualified commercial spans. This produces candidates, never verification. */
export function groupCommercialSpans(spans, originals) {
  const sorted = spans.slice().sort((a,b) => a.startMs-b.startMs || a.endMs-b.endMs);
  const groups = [];
  for (const span of sorted) {
    const previous = groups.at(-1);
    const ids = span.sourceSegmentIds || [span.id];
    const gapHasSpeech = previous && originals.some(row => row.startMs < span.startMs && row.endMs > previous.endMs && !previous.sourceSegmentIds.includes(row.id) && !ids.includes(row.id));
    if (previous && span.startMs <= previous.endMs + 500 && span.endMs - previous.startMs <= 240000 && !gapHasSpeech) {
      previous.endMs = Math.max(previous.endMs, span.endMs);
      previous.sourceSegmentIds = [...new Set([...previous.sourceSegmentIds, ...ids])];
      previous.longestMemberMs = Math.max(previous.longestMemberMs, span.endMs-span.startMs);
      previous.members++;
    } else groups.push({ ...span, sourceSegmentIds: [...ids], members: 1, longestMemberMs: span.endMs-span.startMs });
  }
  return groups.filter(group => group.members > 1 && group.endMs-group.startMs > group.longestMemberMs).map(group => ({
    ...group, id: `break:${group.sourceSegmentIds.join(":")}`, breakCandidate: true,
    text: originals.filter(row => group.sourceSegmentIds.includes(row.id)).map(row => row.text).join(" "),
  }));
}
