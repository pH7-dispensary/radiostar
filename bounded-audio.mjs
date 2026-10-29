import { open, mkdtemp, readFile, rm, truncate } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpeg from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
import { toFile } from 'openai';
import { streamPublic } from './safe-network.mjs';

export const AD_WINDOW_SECONDS = 180;
export const AD_WINDOW_MAX_BYTES = 8 * 1024 * 1024;
const exec = promisify(execFile);

/** Prefix only: never estimate byte offsets from VBR duration or file size.
 * A 200 response is a streaming fallback, cancelled at the SAME hard ceiling.
 * The hash identifies these bytes, not the remainder of a dynamic episode.
 */
export async function acquireAudioPrefix(url, path, { maxBytes = AD_WINDOW_MAX_BYTES, signal, openStream = streamPublic } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > AD_WINDOW_MAX_BYTES) throw Error('Invalid audio window ceiling.');
  signal?.throwIfAborted();
  const result = await openStream(url, 0, [], { range: `bytes=0-${maxBytes - 1}`, signal });
  const { response } = result;
  let file;
  try {
    if (![200, 206].includes(response.statusCode) || ![undefined, 'identity'].includes(response.headers['content-encoding'])) throw Error('Unsupported audio window response.');
    const range = /^bytes 0-(\d+)\/(\d+|\*)$/.exec(response.headers['content-range'] || '');
    if (response.statusCode === 206 && (!range || Number(range[1]) >= maxBytes || (range[2] !== '*' && Number(range[1]) >= Number(range[2])))) throw Error('Publisher did not honour the audio range.');
    const declared = response.headers['content-length'];
    if (declared !== undefined && (!/^\d+$/.test(String(declared)) || Number(declared) < 1)) throw Error('Invalid audio content length.');
    if (range && declared !== undefined && Number(declared) !== Number(range[1]) + 1) throw Error('Audio range length mismatch.');
    const expected = range ? Number(range[1]) + 1 : declared === undefined ? null : Number(declared);
    const digest = createHash('sha256');
    file = await open(path, 'wx', 0o600);
    let bytes = 0;
    for await (const chunk of response) {
      signal?.throwIfAborted();
      const data = chunk.subarray(0, maxBytes - bytes);
      await file.writeFile(data); digest.update(data); bytes += data.length;
      if (range && chunk.length > data.length) throw Error('Audio range exceeded its declared extent.');
      if (bytes === maxBytes) break;
    }
    if (!bytes || (expected !== null && bytes !== Math.min(expected, maxBytes))) throw Error('Audio window was interrupted.');
    const totalBytes = range && range[2] !== '*' ? Number(range[2]) : response.statusCode === 200 && expected !== null ? expected : null;
    return { bytes, contentHash: digest.digest('hex'), completeSource: totalBytes === bytes,
      delivery: { url: result.url, headers: { etag: response.headers.etag || null, contentLength: totalBytes, contentType: response.headers['content-type'] || null },
        acquisition: { rangeHonoured: response.statusCode === 206, bytes, maxBytes, streamingFallback: response.statusCode === 200 } } };
  } finally { response.destroy(); await file?.close(); }
}

/** Decode only locally acquired bytes. No ffmpeg network access or whole-file probe. */
export async function prepareAdAudioWindow(audioUrl, { windowSeconds = AD_WINDOW_SECONDS, signal, acquire = acquireAudioPrefix } = {}) {
  if (!Number.isFinite(windowSeconds) || windowSeconds <= 0 || windowSeconds > AD_WINDOW_SECONDS) throw Error('Invalid ad analysis window.');
  const directory = await mkdtemp(join(tmpdir(), 'starcast-ad-window-')), path = join(directory, 'prefix.audio');
  const cleanup = () => rm(directory, { recursive: true, force: true });
  try {
    const source = await acquire(audioUrl, path, { signal });
    let proofBytes = source.bytes, contentHash = source.contentHash;
    if (!source.completeSource) {
      // For MP3, packet positions give an exact prefix boundary even with VBR.
      // Do not make the phone buffer eight minutes of low-bitrate audio just
      // to verify a three-minute opening. No time/byte-ratio approximation.
      const {stdout:index} = await exec(ffprobe.path,['-v','error','-protocol_whitelist','file,pipe','-select_streams','a:0',
        '-read_intervals',`%+${windowSeconds+1.5}`,'-show_entries','format=format_name:packet=pos,size','-of','json',path],
      {signal,timeout:30000,maxBuffer:4*1024*1024});
      const indexed=JSON.parse(index);
      if(indexed.format?.format_name==='mp3') {
        const ends=(indexed.packets || []).map(p=>Number(p.pos)+Number(p.size)).filter(n=>Number.isSafeInteger(n)&&n>0&&n<=source.bytes);
        if(!ends.length)throw Error('Audio window has no trustworthy MP3 packet positions.');
        proofBytes=Math.max(...ends);
        await truncate(path,proofBytes);
        const hash=createHash('sha256');for await(const bytes of createReadStream(path))hash.update(bytes);contentHash=hash.digest('hex');
      }
    }
    // Count decoded samples, not the whole-file duration in Xing/ID3 headers.
    // One extra second protects the verification boundary at the window end.
    const { stdout } = await exec(ffmpeg, ['-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', path,
      '-t', String(windowSeconds + 1), '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1'],
    { encoding: 'buffer', signal, timeout: 60000, maxBuffer: (windowSeconds + 2) * 16000 });
    const durationMs = Math.floor(stdout.length / 16);
    if (durationMs < 1000) throw Error('Audio window has no usable decoded duration.');
    return { path, durationMs, contentHash, delivery: source.delivery, cleanup,
      windowProof: { version: 'delivered-prefix-v1', byteLength: proofBytes, sha256: contentHash,
        coverageStartMs: 0, coverageEndMs: Math.min(windowSeconds * 1000, durationMs - 500) },
      completeSource: source.completeSource && durationMs < windowSeconds * 1000,
      chunkFactory: async part => {
        if (part.startMs < 0 || part.endMs > Math.min(windowSeconds * 1000, durationMs) || part.endMs <= part.startMs) throw Error('Chunk exceeds acquired audio.');
        const output = join(directory, `chunk-${part.index}.mp3`);
        await exec(ffmpeg, ['-nostdin', '-y', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-ss', String(part.startMs / 1000), '-i', path,
          '-t', String((part.endMs - part.startMs) / 1000), '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', output], { signal, timeout: 60000 });
        return toFile(await readFile(output), 'ad-window.mp3', { type: 'audio/mpeg' });
      } };
  } catch (error) { await cleanup(); throw error; }
}
