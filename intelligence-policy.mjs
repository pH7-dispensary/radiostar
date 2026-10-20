import { createHash, randomUUID } from "node:crypto";

export const IntelligenceTier = Object.freeze({ ZERO: "ZERO", LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH" });
const tiers = new Set(Object.values(IntelligenceTier));
const key = (feedUrl, episodeId = "") => createHash("sha256").update(JSON.stringify([feedUrl, episodeId])).digest("hex");
const bool = (value) => value === true;

// This is deliberately an operational policy, not a rights record. A tier can
// reduce automation; it never grants an otherwise absent content permission.
export class IntelligencePolicyRegistry {
  constructor(store, { now = Date.now } = {}) { this.store = store; this.now = now; }
  global() {
    const stored = this.store.get("intelligence-policy", "global");
    // Existing authorised rights records already governed production behaviour.
    // ZERO preserves that established core behaviour until an administrator
    // deliberately selects a more restrictive operational tier.
    return { id: "global", tier: IntelligenceTier.ZERO, version: 1, updatedAt: null, updatedBy: "system", reason: "Compatibility default: preserve existing authorised automation.", history: [], ...(stored || {}) };
  }
  scope(feedUrl, episodeId = "") { return this.store.get("intelligence-policy", key(feedUrl, episodeId)); }
  effective(feedUrl, episodeId = "") {
    const episode = episodeId ? this.scope(feedUrl, episodeId) : null;
    const podcast = this.scope(feedUrl);
    const record = episode || podcast || this.global();
    return { ...record, source: episode ? "episode" : podcast ? "podcast" : "global" };
  }
  features(feedUrl, episodeId = "") {
    const policy = this.effective(feedUrl, episodeId), enabled = policy.tier !== IntelligenceTier.HIGH;
    return {
      policy,
      intelligence: enabled,
      chapters: enabled,
      topics: enabled,
      moments: enabled,
      conversationSearch: enabled,
      adCandidates: enabled,
      captions: [IntelligenceTier.ZERO, IntelligenceTier.MEDIUM].includes(policy.tier),
      dubbing: [IntelligenceTier.ZERO, IntelligenceTier.MEDIUM].includes(policy.tier),
    };
  }
  allows(feedUrl, episodeId, feature = "intelligence") {
    const features = this.features(feedUrl, episodeId);
    return { allowed: features[feature] === true, tier: features.policy.tier, source: features.policy.source, policyVersion: features.policy.version };
  }
  set(input = {}, { actor = "admin" } = {}) {
    if (typeof input.feedUrl !== "string" || !input.feedUrl) throw Error("A podcast RSS URL is required.");
    if (input.episodeId !== undefined && typeof input.episodeId !== "string") throw Error("Episode identity is invalid.");
    if (!tiers.has(input.tier)) throw Error("Choose a valid intelligence policy tier.");
    const reason = String(input.reason || "").trim().slice(0, 1000);
    if (!reason) throw Error("A reason is required for a policy change.");
    const episodeId = input.episodeId || "", id = key(input.feedUrl, episodeId), previous = this.store.get("intelligence-policy", id), at = this.now();
    if (input.expectedVersion !== undefined && previous && input.expectedVersion !== previous.version) throw Error("This policy changed elsewhere. Refresh before saving.");
    const record = {
      id, feedUrl: input.feedUrl, episodeId: episodeId || null, tier: input.tier,
      version: (previous?.version || 0) + 1, applyToExisting: bool(input.applyToExisting), applyToFuture: input.applyToFuture !== false,
      selectedFeatures: Array.isArray(input.selectedFeatures) ? input.selectedFeatures.filter((x) => typeof x === "string").slice(0, 20) : ["core"],
      updatedAt: at, updatedBy: actor, reason,
      history: [...(previous?.history || []), { at, actor, tier: previous?.tier || null, version: previous?.version || 0, reason: previous?.reason || null }].slice(-50),
    };
    this.store.transaction(() => {
      this.store.set("intelligence-policy", id, record);
      this.store.set("intelligence-policy-audit", randomUUID(), { at, actor, action: "policy-set", feedUrl: record.feedUrl, episodeId: record.episodeId, previousTier: previous?.tier || null, tier: record.tier, version: record.version, reason, applyToExisting: record.applyToExisting, applyToFuture: record.applyToFuture });
    });
    return record;
  }
  setGlobal(input = {}, { actor = "admin" } = {}) {
    if (!tiers.has(input.tier)) throw Error("Choose a valid global intelligence tier.");
    const reason = String(input.reason || "").trim().slice(0, 1000);
    if (!reason) throw Error("A reason is required for a global policy change.");
    const previous = this.global(), at = this.now();
    if (input.expectedVersion !== undefined && input.expectedVersion !== previous.version) throw Error("This global policy changed elsewhere. Refresh before saving.");
    const record = { ...previous, tier: input.tier, version: previous.version + 1, updatedAt: at, updatedBy: actor, reason, history: [...previous.history, { at, actor, tier: previous.tier, version: previous.version, reason: previous.reason }].slice(-50) };
    this.store.transaction(() => { this.store.set("intelligence-policy", "global", record); this.store.set("intelligence-policy-audit", randomUUID(), { at, actor, action: "global-policy-set", previousTier: previous.tier, tier: record.tier, version: record.version, reason }); });
    return record;
  }
  rollback(feedUrl, episodeId, version, { actor = "admin", reason = "" } = {}) {
    const current = this.scope(feedUrl, episodeId || "");
    if (!current) throw Error("No scoped policy exists to roll back.");
    const target = current.history.find((entry) => entry.version === Number(version));
    if (!target?.tier) throw Error("The requested policy version is unavailable.");
    return this.set({ feedUrl, episodeId: episodeId || undefined, tier: target.tier, applyToExisting: false, applyToFuture: current.applyToFuture, selectedFeatures: current.selectedFeatures, reason: reason || `Rollback to version ${target.version}.` }, { actor });
  }
  records() { return this.store.all("intelligence-policy").map(([, value]) => value).filter((value) => value.id !== "global"); }
  audit() { return this.store.all("intelligence-policy-audit").map(([, value]) => value).sort((a, b) => b.at - a.at).slice(0, 500); }
}
