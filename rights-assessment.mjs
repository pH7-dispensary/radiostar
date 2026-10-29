import { createHash } from "node:crypto";

// This assessor deliberately consumes only publisher-supplied RSS metadata.
// A public feed, a transcript link, or the absence of a reservation is never
// treated as permission.  It can establish bounded intelligence only when the
// publisher has supplied a recognised, machine-readable licence.
export const RIGHTS_ASSESSMENT_VERSION = "publisher-rss-v4";

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

// Explain activities through the existing evaluator. This records deployment
// facts and unresolved statutory predicates; it never grants permissions.
export function assessProcessingActivities({ rights, feedUrl, episodeId, deploymentRegion = null }) {
  const record = rights.resolve(feedUrl, episodeId);
  const activities = {
    'bounded-audio-analysis': ['ad-detection'],
    'bounded-audio-transcription': ['audio-transcription', 'ad-detection'],
    'internal-transcription': ['audio-transcription'],
    'internal-ai-analysis': ['intelligence-processing'],
    'displayed-intelligence': ['intelligence-display'],
    'advertisement-detection': ['ad-detection'],
    'automatic-ad-skip': ['automatic-skipping'],
    'public-transcript-distribution': ['transcript-distribution'],
    'playback-captions': ['captions'],
    translation: ['translation-text'], dubbing: ['dubbing-audio'], 'voice-replication': ['voice-cloning'],
  };
  const decisions = Object.fromEntries(Object.entries(activities).map(([activity, features]) => {
    const checks = features.map(feature => rights.evaluate({feature, feedUrl, episodeId}));
    const refusal = checks.find(check => !check.allowed);
    return [activity, { allowed: !refusal, code: refusal?.code || 'ALLOWED_BY_EXISTING_RECORD',
      reason: refusal?.reason || 'The current scoped rights record permits this activity; no duplicate approval is needed.',
      basisEstablished: checks.every(check => check.basisEstablished), requiredPermissions: features,
      policyVersion: checks[0].policyVersion, mode: checks[0].mode,
      ...(activity.startsWith('bounded-') ? {maximumSeconds:180,maximumAcquiredBytes:8*1024*1024,distribution:false} : {}) }];
  }));
  const context = {
    version: 'processing-activities-v1', deploymentRegion, decisionScope: 'rights-only',
    executionJurisdiction: deploymentRegion === 'eu-west-2' ? 'GB' : 'UNESTABLISHED',
    operatorJurisdiction: 'NOT_INFERRED_FROM_SERVER_REGION',
    activityPurpose: 'Podcast listener service and internal advertisement analysis; not solely non-commercial research',
    scope: record.id ? record.episodeId ? 'episode' : 'channel' : 'unassessed', recordId: record.id || null,
    evidenceTerritories: record.approvalAssessment?.territories || [],
    territoryNote: 'An empty territory list does not establish worldwide exception coverage.',
    legalBasis: record.legalBasis || null, rightsReservations: record.reservedFeatures || [],
    evidence: rights.assessment(feedUrl, episodeId).evidence,
    operationalGates: 'Budget, acquisition limits, exact audio verification, active private pilot, listener preference and suspension controls still apply independently.',
    statutoryConsiderations: [
      {provision:'UK CDPA 29A',url:'https://www.legislation.gov.uk/ukpga/1988/48/section/29A',
        guidance:'https://www.gov.uk/guidance/exceptions-to-copyright',status:'PURPOSE_NOT_ESTABLISHED',
        rationale:'This exception requires analysis solely for non-commercial research. Free listener features do not establish that research purpose.'},
      {provision:'UK CDPA 28A',url:'https://www.legislation.gov.uk/ukpga/1988/48/section/28A',status:'CONDITIONS_NOT_ESTABLISHED',
        rationale:'Temporary local audio is deleted, but derived transcripts are retained. The lawful-use, provider-copy retention and independent-economic-significance conditions have not been established for every relevant act. A short window is not itself an exception.'},
      {provision:'EU Directive 2019/790 Articles 3 and 4',url:'https://eur-lex.europa.eu/eli/dir/2019/790/oj/eng',status:'TERRITORIAL_AND_ACTIVITY_BASIS_NOT_ESTABLISHED',
        rationale:'Article 3 requires a qualifying research organisation or cultural heritage institution and scientific research. Article 4 requires applicable national implementation, lawful access and an appropriate rights-reservation check. A UK processing region does not establish EU territorial coverage; absent RSS reservations alone are insufficient.'},
    ], decisions, permissionsChanged: false,
  };
  return {...context,fingerprint:hash(context)};
}

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

const reservation = (value) => /\b(no\s+(?:ai|artificial intelligence|machine learning)|(?:ai|artificial intelligence|machine learning)\s+(?:is|are)\s+not\s+permitted)\b/i.test(value);

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
    const copyrightNotices = elementValues(xml, "copyright");
    const rightsText = unique([
      ...elementValues(xml, "rights"),
      ...copyrightNotices,
      ...elementValues(xml, "podcast:rights"),
    ]);
    for (const value of rightsText) {
      if (copyrightNotices.includes(value) || /\b(?:all )?rights reserved\b|©|copyright/i.test(value))
        evidence.push({ type: "COPYRIGHT_NOTICE", source: "publisher-rss", scope, value });
      const scopedFeatures = [];
      const tdm = /\b(?:no\s+(?:text and data mining|tdm)|(?:text and data mining|tdm)\s+(?:(?:is|are)\s+not\s+permitted|rights?\s+reserved))\b/i.test(value);
      if (tdm) scopedFeatures.push("transcript-acquisition", "audio-transcription", "intelligence-processing");
      if (/\b(?:do not transcribe|no (?:audio )?transcription)\b/i.test(value)) scopedFeatures.push("audio-transcription");
      // A narrowly worded distribution reservation is not an internal-analysis
      // prohibition. Retain the verbatim evidence and gate its actual scope.
      // Sequential public captions distribute the transcript too; preserve the
      // existing output hold without extending it to private internal analysis.
      if (/(?:no|prohibit(?:ed)?|not permitted)[\s\S]{0,45}(?:public transcript distribution|distribution of (?:full )?transcripts)/i.test(value)) scopedFeatures.push("transcript-distribution", "captions");
      if (/(?:no|prohibit(?:ed)?|not permitted)[\s\S]{0,45}public captions/i.test(value)) scopedFeatures.push("captions");
      if (scopedFeatures.length) {
        const item = { type: tdm ? "TDM_RESERVATION" : "SCOPED_PUBLISHER_RESTRICTION", source: "publisher-rss", scope, value: compact(value, 500), features: unique(scopedFeatures) };
        reservations.push(item); evidence.push(item);
      }
      if (!reservation(value)) continue;
      const item = { type: "PUBLISHER_RESTRICTION", source: "publisher-rss", scope, value: compact(value, 500) };
      reservations.push(item);
      evidence.push(item);
    }
  }
  if (String(feedUrl).startsWith("https://"))
    evidence.push({ type: "LAWFUL_ACCESS_OBSERVED", source: "publisher-rss", scope: "feed", value: "The publisher HTTPS feed was retrieved by the server." });
  return { licences, reservations, evidence, fingerprint: hash({ licences, reservations, evidence }) };
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
    canSearchConversations: true,
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
