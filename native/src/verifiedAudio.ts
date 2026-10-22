import { File, Paths } from "expo-file-system";
import * as Crypto from "expo-crypto";
import { fetch as streamFetch } from "expo/fetch";
import { verifyAudioRanges } from "./verifiedAudioRanges.mjs";
import { listenerRequest, type SkipStatus } from "./listenerApi";
import type { Source } from "./PlaybackProvider";
import { localPrivacyState } from "./localStorage";

// Legacy exact-file fallback only; range-pinned streams have no source-size cap.
const maximumBytes = 32 * 1024 * 1024;
type VerifiedSource = { uri: string; fingerprint: string; headers?: Record<string, string> };
const copies = new Map<string, { uri: string; fingerprint: string }>();
let swept = false;
const inflight = new Map<string, Promise<VerifiedSource | null>>();
/** A bounded private playback cache, never an audio proxy or second player. */
export function verifiedPlaybackCopy(source: Source): Promise<VerifiedSource | null> {
  const key = `${source.feedUrl}:${source.episodeId}:${source.url}:${localPrivacyState().revision}`;
  if (!inflight.has(key)) inflight.set(key, prepareCopy(source).finally(() => inflight.delete(key)));
  return inflight.get(key)!;
}
async function prepareCopy(source: Source): Promise<VerifiedSource | null> {
  const privacy = localPrivacyState();
  if (!source.feedUrl || privacy.paused) return null;
  let file: File | null = null;
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 12_000);
  let matchFailure = "BOUNDED_PROOF_UNAVAILABLE";
  const reportFailure = () => listenerRequest("/api/skips/status", { feedUrl: source.feedUrl, episodeId: source.episodeId, audioUrl: source.url, audioMatchCode: matchFailure }).catch(() => null);
  try {
    if (!swept) {
      swept = true;
      // On process start the player restores the publisher URL, never a stale
      // local URI. Remove only this module's previous private copies.
      for (const item of Paths.cache.list()) if (item instanceof File && /^radiostar-verified-[a-f0-9]{64}\.audio$/.test(item.name)) item.delete();
    }
    let statusTimer: ReturnType<typeof setTimeout> | undefined;
    const status = await Promise.race([
      listenerRequest("/api/skips/status", { feedUrl: source.feedUrl, episodeId: source.episodeId, audioUrl: source.url }),
      new Promise<never>((_, reject) => { statusTimer = setTimeout(() => reject(Error("Optional Ad Skip lookup timed out")), 2000); }),
    ]).finally(() => clearTimeout(statusTimer)) as SkipStatus;
    const variant = status.variant;
    if (!status.pilotEnabled || !status.preferenceEnabled || !variant || !/^[a-f0-9]{64}$/.test(variant.audioVariantFingerprint) || !variant.contentLength) return null;
    if (variant.windows?.length) {
      try {
        const pinned = await verifyAudioRanges(variant, { fetcher: streamFetch as typeof fetch, nonce: Crypto.randomUUID(), signal: abort.signal, digest: async bytes => {
          const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
          return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
        } });
        if (localPrivacyState().paused || privacy.revision !== localPrivacyState().revision) return null;
        return pinned;
      } catch (error) { matchFailure = error instanceof Error ? error.message : "AUDIO_MATCH_FAILED"; }
    }
    if (variant.contentLength > maximumBytes || abort.signal.aborted) { void reportFailure(); return null; }
    const fingerprint = variant.audioVariantFingerprint;
    file = new File(Paths.cache, `radiostar-verified-${fingerprint}.audio`);
    if (!file.exists) {
      const task = File.createDownloadTask(source.url, file, { signal: abort.signal, headers: variant.etag ? { "If-Match": variant.etag } : {}, onProgress: progress => { if (progress.bytesWritten > maximumBytes || progress.totalBytes > maximumBytes) abort.abort(); } });
      if (!await task.downloadAsync()) return null;
    }
    if (file.size !== variant.contentLength || file.size > maximumBytes) throw Error("Audio size mismatch");
    if (localPrivacyState().paused || privacy.revision !== localPrivacyState().revision) throw Error("Listener profile changed");
    const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, await file.bytes());
    const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    if (localPrivacyState().paused || privacy.revision !== localPrivacyState().revision) throw Error("Listener profile changed");
    if (actual !== fingerprint) throw Error("Audio variant changed");
    const copy = { uri: file.uri, fingerprint };
    copies.delete(fingerprint); copies.set(fingerprint, copy);
    // Keep at most two verified copies. Never touch publisher/user downloads.
    if (copies.size > 2) { const first = copies.keys().next().value!; const old = copies.get(first)!; copies.delete(first); try { new File(old.uri).delete(); } catch {} }
    return copy;
  } catch {
    matchFailure = "AUDIO_MATCH_FAILED";
    void reportFailure();
    try { if (file?.exists) file.delete(); } catch {}
    return null; // Normal publisher playback always remains available.
  } finally { clearTimeout(timeout); }
}
