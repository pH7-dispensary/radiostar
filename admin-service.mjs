import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const AdministratorRole = Object.freeze({
  SUPER_ADMIN: "SUPER_ADMIN",
  OPERATIONS_ADMIN: "OPERATIONS_ADMIN",
  RIGHTS_ADMIN: "RIGHTS_ADMIN",
  SUPPORT_AGENT: "SUPPORT_AGENT",
  FINANCE_ADMIN: "FINANCE_ADMIN",
  READ_ONLY: "READ_ONLY",
});

const roles = new Set(Object.values(AdministratorRole));
const permissions = Object.freeze({
  "overview:read": Object.values(AdministratorRole),
  "audit:read": Object.values(AdministratorRole),
  "configuration:read": Object.values(AdministratorRole),
  "configuration:write": [AdministratorRole.SUPER_ADMIN],
  "features:read": Object.values(AdministratorRole),
  "features:write": [AdministratorRole.SUPER_ADMIN, AdministratorRole.OPERATIONS_ADMIN],
  "rights:read": [AdministratorRole.SUPER_ADMIN, AdministratorRole.RIGHTS_ADMIN, AdministratorRole.READ_ONLY],
  "rights:write": [AdministratorRole.SUPER_ADMIN, AdministratorRole.RIGHTS_ADMIN],
  "intelligence:read": [AdministratorRole.SUPER_ADMIN, AdministratorRole.OPERATIONS_ADMIN, AdministratorRole.FINANCE_ADMIN, AdministratorRole.READ_ONLY],
  "intelligence:write": [AdministratorRole.SUPER_ADMIN, AdministratorRole.OPERATIONS_ADMIN],
  "translation:read": [AdministratorRole.SUPER_ADMIN, AdministratorRole.OPERATIONS_ADMIN, AdministratorRole.FINANCE_ADMIN, AdministratorRole.READ_ONLY],
  "translation:write": [AdministratorRole.SUPER_ADMIN, AdministratorRole.OPERATIONS_ADMIN],
  "listeners:read": [AdministratorRole.SUPER_ADMIN, AdministratorRole.OPERATIONS_ADMIN, AdministratorRole.SUPPORT_AGENT, AdministratorRole.READ_ONLY],
  "listeners:write": [AdministratorRole.SUPER_ADMIN, AdministratorRole.SUPPORT_AGENT],
  "support:read": [AdministratorRole.SUPER_ADMIN, AdministratorRole.OPERATIONS_ADMIN, AdministratorRole.SUPPORT_AGENT, AdministratorRole.READ_ONLY],
  "support:write": [AdministratorRole.SUPER_ADMIN, AdministratorRole.SUPPORT_AGENT],
  "finance:read": [AdministratorRole.SUPER_ADMIN, AdministratorRole.FINANCE_ADMIN, AdministratorRole.READ_ONLY],
  "administrators:read": [AdministratorRole.SUPER_ADMIN],
  "administrators:write": [AdministratorRole.SUPER_ADMIN],
});
const featureDefinitions = Object.freeze([
  ["episodeBrief", "AI Episode Brief", ["rights", "intelligence budget"], "PRIVATE_BETA"],
  ["conversationSearch", "Conversational Search", ["rights", "processed corpus"], "PRIVATE_BETA"],
  ["findMoment", "Find a Moment", ["rights", "source timestamps"], "PRIVATE_BETA"],
  ["smartChapters", "Smart Chapters", ["rights", "transcript"], "PRIVATE_BETA"],
  ["aiSleep", "AI Sleep", ["on-device safeguards"], "PRIVATE_BETA"],
  ["adSkip", "Ad Skip", ["independent verification", "matching audio variant"], "DISABLED"],
  ["captions", "Playback captions", ["caption rights"], "PRIVATE_BETA"],
  ["privateTranslate", "Private Translate", ["private beta", "translation rights", "separate budget"], "INTERNAL_TESTING"],
  ["referrals", "Referral qualification", ["verified listening receipts"], "PRIVATE_BETA"],
  ["subscriptions", "Premium subscriptions", ["StoreKit verification", "App Store approval"], "DISABLED"],
  ["automaticProcessing", "Automatic podcast processing", ["rights", "processing budget"], "PRIVATE_BETA"],
]);
const states = new Set(["DISABLED", "INTERNAL_TESTING", "PRIVATE_BETA", "ENABLED"]);
const digest = (value) => createHash("sha256").update(String(value)).digest("hex");
const safeText = (value, limit = 400) => typeof value === "string" ? value.trim().slice(0, limit) : "";
const memberId = () => randomBytes(18).toString("base64url");
const sessionId = () => randomBytes(32).toString("base64url");

