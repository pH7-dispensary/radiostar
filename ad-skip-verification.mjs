import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpeg from "ffmpeg-static";
import ffprobe from "ffprobe-static";
import { prepareAudio } from "./transcription.mjs";

const exec = promisify(execFile);
const boundaryWindowMs = 1_500;
export const adSkipAudioVerificationVersion = "automatic-opening-v4";
// Coarse transcript boundaries need not coincide with a pause within 650 ms.
// Search at most three seconds INSIDE the candidate. Never extend its span,
// relax the silence threshold, or trim more than a third from either side.
const maximumInwardTrimMs = 3_000;

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

// Byte witnesses are bounded, not a proportional seek guess. A strong HTTP
// precondition pins the *whole* streamed representation; these hashes also
// check that the enclosure serves the bytes inspected at the ad boundaries.
async function byteWitnesses(path, candidates) {
  const size = (await stat(path)).size;
  const offsets = new Set([0]);
  for (const candidate of candidates.filter(row => row.boundaryVerified).slice(0, 8)) {
    for (const ms of [candidate.startMs, candidate.endMs]) {
      const { stdout } = await exec(ffprobe.path, ["-v", "error", "-protocol_whitelist", "file,pipe", "-read_intervals", `${Math.max(0, ms / 1000 - 1)}%+2`, "-select_streams", "a:0", "-show_entries", "packet=pos", "-of", "json", path], { timeout: 15000, maxBuffer: 256000 });
      const pos = Number(JSON.parse(stdout).packets?.find(row => /^\d+$/.test(row.pos))?.pos);
      if (Number.isSafeInteger(pos) && pos >= 0 && pos < size) offsets.add(Math.max(0, pos - 1024));
    }
  }
  const file = await open(path, "r");
  try {
    const windows = [];
    for (const start of offsets) {
      const bytes = Buffer.alloc(Math.min(65536, size - start));
      const read = await file.read(bytes, 0, bytes.length, start);
      if (read.bytesRead !== bytes.length) throw Error("Audio witness was truncated");
      windows.push({ start, end: start + bytes.length - 1, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
    return windows;
  } finally { await file.close(); }
}

const parseSilence = (output) => {
  const marks = [];
  for (const match of output.matchAll(/silence_(start|end):\s*([0-9.]+)/g))
    marks.push({ kind: match[1], ms: Math.round(Number(match[2]) * 1000) });
  return marks.filter((mark) => Number.isFinite(mark.ms));
};

async function boundaryEvidence(path, boundaryMs, durationMs, side, inwardTrimMs) {
  const startMs = Math.max(0, boundaryMs - (side === "end" ? inwardTrimMs : boundaryWindowMs));
  const windowMs = Math.min(durationMs - startMs, inwardTrimMs + boundaryWindowMs);
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
  if (!closest || Math.abs(closest.absoluteMs - boundaryMs) > inwardTrimMs)
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

async function openingBoundaryEvidence(path, candidate, hash) {
  const review = candidate.independentReview;
  const reviewed = Boolean(review);
  const automatic = !reviewed && candidate.automaticOpeningEvidence?.version==='commercial-opening-v1' && candidate.qualifiesForAudioVerification===true;
  if (!candidate.openingBreak || candidate.startMs!==0 || !Number.isFinite(candidate.endMs) || !Number.isFinite(candidate.nextSpeechMs) || candidate.endMs<=0 || candidate.endMs>240000) return null;
  if (reviewed && (review.independent!==true || review.audioContentHash!==hash || !review.chainHash || review.startMs!==0 || Math.abs(review.endMs-candidate.endMs)>1500 || review.endMs>=candidate.nextSpeechMs)) return null;
  if (!reviewed && !automatic) return null;
  const proposedEnd = reviewed ? review.endMs : candidate.endMs;
  // A file starts at zero without needing silence. At the other edge require
  // the cut to lie INSIDE an observed silent pause. Machine verification never
  // trims final advert words or crosses into the next editorial speech.
  const start = Math.max(0, proposedEnd-1500), finish = Math.min(candidate.nextSpeechMs, proposedEnd+1500);
  const {stderr} = await exec(ffmpeg,['-nostdin','-v','info','-i',path,'-af',`atrim=start=${start/1000}:end=${finish/1000},asetpts=PTS-STARTPTS,silencedetect=noise=-42dB:d=0.12`,'-f','null','-'],{timeout:45000,maxBuffer:256000});
  let silenceStart=null, pause=null;
  for (const mark of parseSilence(stderr)) {
    if (mark.kind==='start') silenceStart=start+mark.ms;
    else if (silenceStart!==null && silenceStart<=proposedEnd && start+mark.ms>=proposedEnd) pause={startMs:silenceStart,endMs:start+mark.ms};
  }
  if (!pause) return null;
  const endMs = reviewed ? proposedEnd : Math.round(Math.max(proposedEnd,(pause.startMs+pause.endMs)/2));
  if (!reviewed && (pause.endMs-pause.startMs<200 || endMs+300>=candidate.nextSpeechMs || endMs>candidate.endMs+1500)) return null;
  const fingerprints=[];
  for (const ms of [0,Math.max(0,endMs-250)]) {
    const {stdout}=await exec(ffmpeg,['-nostdin','-v','error','-i',path,'-af',`atrim=start=${ms/1000}:end=${(ms+500)/1000}`,'-ac','1','-ar','8000','-f','s16le','-'],{encoding:'buffer',timeout:45000,maxBuffer:64000});
    if(stdout.length!==8000)return null;
    fingerprints.push(createHash('sha256').update(stdout).digest('hex'));
  }
  return {id:candidate.id,boundaryVerified:true,startMs:0,endMs,approvalSource:reviewed?'HUMAN_REVIEW_PLUS_AUDIO':'AUTOMATED_AUDIO_VERIFICATION',acousticPause:pause,detectedEndMs:candidate.endMs,boundaryFingerprint:createHash('sha256').update(fingerprints.join(':')).digest('hex')};
}

/**
 * Derives evidence from the actual bytes delivered by an authorised publisher
 * enclosure.  This deliberately has no URL-hash fallback: a weak/missing
 * validator or a non-silent boundary leaves the interval unverified.
 */
export async function verifyAdSkipAudio({ audioUrl, candidates, maxSeconds, expectedContentHash, preparedAudio = null, audioFactory = prepareAudio }) {
  if (!/^[a-f0-9]{64}$/.test(expectedContentHash || "")) return { state: "UNAVAILABLE", reason: "The transcript has not been aligned to these exact audio bytes. Automatic skipping remains off.", candidates: [] };
  const audio = preparedAudio || await audioFactory(audioUrl, maxSeconds);
  try {
    const etag = audio.delivery?.headers?.etag || null;
    const streamSafe = strongEtag(etag) && !/(?:^|,)\s*(?:user-agent|cookie|authorization)\s*(?:,|$)/i.test(String(audio.delivery?.headers?.vary || ""));
    const audioVariantFingerprint = await contentFingerprint(audio.path);
    if (!expectedContentHash || expectedContentHash !== audioVariantFingerprint)
      return { state: "DYNAMIC_VARIANT", reason: "The transcript is not bound to these exact audio bytes. Independent alignment is required before automatic skipping.", candidates: [] };
    const verified = [];
    for (const candidate of candidates) {
      if (candidate.openingBreak) {
        verified.push(await openingBoundaryEvidence(audio.path,candidate,audioVariantFingerprint) || {id:candidate.id,boundaryVerified:false,code:'COMPLETE_BREAK_AUDIO_EVIDENCE_INSUFFICIENT'});
        continue;
      }
      const inwardTrimMs = Math.min(maximumInwardTrimMs, Math.floor((candidate.endMs - candidate.startMs) / 3));
      if (!Number.isFinite(inwardTrimMs) || inwardTrimMs <= 0) { verified.push({id:candidate.id,boundaryVerified:false,code:"INVALID_CANDIDATE_BOUNDARIES"}); continue; }
      const [start, end] = await Promise.all([
        boundaryEvidence(audio.path, candidate.startMs, audio.durationMs, "start", inwardTrimMs),
        boundaryEvidence(audio.path, candidate.endMs, audio.durationMs, "end", inwardTrimMs),
      ]);
      if (!start || !end) {
        verified.push({ id: candidate.id, boundaryVerified: false, code: !start && !end ? "BOTH_BOUNDARIES_UNCERTAIN" : !start ? "START_BOUNDARY_UNCERTAIN" : "END_BOUNDARY_UNCERTAIN" });
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
    let windows = [];
    // Unsupported container packet indexing must not invalidate otherwise
    // safe exact-file playback. It just leaves bounded streaming unavailable.
    try { if (streamSafe) windows = await byteWitnesses(audio.path, verified); } catch {}
    return {
      state: "READY",
      variant: {
        requestedAudioUrl: audioUrl,
        deliveryUrl: audio.delivery.url,
        etag,
        contentLength: Number(audio.delivery.headers?.contentLength) || null,
        audioVariantFingerprint,
        durationMs: audio.durationMs,
        windows,
      },
      candidates: verified,
    };
  } finally {
    if (!preparedAudio) await audio.cleanup();
  }
}
