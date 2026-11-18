import { mkdtemp, rm, readFile, statfs, mkdir, readdir, lstat, writeFile } from "node:fs/promises";
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
export const TRANSCRIPTION_ASSEMBLY_VERSION = "chunk-boundaries-v3";
export const AUDIO_STAGING_VERSION = 'disk-staging-v1';
export async function initialiseAudioStaging(root) {
  await mkdir(root,{recursive:true,mode:0o700});
  // Only owned staging directories with an explicit dead-process marker are
  // disposable. Never follow symlinks or scan the database/backup directory.
  for (const entry of (await readdir(root,{withFileTypes:true})).slice(0,200)) {
    if (!entry.isDirectory() || !/^starcast-audio-[A-Za-z0-9]+$/.test(entry.name)) continue;
    const directory=join(root,entry.name);let info;try{info=await lstat(directory);}catch(error){if(error.code==='ENOENT')continue;throw error;}
    if (Date.now()-info.mtimeMs<2*3600000) continue;
    let owner;try { owner=JSON.parse(await readFile(join(directory,'owner.json'),'utf8')); } catch { continue; }
    if (owner.kind!==AUDIO_STAGING_VERSION || !Number.isSafeInteger(owner.pid) || owner.pid<1) continue;
    try { process.kill(owner.pid,0); } catch(error) { if(error.code==='ESRCH')await rm(directory,{recursive:true,force:true}); }
  }
}
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
export async function prepareAudio(audioUrl, maxSeconds, { signal, download = downloadPublicAudio, stagingRoot=process.env.STARCAST_AUDIO_TEMP_DIR || tmpdir(), diskInfo=statfs } = {}) {
  if (!Number.isFinite(maxSeconds) || maxSeconds <= 0 || maxSeconds > 14400) throw Error('Invalid audio processing duration limit.');
  if (!publicUrl(audioUrl))
    throw Error("A public HTTPS audio source is required.");
  if(stagingRoot!==tmpdir())await initialiseAudioStaging(stagingRoot);
  const directory = await mkdtemp(join(stagingRoot, "starcast-audio-")),
    path = join(directory, "source.audio");
  try {
    // Full canonical transcription is an explicit, separately budgeted job.
    // Allow four hours up to 512 kb/s plus tags, with a 1 GiB disk ceiling.
    // Ad-only acquisition never enters this whole-source path.
    const maximumBytes = Math.min(1024 ** 3, Math.ceil(maxSeconds * 64000) + 8 * 1024 ** 2);
    await writeFile(join(directory,'owner.json'),JSON.stringify({kind:AUDIO_STAGING_VERSION,pid:process.pid}),{mode:0o600});
    const disk = await diskInfo(directory);
    if (disk.bavail * disk.bsize < maximumBytes + 512 * 1024 ** 2)
      throw Object.assign(Error("Insufficient temporary audio capacity."), { code: "AUDIO_STAGING_CAPACITY" });
    signal?.throwIfAborted();
    const delivery = await download(audioUrl, path, maximumBytes, { signal });
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
      { timeout: 30_000, signal },
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
          { timeout: 120_000, signal },
        );
        try { return await toFile(await readFile(output), "chunk.mp3", { type: "audio/mpeg" }); }
        finally { await rm(output, { force: true }); }
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
  shouldYield = () => false,
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
    let newChunks = 0;
    for (const part of plan) {
      signal?.throwIfAborted();
      const key = checkpointPrefix && `${checkpointPrefix}:${model}:${durationMs}:${part.index}`;
      const saved = key && checkpointStore?.get("transcription-checkpoint", key);
      if (saved?.state === "SENDING") throw Object.assign(Error("The transcription provider outcome is unknown; automatic replay is blocked."), { code: "PROVIDER_OUTCOME_UNKNOWN" });
      let response = saved?.response;
      if (!response) {
        const seconds = Math.ceil((part.endMs - part.startMs) / 1000);
        const capacity = ledger.capacity({ usd: seconds * 0.0001, seconds, kind: "transcription" });
        if (!capacity.available) throw Object.assign(Error(capacity.reason === "DAILY_AUDIO" ? "The daily transcription duration budget has been reached." : "The intelligence budget has been reached."), { code: "BUDGET_LIMIT", capacity });
        const file = await chunkFactory(part);
        signal?.throwIfAborted();
        beforePaid();
        // Re-evaluate expiring controls before every paid chunk. The source
        // cap applies to the full episode; daily usage includes chunk overlap.
        if (durationMs > ledger.controls.maxEpisodeSeconds * 1000) throw Error("This episode is longer than the current audio processing limit.");
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
          newChunks++;
        } catch (error) {
          // An explicit rate-limit rejection is not an unknown paid outcome.
          // Timeouts, transport loss and server errors remain conservative.
          if (error.status === 429) {
            const cancel = () => { ledger.cancel(id); if (key) checkpointStore?.delete("transcription-checkpoint", key); };
            if (checkpointStore) checkpointStore.transaction(cancel); else cancel();
            throw Object.assign(Error("Transcription provider rate limited the request."), { code: "PROVIDER_RATE_LIMIT", retryable: true });
          }
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
        // The final Whisper segment can extend slightly past a bounded input
        // (observed 2.080 s on a verified 1,200 s chunk). Only a terminal
        // segment starting in the final 15 s may use the 3 s drift allowance.
        // Clip to the independently measured chunk extent and preserve the
        // original timestamp. Nonterminal, larger and negative drift fail.
        const terminalDrift = i === response.segments.length-1 &&
          startMs >= part.endMs-15000 && observedEndMs <= part.endMs+3000;
        if (!Number.isFinite(startMs) || !Number.isFinite(observedEndMs) || startMs < part.startMs ||
            startMs > part.endMs || (observedEndMs > part.endMs && !terminalDrift) || observedEndMs <= startMs)
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
      const next = plan[part.index + 1];
      onProgress({ completedChunks: part.index + 1, totalChunks: plan.length, completedSourceMs: part.endMs, sourceDurationMs: durationMs,
        nextChunkSeconds: next ? Math.ceil((next.endMs - next.startMs) / 1000) : 0 });
      if (next && newChunks >= 2 && shouldYield()) throw Object.assign(Error("Checkpoint saved; another queued episode will receive processing capacity."), { code: "PROCESSING_YIELD" });
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
