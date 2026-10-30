// Only a native witness from the current AVPlayer item may attach a prefix.
// Probe fetches and cached analysis bytes are deliberately not accepted here.
export async function matchDeliveredPrefix(variant, { match, matchChain, current }) {
  const proof = variant?.windowProof;
  if(proof?.version==='delivered-chain-v1') {
    if(typeof matchChain!=='function'||!current()||!Number.isSafeInteger(proof.byteStart)||proof.byteStart<0||proof.byteStart%65536||!Number.isSafeInteger(proof.byteLength)||proof.byteLength<1||proof.byteLength>8*1024*1024||proof.byteEnd!==proof.byteStart+proof.byteLength||proof.byteEnd>2*1024**3||proof.blockBytes!==65536||!Number.isFinite(proof.coverageStartMs)||proof.coverageStartMs<0||!Number.isFinite(proof.coverageEndMs)||proof.coverageEndMs<=proof.coverageStartMs||proof.coverageEndMs-proof.coverageStartMs>180000||!/^[a-f0-9]{64}$/.test(proof.chainHash||'')||!/^[a-f0-9]{64}$/.test(proof.sha256||'')||proof.sha256!==variant.audioVariantFingerprint)return null;
    return await matchChain(proof.byteEnd,proof.chainHash)===true && current()?proof.sha256:null;
  }
  if (!proof || proof.version !== 'delivered-prefix-v1' || proof.coverageStartMs !== 0 || !Number.isFinite(proof.coverageEndMs) || proof.coverageEndMs <= 0 || proof.coverageEndMs > 180000 ||
      !Number.isSafeInteger(proof.byteLength) || proof.byteLength < 1 || proof.byteLength > 8 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/.test(proof.sha256 || '') || proof.sha256 !== variant.audioVariantFingerprint || !current()) return null;
  const matches = await match(proof.byteLength, proof.sha256);
  return matches === true && current() ? proof.sha256 : null;
}
