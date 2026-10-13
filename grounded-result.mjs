// A conservative, deterministic check, not a claim of full semantic validation.
// Dates absent from the speech must not be inferred from model world knowledge.
export function groundResult(value, transcript) {
  if (value.groundingVersion === "source-years-v1" || !value.brief)
    return value;
  const sourceText = transcript.segments.map((s) => s.text).join(" ");
  const years = new Set(sourceText.match(/\b(?:18|19|20)\d{2}\b/g) || []);
  const supported = (text) =>
    (String(text).match(/\b(?:18|19|20)\d{2}\b/g) || []).every((year) =>
      years.has(year),
    );
  const { brief } = value;
  const briefValid = [brief.overview, brief.detail, ...brief.themes].every(
    supported,
  );
  const chapters = (value.chapters || []).filter(
    (c) => supported(c.title) && supported(c.description),
  );
  if (briefValid && chapters.length === (value.chapters || []).length)
    return { ...value, groundingVersion: "source-years-v1" };
  // Preserve genuine speech, source IDs, accounting and original provider output.
  // Never spend on a hidden repair request or reset a retry counter.
  const first = Math.max(
    0,
    transcript.segments.findIndex((s) => s.text.trim().length >= 60),
  );
  const opening = transcript.segments.slice(first, first + 2);
  const referenced = transcript.segments
    .filter(
      (s) => brief.sourceSegmentIds.includes(s.id) && !opening.includes(s),
    )
    .slice(0, 4);
  const excerpts = [...opening, ...referenced];
  return {
    ...value,
    groundingVersion: "source-years-v1",
    partialResult: true,
    qualityNote: briefValid
      ? "Some generated chapters could not be verified. The brief and remaining source-backed chapters are available."
      : "The generated summary could not be verified. These are transcript excerpts, not a full episode summary.",
    brief: briefValid
      ? brief
      : {
          ...brief,
          mode: "extractive",
          overview: `“${opening.map((s) => s.text).join(" ")}”`,
          themes: [],
          detail: excerpts.map((s) => `“${s.text}”`).join("\n\n"),
          sourceSegmentIds: excerpts.map((s) => s.id),
        },
    chapters,
  };
}
