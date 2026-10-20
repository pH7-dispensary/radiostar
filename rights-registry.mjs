import { createHash, randomUUID } from "node:crypto";

export const RightsClassification = Object.freeze({
  LICENSED: "LICENSED",
  TDM_ELIGIBLE: "TDM_ELIGIBLE",
  RESTRICTED: "RESTRICTED",
  DISPUTED: "DISPUTED",
});
export const RightsEnforcementMode = Object.freeze({
  OFF: "OFF",
  LITE: "LITE",
  MEDIUM: "MEDIUM",
  STRONG: "STRONG",
});
export const RightsAssessmentStatus = Object.freeze({
  UNASSESSED: "UNASSESSED",
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
});

const permissions = [
  "canAcquireTranscript",
  "canProcessForAi",
  "canTranscribeAudio",
  "canDisplayCaptions",
  "canDisplayDerivedIntelligence",
  "canGenerateBrief",
  "canGenerateChapters",
  "canGenerateTopics",
  "canSearchMoments",
  "canSearchConversations",
  "canDetectAdvertisements",
  "canRetain",
  "canRegenerate",
  "canTranslateText",
  "canGenerateDubbedAudio",
  "canCacheTranslatedAudio",
  "canDistributeTranslation",
  "canCloneSpeakerVoice",
];
const key = (feedUrl, episodeId = "") =>
  createHash("sha256").update(JSON.stringify([feedUrl, episodeId])).digest("hex");
const policyKey = "global";
const overrideKey = (feedUrl, episodeId = "") => key(feedUrl, episodeId);
const bools = (input = {}) =>
  Object.fromEntries(permissions.map((name) => [name, input[name] === true]));
const modeValues = new Set(Object.values(RightsEnforcementMode));
const assessmentValues = new Set(Object.values(RightsAssessmentStatus));
const optionalFeatures = Object.freeze({
  intelligenceProcessing: true,
  intelligenceDisplay: true,
  conversationSearch: true,
});
const featurePermission = Object.freeze({
  "intelligence-processing": ["canProcessForAi", "canRetain"],
  "intelligence-display": ["canDisplayDerivedIntelligence"],
  "conversation-search": ["canDisplayDerivedIntelligence", "canSearchConversations"],
  "episode-brief": ["canGenerateBrief"],
  "smart-chapters": ["canGenerateChapters"],
  topics: ["canGenerateTopics"],
  "find-moment": ["canSearchMoments"],
  "ad-detection": ["canDetectAdvertisements"],
  captions: ["canDisplayCaptions"],
  "translation-text": ["canTranslateText"],
  "dubbing-audio": ["canGenerateDubbedAudio", "canCacheTranslatedAudio", "canDistributeTranslation"],
  "voice-cloning": ["canCloneSpeakerVoice"],
});
const optionalFeatureFor = Object.freeze({
  "intelligence-processing": "intelligenceProcessing",
  "intelligence-display": "intelligenceDisplay",
  "conversation-search": "conversationSearch",
});
const defaultPolicy = () => ({
  id: policyKey,
  version: 1,
  mode: RightsEnforcementMode.STRONG,
  features: { ...optionalFeatures },
  testMode: {
    enabled: false,
    updatedAt: null,
    updatedBy: null,
    reason: null,
  },
  updatedAt: Date.now(),
  updatedBy: "system",
  history: [],
});
const normaliseEvidence = (input) => Array.isArray(input)
  ? input.slice(0, 30).map((item) => ({
    type: String(item?.type || "EVIDENCE").slice(0, 80),
    source: String(item?.source || "unknown").slice(0, 120),
    scope: String(item?.scope || "unknown").slice(0, 80),
    value: String(item?.value || "").slice(0, 1000),
    ...(typeof item?.url === "string" ? { url: item.url.slice(0, 2000) } : {}),
  })) : [];
const normaliseRecord = (record) => record && (() => {
  const legacyDerived = record.canProcessForAi === true && record.canDisplayDerivedIntelligence === true;
  return {
  ...record,
  ...bools(record),
  // Existing authorised records predate the feature-level fields. Preserve
  // their bounded core-intelligence behaviour while keeping captions, dubbing
  // and voice permissions independently false unless explicitly recorded.
  canGenerateBrief: record.canGenerateBrief === undefined ? legacyDerived : record.canGenerateBrief === true,
  canGenerateChapters: record.canGenerateChapters === undefined ? legacyDerived : record.canGenerateChapters === true,
  canGenerateTopics: record.canGenerateTopics === undefined ? legacyDerived : record.canGenerateTopics === true,
  canSearchMoments: record.canSearchMoments === undefined ? legacyDerived : record.canSearchMoments === true,
  canSearchConversations: record.canSearchConversations === undefined ? record.canDisplayDerivedIntelligence === true : record.canSearchConversations === true,
  canDetectAdvertisements: record.canDetectAdvertisements === undefined ? legacyDerived : record.canDetectAdvertisements === true,
  assessmentStatus: assessmentValues.has(record.assessmentStatus) ? record.assessmentStatus : record.classification === RightsClassification.LICENSED ? RightsAssessmentStatus.APPROVED : RightsAssessmentStatus.UNASSESSED,
  explicitAuthorisation: record.explicitAuthorisation === true || (record.classification === RightsClassification.LICENSED && record.canProcessForAi === true && record.canDisplayDerivedIntelligence === true),
  rightsReserved: record.rightsReserved === true,
  testContentEligible: record.testContentEligible === true,
  blockerCode: typeof record.blockerCode === "string" ? record.blockerCode.slice(0, 120) : null,
  assessmentReason: typeof record.assessmentReason === "string" ? record.assessmentReason.slice(0, 2000) : null,
  assessmentSource: typeof record.assessmentSource === "string" ? record.assessmentSource.slice(0, 120) : null,
  assessmentVersion: typeof record.assessmentVersion === "string" ? record.assessmentVersion.slice(0, 120) : null,
  evidenceFingerprint: typeof record.evidenceFingerprint === "string" ? record.evidenceFingerprint.slice(0, 128) : null,
  assessmentEvidence: normaliseEvidence(record.assessmentEvidence),
  };
})();

