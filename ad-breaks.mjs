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

/** A sponsor opening plus a commercial offer and an explicit editorial return
 * can bound a review proposal. Intervening narration is NOT independent evidence:
 * these wider spans must never inherit eligibility from a short verified member. */
export function proposeCompleteBreaks(segments, { opens, qualifies, denies }) {
  const returns = /\b(?:back to (?:our|the) (?:show|news|discussion|conversation)|return(?:ing)? to (?:our|the) (?:show|news|discussion)|now (?:let's|we) (?:discuss|return))\b/i;
  const proposals = [];
  for (let i = 0; i < segments.length; i++) {
    const first = segments[i];
    if (!opens(first.text || '') || denies(first.text || '') || !Number.isFinite(first.startMs)) continue;
    const members = [first];
    for (const next of segments.slice(i + 1, i + 121)) {
      const previous = members.at(-1);
      if (!Number.isFinite(next.startMs) || !Number.isFinite(next.endMs) || next.startMs < previous.endMs || next.startMs - previous.endMs > 3000 || next.endMs - first.startMs > 240000) break;
      if (returns.test(next.text || '')) {
        if (members.length > 1 && qualifies(members.map(s => s.text).join(' '))) {
          proposals.push({...first,id:'review-break:'+members.map(s=>s.id).join(':'),endMs:previous.endMs,text:members.map(s=>s.text).join(' '),sourceSegmentIds:members.map(s=>s.id),breakCandidate:true,reviewOnly:true});
        }
        break; // Never include the return-to-editorial sentence.
      }
      if (denies(next.text || '')) break;
      members.push(next);
    }
  }
  return proposals.filter((p,i,all)=>!all.some((q,j)=>j!==i&&q.startMs<=p.startMs&&q.endMs>=p.endMs&&(q.startMs<p.startMs||j<i)));
}
