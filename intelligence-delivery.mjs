import { createHash } from "node:crypto";
import { searchTerms } from "./intelligence.mjs";
import { validateClaims, localClaimCheck } from "./claim-grounding.mjs";
import { RETRIEVAL_VERSION } from "./retrieval.mjs";

// Local derived artefacts, not another provider, queue or processing service.
export const DELIVERY_VERSION = "grounded-delivery-v2";
export const transcriptFingerprint = (t) => createHash("sha256").update(JSON.stringify([
  t.episodeId, t.transcriptVersion, t.audioVariant, t.audioContentHash, t.language, t.quality, t.segments,
])).digest("hex");
export const indexChecksum = index => createHash("sha256").update(JSON.stringify([index.version,index.processingVersion,index.feedUrl,index.episodeId,index.fingerprint,index.language,index.coverage,index.segments])).digest("hex");
export function validSearchIndex(index,transcript,value){
 return Boolean(index && Array.isArray(index.segments) && index.version===DELIVERY_VERSION && index.processingVersion===value.processingVersion && index.feedUrl===value.feedUrl && index.episodeId===value.episodeId && index.fingerprint===transcriptFingerprint(transcript) && index.checksum===indexChecksum(index));
}
export function buildSearchIndex(transcript, { feedUrl, episodeId, processingVersion }) {
  if (transcript.episodeId !== episodeId || !transcript.segments?.length || transcript.quality?.readiness === "UNUSABLE")
    throw Object.assign(Error("Canonical transcript identity or quality failed validation."), { code: "TRANSCRIPT_VALIDATION_FAILED" });
  const seen = new Set();
  const segments = transcript.segments.map(s => {
    if (!s.id || seen.has(s.id) || typeof s.text !== "string" || !s.text.trim()) throw Error("Invalid search source segment.");
    seen.add(s.id);
    const timed = Number.isFinite(s.startMs) || Number.isFinite(s.endMs);
    if (timed && !(Number.isFinite(s.startMs) && Number.isFinite(s.endMs) && s.startMs >= 0 && s.endMs > s.startMs)) throw Error("Invalid search source timestamp.");
    return { id:s.id, text:s.text, startMs:timed?s.startMs:null, endMs:timed?s.endMs:null,
      ...(s.speaker ? {speaker:s.speaker} : {}), contentType:s.contentType || "conversation",
      searchTermsVersion:RETRIEVAL_VERSION, searchTerms:[...searchTerms(`${s.text} ${(s.topics || []).join(" ")} ${(s.entities || []).join(" ")} ${s.speaker || ""}`)] };
  });
  const index={ version:DELIVERY_VERSION, processingVersion, feedUrl, episodeId, transcriptVersion:transcript.transcriptVersion,
    language:transcript.language||"und",coverage:transcript.quality||null,
    fingerprint:transcriptFingerprint(transcript), audioVariant:transcript.audioVariant, segments, indexedAt:new Date().toISOString() };
  return {...index,checksum:indexChecksum(index)};
}

// Chapter labels already carry provider citations. Theme labels are admitted
// only when retrievable original speech supports navigation to that theme.
export function groundedTopics(value, index, checks = validateClaims(value, index)) {
  const source = new Map(index.segments.map(s=>[s.id,s])), seen = new Set(), topics = [];
  const add = (label, ids, chapterTitle = null) => {
    const name = String(label || "").trim().slice(0,120), key = name.toLocaleLowerCase();
    const cited = [...new Set(ids || [])].map(id=>source.get(id));
    if (name.length < 3 || /^(topic|discussion|conversation|introduction|conclusion)$/i.test(name) || seen.has(key) || !cited.length || cited.some(s=>!s)) return;
    seen.add(key);
    const timed = cited.every(s=>Number.isFinite(s.startMs));
    topics.push({ id:createHash("sha256").update(key).digest("hex").slice(0,16), label:name,
      sourceSegmentIds:cited.map(s=>s.id), startMs:timed?Math.min(...cited.map(s=>s.startMs)):null,
      endMs:timed?Math.max(...cited.map(s=>s.endMs)):null, chapterTitle,
      transcriptVersion:index.transcriptVersion, evidenceType:chapterTitle?"chapter_citations":"lexical_source_match" });
  };
  for(const [i,chapter] of (value.chapters || []).entries())
    if(!checks.claims.some(c=>c.id.startsWith(`chapter.${i}.`)&&!c.supported))add(chapter.title,chapter.sourceSegmentIds,chapter.title);
  for(const [i,theme] of (value.brief?.themes || []).entries()) {
    const approved=checks.claims.find(c=>c.id===`brief.theme.${i}`&&c.supported);
    if(!approved)continue;
    const local=localClaimCheck({text:theme,label:true,sourceSegmentIds:value.brief.sourceSegmentIds},index);
    const ids=local.supported?local.sourceSegmentIds:approved.evidenceSegmentIds;
    // Model-reviewed themes use the exact supporting quote's source, rather
    // than the earliest generic brief citation or an unrelated lexical match.
    if(ids?.length)add(theme,ids);
  }
  return topics.slice(0,80);
}