export const processingApprovalFeatures = Object.freeze({
  transcription: "canTranscribeAudio",
  brief: "canGenerateBrief",
  chapters: "canGenerateChapters",
  topics: "canGenerateTopics",
  moments: "canSearchMoments",
  search: "canSearchConversations",
  advertisements: "canDetectAdvertisements",
});
const mandatoryRestriction = (record) => record && (record.suspendedAt || record.deletedAt || record.rightsReserved ||
  record.classification === RightsClassification.DISPUTED ||
  ["PUBLISHER_RESTRICTION", "RIGHTS_RESERVED", "LEGAL_PROHIBITION"].includes(record.blockerCode));
const approvalError = (message) => Object.assign(Error(message), { code: "APPROVAL_INVALID" });

/**
 * Server-owned rights records deliberately default to no permission. A publisher
 * transcript link is provenance, not permission to process or display it.
 */
export class RightsRegistry {
  constructor(store, { now = Date.now } = {}) {
    this.store = store;
    this.now = now;
  }
  policy() {
    const stored = this.store.get("rights-policy", policyKey);
    if (!stored) return defaultPolicy();
    return {
      ...defaultPolicy(),
      ...stored,
      mode: modeValues.has(stored.mode) ? stored.mode : RightsEnforcementMode.STRONG,
      features: { ...optionalFeatures, ...(stored.features || {}) },
      testMode: {
        ...defaultPolicy().testMode,
        ...(stored.testMode || {}),
        enabled: stored.testMode?.enabled === true,
      },
      history: Array.isArray(stored.history) ? stored.history : [],
    };
  }
  setPolicy(input = {}, { actor = "admin" } = {}) {
    if (!modeValues.has(input.mode)) throw Error("Choose a valid rights enforcement mode.");
    if (input.features !== undefined && (!input.features || typeof input.features !== "object"))
      throw Error("Feature controls are invalid.");
    for (const [name, value] of Object.entries(input.features || {}))
      if (!(name in optionalFeatures) || typeof value !== "boolean") throw Error("Feature controls are invalid.");
    const prior = this.policy(), at = this.now();
    const record = {
      ...prior,
      version: prior.version + 1,
      mode: input.mode,
      features: { ...prior.features, ...(input.features || {}) },
      updatedAt: at,
      updatedBy: actor,
      history: [...prior.history, { at, actor, action: "policy-changed", mode: input.mode, features: input.features || {} }].slice(-100),
    };
    this.store.set("rights-policy", policyKey, record);
    this.store.set("rights-policy-history", randomUUID(), { at, actor, policyVersion: record.version, mode: record.mode, features: record.features });
    return record;
  }
  setSuperAdminTestMode(input = {}, { actor = "admin" } = {}) {
    if (typeof input.enabled !== "boolean")
      throw Error("Choose whether Super Admin test mode is enabled.");
    const reason = String(input.reason || "").trim().slice(0, 1000);
    if (!reason) throw Error("A reason is required for Super Admin test mode.");
    if (input.confirmation !== "SUPER ADMIN")
      throw Error("Type SUPER ADMIN before changing test mode.");
    const prior = this.policy(), at = this.now();
    const testMode = {
      enabled: input.enabled,
      updatedAt: at,
      updatedBy: actor,
      reason,
    };
    const record = {
      ...prior,
      version: prior.version + 1,
      testMode,
      updatedAt: at,
      updatedBy: actor,
      history: [
        ...prior.history,
        {
          at,
          actor,
          action: "super-admin-test-mode-changed",
          enabled: input.enabled,
          reason,
        },
      ].slice(-100),
    };
    this.store.transaction(() => {
      this.store.set("rights-policy", policyKey, record);
      this.store.set("rights-policy-history", randomUUID(), {
        at,
        actor,
        action: "super-admin-test-mode-changed",
        policyVersion: record.version,
        enabled: input.enabled,
        reason,
      });
    });
    return record;
  }
  assessmentRevision(feedUrl, episodeId = "") {
    // Include inherited records and enforcement policy: a preview cannot outlive
    // a new publisher reservation, expiry edit, or concurrent reviewer decision.
    return createHash("sha256").update(JSON.stringify([
      this.store.get("rights", key(feedUrl)), episodeId ? this.store.get("rights", key(feedUrl, episodeId)) : null,
      this.store.get("rights-policy", policyKey),
      this.store.get("rights-policy-override", key(feedUrl)),
      episodeId ? this.store.get("rights-policy-override", key(feedUrl, episodeId)) : null,
    ])).digest("hex");
  }
  validateProcessingApproval(input = {}) {
    if (typeof input.feedUrl !== "string" || !input.feedUrl)
      throw Error("A publisher feed is required.");
    if (input.episodeId !== undefined && typeof input.episodeId !== "string")
      throw Error("Episode identity is invalid.");
    if (![RightsClassification.LICENSED, RightsClassification.TDM_ELIGIBLE].includes(input.classification))
      throw Error("Choose the documented processing basis for this approval.");
    const legalBasis = String(input.legalBasis || "").trim().slice(0, 1000);
    const reason = String(input.reason || "").trim().slice(0, 1000);
    if (!legalBasis || !reason) throw Error("A legal basis and approval reason are required.");
    if (input.confirmation !== "APPROVE & PROCESS")
      throw Error("Type APPROVE & PROCESS before approving content.");
    const prior = this.resolve(input.feedUrl, input.episodeId || "");
    // An administrator records a documented basis; they do not override a
    // publisher reservation, dispute, suspension, or takedown.
    if (mandatoryRestriction(prior))
      throw Error("This content has a mandatory rights restriction and cannot be approved here.");
    const basisType = input.basisType;
    if (!["OWNED", "PUBLISHER_LICENCE", "CREATOR_AUTHORISATION", "APPLICABLE_EXCEPTION", "INDEPENDENT_REVIEW"].includes(basisType))
      throw approvalError("Choose a structured processing basis.");
    if ((basisType === "APPLICABLE_EXCEPTION") !== (input.classification === RightsClassification.TDM_ELIGIBLE))
      throw approvalError("The processing basis and rights classification must agree.");
    const evidenceReference = String(input.evidenceReference || "").trim();
    const evidenceIssuer = String(input.evidenceIssuer || "").trim();
    if (evidenceReference.length < 8 || evidenceReference.length > 2000 || evidenceIssuer.length < 3 || evidenceIssuer.length > 300)
      throw approvalError("Provide an evidence reference and the rights-holder or independent reviewer who issued it.");
    if (input.authorityConfirmed !== true) throw approvalError("Confirm that the evidence covers these rights and this scope.");
    if (!Array.isArray(input.selectedFeatures)) throw approvalError("Choose supported intelligence capabilities.");
    const selectedFeatures = [...new Set(input.selectedFeatures)];
    if (!selectedFeatures.length || selectedFeatures.some((feature) => !processingApprovalFeatures[feature]))
      throw approvalError("Choose supported intelligence capabilities. Captions, dubbing and voice permissions remain separate.");
    if (!selectedFeatures.some((feature) => feature !== "transcription")) throw approvalError("Choose at least one intelligence capability.");
    const dates = {};
    for (const field of ["expiresAt", "reviewAt"]) {
      if (input[field]) {
        const time = Date.parse(input[field]);
        if (!Number.isFinite(time) || time <= this.now()) throw approvalError("Review and expiry dates must be valid future dates.");
        dates[field] = new Date(time).toISOString();
      } else dates[field] = null;
    }
    if (!Array.isArray(input.territories)) throw approvalError("Record the territories covered by the evidence.");
    const territories = [...new Set(input.territories)];
    if (!territories.length || territories.length > 50 ||
        territories.some((territory) => !/^(WORLDWIDE|[A-Z]{2})$/.test(territory)) ||
        (territories.includes("WORLDWIDE") && territories.length !== 1))
      throw approvalError("Record WORLDWIDE or explicit two-letter territories, without mixing them.");
    if (input.expectedAssessmentRevision !== this.assessmentRevision(input.feedUrl, input.episodeId || ""))
      throw approvalError("The rights assessment changed. Refresh and preview it before approving.");
    const episodeIds = input.episodeId ? [input.episodeId] : input.coveredEpisodeIds;
    if (!Array.isArray(episodeIds) || !episodeIds.length || episodeIds.length > 500 ||
        episodeIds.some((id) => typeof id !== "string" || !id || id.length > 2000))
      throw approvalError("Record the exact existing episodes covered by this assessment.");
    return {
      legalBasis, reason, prior, basisType, evidenceReference, evidenceIssuer, selectedFeatures,
      coverage: { episodeIds: [...new Set(episodeIds)], futureEpisodes: !input.episodeId && input.applyToFuture === true },
      territories, ...dates,
    };
  }
  approveProcessing(input = {}, { actor = "admin" } = {}) {
    const validated = this.validateProcessingApproval(input);
    const { legalBasis, reason, prior } = validated;
    const selected = new Set(validated.selectedFeatures);
    let record, override;
    this.store.transaction(() => {
    record = this.set({
      feedUrl: input.feedUrl,
      episodeId: input.episodeId || undefined,
      publisher: input.publisher,
      podcast: input.podcast,
      episodeTitle: input.episodeTitle,
      classification: input.classification,
      legalBasis,
      approvalAssessment: { schemaVersion: 1, ...validated, prior: undefined, reviewedBy: actor, decidedAt: new Date(this.now()).toISOString() },
      assessmentSource: "super-admin-evidence-review",
      assessmentReason: reason,
      assessmentEvidence: [...(prior.assessmentEvidence || []), { type: validated.basisType, source: validated.evidenceIssuer, scope: input.episodeId ? "episode" : "podcast", value: validated.evidenceReference }],
      blockerCode: null,
      restrictions: "Approved for bounded Radio Star intelligence only.",
      assessmentStatus: RightsAssessmentStatus.APPROVED,
      explicitAuthorisation: input.classification === RightsClassification.LICENSED,
      rightsReserved: false,
      canAcquireTranscript: true,
      canProcessForAi: true,
      canTranscribeAudio: selected.has("transcription"),
      canDisplayDerivedIntelligence: true,
      ...Object.fromEntries(Object.entries(processingApprovalFeatures).map(([feature, permission]) => [permission, selected.has(feature)])),
      canRetain: true,
      canRegenerate: true,
      // Core approval cannot expand independent permissions. Preserve only
      // active grants already recorded at this exact scope, with their evidence.
      ...Object.fromEntries([
        ["canDisplayCaptions", "captions"], ["canTranslateText", "translation-text"],
        ["canGenerateDubbedAudio", "dubbing-audio"], ["canCacheTranslatedAudio", "dubbing-audio"],
        ["canDistributeTranslation", "dubbing-audio"], ["canCloneSpeakerVoice", "voice-cloning"],
      ].map(([permission, feature]) => [permission, (prior.episodeId || "") === (input.episodeId || "") &&
        prior[permission] === true && this.evaluate({ feature, feedUrl: input.feedUrl, episodeId: input.episodeId || "" }).allowed])),
    }, { actor });
    // A documented TDM basis can relax only the optional STRONG workflow for
    // this scope. It never disables mandatory checks or other feature gates.
    override = this.setOverride({
      feedUrl: input.feedUrl,
      episodeId: input.episodeId || undefined,
      mode: input.classification === RightsClassification.TDM_ELIGIBLE ? RightsEnforcementMode.LITE : undefined,
      features: {
        intelligenceProcessing: true,
        intelligenceDisplay: true,
        conversationSearch: true,
      },
      reason: `Super Admin approval: ${reason}`,
    }, { actor });
    this.audit("super-admin-processing-approved", record.id, actor, {
      scope: record.episodeId ? "episode" : "podcast",
      classification: record.classification,
      legalBasis,
      audioTranscriptionApproved: record.canTranscribeAudio,
      reason,
    });
    this.store.set("rights-review-history", randomUUID(), {
      at: this.now(), actor, target: record.id, previous: prior, next: record, reason,
    });
    });
    return { record, override, reason };
  }
  previewProcessingApproval(input) {
    const staged = new Map();
    const preview = new RightsRegistry({
      get: (kind, id) => staged.has(`${kind}:${id}`) ? staged.get(`${kind}:${id}`) : this.store.get(kind, id),
      set: (kind, id, value) => staged.set(`${kind}:${id}`, value),
      transaction: (operation) => operation(),
    }, { now: this.now });
    const { record } = preview.approveProcessing(input, { actor: "preview" });
    return { record, evaluate: (query) => preview.evaluate(query) };
  }
  revokeApproval(input, { actor = "admin" } = {}) {
    if (input.confirmation !== "REVOKE APPROVAL" || !String(input.reason || "").trim())
      throw approvalError("Provide a reason and type REVOKE APPROVAL.");
    if (input.expectedAssessmentRevision !== this.assessmentRevision(input.feedUrl, input.episodeId || ""))
      throw approvalError("The rights assessment changed. Refresh before revoking.");
    const id = key(input.feedUrl, input.episodeId || ""), previous = this.store.get("rights", id);
    if (!previous?.approvalAssessment) throw approvalError("This scope has no structured approval to revoke.");
    const record = { ...previous, version: (previous.version || 0) + 1, updatedAt: this.now(), updatedBy: actor,
      approvalAssessment: { ...previous.approvalAssessment, revokedAt: new Date(this.now()).toISOString(), revokedBy: actor, revocationReason: String(input.reason).slice(0, 1000) } };
    this.store.transaction(() => {
      this.store.set("rights", id, record);
      this.store.set("rights-review-history", randomUUID(), { at: this.now(), actor, target: id, previous, next: record, reason: input.reason });
      this.audit("processing-approval-revoked", id, actor, { reason: input.reason });
    });
    return record;
  }
  setOverride(input = {}, { actor = "admin" } = {}) {
    if (typeof input.feedUrl !== "string" || !input.feedUrl) throw Error("A publisher feed is required.");
    if (input.episodeId !== undefined && typeof input.episodeId !== "string") throw Error("Episode identity is invalid.");
    if (input.mode !== undefined && !modeValues.has(input.mode)) throw Error("Choose a valid override mode.");
    if (input.features !== undefined && (!input.features || typeof input.features !== "object")) throw Error("Feature controls are invalid.");
    for (const [name, value] of Object.entries(input.features || {}))
      if (!(name in optionalFeatures) || typeof value !== "boolean") throw Error("Feature controls are invalid.");
    const id = overrideKey(input.feedUrl, input.episodeId || ""), prior = this.store.get("rights-policy-override", id), at = this.now();
    const record = {
      id, feedUrl: input.feedUrl, episodeId: input.episodeId || null,
      mode: input.mode || prior?.mode || null,
      features: { ...(prior?.features || {}), ...(input.features || {}) },
      reason: typeof input.reason === "string" ? input.reason.slice(0, 1000) : prior?.reason || null,
      updatedAt: at, updatedBy: actor,
      history: [...(prior?.history || []), { at, actor, action: "override-changed", mode: input.mode || null, features: input.features || {} }].slice(-50),
    };
    this.store.set("rights-policy-override", id, record);
    this.store.set("rights-policy-history", randomUUID(), { at, actor, action: "override-changed", scope: input.episodeId ? "episode" : "publisher", overrideId: id });
    return record;
  }
  override(feedUrl, episodeId = "") {
    return this.store.get("rights-policy-override", overrideKey(feedUrl, episodeId)) ||
      this.store.get("rights-policy-override", overrideKey(feedUrl));
  }
  resolve(feedUrl, episodeId = "") {
    const episode = this.store.get("rights", key(feedUrl, episodeId));
    const podcast = this.store.get("rights", key(feedUrl));
    const mandatory = mandatoryRestriction;
    // A channel-level reservation/dispute always constrains an episode. An
    // episode record cannot be used to sidestep the publisher's mandatory hold.
    const covered = !podcast?.approvalAssessment || !episodeId || podcast.approvalAssessment.coverage.futureEpisodes ||
      podcast.approvalAssessment.coverage.episodeIds.includes(episodeId);
    // A documented channel approval supersedes an automatic missing-basis
    // assessment, never an explicit episode restriction or human assessment.
    const automaticMissing = episode?.assessmentSource?.startsWith("publisher-rss-") && episode?.blockerCode === "LEGAL_BASIS_NOT_ESTABLISHED";
    const selected = mandatory(episode) ? episode : mandatory(podcast) ? podcast
      : covered && podcast?.approvalAssessment && automaticMissing ? podcast : episode || (covered ? podcast : null);
    return (
      normaliseRecord(selected) || {
        id: null,
        feedUrl,
        episodeId: episodeId || null,
        classification: RightsClassification.RESTRICTED,
        publisher: null,
        licence: null,
        restrictions: "This episode has not been assessed yet.",
        assessmentStatus: RightsAssessmentStatus.UNASSESSED,
        legalBasis: null,
        explicitAuthorisation: false,
        rightsReserved: false,
        ...bools(),
        suspendedAt: null,
        deletedAt: null,
      }
    );
  }
  evaluate({ feature, feedUrl, episodeId = "", audit = false, policy: policyOverride } = {}) {
    if (!featurePermission[feature]) throw Error("A valid rights feature is required.");
    const rights = this.resolve(feedUrl, episodeId), policy = policyOverride || this.policy(), override = this.override(feedUrl, episodeId);
    const mode = override?.mode || policy.mode;
    const features = { ...policy.features, ...(override?.features || {}) };
    const optionalFeature = optionalFeatureFor[feature];
    let allowed = true, code = "ALLOWED", reason = "Rights requirements are satisfied.", outputProfile = "standard";
    if (!rights.id) [allowed, code, reason] = [false, "LEGAL_BASIS_NOT_ESTABLISHED", "No rights assessment has been completed for this episode yet."];
    else if (rights.suspendedAt || rights.deletedAt) [allowed, code, reason] = [false, "TAKEDOWN_OR_SUSPENSION", "This content is suspended or subject to a takedown."];
    else if (rights.rightsReserved || rights.classification === RightsClassification.DISPUTED) [allowed, code, reason] = [false, rights.blockerCode || "RIGHTS_RESERVED", rights.assessmentReason || "The rights record reserves this feature or is under dispute."];
    else if (mandatoryRestriction(rights)) [allowed, code, reason] = [false, rights.blockerCode, rights.assessmentReason || "A recorded mandatory restriction applies to this content."];
    else if (rights.approvalAssessment?.revokedAt) [allowed, code, reason] = [false, "APPROVAL_REVOKED", "The documented approval has been revoked. Review new evidence before processing."];
    else if (rights.approvalAssessment?.expiresAt && Date.parse(rights.approvalAssessment.expiresAt) <= this.now()) [allowed, code, reason] = [false, "APPROVAL_EXPIRED", "The documented approval has expired."];
    else if (rights.approvalAssessment?.territories?.some((territory) => territory !== "WORLDWIDE")) [allowed, code, reason] = [false, "TERRITORY_REVIEW_REQUIRED", "This approval has territory limits. Processing and delivery are held until those limits can be enforced."];
    else if (rights.classification === RightsClassification.RESTRICTED) [allowed, code, reason] = [false, rights.blockerCode || "RIGHTS_RESTRICTED", rights.assessmentReason || "The rights assessment does not permit this feature."];
    else if (!featurePermission[feature].every((name) => rights[name] === true)) [allowed, code, reason] = [false, "FEATURE_NOT_AUTHORISED", "This feature is not authorised by the rights record."];
    else if (optionalFeature && features[optionalFeature] === false) [allowed, code, reason] = [false, "POLICY_FEATURE_DISABLED", "This optional intelligence feature is disabled by policy."];
    // This is deliberately not a rights bypass. It is only available for an
    // explicit, server-owned authorised test record and never changes the
    // independent caption, dubbing, translation, or voice-consent gates.
    else if (optionalFeature && policy.testMode?.enabled && rights.testContentEligible === true) {
      outputProfile = "short-grounded";
      reason = "Allowed for explicitly authorised Super Admin test content with short, grounded intelligence.";
    }
    else if (optionalFeature && mode === RightsEnforcementMode.MEDIUM && rights.assessmentStatus !== RightsAssessmentStatus.APPROVED) [allowed, code, reason] = [false, "ASSESSMENT_REQUIRED", "An approved rights assessment is required by the current policy."];
    else if (optionalFeature && mode === RightsEnforcementMode.STRONG && !(rights.classification === RightsClassification.LICENSED && (rights.explicitAuthorisation === true || rights.assessmentStatus === RightsAssessmentStatus.APPROVED))) [allowed, code, reason] = [false, "EXPLICIT_AUTHORISATION_REQUIRED", "Explicit authorisation is required by the current policy."];
    else if (optionalFeature && mode === RightsEnforcementMode.LITE) {
      outputProfile = "short-grounded";
      reason = "Allowed with short, grounded, non-substitutive intelligence.";
    }
    const decision = { allowed, code, reason, feature, mode, policyVersion: policy.version, outputProfile, classification: rights.classification, testMode: policy.testMode?.enabled === true, rights, override: override ? { id: override.id, scope: override.episodeId ? "episode" : "publisher" } : null };
    if (audit) this.auditDecision(decision, { feedUrl, episodeId });
    return decision;
  }
  previewPolicy(input = {}) {
    const current = this.policy();
    if (input.mode !== undefined && !modeValues.has(input.mode))
      throw Error("Choose a valid rights enforcement mode.");
    if (input.features !== undefined && (!input.features || typeof input.features !== "object"))
      throw Error("Feature controls are invalid.");
    for (const [name, value] of Object.entries(input.features || {}))
      if (!(name in optionalFeatures) || typeof value !== "boolean")
        throw Error("Feature controls are invalid.");
    const candidate = {
      ...current,
      mode: input.mode || current.mode,
      features: { ...current.features, ...(input.features || {}) },
    };
    const features = ["intelligence-processing", "intelligence-display", "conversation-search"];
    const records = this.list();
    const changes = records.flatMap((record) =>
      features.map((feature) => {
        const currentDecision = this.evaluate({
          feature,
          feedUrl: record.feedUrl,
          episodeId: record.episodeId || "",
        });
        const nextDecision = this.evaluate({
          feature,
          feedUrl: record.feedUrl,
          episodeId: record.episodeId || "",
          policy: candidate,
        });
        return {
          feature,
          feedUrl: record.feedUrl,
          episodeId: record.episodeId || null,
          publisher: record.publisher || null,
          previous: currentDecision.allowed ? "ALLOWED" : "BLOCKED",
          next: nextDecision.allowed ? "ALLOWED" : "BLOCKED",
          reason: nextDecision.code,
        };
      }),
    );
    return {
      policy: {
        mode: candidate.mode,
        features: candidate.features,
        version: current.version,
      },
      affected: {
        previouslyAllowed: changes.filter((change) => change.previous === "ALLOWED").length,
        newlyAllowed: changes.filter((change) => change.previous === "BLOCKED" && change.next === "ALLOWED").length,
        newlyRestricted: changes.filter((change) => change.previous === "ALLOWED" && change.next === "BLOCKED").length,
        stillRestricted: changes.filter((change) => change.previous === "BLOCKED" && change.next === "BLOCKED").length,
      },
      changes,
    };
  }
  auditDecision(decision, { feedUrl, episodeId = "" } = {}) {
    const at = this.now(), publisher = String(decision.rights.publisher || "").slice(0, 300) || null;
    this.store.transaction(() => {
      const metricId = [decision.policyVersion, decision.mode, decision.feature, decision.allowed ? "allowed" : "blocked"].join(":"), prior = this.store.get("rights-policy-metric", metricId) || { count: 0 };
      this.store.set("rights-policy-metric", metricId, { ...prior, count: prior.count + 1, policyVersion: decision.policyVersion, mode: decision.mode, feature: decision.feature, decision: decision.allowed ? "ALLOWED" : "BLOCKED", updatedAt: at });
      this.store.set("rights-policy-audit", randomUUID(), { at, feature: decision.feature, feedUrl, episodeId: episodeId || null, publisher, classification: decision.classification, enforcementMode: decision.mode, policyVersion: decision.policyVersion, decision: decision.allowed ? "ALLOWED" : "BLOCKED", reason: decision.reason, code: decision.code });
    });
  }
  set(input, { actor = "admin" } = {}) {
    if (!input || typeof input.feedUrl !== "string" || !input.feedUrl)
      throw Error("A publisher feed is required.");
    if (!Object.values(RightsClassification).includes(input.classification))
      throw Error("Choose a valid rights classification.");
    if (input.episodeId !== undefined && typeof input.episodeId !== "string")
      throw Error("Episode identity is invalid.");
    if (input.assessmentStatus !== undefined && !assessmentValues.has(input.assessmentStatus)) throw Error("Rights assessment status is invalid.");
    for (const name of ["explicitAuthorisation", "rightsReserved", "testContentEligible"])
      if (input[name] !== undefined && typeof input[name] !== "boolean") throw Error("Rights assessment controls must be true or false.");
    for (const name of permissions)
      if (input[name] !== undefined && typeof input[name] !== "boolean")
        throw Error("Rights permissions must be true or false.");
    if (input.assessmentEvidence !== undefined && !Array.isArray(input.assessmentEvidence))
      throw Error("Rights assessment evidence is invalid.");
    const id = key(input.feedUrl, input.episodeId || "");
    const prior = this.store.get("rights", id);
    const record = {
      id,
      feedUrl: input.feedUrl,
      episodeId: input.episodeId || null,
      publisher: typeof input.publisher === "string" ? input.publisher.slice(0, 300) : prior?.publisher || null,
      podcast: typeof input.podcast === "string" ? input.podcast.slice(0, 300) : prior?.podcast || null,
      episodeTitle: typeof input.episodeTitle === "string" ? input.episodeTitle.slice(0, 500) : prior?.episodeTitle || null,
      classification: input.classification,
      licence: typeof input.licence === "string" ? input.licence.slice(0, 1000) : prior?.licence || null,
      restrictions: typeof input.restrictions === "string" ? input.restrictions.slice(0, 2000) : prior?.restrictions || null,
      legalBasis: typeof input.legalBasis === "string" ? input.legalBasis.slice(0, 1000) : prior?.legalBasis || null,
      assessmentStatus: input.assessmentStatus || prior?.assessmentStatus || (input.classification === RightsClassification.LICENSED ? RightsAssessmentStatus.APPROVED : RightsAssessmentStatus.UNASSESSED),
      explicitAuthorisation: input.explicitAuthorisation === undefined ? prior?.explicitAuthorisation === true || (input.classification === RightsClassification.LICENSED && input.canProcessForAi === true && input.canDisplayDerivedIntelligence === true) : input.explicitAuthorisation,
      rightsReserved: input.rightsReserved === undefined ? prior?.rightsReserved === true : input.rightsReserved,
      testContentEligible: input.testContentEligible === undefined ? prior?.testContentEligible === true : input.testContentEligible,
      blockerCode: typeof input.blockerCode === "string" ? input.blockerCode.slice(0, 120) : input.blockerCode === null ? null : prior?.blockerCode || null,
      assessmentReason: typeof input.assessmentReason === "string" ? input.assessmentReason.slice(0, 2000) : input.assessmentReason === null ? null : prior?.assessmentReason || null,
      assessmentSource: typeof input.assessmentSource === "string" ? input.assessmentSource.slice(0, 120) : input.assessmentSource === null ? null : prior?.assessmentSource || null,
      assessmentVersion: typeof input.assessmentVersion === "string" ? input.assessmentVersion.slice(0, 120) : input.assessmentVersion === null ? null : prior?.assessmentVersion || null,
      evidenceFingerprint: typeof input.evidenceFingerprint === "string" ? input.evidenceFingerprint.slice(0, 128) : input.evidenceFingerprint === null ? null : prior?.evidenceFingerprint || null,
      assessmentEvidence: input.assessmentEvidence === undefined ? normaliseEvidence(prior?.assessmentEvidence) : normaliseEvidence(input.assessmentEvidence),
      approvalAssessment: input.approvalAssessment === undefined ? prior?.approvalAssessment || null : input.approvalAssessment,
      version: (prior?.version || 0) + 1,
      assessmentDate: input.assessmentDate || new Date(this.now()).toISOString(),
      ...bools({ ...prior, ...input }),
      // Preserve pre-feature-granularity authorised records. New assessments
      // always set these explicitly; this compatibility path never extends to
      // captions, translation, dubbing or voice replication.
      canGenerateBrief: input.canGenerateBrief === undefined ? (prior?.canGenerateBrief === true || (input.canProcessForAi === true && input.canDisplayDerivedIntelligence === true)) : input.canGenerateBrief,
      canGenerateChapters: input.canGenerateChapters === undefined ? (prior?.canGenerateChapters === true || (input.canProcessForAi === true && input.canDisplayDerivedIntelligence === true)) : input.canGenerateChapters,
      canGenerateTopics: input.canGenerateTopics === undefined ? (prior?.canGenerateTopics === true || (input.canProcessForAi === true && input.canDisplayDerivedIntelligence === true)) : input.canGenerateTopics,
      canSearchMoments: input.canSearchMoments === undefined ? (prior?.canSearchMoments === true || (input.canProcessForAi === true && input.canDisplayDerivedIntelligence === true)) : input.canSearchMoments,
      canSearchConversations: input.canSearchConversations === undefined ? (prior?.canSearchConversations ?? (input.canDisplayDerivedIntelligence === true)) : input.canSearchConversations,
      canDetectAdvertisements: input.canDetectAdvertisements === undefined ? (prior?.canDetectAdvertisements === true || (input.canProcessForAi === true && input.canDisplayDerivedIntelligence === true)) : input.canDetectAdvertisements,
      suspendedAt: input.suspendedAt || null,
      deletedAt: input.deletedAt || null,
      updatedAt: this.now(),
      updatedBy: actor,
      history: [...(prior?.history || []), {
        at: this.now(), actor, action: "assessment", classification: input.classification,
      }].slice(-50),
    };
    this.store.set("rights", id, record);
    return record;
  }
  assessAutomatic(input = {}, { actor = "system:publisher-rss" } = {}) {
    if (!input || typeof input.feedUrl !== "string" || !input.feedUrl || typeof input.episodeId !== "string" || !input.episodeId)
      throw Error("A publisher feed and episode are required for an automatic rights assessment.");
    const prior = this.resolve(input.feedUrl, input.episodeId);
    const mandatory = prior.id && (prior.suspendedAt || prior.deletedAt || prior.rightsReserved || prior.classification === RightsClassification.DISPUTED);
    if (mandatory) return { record: prior, reused: true, mandatory: true };
    // Human-entered rights records remain authoritative. Automatic evidence may
    // refresh only a prior automatic assessment for the same episode.
    if (prior.id && prior.assessmentSource !== input.assessmentSource)
      return { record: prior, reused: true, mandatory: false };
    if (prior.id && prior.evidenceFingerprint && prior.evidenceFingerprint === input.evidenceFingerprint)
      return { record: prior, reused: true, mandatory: false };
    const record = this.set({ ...input, episodeId: input.episodeId }, { actor });
    this.audit("rights-assessed-automatically", record.id, actor, {
      classification: record.classification,
      assessmentStatus: record.assessmentStatus,
      blockerCode: record.blockerCode,
      evidenceCount: record.assessmentEvidence.length,
      assessmentVersion: record.assessmentVersion,
    });
    return { record: normaliseRecord(record), reused: false, mandatory: false };
  }
  suspend(feedUrl, episodeId, reason, { actor = "admin" } = {}) {
    const prior = this.resolve(feedUrl, episodeId);
    const id = key(feedUrl, episodeId || "");
    const record = {
      ...prior,
      id,
      feedUrl,
      episodeId: episodeId || null,
      classification: RightsClassification.DISPUTED,
      ...bools(),
      assessmentStatus: RightsAssessmentStatus.PENDING,
      explicitAuthorisation: false,
      rightsReserved: true,
      restrictions: String(reason || "Rights review pending.").slice(0, 2000),
      suspendedAt: this.now(),
      updatedAt: this.now(),
      updatedBy: actor,
      history: [...(prior.history || []), { at: this.now(), actor, action: "suspended", reason: String(reason || "").slice(0, 1000) }].slice(-50),
    };
    this.store.set("rights", id, record);
    return record;
  }
  markDeleted(feedUrl, episodeId, reason, { actor = "admin" } = {}) {
    const record = this.suspend(feedUrl, episodeId, reason, { actor });
    const deleted = {
      ...record,
      deletedAt: this.now(),
      history: [...record.history, { at: this.now(), actor, action: "deleted" }].slice(-50),
    };
    this.store.set("rights", deleted.id, deleted);
    return deleted;
  }
  list() {
    return this.store.all("rights").map(([, value]) => normaliseRecord(value));
  }
  controlCentre() {
    const audits = this.store.all("rights-policy-audit").map(([, value]) => value).sort((a, b) => b.at - a.at).slice(0, 500);
    const records = this.list();
    return {
      policy: this.policy(),
      overrides: this.store.all("rights-policy-override").map(([, value]) => value),
      records,
      metrics: this.store.all("rights-policy-metric").map(([, value]) => value),
      assessments: records.map((record) => ({ id: record.id, feedUrl: record.feedUrl, episodeId: record.episodeId, publisher: record.publisher, classification: record.classification, assessmentStatus: record.assessmentStatus || RightsAssessmentStatus.UNASSESSED, legalBasis: record.legalBasis || null, blockerCode: record.blockerCode || null, assessmentReason: record.assessmentReason || null, assessmentSource: record.assessmentSource || null, evidence: record.assessmentEvidence, explicitAuthorisation: record.explicitAuthorisation === true, rightsReserved: record.rightsReserved === true, updatedAt: record.updatedAt })),
      reservations: records.filter((record) => record.rightsReserved === true),
      takedowns: records.filter((record) => record.suspendedAt || record.deletedAt),
      audit: audits,
      auditHistory: this.store.all("rights-audit").map(([, value]) => value).sort((a, b) => b.at - a.at).slice(0, 500),
      policyHistory: this.store.all("rights-policy-history").map(([, value]) => value).sort((a, b) => b.at - a.at).slice(0, 500),
    };
  }
  audit(action, target, actor, metadata = {}) {
    this.store.set("rights-audit", randomUUID(), {
      action,
      target,
      actor,
      metadata,
      at: this.now(),
    });
  }
}
