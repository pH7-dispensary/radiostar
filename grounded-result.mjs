import {
  validateClaims,
  GROUNDING_VERSION,
  claimsForResult,
  claimBinding,
  expandGroundingSources,
} from "./claim-grounding.mjs";

const sentences = (text) =>
  [
    ...new Intl.Segmenter("und", { granularity: "sentence" }).segment(
      text || "",
    ),
  ].map((s) => s.segment.trim());

// Keep supported material useful. Unsupported provider prose is never made
// trustworthy by a citation ID; originals remain in protected checkpoints.
export function groundResult(value, transcript) {
  value = expandGroundingSources(value, transcript);
  if (!value.brief && !value.chapters?.length) return value;
  const originalClaims = claimsForResult(value);
  const assessment = validateClaims(value, transcript);
  const supported = new Set(
    assessment.claims.filter((c) => c.supported).map((c) => c.id),
  );
  const failed = assessment.claims.filter((c) => !c.supported);
  if (!failed.length)
    return {
      ...value,
      groundingVersion: GROUNDING_VERSION,
      claimGrounding: assessment,
    };

  let brief = value.brief;
  if (brief && failed.some((c) => c.id.startsWith("brief."))) {
    const details = originalClaims.filter(
      (c) => c.id.startsWith("brief.detail.") && supported.has(c.id),
    );
    const overview = originalClaims.filter((c) =>
      c.id.startsWith("brief.overview."),
    );
    const safeOverview =
      overview.length && overview.every((c) => supported.has(c.id))
        ? brief.overview
        : details[0]?.text;
    if (safeOverview && details.length) {
      brief = {
        ...brief,
        mode: "verified_partial",
        overview: safeOverview,
        detail: details.map((c) => c.text).join(" "),
        themes: (brief.themes || []).filter((_, i) =>
          supported.has(`brief.theme.${i}`),
        ),
      };
    } else {
      const excerpts = [];
      let size = 0;
      for (const source of transcript.segments.filter((s) =>
        brief.sourceSegmentIds?.includes(s.id),
      )) {
        for (const text of sentences(source.text)) {
          if (text.length < 12 || text.length > 300 || size + text.length > 600)
            continue;
          excerpts.push({ id: source.id, text });
          size += text.length;
          if (excerpts.length === 3) break;
        }
        if (excerpts.length === 3) break;
      }
      brief = excerpts.length
        ? {
            ...brief,
            mode: "extractive",
            overview: `“${excerpts[0].text}”`,
            detail: excerpts.map((s) => `“${s.text}”`).join("\n"),
            themes: [],
            sourceSegmentIds: [...new Set(excerpts.map((s) => s.id))],
          }
        : undefined;
    }
  }

  const chapters = [];
  for (const [i, chapter] of (value.chapters || []).entries()) {
    if (!failed.some((c) => c.id.startsWith(`chapter.${i}.`))) {
      chapters.push(chapter);
      continue;
    }
    const sources = transcript.segments.filter((s) =>
      chapter.sourceSegmentIds?.includes(s.id),
    );
    if (
      !sources.length ||
      sources.length !== new Set(chapter.sourceSegmentIds).size
    )
      continue;
    const sentence = sentences(sources[0].text).find(
      (s) => s.length >= 12 && s.length <= 300,
    );
    if (!sentence) continue;
    const title =
      sentence.length <= 90
        ? sentence
        : sentence.slice(0, 86).replace(/\s+\S*$/, "") + "…";
    chapters.push({
      ...chapter,
      mode: "extractive",
      title: `“${title}”`,
      description: `“${sentence}”`,
    });
  }

  const next = { ...value, brief, chapters };
  // Projection may renumber sentences/chapters. Rebind only already-supported
  // identical claims against the same source IDs; never promote failed claims.
  if (value.claimReview) {
    const reviews = [];
    for (const claim of claimsForResult(next)) {
      const original = originalClaims.find(
        (c) =>
          supported.has(c.id) &&
          c.text === claim.text &&
          c.label === claim.label &&
          JSON.stringify(c.sourceSegmentIds) ===
            JSON.stringify(claim.sourceSegmentIds),
      );
      const review =
        original &&
        value.claimReview.claims.find(
          (c) =>
            c.id === original.id &&
            c.binding === claimBinding(original, transcript),
        );
      if (review)
        reviews.push({
          ...review,
          id: claim.id,
          binding: claimBinding(claim, transcript),
        });
    }
    next.claimReview = { ...value.claimReview, claims: reviews };
  }
  return {
    ...next,
    groundingVersion: GROUNDING_VERSION,
    claimGrounding: assessment,
    partialResult: true,
    qualityNote:
      brief?.mode === "extractive"
        ? "The generated summary could not be fully verified. Available text is a short source excerpt, not a complete episode summary."
        : "Some generated claims could not be verified. Supported findings remain available; quoted chapter labels are source excerpts.",
  };
}
