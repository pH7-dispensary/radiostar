import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpeg from "ffmpeg-static";
import { prepareAudio } from "./transcription.mjs";

const exec = promisify(execFile);
const boundaryWindowMs = 1_500;
const boundaryToleranceMs = 650;

const strongEtag = (value) =>
  typeof value === "string" && /^"[^"\r\n]+"$/.test(value.trim());

const contentFingerprint = (path) =>
  new Promise((resolve, reject) => {
    const digest = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => digest.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(digest.digest("hex")));
  });

const parseSilence = (output) => {
  const marks = [];
  for (const match of output.matchAll(/silence_(start|end):\s*([0-9.]+)/g))
    marks.push({ kind: match[1], ms: Math.round(Number(match[2]) * 1000) });
  return marks.filter((mark) => Number.isFinite(mark.ms));
};

async function boundaryEvidence(path, boundaryMs, durationMs, side) {
  const startMs = Math.max(0, boundaryMs - boundaryWindowMs);
  const windowMs = Math.min(durationMs - startMs, boundaryWindowMs * 2);
  if (windowMs <= 0) return null;
  const { stdout, stderr } = await exec(
    ffmpeg,
    [
      "-nostdin",
      "-v",
      "info",
      "-ss",
      String(startMs / 1000),
      "-i",
      path,
      "-t",
      String(windowMs / 1000),
      "-vn",
      "-af",
      "silencedetect=noise=-42dB:d=0.12",
      "-f",
      "null",
      "-",
    ],
    { timeout: 45_000, maxBuffer: 256_000 },
  );
  const closest = parseSilence(`${stdout}\n${stderr}`)
    .map((mark) => ({ ...mark, absoluteMs: startMs + mark.ms }))
    .filter((mark) => side === "start" ? mark.absoluteMs >= boundaryMs : mark.absoluteMs <= boundaryMs)
    .sort((a, b) => Math.abs(a.absoluteMs - boundaryMs) - Math.abs(b.absoluteMs - boundaryMs))[0];
  if (!closest || Math.abs(closest.absoluteMs - boundaryMs) > boundaryToleranceMs)
    return null;
  const clipStartMs = Math.max(0, closest.absoluteMs - 250);
  const { stdout: pcm } = await exec(
    ffmpeg,
    [
      "-nostdin",
      "-v",
      "error",
      "-ss",
      String(clipStartMs / 1000),
      "-i",
      path,
      "-t",
      "0.5",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "8000",
      "-f",
      "s16le",
      "pipe:1",
    ],
    { timeout: 45_000, encoding: "buffer", maxBuffer: 64_000 },
  );
  if (!Buffer.isBuffer(pcm) || pcm.length < 4_000) return null;
  return {
    boundaryMs: closest.absoluteMs,
    fingerprint: createHash("sha256").update(pcm).digest("hex"),
  };
}

/**
 * Derives evidence from the actual bytes delivered by an authorised publisher
 * enclosure.  This deliberately has no URL-hash fallback: a weak/missing
 * validator or a non-silent boundary leaves the interval unverified.
 */
export async function verifyAdSkipAudio({ audioUrl, candidates, maxSeconds, expectedContentHash, audioFactory = prepareAudio }) {
  if (!/^[a-f0-9]{64}$/.test(expectedContentHash || "")) return { state: "UNAVAILABLE", reason: "The transcript has not been aligned to these exact audio bytes. Automatic skipping remains off.", candidates: [] };
  const audio = await audioFactory(audioUrl, maxSeconds);
  try {
    const etag = audio.delivery?.headers?.etag || null;
    if (
      !strongEtag(etag) ||
      /(?:^|,)\s*(?:user-agent|cookie|authorization)\s*(?:,|$)/i.test(
        String(audio.delivery?.headers?.vary || ""),
      )
    )
      return {
        state: "DYNAMIC_VARIANT",
        reason: "The publisher delivery has no strong, stable audio-variant validator.",
        candidates: [],
      };
    const audioVariantFingerprint = await contentFingerprint(audio.path);
    if (!expectedContentHash || expectedContentHash !== audioVariantFingerprint)
      return { state: "DYNAMIC_VARIANT", reason: "The transcript is not bound to these exact audio bytes. Independent alignment is required before automatic skipping.", candidates: [] };
    const verified = [];
    for (const candidate of candidates) {
      const [start, end] = await Promise.all([
        boundaryEvidence(audio.path, candidate.startMs, audio.durationMs, "start"),
        boundaryEvidence(audio.path, candidate.endMs, audio.durationMs, "end"),
      ]);
      if (!start || !end) {
        verified.push({ id: candidate.id, boundaryVerified: false });
        continue;
      }
      verified.push({
        id: candidate.id,
        boundaryVerified: true,
        startMs: start.boundaryMs,
        endMs: end.boundaryMs,
        boundaryFingerprint: createHash("sha256")
          .update(`${start.fingerprint}:${end.fingerprint}`)
          .digest("hex"),
      });
    }
    return {
      state: "READY",
      variant: {
        requestedAudioUrl: audioUrl,
        deliveryUrl: audio.delivery.url,
        etag,
        contentLength: Number(audio.delivery.headers?.contentLength) || null,
        audioVariantFingerprint,
        durationMs: audio.durationMs,
      },
      candidates: verified,
    };
  } finally {
    await audio.cleanup();
  }
}
