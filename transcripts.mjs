import { createHash } from "node:crypto";
import { publicUrl, fetchPublicText } from "./safe-network.mjs";
const MAX_TRANSCRIPT_BYTES = 2_000_000;
// Changes to publisher parsing must cause an explicit source recheck before a
// completed cache entry is reused. This version is part of the pipeline cache
// signature, not a listener-facing format guarantee.
// v3 also invalidates a short-lived v2 cache entry whose requested refresh was
// dispatched through SQS before the refresh flag was included in the message.
export const PUBLISHER_TRANSCRIPT_PARSER_VERSION = "3";
export const TranscriptReadiness = Object.freeze({
  FULLY_READY: "FULLY_READY",
  TEXT_ONLY: "TEXT_ONLY",
  PARTIAL: "PARTIAL",
  UNUSABLE: "UNUSABLE",
});

const decode = (s) =>
  String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
const attrs = (s) =>
  Object.fromEntries(
    [...String(s).matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map(
      ([, k, v]) => [k.toLowerCase(), decode(v)],
    ),
  );
export function safeTranscriptUrl(value) {
  return publicUrl(value);
}
export function transcriptRefsFromItem(xml) {
  return [...String(xml).matchAll(/<podcast:transcript\b([^>]*?)(?:\/?>)/gi)]
    .map((match) => {
      let a = attrs(match[1]);
      return {
        url: a.url,
        type: (a.type || "").toLowerCase(),
        language: a.language || "und",
        rel: a.rel || "transcript",
      };
    })
    .filter((x) => x.url);
}
export function parseClock(value) {
  let m = String(value)
    .trim()
    .replace(",", ".")
    .match(/^(?:(\d+):)?(\d{1,2}):(\d{2}(?:\.\d+)?)$/);
  if (!m) return null;
  let ms = Math.round(
    (Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000,
  );
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}
function timed(lines) {
  let segments = [],
    start = null,
    end = null,
    text = [];
  let flush = () => {
    if (start !== null && end !== null && end > start && text.join(" ").trim())
      segments.push({
        id: `seg-${segments.length + 1}`,
        startMs: start,
        endMs: end,
        speaker: text.join(" ").match(/<v\s+([^>]+)>/i)?.[1],
        text: text
          .join(" ")
          .replace(/<[^>]+>/g, "")
          .trim(),
      });
    start = end = null;
    text = [];
  };
  for (let line of lines) {
    let match = line.match(
      /(\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{1,3}\s*-->\s*(?:(\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{1,3})/,
    );
    if (match) {
      flush();
      let [left, right] = line
        .split("-->")
        .map((x) => x.trim().split(/\s+/)[0]);
      start = parseClock(left);
      end = parseClock(right);
    } else if (
      line.trim() &&
      !/^\d+$/.test(line.trim()) &&
      !/^WEBVTT/i.test(line)
    )
      text.push(line.trim());
    else if (!line.trim()) flush();
  }
  flush();
  return segments;
}
export function parseVtt(source) {
  return timed(
    String(source)
      .replace(/^WEBVTT[^\n]*\n?/i, "")
      .split(/\r?\n/),
  );
}
export function parseSrt(source) {
  return timed(String(source).split(/\r?\n/));
}
export function parseJsonTranscript(source) {
  const data = typeof source === "string" ? JSON.parse(source) : source,
    rows = Array.isArray(data) ? data : data.segments || data.transcript || [];
  const clock = (row, ms, keys) => {
    if (row[ms] !== undefined) return row[ms] === null ? null : Number(row[ms]);
    const value = keys.map((k) => row[k]).find((v) => v !== undefined);
    if (value === undefined || value === null) return null;
    return typeof value === "string" && value.includes(":")
      ? parseClock(value)
      : Number(value) * 1000;
  };
  return rows
    .map((row, i) => ({
      id: String(row.id || `seg-${i + 1}`),
      startMs: clock(row, "startMs", [
        "startTime",
        "start_time",
        "start",
        "offset",
      ]),
      endMs: clock(row, "endMs", ["endTime", "end_time", "end"]),
      text: decode(row.text || row.content || ""),
      speaker: row.speaker || row.speaker_label,
    }))
    .filter((x) => x.text);
}
const htmlText = (value) =>
  decode(
    String(value || "")
      .replace(/<(script|style|nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  );

// Captivate's publisher transcript pages express each cue as a nearby
// <cite>, <time>, <p> sequence. Preserve only timestamps that the publisher
// supplied and derive a cue end only from the next source cue. The final cue
// has no publisher end boundary, so it is intentionally excluded rather than
// extended to the RSS duration. This is not speech-to-text alignment.
export function parseHtmlTranscript(source, { durationMs = null } = {}) {
  const body = String(source || "");
  const events = [...body.matchAll(/<(cite|time|p)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)];
  let speaker = null;
  let startMs = null;
  const cues = [];
  for (const match of events) {
    const tag = match[1].toLowerCase();
    const text = htmlText(match[2]);
    if (tag === "cite") {
      speaker = text || null;
      continue;
    }
    if (tag === "time") {
      startMs = parseClock(text);
      continue;
    }
    if (startMs !== null && text) {
      cues.push({
        id: `seg-${cues.length + 1}`,
        startMs,
        endMs: null,
        text,
        speaker,
      });
      startMs = null;
    }
  }
  const timed = cues
    .slice(0, -1)
    .map((cue, index) => ({
      ...cue,
      endMs: cues[index + 1].startMs,
    }))
    .filter((cue) => Number.isFinite(cue.startMs) && Number.isFinite(cue.endMs) && cue.endMs > cue.startMs);
  return timed;
}

export function parseTranscript(source, type = "text/plain", options = {}) {
  let kind = type.toLowerCase(),
    body = String(source);
  if (kind.includes("vtt")) return parseVtt(body);
  if (kind.includes("subrip") || kind.includes("srt")) return parseSrt(body);
  if (kind.includes("json")) return parseJsonTranscript(body);
  if (kind.includes("html")) {
    const timed = parseHtmlTranscript(body, options);
    if (timed.length) return timed;
  }
  let text = kind.includes("html") ? htmlText(body) : body.trim();
  return text
    ? [{ id: "seg-1", startMs: null, endMs: null, text: decode(text) }]
    : [];
}
export function assessTranscript({
  segments,
  durationMs = null,
  language = "und",
}) {
  let usable = segments.filter((s) => s.text?.trim()),
    hasTiming = usable.some(
      (s) =>
        (s.startMs !== null && s.startMs !== undefined) ||
        (s.endMs !== null && s.endMs !== undefined),
    ),
    timedSegments = usable.filter(
      (s) =>
        Number.isFinite(s.startMs) &&
        Number.isFinite(s.endMs) &&
        s.endMs > s.startMs &&
        s.startMs >= 0 &&
        (!durationMs || s.endMs <= durationMs + 1000),
    ),
    monotonic = timedSegments.every(
      (s, i) =>
        !i ||
        (s.startMs >= timedSegments[i - 1].startMs &&
          s.endMs > timedSegments[i - 1].endMs),
    ),
    coverage =
      durationMs && timedSegments.length
        ? (timedSegments.at(-1).endMs - timedSegments[0].startMs) / durationMs
        : null;
  let readiness =
    !usable.length ||
    (hasTiming &&
      (!timedSegments.length ||
        !monotonic ||
        usable.some(
          (s) =>
            ((s.startMs !== null && s.startMs !== undefined) ||
              (s.endMs !== null && s.endMs !== undefined)) &&
            !timedSegments.includes(s),
        )))
      ? TranscriptReadiness.UNUSABLE
      : timedSegments.length === usable.length &&
          (!coverage || coverage >= 0.65)
        ? TranscriptReadiness.FULLY_READY
        : timedSegments.length
          ? TranscriptReadiness.PARTIAL
          : TranscriptReadiness.TEXT_ONLY;
  return {
    readiness,
    language,
    segmentCount: usable.length,
    timestampedSegmentCount: timedSegments.length,
    coverage:
      coverage === null
        ? null
        : Number(Math.max(0, Math.min(1, coverage)).toFixed(3)),
    speakerLabels: usable.filter((s) => s.speaker).length,
    reason:
      readiness === TranscriptReadiness.TEXT_ONLY
        ? "Publisher text has no verified timestamps."
        : readiness === TranscriptReadiness.PARTIAL
          ? "Publisher transcript has incomplete timing coverage."
          : readiness === TranscriptReadiness.UNUSABLE
            ? "Publisher transcript is empty or malformed."
            : "Publisher transcript is suitable for timestamped intelligence.",
  };
}
export async function fetchPublisherTranscript(
  ref,
  { fetchImpl = null, durationMs = null } = {},
) {
  const initial = safeTranscriptUrl(ref.url);
  if (!initial)
    throw Error("Transcript URL must be a permitted public HTTPS address.");
  let source, type, url;
  if (fetchImpl) {
    const response = await fetchImpl(initial, {
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw Error("Publisher transcript is unavailable.");
    source = await response.text();
    type = ref.type || response.headers.get("content-type");
    url = response.url || initial.href;
  } else {
    const result = await fetchPublicText(initial, MAX_TRANSCRIPT_BYTES);
    source = result.text;
    type = ref.type || result.type;
    url = result.url;
  }
  if (Buffer.byteLength(source) > MAX_TRANSCRIPT_BYTES)
    throw Error("Publisher transcript exceeds the size limit.");
  type = (type || "text/plain").split(";")[0];
  const segments = parseTranscript(source, type, { durationMs }).map((segment) => ({
    ...segment,
    topics: [],
    entities: [],
    contentType: "conversation",
  }));
  const transcriptVersion = createHash("sha256")
    .update(JSON.stringify(segments))
    .digest("hex");
  return {
    id: "transcript-" + transcriptVersion,
    transcriptVersion,
    sourceType: "publisher_rss",
    parserVersion: PUBLISHER_TRANSCRIPT_PARSER_VERSION,
    sourceUri: url,
    originalFormat: type,
    language: ref.language || "und",
    acquiredAt: new Date().toISOString(),
    segments,
    quality: assessTranscript({
      segments,
      durationMs,
      language: ref.language || "und",
    }),
  };
}