export function deliveryValidation(value, index) {
  const source = new Map((index?.segments || []).map(s=>[s.id,s]));
  const cited = ids => Array.isArray(ids) && ids.length>0 && ids.every(id=>source.has(id));
  const claimCheck=validateClaims(value,index||{segments:[]});
  const supported=prefix=>!claimCheck.claims.some(c=>c.id.startsWith(prefix)&&!c.supported);
  const brief = value.brief;
  const briefValid = Boolean(brief && supported("brief.") && brief.episodeId === value.episodeId && brief.processingVersion === value.processingVersion &&
    brief.transcriptVersion === index?.transcriptVersion && typeof brief.overview === "string" && brief.overview.trim().length>=12 &&
    typeof brief.detail === "string" && brief.detail.trim().length>=12 && cited(brief.sourceSegmentIds));
  let lastEnd=-1;const names=new Set();
  const chaptersValid = Boolean(value.chapters?.length && supported("chapter.") && value.chapters.every(c=>{
    const rows=(c.sourceSegmentIds || []).map(id=>source.get(id));const name=String(c.title||"").trim().toLowerCase(),identity=JSON.stringify([name,c.startMs,c.endMs]);
    if(!name || names.has(identity) || !cited(c.sourceSegmentIds) || rows.some(s=>!Number.isFinite(s?.startMs)) ||
      c.startMs<lastEnd || c.startMs!==Math.min(...rows.map(s=>s.startMs)) || c.endMs!==Math.max(...rows.map(s=>s.endMs)) || c.endMs<=c.startMs)return false;
    lastEnd=c.endMs;names.add(identity);return true;
  }));
  const timed = index?.segments.some(s=>Number.isFinite(s.startMs));
  const features = {
    transcript:{state:index?"READY":"UNAVAILABLE"},
    brief:{state:briefValid?(["extractive","verified_partial"].includes(brief.mode)?"PARTIAL_READY":"READY"):"FAILED"},
    chapters:{state:!timed?"UNAVAILABLE":chaptersValid?(value.chapters.some(c=>c.mode==="extractive")?"PARTIAL_READY":"READY"):"FAILED",...(!timed?{code:"UNTIMED_TRANSCRIPT"}:{})},
    topics:{state:value.topics?.length&&value.topics.every(t=>groundedTopics(value,index,claimCheck).some(expected=>expected.label===t.label&&JSON.stringify(expected.sourceSegmentIds)===JSON.stringify(t.sourceSegmentIds)&&expected.startMs===t.startMs&&expected.endMs===t.endMs))?"READY":"FAILED"},
    search:{state:index?"READY":"INDEXING"},
    moments:{state:timed?"READY":"UNAVAILABLE",...(!timed?{code:"UNTIMED_TRANSCRIPT"}:{})},
  };
  for(const failure of value.validationFailures || [])if(features[failure.feature])features[failure.feature]={state:features[failure.feature].state==="READY"?"PARTIAL_READY":"FAILED",code:failure.code};
  return {version:DELIVERY_VERSION,features,complete:features.brief.state==="READY" &&
    ["READY","UNAVAILABLE"].includes(features.chapters.state) && features.topics.state==="READY" && features.search.state==="READY",
    failures:Object.entries(features).filter(([,v])=>v.state==="FAILED").map(([feature])=>({feature,code:"OUTPUT_VALIDATION_FAILED"})),
    claimValidation:claimCheck,
    note:"Claims checked against cited speech with restricted restatement rules or a bound independent review; ambiguous claims abstain. Listening review is still required for production quality."};
}
