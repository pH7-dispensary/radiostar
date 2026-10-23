import { createHash } from "node:crypto";

// This assessor deliberately consumes only publisher-supplied RSS metadata.
// A public feed, a transcript link, or the absence of a reservation is never
// treated as permission.  It can establish bounded intelligence only when the
// publisher has supplied a recognised, machine-readable licence.
export const RIGHTS_ASSESSMENT_VERSION = "publisher-rss-v3";

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
const urls = (value) => [...String(value || "").matchAll(/https?:\/\/[^\s<>'"]+/gi)].map((match) => match[0].replace(/[.,;:!?)\]]+$/, ""));

const canonicalLicence = (value) => {
  try {
    const url = new URL(String(value));
    const host = url.hostname.toLowerCase();
    const path = url.pathname.replace(/\/+$/, "/").toLowerCase();
    if (!/(^|\.)creativecommons\.org$/.test(host)) return null;
    if (/^\/publicdomain\/zero\/1\.0\/$/.test(path)) return { url: url.toString(), kind: "CC0" };
    if (/^\/licenses\/by\/(?:1\.0|2\.0|2\.5|3\.0|4\.0)\/$/.test(path)) return { url: url.toString(), kind: "CC-BY" };
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
    // RSS copyright text is normally human-readable, but a direct statement
    // that the work is licensed under a canonical CC URL is an explicit
    // publisher permission. Do not mistake a third-party music credit or an
    // arbitrary URL in an episode description for a show/episode licence.
    for (const value of elementValues(xml, "copyright")) {
      if (!/\b(?:this\s+(?:work|podcast|episode)|the\s+(?:work|podcast|episode))\b[\s\S]{0,140}\b(?:is\s+)?licen[cs]ed\b[\s\S]{0,140}\bcreative\s+commons\b/i.test(value)) continue;
      for (const candidate of urls(value)) {
        const licence = canonicalLicence(candidate);
        if (!licence) continue;
        licences.push({ ...licence, scope });
        evidence.push({ type: "PUBLISHER_LICENSE", source: "publisher-rss-copyright", scope, value: licence.kind, url: licence.url });
      }
    }
    const rightsText = unique([
      ...elementValues(xml, "rights"),
      ...elementValues(xml, "copyright"),
      ...elementValues(xml, "podcast:rights"),
    ]);
    for (const value of rightsText) {
      // A narrowly worded distribution reservation is not an internal-analysis
      // prohibition. Retain the verbatim evidence and gate its actual scope.
      const distributionOnly = /(?:no|prohibit(?:ed)?|not permitted)[\s\S]{0,45}(?:public transcript distribution|distribution of (?:full )?transcripts|public captions)/i.test(value)
        && !reservation(value);
      if (distributionOnly) {
        const item = { type: "SCOPED_PUBLISHER_RESTRICTION", source: "publisher-rss", scope, value: compact(value, 500), features: ["captions", "transcript-distribution"] };
        reservations.push(item); evidence.push(item); continue;
      }
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
    reservedFeatures: [...new Set(snapshot.reservations.flatMap(item => item.features || []))],
  };
  if (snapshot.reservations.some(item => !item.features?.length)) return {
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
    // A publisher licence expressly applied to the podcast covers internal
    // reproduction too. Episode reservations above and authoritative registry
    // restrictions still win; this does not enable transcript distribution.
    canTranscribeAudio: true,
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
