/** Bounded proof for an If-Match-pinned stream. No full response is buffered. */
export async function verifyAudioRanges(variant, { fetcher = fetch, digest, nonce, signal }) {
  const { deliveryUrl, etag, contentLength, windows } = variant;
  const url = new URL(deliveryUrl);
  if (url.protocol !== "https:" || url.username || url.password || !/^"[^"\r\n]+"$/.test(etag || "") || !Number.isSafeInteger(contentLength) || contentLength < 1 || !Array.isArray(windows) || !windows.length || windows.length > 17) throw Error("RANGE_PROOF_UNAVAILABLE");
  const request = async (headers, inspect) => {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) controller.abort();
    const timeout = setTimeout(cancel, 5000);
    try {
      const response = await fetcher(deliveryUrl, { headers: { "Accept-Encoding": "identity", ...headers }, redirect: "error", signal: controller.signal });
      if (response.redirected || (response.url && response.url !== deliveryUrl)) throw Error("AUDIO_REDIRECT_CHANGED");
      return await inspect(response);
    } finally { clearTimeout(timeout); signal?.removeEventListener("abort", cancel); controller.abort(); }
  };
  // Some CDNs ignore If-Match. Never stream their audio as an exact variant.
  await request({ "If-Match": `"radiostar-must-not-match-${nonce}"`, Range: "bytes=0-0" }, response => {
    if (response.status !== 412) throw Error("AUDIO_PRECONDITION_UNSUPPORTED");
  });
  for (const window of windows) {
    const { start, end, sha256 } = window;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end >= contentLength || end - start >= 65536 || !/^[a-f0-9]{64}$/.test(sha256)) throw Error("INVALID_AUDIO_WITNESS");
    await request({ "If-Match": etag, Range: `bytes=${start}-${end}` }, async response => {
      if (response.status !== 206 || response.headers.get("etag") !== etag || response.headers.get("content-range") !== `bytes ${start}-${end}/${contentLength}` || ![null, "identity"].includes(response.headers.get("content-encoding"))) throw Error("AUDIO_VARIANT_CHANGED");
      const declared = response.headers.get("content-length");
      if (declared !== null && Number(declared) !== end - start + 1) throw Error("AUDIO_RANGE_SIZE_MISMATCH");
      const reader = response.body?.getReader();
      if (!reader) throw Error("BOUNDED_STREAM_UNAVAILABLE");
      const buffer = new Uint8Array(end - start + 1);
      let offset = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (offset + value.byteLength > buffer.byteLength) throw Error("AUDIO_RANGE_SIZE_MISMATCH");
          buffer.set(value, offset); offset += value.byteLength;
        }
      } finally { await reader.cancel().catch(() => {}); }
      if (offset !== buffer.byteLength) throw Error("AUDIO_RANGE_SIZE_MISMATCH");
      const bytes = buffer.buffer;
      if (bytes.byteLength !== end - start + 1 || await digest(bytes) !== sha256) throw Error("AUDIO_WITNESS_MISMATCH");
    });
  }
  return { uri: deliveryUrl, headers: { "If-Match": etag, "Accept-Encoding": "identity" }, fingerprint: variant.audioVariantFingerprint };
}
