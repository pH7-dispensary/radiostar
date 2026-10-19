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
  "conversation-search": ["canDisplayDerivedIntelligence"],
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
  updatedAt: Date.now(),
  updatedBy: "system",
  history: [],
});
const normaliseRecord = (record) => record && ({
  ...record,
  assessmentStatus: assessmentValues.has(record.assessmentStatus) ? record.assessmentStatus : record.classification === RightsClassification.LICENSED ? RightsAssessmentStatus.APPROVED : RightsAssessmentStatus.UNASSESSED,
  explicitAuthorisation: record.explicitAuthorisation === true || (record.classification === RightsClassification.LICENSED && record.canProcessForAi === true && record.canDisplayDerivedIntelligence === true),
  rightsReserved: record.rightsReserved === true,
});

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
    const selected = episode?.suspendedAt || episode?.deletedAt ? episode : podcast?.suspendedAt || podcast?.deletedAt ? podcast : episode || podcast;
    return (
      normaliseRecord(selected) || {
        id: null,
        feedUrl,
        episodeId: episodeId || null,
        classification: RightsClassification.RESTRICTED,
        publisher: null,
        licence: null,
        restrictions: "No rights assessment has authorised processing.",
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
  evaluate({ feature, feedUrl, episodeId = "", audit = false } = {}) {
    if (!featurePermission[feature]) throw Error("A valid rights feature is required.");
    const rights = this.resolve(feedUrl, episodeId), policy = this.policy(), override = this.override(feedUrl, episodeId);
    const mode = override?.mode || policy.mode;
    const features = { ...policy.features, ...(override?.features || {}) };
    const optionalFeature = optionalFeatureFor[feature];
    let allowed = true, code = "ALLOWED", reason = "Rights requirements are satisfied.", outputProfile = "standard";
    if (rights.suspendedAt || rights.deletedAt) [allowed, code, reason] = [false, "TAKEDOWN_OR_SUSPENSION", "This content is suspended or subject to a takedown."];
    else if (rights.rightsReserved || [RightsClassification.RESTRICTED, RightsClassification.DISPUTED].includes(rights.classification)) [allowed, code, reason] = [false, "RIGHTS_RESERVED", "The rights record does not permit this feature."];
    else if (!featurePermission[feature].every((name) => rights[name] === true)) [allowed, code, reason] = [false, "FEATURE_NOT_AUTHORISED", "This feature is not authorised by the rights record."];
    else if (optionalFeature && features[optionalFeature] === false) [allowed, code, reason] = [false, "POLICY_FEATURE_DISABLED", "This optional intelligence feature is disabled by policy."];
    else if (optionalFeature && mode === RightsEnforcementMode.MEDIUM && rights.assessmentStatus !== RightsAssessmentStatus.APPROVED) [allowed, code, reason] = [false, "ASSESSMENT_REQUIRED", "An approved rights assessment is required by the current policy."];
    else if (optionalFeature && mode === RightsEnforcementMode.STRONG && !(rights.classification === RightsClassification.LICENSED && (rights.explicitAuthorisation === true || rights.assessmentStatus === RightsAssessmentStatus.APPROVED))) [allowed, code, reason] = [false, "EXPLICIT_AUTHORISATION_REQUIRED", "Explicit authorisation is required by the current policy."];
    else if (optionalFeature && mode === RightsEnforcementMode.LITE) {
      outputProfile = "short-grounded";
      reason = "Allowed with short, grounded, non-substitutive intelligence.";
    }
    const decision = { allowed, code, reason, feature, mode, policyVersion: policy.version, outputProfile, classification: rights.classification, rights, override: override ? { id: override.id, scope: override.episodeId ? "episode" : "publisher" } : null };
    if (audit) this.auditDecision(decision, { feedUrl, episodeId });
    return decision;
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
    for (const name of ["explicitAuthorisation", "rightsReserved"])
      if (input[name] !== undefined && typeof input[name] !== "boolean") throw Error("Rights assessment controls must be true or false.");
    for (const name of permissions)
      if (input[name] !== undefined && typeof input[name] !== "boolean")
        throw Error("Rights permissions must be true or false.");
    const id = key(input.feedUrl, input.episodeId || "");
    const prior = this.store.get("rights", id);
    const record = {
      id,
      feedUrl: input.feedUrl,
      episodeId: input.episodeId || null,
      publisher: typeof input.publisher === "string" ? input.publisher.slice(0, 300) : prior?.publisher || null,
      podcast: typeof input.podcast === "string" ? input.podcast.slice(0, 300) : prior?.podcast || null,
      classification: input.classification,
      licence: typeof input.licence === "string" ? input.licence.slice(0, 1000) : prior?.licence || null,
      restrictions: typeof input.restrictions === "string" ? input.restrictions.slice(0, 2000) : prior?.restrictions || null,
      legalBasis: typeof input.legalBasis === "string" ? input.legalBasis.slice(0, 1000) : prior?.legalBasis || null,
      assessmentStatus: input.assessmentStatus || prior?.assessmentStatus || (input.classification === RightsClassification.LICENSED ? RightsAssessmentStatus.APPROVED : RightsAssessmentStatus.UNASSESSED),
      explicitAuthorisation: input.explicitAuthorisation === undefined ? prior?.explicitAuthorisation === true || (input.classification === RightsClassification.LICENSED && input.canProcessForAi === true && input.canDisplayDerivedIntelligence === true) : input.explicitAuthorisation,
      rightsReserved: input.rightsReserved === undefined ? prior?.rightsReserved === true : input.rightsReserved,
      assessmentDate: input.assessmentDate || new Date(this.now()).toISOString(),
      ...bools({ ...prior, ...input }),
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
    return this.store.all("rights").map(([, value]) => value);
  }
  controlCentre() {
    const audits = this.store.all("rights-policy-audit").map(([, value]) => value).sort((a, b) => b.at - a.at).slice(0, 500);
    return {
      policy: this.policy(),
      overrides: this.store.all("rights-policy-override").map(([, value]) => value),
      records: this.list(),
      metrics: this.store.all("rights-policy-metric").map(([, value]) => value),
      assessments: this.list().map((record) => ({ id: record.id, feedUrl: record.feedUrl, episodeId: record.episodeId, publisher: record.publisher, classification: record.classification, assessmentStatus: record.assessmentStatus || RightsAssessmentStatus.UNASSESSED, legalBasis: record.legalBasis || null, explicitAuthorisation: record.explicitAuthorisation === true, rightsReserved: record.rightsReserved === true, updatedAt: record.updatedAt })),
      takedowns: this.list().filter((record) => record.suspendedAt || record.deletedAt),
      audit: audits,
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
