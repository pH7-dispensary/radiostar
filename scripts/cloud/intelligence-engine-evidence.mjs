import {createHash} from 'node:crypto';

// Retain exact result citations while bounding repeated chapter/claim ID lists.
// Counts and hashes preserve the full-list identity; no transcript is exported.
export function compactEvidence(value) {
  if (Array.isArray(value)) return value.map(compactEvidence);
  if (!value || typeof value !== 'object') return value;
  const result={};
  for (const [key,item] of Object.entries(value)) {
    if (key==='sourceSegmentIds' && Array.isArray(item) && item.length>12) {
      result.sourceSegmentCount=item.length;
      result.sourceSegmentIdsSample=[...new Set([...item.slice(0,3),...item.slice(-3)])];
      result.sourceIdsSha256=createHash('sha256').update(JSON.stringify(item)).digest('hex');
    } else result[key]=compactEvidence(item);
  }
  return result;
}
