import { createHash } from "node:crypto";

// This assessor deliberately consumes only publisher-supplied RSS metadata.
// A public feed, a transcript link, or the absence of a reservation is never
// treated as permission.  It can establish bounded intelligence only when the
// publisher has supplied a recognised, machine-readable licence.
export const RIGHTS_ASSESSMENT_VERSION = "publisher-rss-v1";

const text = (value) => String(value || "")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
  .replace(/<[^>]+>/g, " ")
  .replace(/&(?:amp|#38);/gi, "&")
  .replace(/&(?:quot|#34);/gi, '"')
  .replace(/&(?:apos|#39);/gi, "'")
  .replace(/&(?:lt|#60);/gi, "<")
  .replace(/&(?:gt|#62);/gi, ">")
  .replace(/\s+/g, " ")
  .trim();

const compact = (value, length = 500) => text(value).slice(0, length);
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const unique = (items) => [...new Set(items.filter(Boolean))];

const elementValues = (xml, name) => [...String(xml || "").matchAll(new RegExp(
  `<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "gi",
))].map((match) => compact(match[1]));
const attrValues = (xml, name) => [...String(xml || "").matchAll(new RegExp(
  `<${name}\\b[^>]*(?:href|url)=["']([^"']+)["'][^>]*\\/?>(?:[\\s\\S]*?<\\/${name}>)?`, "gi",
))].map((match) => compact(match[1]));
const linkLicences = (xml) => [...String(xml || "").matchAll(/<link\b[^>]*\brel=["']license["'][^>]*\bhref=["']([^"']+)["'][^>]*\/?>/gi)]
  .map((match) => compact(match[1]));

const canonicalLicence = (value) => {
  try {
    const url = new URL(String(value));
    const host = url.hostname.toLowerCase();
    const path = url.pathname.replace(/\/+$/, "/").toLowerCase();
    if (!/(^|\.)creativecommons\.org$/.test(host)) return null;
    if (/^\/publicdomain\/zero\/1\.0\/$/.test(path)) return { url: url.toString(), kind: "CC0" };
    if (/^\/licenses\/by\/(?:[\d.]+)\/$/.test(path)) return { url: url.toString(), kind: "CC-BY" };
  } catch {
    // Invalid publisher metadata is evidence for neither a grant nor a block.
  }
  return null;
};

const reservation = (value) => /\b(all rights reserved|rights reserved|no\s+(?:ai|artificial intelligence|machine learning|text and data mining|tdm)|(?:ai|artificial intelligence|machine learning|text and data mining|tdm)\s+(?:is|are)\s+not\s+permitted|do not transcrib)\b/i.test(value);

/**
 * Extracts bounded, auditable evidence. It does not fetch a linked licence or
 * infer a licence from copyright notices that do not contain an explicit term.
 */
export function publisherRightsEvidence({ channelXml = "", itemXml = "", feedUrl = "" } = {}) {
  const scopes = [
    { scope: "episode", xml: itemXml },
    { scope: "podcast", xml: channelXml },
  ];
  const licences = [], reservations = [], evidence = [];
  for (const { scope, xml } of scopes) {
    const licenceCandidates = unique([
      ...attrValues(xml, "podcast:license"),
      ...attrValues(xml, "cc:license"),
      ...attrValues(xml, "creativecommons:license"),
      ...attrValues(xml, "license"),
      ...elementValues(xml, "podcast:license"),
      ...elementValues(xml, "cc:license"),
      ...elementValues(xml, "creativecommons:license"),
      ...elementValues(xml, "license"),
      ...linkLicences(xml),
    ]);
    for (const value of licenceCandidates) {
      const licence = canonicalLicence(value);
      if (!licence) continue;
      licences.push({ ...licence, scope });
      evidence.push({ type: "PUBLISHER_LICENSE", source: "publisher-rss", scope, value: licence.kind, url: licence.url });
    }
    const rightsText = unique([
      ...elementValues(xml, "rights"),
      ...elementValues(xml, "copyright"),
      ...elementValues(xml, "podcast:rights"),
    ]);
    for (const value of rightsText) {
      if (!reservation(value)) continue;
      const item = { type: "PUBLISHER_RESTRICTION", source: "publisher-rss", scope, value: compact(value, 500) };
      reservations.push(item);
      evidence.push(item);
    }
  }
  if (String(feedUrl).startsWith("https://"))
    evidence.push({ type: "LAWFUL_ACCESS_OBSERVED", source: "publisher-rss", scope: "feed", value: "The publisher HTTPS feed was retrieved by the server." });
  return { licences, reservations, evidence, fingerprint: hash({ licences, reservations }) };
}

/**
 * Produces a policy decision, not a legal opinion. TDM is explicitly recorded
 * as considered, but is not automatically asserted for a listener-facing
 * product without deployment-approved jurisdictional evidence.
 */
export function assessPublisherRights({ feedUrl, episode, evidence } = {}) {
  const snapshot = evidence || publisherRightsEvidence({ feedUrl });
  const common = {
    assessmentSource: RIGHTS_ASSESSMENT_VERSION,
    assessmentVersion: RIGHTS_ASSESSMENT_VERSION,
    evidenceFingerprint: snapshot.fingerprint,
    assessmentEvidence: snapshot.evidence,
  };
  if (snapshot.reservations.length) return {
    ...common,
    classification: "RESTRICTED",
    assessmentStatus: "REJECTED",
    explicitAuthorisation: false,
    rightsReserved: true,
    blockerCode: "PUBLISHER_RESTRICTION",
    assessmentReason: "The publisher RSS includes an explicit rights reservation for this kind of processing.",
    restrictions: snapshot.reservations.map((item) => item.value).join("; "),
    legalBasis: null,
    ...Object.fromEntries([
      "canAcquireTranscript", "canProcessForAi", "canTranscribeAudio", "canDisplayDerivedIntelligence", "canRetain", "canRegenerate",
      "canGenerateBrief", "canGenerateChapters", "canGenerateTopics", "canSearchMoments", "canDetectAdvertisements",
      "canDisplayCaptions", "canTranslateText", "canGenerateDubbedAudio", "canCacheTranslatedAudio", "canDistributeTranslation", "canCloneSpeakerVoice",
    ].map((name) => [name, false])),
  };
  const licence = snapshot.licences.find((item) => item.scope === "episode") || snapshot.licences[0];
  if (licence) return {
    ...common,
    classification: "LICENSED",
    assessmentStatus: "APPROVED",
    explicitAuthorisation: true,
    rightsReserved: false,
    blockerCode: null,
    assessmentReason: "A recognised publisher-provided licence supports bounded Radio Star intelligence.",
    restrictions: "Bounded derived intelligence only; captions, translation, dubbing and voice replication remain independently gated.",
    legalBasis: `Publisher-provided ${licence.kind} licence in ${licence.scope}-level RSS metadata: ${licence.url}`,
    licence: licence.url,
    canAcquireTranscript: true,
    canProcessForAi: true,
    // Channel-level licences do not automatically establish that the specific
    // audio variant can be copied for paid transcription. A direct episode
    // licence is required, and callers must still opt in to paid audio.
    canTranscribeAudio: licence.scope === "episode",
    canDisplayDerivedIntelligence: true,
    canRetain: true,
    canRegenerate: true,
    canGenerateBrief: true,
    canGenerateChapters: true,
    canGenerateTopics: true,
    canSearchMoments: true,
    canDetectAdvertisements: true,
    canDisplayCaptions: false,
    canTranslateText: false,
    canGenerateDubbedAudio: false,
    canCacheTranslatedAudio: false,
    canDistributeTranslation: false,
    canCloneSpeakerVoice: false,
  };
  return {
    ...common,
    classification: "RESTRICTED",
    assessmentStatus: "REJECTED",
    explicitAuthorisation: false,
    rightsReserved: false,
    blockerCode: "LEGAL_BASIS_NOT_ESTABLISHED",
    assessmentReason: "No publisher permission or deployment-approved legal basis for this listener-facing processing was established from the available evidence.",
    restrictions: "No qualifying publisher authorisation or approved legal basis was found in the available RSS evidence.",
    legalBasis: null,
    assessmentEvidence: [...snapshot.evidence, {
      type: "TDM_REVIEW", source: "server-policy", scope: "processing",
      value: "TDM was considered but not automatically asserted without a deployment-approved, jurisdiction-specific basis and output assessment.",
    }],
    ...Object.fromEntries([
      "canAcquireTranscript", "canProcessForAi", "canTranscribeAudio", "canDisplayDerivedIntelligence", "canRetain", "canRegenerate",
      "canGenerateBrief", "canGenerateChapters", "canGenerateTopics", "canSearchMoments", "canDetectAdvertisements",
      "canDisplayCaptions", "canTranslateText", "canGenerateDubbedAudio", "canCacheTranslatedAudio", "canDistributeTranslation", "canCloneSpeakerVoice",
    ].map((name) => [name, false])),
  };
}
