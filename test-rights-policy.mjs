import assert from "node:assert/strict";
import { LocalStore } from "./persistence.mjs";
import {
  RightsAssessmentStatus,
  RightsClassification,
  RightsEnforcementMode,
  RightsRegistry,
} from "./rights-registry.mjs";

const store = new LocalStore(":memory:"), rights = new RightsRegistry(store, { now: () => 1_700_000_000_000 });
const feedUrl = "https://publisher.example/rights-policy.xml", episodeId = "policy-episode";
const tdm = {
  feedUrl, episodeId, classification: RightsClassification.TDM_ELIGIBLE,
  legalBasis: "Documented qualifying TDM assessment.",
  canAcquireTranscript: true, canProcessForAi: true, canDisplayDerivedIntelligence: true,
  canRetain: true, canDisplayCaptions: false, canTranslateText: false,
  canGenerateDubbedAudio: false, canCacheTranslatedAudio: false, canDistributeTranslation: false,
};
try {
  rights.set(tdm);
  assert.equal(rights.policy().mode, RightsEnforcementMode.STRONG, "the migration-safe default remains strong");
  assert.equal(rights.evaluate({ feature: "intelligence-processing", feedUrl, episodeId }).allowed, false, "strong requires explicit authorisation");

  const lite = rights.setPolicy({ mode: RightsEnforcementMode.LITE }, { actor: "test-admin" });
  const liteDecision = rights.evaluate({ feature: "intelligence-processing", feedUrl, episodeId, audit: true });
  assert.equal(liteDecision.allowed, true, "qualifying TDM can be processed in lite mode");
  assert.equal(liteDecision.outputProfile, "short-grounded", "lite output is bounded and non-substitutive");

  rights.setPolicy({ mode: RightsEnforcementMode.MEDIUM });
  assert.equal(rights.evaluate({ feature: "intelligence-display", feedUrl, episodeId }).code, "ASSESSMENT_REQUIRED", "medium requires an additional assessment");
  rights.set({ ...tdm, assessmentStatus: RightsAssessmentStatus.APPROVED });
  assert.equal(rights.evaluate({ feature: "intelligence-display", feedUrl, episodeId }).allowed, true, "approved assessment satisfies medium");

  rights.setPolicy({ mode: RightsEnforcementMode.STRONG });
  assert.equal(rights.evaluate({ feature: "intelligence-display", feedUrl, episodeId }).code, "EXPLICIT_AUTHORISATION_REQUIRED", "strong does not treat TDM as explicit authorisation");
  rights.set({ ...tdm, classification: RightsClassification.LICENSED, assessmentStatus: RightsAssessmentStatus.APPROVED, explicitAuthorisation: true, rightsReserved: false });
  assert.equal(rights.evaluate({ feature: "intelligence-display", feedUrl, episodeId }).allowed, true, "explicit licensed authorisation satisfies strong");

  rights.setPolicy({ mode: RightsEnforcementMode.OFF });
  assert.equal(rights.evaluate({ feature: "captions", feedUrl, episodeId }).code, "FEATURE_NOT_AUTHORISED", "OFF never grants independently gated captions");
  assert.equal(rights.evaluate({ feature: "dubbing-audio", feedUrl, episodeId }).code, "FEATURE_NOT_AUTHORISED", "OFF never grants independently gated dubbing");
  rights.set({ ...tdm, classification: RightsClassification.RESTRICTED, assessmentStatus: RightsAssessmentStatus.REJECTED, rightsReserved: true });
  assert.equal(rights.evaluate({ feature: "intelligence-processing", feedUrl, episodeId }).code, "RIGHTS_RESERVED", "OFF cannot bypass an explicit reservation");

  rights.set({ ...tdm, classification: RightsClassification.LICENSED, assessmentStatus: RightsAssessmentStatus.APPROVED, explicitAuthorisation: true, rightsReserved: false });
  rights.setPolicy({ mode: RightsEnforcementMode.STRONG, features: { intelligenceDisplay: true } });
  rights.setOverride({ feedUrl, mode: RightsEnforcementMode.LITE, features: { intelligenceDisplay: false }, reason: "Publisher-specific hold" });
  assert.equal(rights.evaluate({ feature: "intelligence-display", feedUrl, episodeId }).code, "POLICY_FEATURE_DISABLED", "publisher override can immediately hold one feature");
  const dashboard = rights.controlCentre();
  assert.equal(dashboard.policy.version > lite.version, true);
  assert.equal(dashboard.overrides.length, 1);
  assert.equal(dashboard.metrics.some((row) => row.feature === "intelligence-processing" && row.count === 1), true, "allowed and blocked decision counts persist");
  assert.equal(dashboard.audit.length, 1, "policy audit excludes personal listener identity");
  assert.equal(new RightsRegistry(store).controlCentre().policy.version, dashboard.policy.version, "policy survives a registry restart");
} finally {
  store.close();
}
console.log("Rights policy modes, mandatory gates, overrides, audit counts and persistence checks passed");
