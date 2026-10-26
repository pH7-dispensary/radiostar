// Unicode lexical retrieval shared by episode moments and conversation search.
// Embedding scores, when present, are relevance signals, never factual confidence.
export const RETRIEVAL_VERSION = "unicode-hybrid-v2";
const stopWords = new Set(
  "the and what where when which who how does did they them about that this with from have has were are was for into said podcast episode find moment people discuss discussed do a an of to in is it on we you their why can could would should not que qual quais como onde quando quem sobre uma um os as dos das de da do para por em e o a".split(
    " ",
  ),
);
const segmenter = new Intl.Segmenter("und", { granularity: "word" });
export function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\p{Script=Latin}[\p{Script=Latin}\p{M}]*/gu, (s) =>
      s.normalize("NFD").replace(/\p{M}/gu, ""),
    );
}
export function unicodeTerms(value) {
  const text = normalizeSearch(value),
    terms = new Set();
  for (const { segment, isWordLike } of segmenter.segment(text))
    if (
      isWordLike &&
      ([...segment].length >= 2 || /\p{Script=Han}/u.test(segment)) &&
      !stopWords.has(segment)
    )
      terms.add(/^profil(e|er|ers|ing)$/.test(segment) ? "profile" : segment);
  // Overlapping bigrams avoid dependence on one dictionary's CJK word boundaries.
  for (const run of text.match(
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/gu,
  ) || []) {
    const chars = [...run];
    for (let i = 0; i < chars.length - 1; i++)
      terms.add(chars.slice(i, i + 2).join(""));
  }
  return terms;
}
const synonyms = {
  dangerous: ["safety", "strategic", "deception", "oversight"],
  danger: ["safety", "strategic"],
  worried: ["safety", "oversight"],
  agents: ["agent", "autonomy", "delegated"],
  control: ["oversight", "permissions", "audit"],
  energy: ["compute", "energy"],
};
export function lexicalRank(transcript, query) {
  const terms = unicodeTerms(query);
  if (!terms.size) return [];
  const expanded = new Set([...terms].flatMap((w) => synonyms[w] || []));
  const rows = (transcript.segments || []).filter(
    (s) => (s.contentType || "conversation") === "conversation",
  );
  const prepared = rows.map((s) => ({
    s,
    hay:
      s.searchTermsVersion === RETRIEVAL_VERSION && Array.isArray(s.searchTerms)
        ? new Set(s.searchTerms)
        : unicodeTerms(
            `${s.text} ${(s.topics || []).join(" ")} ${(s.entities || []).join(" ")} ${s.speaker || ""}`,
          ),
  }));
  const weight = (t) =>
    1 +
    Math.log(
      1 + rows.length / (1 + prepared.filter((x) => x.hay.has(t)).length),
    );
  const weights = new Map([...terms].map((t) => [t, weight(t)])),
    total = [...weights.values()].reduce((a, b) => a + b, 0),
    phrase = normalizeSearch(query).trim();
  return prepared
    .map(({ s, hay }) => {
      const hits = [...terms].filter((t) => hay.has(t)),
        coverage = hits.reduce((n, t) => n + weights.get(t), 0) / total;
      const related =
          [...expanded].filter((t) => hay.has(t)).length /
          Math.max(expanded.size, 1),
        exact = phrase.length >= 3 && normalizeSearch(s.text).includes(phrase);
      const score = coverage + 0.24 * related + (exact ? 0.3 : 0);
      return {
        ...s,
        score,
        lexicalScore: score,
        queryCoverage: coverage,
        hitCount: hits.length,
        querySize: terms.size,
        relatedScore: related,
        exactMatch: exact,
      };
    })
    .filter(
      (s) =>
        s.score > 0 &&
        (s.querySize < 3 ||
          s.hitCount >= 2 ||
          s.relatedScore >= 0.5 ||
          s.exactMatch),
    )
    .sort(
      (a, b) =>
        b.score - a.score || (a.startMs ?? Infinity) - (b.startMs ?? Infinity),
    );
}
export function rankMoments(transcript, query, limit = 3) {
  const rows = lexicalRank(transcript, query),
    top = rows[0]?.score || 0;
  return rows
    .filter((s) => s.score >= top * 0.55)
    .slice(0, Math.min(20, Math.max(0, limit)))
    .map((s, index) => ({
      rank: index + 1,
      label:
        index === 0
          ? "MOST LIKELY"
          : index === 1
            ? "ANOTHER POSSIBILITY"
            : "RELATED MOMENT",
      segmentId: s.id,
      startMs: s.startMs ?? null,
      endMs: s.endMs ?? null,
      context: s.text,
      score: s.score,
      confidence: Number(Math.min(0.98, 0.45 + s.score / 2).toFixed(2)),
      sourceTranscriptVersion: transcript.transcriptVersion || "publisher-v1",
      retrievalVersion: RETRIEVAL_VERSION,
    }));
}
