import { createHash } from "node:crypto";

export const testingLimits = Object.freeze({ dailyUsd: 25, monthlyUsd: 125, dailyTranscriptionSeconds: 54_000, maxEpisodeSeconds: 14_400 });
export class IntelligenceTestMode {
  constructor(store, { now = Date.now } = {}) { this.store = store; this.now = now; }
  configuration() {
    const value = this.store.get("intelligence-test-mode", "configuration") || { enabled: false, version: 0, listenerIds: [], expiresAt: null };
    return { ...value, active: value.enabled === true && Date.parse(value.expiresAt) > this.now() };
  }
  eligibleListener(id) {
    return !!id && this.store.all("installation").some(([, row]) => row.id === id && !row.revokedAt && row.intelligenceEnabled !== false) &&
      this.store.all("pilot-device").some(([, row]) => row.listenerId === id && !row.revokedAt && Date.parse(row.expiresAt) > this.now());
  }
  allowed(id, version = null) {
    const config = this.configuration();
    return config.active && (version === null || version === config.version) && config.listenerIds.includes(id) && this.eligibleListener(id);
  }
  context(id) { return this.allowed(id) ? { listenerId: id, version: this.configuration().version } : null; }
  // One global allowance, with the existing expiry; not a per-user budget.
  platformContext() { const c = this.configuration(); return c.active ? { platform: true, version: c.version } : null; }
  adSkipAllowed(id) { return this.allowed(id) && this.configuration().adSkipPilotEnabled === true; }
  // Preparation is shared across eligible episodes, not tied to the listener
  // whose encounter won the queue race. Execution remains tester-specific.
  adSkipPreparationAllowed() { const c=this.configuration();return c.active && c.adSkipPilotEnabled===true && c.listenerIds.some(id=>this.allowed(id)); }
  limits(context) { return context && (context.platform === true ? this.configuration().active && context.version === this.configuration().version : this.allowed(context.listenerId, context.version)) ? testingLimits : {}; }
  set(input, actor) {
    return this.store.transaction(() => {
      const prior = this.configuration();
      if (input.expectedVersion !== prior.version) throw Error("Testing configuration changed. Reload before saving.");
      if (typeof input.enabled !== "boolean" || !String(input.reason || "").trim() || input.confirmation !== (input.enabled ? "ENABLE TESTING" : "DISABLE TESTING")) throw Error("Confirm the testing change and provide a reason.");
      if (input.adSkipPilotEnabled !== undefined && typeof input.adSkipPilotEnabled !== "boolean") throw Error("Ad Skip pilot must be enabled or disabled.");
      if (input.listenerIds !== undefined && (!Array.isArray(input.listenerIds) || input.listenerIds.some((id) => typeof id !== "string"))) throw Error("An explicit list of enrolled listeners is required.");
      const listenerIds = [...new Set(input.listenerIds || prior.listenerIds)];
      if (listenerIds.length > 5 || (input.enabled && (!listenerIds.length || listenerIds.some((id) => !this.eligibleListener(id))))) throw Error("Select existing active, enrolled internal listeners (maximum five).");
      const expiresAt = input.enabled ? input.expiresAt || (prior.active ? prior.expiresAt : new Date(this.now() + 7 * 86400000).toISOString()) : prior.expiresAt;
      if (input.enabled && (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= this.now() || Date.parse(expiresAt) > this.now() + 7 * 86400000)) throw Error("Testing must expire within seven days.");
      const next = { enabled: input.enabled, adSkipPilotEnabled: input.adSkipPilotEnabled ?? prior.adSkipPilotEnabled ?? false, listenerIds, expiresAt, version: prior.version + 1, updatedAt: new Date(this.now()).toISOString(), updatedBy: actor, reason: input.reason.trim().slice(0, 1000) };
      this.store.set("intelligence-test-mode", "configuration", next);
      this.store.set("intelligence-test-mode-history", String(next.version), { previous: prior, current: next });
      return this.configuration();
    });
  }
  attention({ feedUrl, episodeId, podcast, title, decision, durationMs }) {
    const id = createHash("sha256").update(JSON.stringify([feedUrl, episodeId])).digest("hex");
    const previous = this.store.get("intelligence-attention", id);
    const evidence = decision.rights?.assessmentEvidence || [];
    const fingerprint = createHash("sha256").update(JSON.stringify([decision.code, evidence, decision.policyVersion])).digest("hex");
    if (previous?.fingerprint === fingerprint) return previous;
    const value = { id, feedUrl, episodeId, podcast, title, code: decision.code, reason: decision.reason, evidence, fingerprint, affectedFeatures: ["internal transcription", "AI analysis", "displayed intelligence"], estimatedTranscriptionUsd: durationMs ? Math.ceil(durationMs / 1000) * 0.0001 : null, status: "REVIEW_REQUIRED", updatedAt: new Date(this.now()).toISOString() };
    this.store.set("intelligence-attention", id, value); return value;
  }
}
