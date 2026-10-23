import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import ffmpeg from "ffmpeg-static";
import ffprobe from "ffprobe-static";
import { toFile } from "openai";
import { downloadPublicAudio, publicUrl } from "./safe-network.mjs";
import { assessTranscript } from "./transcripts.mjs";

const exec = promisify(execFile);
export const TRANSCRIPTION_ASSEMBLY_VERSION = "chunk-boundaries-v2";
export function planAudioSegments({
  durationMs,
  maxSegmentMs = 20 * 60_000,
  overlapMs = 1_000,
}) {
  if (!Number.isFinite(durationMs) || durationMs <= 0)
    throw Error(
      "A verified episode duration is required before transcription.",
    );
  if (maxSegmentMs <= overlapMs)
    throw Error("Audio segment configuration is invalid.");
  const plan = [];
  let startMs = 0;
  while (startMs < durationMs) {
    const endMs = Math.min(durationMs, startMs + maxSegmentMs);
    plan.push({
      index: plan.length,
      startMs,
      endMs,
      overlapMs: startMs ? overlapMs : 0,
    });
    if (endMs >= durationMs) break;
    startMs = endMs - overlapMs;
  }
  return plan;
}
export function mergeTranscriptSegments(segments) {
  const merged = [];
  for (const segment of [...segments].sort((a, b) => a.startMs - b.startMs)) {
    const text = String(segment.text || "").trim(),
      prior = merged.at(-1);
    if (
      !text ||
      !Number.isFinite(segment.startMs) ||
      !Number.isFinite(segment.endMs) ||
      segment.endMs <= segment.startMs
    )
      continue;
    if (
      prior &&
      segment.startMs < prior.endMs &&
      prior.text.toLowerCase().endsWith(text.toLowerCase())
    )
      continue;
    // Independently transcribed overlap can put a short tail from chunk N
    // inside the first segment from chunk N+1. Preserve both observations in
    // one source interval; do not invent timing or weaken the validator for
    // malformed/nested segments elsewhere in a chunk.
    if (prior && Number.isInteger(segment.chunkIndex) && Number.isInteger(prior.chunkIndex) &&
        segment.chunkIndex !== prior.chunkIndex && segment.startMs < prior.endMs && segment.endMs <= prior.endMs &&
        Math.max(segment.chunkStartMs, prior.chunkStartMs) < Math.min(segment.chunkEndMs, prior.chunkEndMs)) {
      const sources = [...(prior.overlapSources || [prior]), { ...segment, text }]
        .map(({ id, startMs, endMs, text, chunkIndex }) => ({ id, startMs, endMs, text, chunkIndex }))
        .sort((a, b) => a.chunkIndex - b.chunkIndex || a.startMs - b.startMs);
      const words = value => value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/);
      let combined = sources[0].text;
      for (const source of sources.slice(1)) {
        const left = words(combined), right = words(source.text);
        let overlap = Math.min(left.length, right.length);
        while (overlap && left.slice(-overlap).join(" ") !== right.slice(0, overlap).join(" ")) overlap--;
        combined = overlap === left.length ? source.text : combined + (overlap === right.length ? "" : " " + source.text.split(/\s+/).slice(overlap).join(" "));
      }
      prior.text = combined;
      prior.overlapSources = sources;
      prior.timestampPrecision = "overlapping_chunk_union";
      continue;
    }
    merged.push({ ...segment, text });
  }
  return merged;
}
export async function prepareAudio(audioUrl, maxSeconds) {
  if (!publicUrl(audioUrl))
    throw Error("A public HTTPS audio source is required.");
  const directory = await mkdtemp(join(tmpdir(), "starcast-audio-")),
    path = join(directory, "source.audio");
  try {
    const delivery = await downloadPublicAudio(audioUrl, path);
    const { stdout } = await exec(
      ffprobe.path,
      [
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        path,
      ],
      { timeout: 30_000 },
    );
    const durationMs = Math.ceil(
      Number(JSON.parse(stdout).format?.duration) * 1000,
    );
    if (!Number.isFinite(durationMs) || durationMs <= 0)
      throw Error("Audio duration could not be verified.");
    if (durationMs > maxSeconds * 1000)
      throw Error(
        "This episode is longer than the current audio processing limit.",
      );
    const digest = createHash("sha256");
    for await (const chunk of createReadStream(path)) digest.update(chunk);
    return {
      durationMs,
      contentHash: digest.digest("hex"),
      // These values are intentionally private to server-side processors.  A
      // caller may use them to verify an authorised audio variant, never to
      // disclose or distribute the source audio.
      path,
      delivery,
      cleanup: () => rm(directory, { recursive: true, force: true }),
      chunkFactory: async (part) => {
        const output = join(directory, "chunk-" + part.index + ".mp3");
        await exec(
          ffmpeg,
          [
            "-nostdin",
            "-v",
            "error",
            "-protocol_whitelist",
            "file,pipe",
            "-ss",
            String(part.startMs / 1000),
            "-i",
            path,
            "-t",
            String((part.endMs - part.startMs) / 1000),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-b:a",
            "48k",
            output,
          ],
          { timeout: 120_000 },
        );
        return toFile(await readFile(output), "chunk.mp3", {
          type: "audio/mpeg",
        });
      },
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
export async function transcribeOnDemand({
  episodeId,
  audioUrl,
  durationMs,
  chunkFactory,
  client,
  ledger,
  requestId,
  model = "whisper-1",
  authorised = false,
  signal,
  checkpointStore = null,
  checkpointPrefix = null,
  beforePaid = () => {},
  canPersist = () => true,
  onProgress = () => {},
}) {
  signal?.throwIfAborted();
  if (!authorised)
    throw Error("Audio transcription has not been authorised for this server.");
  if (!publicUrl(audioUrl))
    throw Error("A public HTTPS audio source is required.");
  if (model !== "whisper-1")
    throw Error(
      "A timestamp-capable, priced transcription adapter is required.",
    );
  const plan = planAudioSegments({ durationMs });
  if (durationMs > ledger.controls.maxEpisodeSeconds * 1000)
    throw Error(
      "This episode is longer than the current audio processing limit.",
    );
    const responses = [];
    for (const part of plan) {
      signal?.throwIfAborted();
      const key = checkpointPrefix && `${checkpointPrefix}:${model}:${durationMs}:${part.index}`;
      const saved = key && checkpointStore?.get("transcription-checkpoint", key);
      if (saved?.state === "SENDING") throw Object.assign(Error("The transcription provider outcome is unknown; automatic replay is blocked."), { code: "PROVIDER_OUTCOME_UNKNOWN" });
      let response = saved?.response;
      if (!response) {
        const file = await chunkFactory(part);
        signal?.throwIfAborted();
        beforePaid();
        // Re-evaluate expiring controls before every paid chunk. The source
        // cap applies to the full episode; daily usage includes chunk overlap.
        if (durationMs > ledger.controls.maxEpisodeSeconds * 1000) throw Error("This episode is longer than the current audio processing limit.");
        const seconds = Math.ceil((part.endMs - part.startMs) / 1000);
        const id = key || `${requestId}:${part.index}`;
        ledger.reserve({ id, usd: seconds * 0.0001, kind: "transcription", seconds, jobId: requestId.split(":audio")[0], episodeKey: checkpointPrefix?.split(":")[0] });
        try {
          if (key) checkpointStore?.set("transcription-checkpoint", key, { state: "SENDING", requestId: id });
          response = await client.audio.transcriptions.create({ file, model, response_format: "verbose_json", timestamp_granularities: ["segment"] }, { signal });
          const save = () => {
            if (key && canPersist()) checkpointStore?.set("transcription-checkpoint", key, { state: "READY", response, completedAt: new Date().toISOString() });
            else if (key) checkpointStore?.delete("transcription-checkpoint", key);
            ledger.reconcile(id, { usd: seconds * 0.0001, seconds });
          };
          if (checkpointStore) checkpointStore.transaction(save); else save();
        } catch (error) {
          ledger.reconcile(id, { usd: seconds * 0.0001, seconds, failed: true, uncertain: true });
          throw Object.assign(Error("The transcription provider outcome is unknown; automatic replay is blocked.", { cause: error }), { code: "PROVIDER_OUTCOME_UNKNOWN" });
        }
      }
      if (!canPersist()) throw Error("Rights permission no longer allows retaining this transcript.");
      if (!response.segments?.length)
        throw Error("Transcription returned no usable timestamped speech.");
      for (const [i, s] of response.segments.entries()) {
        if (s.no_speech_prob > 0.8 || s.avg_logprob < -1) continue;
        const startMs = part.startMs + Math.round(s.start * 1000),
          observedEndMs = part.startMs + Math.round(s.end * 1000);
        // Whisper can place its final speech segment slightly beyond the
        // submitted chunk (observed 1.2 s). Clip only bounded terminal drift
        // to the KNOWN audio extent; larger/invalid timings still fail closed.
        if (!Number.isFinite(startMs) || !Number.isFinite(observedEndMs) || startMs < part.startMs ||
            startMs > part.endMs || observedEndMs > part.endMs + 2000 || observedEndMs <= startMs)
          throw Error("Transcription timing failed validation.");
        const endMs = Math.min(durationMs, part.endMs, observedEndMs);
        if (startMs === endMs) continue;
        responses.push({
          id: part.index + "-" + i,
          startMs,
          endMs,
          ...(observedEndMs > endMs ? { timestampPrecision: "clipped_to_chunk_extent", providerEndMs: observedEndMs } : {}),
          text: s.text,
          contentType: "conversation",
          chunkIndex: part.index,
          chunkStartMs: part.startMs,
          chunkEndMs: part.endMs,
        });
      }
      onProgress({ completedChunks: part.index + 1, totalChunks: plan.length, completedSourceMs: part.endMs, sourceDurationMs: durationMs });
    }
    const segments = mergeTranscriptSegments(responses),
      quality = assessTranscript({ segments, durationMs });
    if (
      quality.readiness === "UNUSABLE" ||
      segments.reduce((n, s) => n + s.text.length, 0) < 100
    )
      throw Error("Transcription quality was insufficient.");
    const transcriptVersion = createHash("sha256")
      .update(JSON.stringify(segments))
      .digest("hex");
    return {
      id: "transcript-" + transcriptVersion,
      transcriptVersion,
      episodeId,
      sourceType: "on_demand_audio",
      sourceUri: audioUrl,
      durationMs,
      originalFormat: "verbose_json",
      audioUrl,
      model,
      language: "und",
      segments,
      quality,
      acquiredAt: new Date().toISOString(),
      processingVersion: "2.0.0",
    };
}
