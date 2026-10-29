// Only a native witness from the current AVPlayer item may attach a prefix.
// Probe fetches and cached analysis bytes are deliberately not accepted here.
export async function matchDeliveredPrefix(variant, { match, current }) {
  const proof = variant?.windowProof;
  if (!proof || proof.version !== 'delivered-prefix-v1' || proof.coverageStartMs !== 0 || !Number.isFinite(proof.coverageEndMs) || proof.coverageEndMs <= 0 || proof.coverageEndMs > 180000 ||
      !Number.isSafeInteger(proof.byteLength) || proof.byteLength < 1 || proof.byteLength > 8 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/.test(proof.sha256 || '') || proof.sha256 !== variant.audioVariantFingerprint || !current()) return null;
  const matches = await match(proof.byteLength, proof.sha256);
  return matches === true && current() ? proof.sha256 : null;
}
