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
 * these wider spans must never inherit eligibility from a short verified member.
 * A clear commercial closing can qualify the full span for acoustic checks. */
export function proposeCompleteBreaks(segments, { opens, qualifies, denies }) {
  const returns = /\b(?:back to (?:our|the) (?:show|news|discussion|conversation)|return(?:ing)? to (?:our|the) (?:show|news|discussion)|now (?:let's|we) (?:discuss|return)|that'?s all for (?:today|this (?:week|episode))|thanks for listening to (?:our|the) (?:show|podcast))\b/i;
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
          proposals.push({...first,id:'review-break:'+members.map(s=>s.id).join(':'),endMs:previous.endMs,nextSpeechMs:next.startMs,text:members.map(s=>s.text).join(' '),sourceSegmentIds:members.map(s=>s.id),breakCandidate:true,reviewOnly:true,automaticBreakEvidence:automaticOpeningEvidence(members,next)});
        }
        break; // Never include the return-to-editorial sentence.
      }
      if (denies(next.text || '')) break;
      members.push(next);
    }
  }
  return proposals.filter((p,i,all)=>!all.some((q,j)=>j!==i&&q.startMs<=p.startMs&&q.endMs>=p.endMs&&(q.startMs<p.startMs||j<i)));
}

// A pre-roll can end in a music bed before the first spoken welcome. It need
// not say "back to the show". Automatic qualification still requires a
// commercial closing and a separate measured audio boundary. Human annotation
// is optional operational evidence, never an invented prerequisite or label.
export function proposeOpeningBreaks(segments, { opens, qualifies, denies }) {
  const first = segments[0];
  if (!first || first.startMs < 0 || first.startMs > 1000 || !opens(first.text || '') || denies(first.text || '')) return [];
  const members = [first];
  for (const next of segments.slice(1, 129)) {
    const previous = members.at(-1);
    if (!Number.isFinite(next.startMs) || !Number.isFinite(next.endMs) || next.startMs < previous.endMs || next.endMs > 240000) break;
    const gap = next.startMs - previous.endMs;
    const welcome = /\b(?:hello[ ,]+(?:friends|and welcome)|welcome (?:back )?to|coming up on (?:the|our) show|this week[ ,]+we(?:'re| are) going to|you have (?:one|a|\d+) (?:unheard|new) messages?)\b/i.test(next.text || '');
    if (gap >= 4000 || welcome) {
      if (welcome && gap <= 30000 && qualifies(members.map(s => s.text).join(' '))) return [{
        ...first, id: 'opening-break:' + members.map(s => s.id).join(':'),
        startMs: 0, endMs: previous.endMs, nextSpeechMs: next.startMs,
        text: members.map(s => s.text).join(' '), sourceSegmentIds: members.map(s => s.id),
        breakCandidate: true, openingBreak: true, reviewOnly: true,
        automaticOpeningEvidence: automaticOpeningEvidence(members, next),
      }];
      break;
    }
    if (denies(next.text || '')) break;
    members.push(next);
  }
  return [];
}

function automaticOpeningEvidence(members, next) {
  const first = members[0], last = members.at(-1);
  // The sponsor cue must be an actual opening declaration, not quoted analysis
  // of an advert. A long gap or an unclear closing remains non-skippable.
  const declaration = /^(?:(?:this|the) (?:episode|show|podcast)(?: of .{1,100})? (?:is |was )?|today(?:'s (?:episode|show))? (?:is )?)?(?:brought to you by|sponsored by|made possible by)\b/i;
  const address = /\b[a-z][\w-]*(?:\.(?:com|net|org|io|promo)\b|\s+dot\s+(?:com|net|org|io|promo)\b)/i;
  const action = /\b(?:go to|visit|head (?:over )?to|sign up|get started|use (?:the )?(?:code|[a-z]+))\b/i;
  const close = String(last.text || '');
  const editorial = /\b(?:back to (?:our|the)|return(?:ing)? to (?:our|the)|editorial (?:discussion|analysis)|discuss(?:ing)? (?:our |the )?(?:sponsors?|sponsorship|advertising)|not (?:an? )?(?:ad|advertisement)|not sponsored|now (?:let's|we) (?:discuss|return))\b/i;
  if (!declaration.test(String(first.text || '').trim()) || members.some(s => editorial.test(s.text || '')) || !address.test(close) || !action.test(close) || next.startMs-last.endMs < 500 || next.startMs-last.endMs > 15000) return null;
  return { version: 'commercial-opening-v1', sourceSegmentIds: members.map(s=>s.id), closingSegmentId: last.id, editorialSegmentId: next.id, independentHumanReview: false };
}
