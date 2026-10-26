import { normalizeSearch, unicodeTerms } from "./retrieval.mjs";
export function composeGroundedAnswer(
  query,
  matches,
  { partialEpisodes = 0 } = {},
) {
  if (!matches.length)
    return {
      synthesis:
        "I couldn’t find that discussed in the available processed episodes.",
      synthesisType: "abstention",
      answerState: "NO_EVIDENCE",
      claims: [],
      limitations: partialEpisodes
        ? ["Only part of at least one episode is available."]
        : [],
    };
  const comparison =
      /\b(compare|disagree|disagreement|against|contrasting|opposing)\b|discord|compar|分歧|比较/i.test(
        query,
      ),
    terms = unicodeTerms(query);
  const selected = [];
  const seenEpisodes = new Set();
  const add = (m, i) => {
    if (selected.some((x) => x.i === i)) return;
    selected.push({ m, i });
    seenEpisodes.add(m.episode?.id);
  };
  if (comparison)
    matches.forEach((m, i) => {
      if (!seenEpisodes.has(m.episode?.id) && selected.length < 3) add(m, i);
    });
  matches.forEach((m, i) => {
    if (selected.length < 3) add(m, i);
  });
  const claims = selected.map(({ m, i }) => {
    const sentences = [
      ...new Intl.Segmenter("und", { granularity: "sentence" }).segment(
        m.context,
      ),
    ].map((x) => x.segment.trim());
    const ranked = sentences
      .filter((s) => s.length <= 320)
      .map((text, order) => ({
        text,
        order,
        hits: [...unicodeTerms(text)].filter((t) => terms.has(t)).length,
      }))
      .sort((a, b) => b.hits - a.hits || a.order - b.order);
    const text = ranked[0]?.text || String(m.context).slice(0, 280),
      speaker =
        m.speaker && !/^SPEAKER[_\s-]?\d+$/i.test(m.speaker) ? m.speaker : null;
    return {
      text,
      citation: i + 1,
      sourceSegmentIds: [m.segmentId],
      episodeId: m.episode?.id,
      feedUrl: m.episode?.feedUrl,
      startMs: m.startMs ?? null,
      endMs: m.endMs ?? null,
      speaker,
      excerpt: true,
      truncated: !ranked[0],
    };
  });
  const stances = claims
    .map((c) => {
      const text = normalizeSearch(c.text),
        speaker = normalizeSearch(c.speaker || "");
      const m =
        speaker && text.startsWith(speaker + " ")
          ? text
              .slice(speaker.length + 1)
              .match(/^(supports?|opposes?)\s+(.+?)(?:\s+because|[.,;]|$)/)
          : null;
      return m
        ? {
            claim: c,
            direction: m[1].startsWith("support") ? "support" : "oppose",
            object: m[2].trim(),
          }
        : null;
    })
    .filter(Boolean);
  const opposed = stances.some((a) =>
    stances.some((b) => a.object === b.object && a.direction !== b.direction),
  );
  const lead = opposed
    ? "The cited passages state opposing positions on the same proposal."
    : comparison
      ? "These are the relevant stated positions. The available passages do not establish a direct disagreement."
      : "The relevant passage" + (claims.length > 1 ? "s say:" : " says:");
  const limitations = [];
  if (partialEpisodes)
    limitations.push(
      "Only part of at least one episode is available; missing sections may change the context.",
    );
  if (/\bwho\b|quem|谁/i.test(query) && claims.some((c) => !c.speaker))
    limitations.push(
      "Speaker identity is not reliably attributed in the source.",
    );
  const synthesis =
    lead +
    "\n\n" +
    claims
      .map(
        (c) =>
          `[${c.citation}] ${c.speaker ? c.speaker + ": " : ""}“${c.text}”${c.truncated ? " (excerpt)" : ""}`,
      )
      .join("\n\n") +
    (limitations.length ? "\n\n" + limitations.join(" ") : "");
  return {
    synthesis,
    synthesisType: opposed ? "source_comparison" : "grounded_extracts",
    answerState: limitations.length ? "PARTIAL" : "SUPPORTED_EXCERPTS",
    claims,
    limitations,
  };
}