export class AdminService {
  constructor(store, { now = Date.now, sessionTtlMs = 8 * 60 * 60 * 1000 } = {}) {
    this.store = store;
    this.now = now;
    this.sessionTtlMs = sessionTtlMs;
  }
  permissionsFor(role) { return Object.keys(permissions).filter((permission) => permissions[permission].includes(role)); }
  can(actor, permission) { return Boolean(actor && permissions[permission]?.includes(actor.role)); }
  actorForToken(expected, received) {
    if (typeof expected !== "string" || !expected || typeof received !== "string" || Buffer.byteLength(expected) !== Buffer.byteLength(received)) return null;
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(received))) return null;
    return { id: "automation", name: "Cloud administration", role: AdministratorRole.SUPER_ADMIN, source: "token" };
  }
  startSession(actor) {
    const id = sessionId(), csrf = sessionId(), at = this.now();
    this.store.set("admin-session", digest(id), { idHash: digest(id), csrfHash: digest(csrf), actor, createdAt: at, expiresAt: at + this.sessionTtlMs, revokedAt: null });
    this.appendAudit({ actor, action: "administrator-session-created", resource: actor.id, outcome: "ALLOWED" });
    return { id, csrf, expiresAt: at + this.sessionTtlMs };
  }
  session(id) {
    if (typeof id !== "string" || id.length < 32) return null;
    const record = this.store.get("admin-session", digest(id));
    if (!record || record.revokedAt || record.expiresAt <= this.now()) return null;
    return { ...record, id };
  }
  authenticate(id, csrf, { write = false } = {}) {
    const session = this.session(id);
    if (!session) return null;
    if (write && (typeof csrf !== "string" || !timingSafeEqual(Buffer.from(session.csrfHash), Buffer.from(digest(csrf))))) return null;
    return session.actor;
  }
  revokeSession(id, actor = null) {
    const record = this.session(id);
    if (!record) return false;
    this.store.set("admin-session", digest(id), { ...record, id: undefined, revokedAt: this.now() });
    this.appendAudit({ actor: actor || record.actor, action: "administrator-session-revoked", resource: record.actor.id, outcome: "ALLOWED" });
    return true;
  }
  members() { return this.store.all("administrator").map(([, member]) => ({ ...member, roles: [member.role] })).sort((a, b) => a.name.localeCompare(b.name)); }
  addMember(input, actor) {
    const name = safeText(input?.name, 120), role = input?.role;
    if (!name || !roles.has(role)) throw Error("An administrator name and valid role are required.");
    const member = { id: memberId(), name, role, active: input.active !== false, createdAt: this.now(), updatedAt: this.now(), createdBy: actor.id };
    this.store.set("administrator", member.id, member);
    this.appendAudit({ actor, action: "administrator-created", resource: member.id, newState: { name: member.name, role: member.role }, outcome: "ALLOWED" });
    return member;
  }
  configuration() {
    const stored = this.store.get("admin-configuration", "global");
    return { version: 1, updatedAt: null, updatedBy: "system", values: { notificationPreferences: { budgetAlerts: true, queueAlerts: true }, security: { adminSessionHours: 8 }, processing: { automaticFollowPreparation: true } }, ...(stored || {}) };
  }
  setConfiguration(input, actor) {
    if (!input || typeof input !== "object" || typeof input.values !== "object" || Array.isArray(input.values)) throw Error("Configuration values are required.");
    const previous = this.configuration();
    if (input.expectedVersion !== undefined && input.expectedVersion !== previous.version) throw Error("Configuration changed elsewhere. Refresh before saving.");
    const reason = safeText(input.reason, 1000);
    if (!reason) throw Error("A reason is required for configuration changes.");
    if (input.confirmation !== "CONFIRM") throw Error("Type CONFIRM before changing global configuration.");
    const values = { ...previous.values, ...input.values };
    if (values.security?.adminSessionHours !== undefined && (!Number.isInteger(values.security.adminSessionHours) || values.security.adminSessionHours < 1 || values.security.adminSessionHours > 24)) throw Error("Administrator session duration must be between 1 and 24 hours.");
    const record = { version: previous.version + 1, values, updatedAt: this.now(), updatedBy: actor.id, reason };
    this.store.transaction(() => { this.store.set("admin-configuration", "global", record); this.appendAudit({ actor, action: "configuration-changed", resource: "global", previousState: { version: previous.version }, newState: { version: record.version }, reason, outcome: "ALLOWED" }); });
    return record;
  }
  featureFlags() {
    return featureDefinitions.map(([id, name, dependencies, defaultState]) => {
      const prior = this.store.get("feature-flag", id);
      return { id, name, state: defaultState, rolloutPercent: defaultState === "DISABLED" ? 0 : 100, eligibilityRules: null, dependencies, environment: "production", updatedAt: null, updatedBy: "system", version: 1, ...(prior || {}) };
    });
  }
  setFeatureFlag(input, actor) {
    const id = safeText(input?.id, 100), state = input?.state;
    if (!featureDefinitions.some(([candidate]) => candidate === id) || !states.has(state)) throw Error("A valid feature and state are required.");
    const rolloutPercent = input.rolloutPercent === undefined ? 0 : Number(input.rolloutPercent);
    if (!Number.isInteger(rolloutPercent) || rolloutPercent < 0 || rolloutPercent > 100) throw Error("Rollout must be a whole percentage from 0 to 100.");
    if (state === "ENABLED" && rolloutPercent !== 100) throw Error("An enabled feature requires a 100% rollout.");
    const reason = safeText(input.reason, 1000);
    if (!reason) throw Error("A reason is required for a feature change.");
    if (["ENABLED", "DISABLED"].includes(state) && input.confirmation !== "CONFIRM") throw Error("Type CONFIRM before making this high-impact feature change.");
    const prior = this.featureFlags().find((flag) => flag.id === id), record = { ...prior, state, rolloutPercent, eligibilityRules: safeText(input.eligibilityRules, 1000) || null, version: prior.version + 1, updatedAt: this.now(), updatedBy: actor.id, reason };
    this.store.transaction(() => { this.store.set("feature-flag", id, record); this.appendAudit({ actor, action: "feature-flag-changed", resource: id, previousState: { state: prior.state, rolloutPercent: prior.rolloutPercent }, newState: { state, rolloutPercent }, reason, outcome: "ALLOWED" }); });
    return record;
  }
  appendAudit({ actor, action, resource, previousState = null, newState = null, reason = null, outcome = "ALLOWED", requestId = null }) {
    const previous = this.store.get("admin-audit-head", "global"), at = this.now();
    const entry = { id: memberId(), at, actor: actor ? { id: actor.id, name: actor.name, role: actor.role } : null, action, resource, previousState, newState, reason: safeText(reason, 1000) || null, outcome, requestId, previousHash: previous?.hash || null };
    const hash = digest(JSON.stringify(entry));
    this.store.set("admin-audit", entry.id, { ...entry, hash });
    this.store.set("admin-audit-head", "global", { id: entry.id, hash, at });
    return { ...entry, hash };
  }
  audit({ limit = 100 } = {}) { return this.store.all("admin-audit").map(([, entry]) => entry).sort((a, b) => b.at - a.at).slice(0, Math.max(1, Math.min(500, Number(limit) || 100))); }
  overview({ ledger, pipeline, rights, translation } = {}) {
    const jobs = this.store.all("intelligence").map(([, value]) => value), jobCounts = Object.fromEntries(["QUEUED", "PROCESSING", "READY", "FAILED", "BLOCKED"].map((state) => [state, jobs.filter((job) => job.state === state).length]));
    const reports = this.store.all("problem-report").map(([, value]) => value), listeners = this.store.all("installation").length || this.store.all("listener").length || this.store.all("listener-profile").length;
    return { generatedAt: this.now(), dataStatus: "MEASURED", listeners: { total: listeners, follows: this.store.all("follow").length, pilotDevices: this.store.all("pilot-device").length, reportsOpen: reports.filter((report) => !["RESOLVED", "CLOSED"].includes(report.status)).length }, intelligence: { ...jobCounts, total: jobs.length, budget: ledger ? { controls: ledger.controls, totals: ledger.totals() } : null }, rights: { policy: rights?.policy() || null, records: rights?.list().length || 0, reservations: rights?.controlCentre().reservations.length || 0, takedowns: rights?.controlCentre().takedowns.length || 0 }, translation: translation ? translation.status() : null, operations: { transcriptRecords: this.store.all("transcript").length, auditEvents: this.store.all("admin-audit").length }, infrastructure: { status: "UNAVAILABLE", reason: "Live AWS metrics require a scoped server-side CloudWatch integration; no browser credentials are exposed." } };
  }
}
