import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { commandCentre } from './admin-command-centre.mjs';

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
const activeJobStates = new Set(["QUEUED", "DISCOVERING", "TRANSCRIBING", "UNDERSTANDING", "ORGANISING", "PROCESSING", "PARTIAL_READY"]);
const openReportStates = new Set(["OPEN", "NEW", "TRIAGED", "INVESTIGATING", "WAITING", "UNDER_REVIEW"]);
const reportStates = new Set(["OPEN", "UNDER_REVIEW", "RESOLVED", "DISMISSED"]);
const asArray = (store, kind) => store.all(kind).map(([, value]) => value);
const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const dateMs = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
};
const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};
const percentile = (values, ratio) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
};
const average = (values) => {
  const filtered = values.filter(Number.isFinite);
  return filtered.length ? Math.round(filtered.reduce((sum, value) => sum + value, 0) / filtered.length) : null;
};
const ratio = (numerator, denominator) => denominator ? Number((numerator / denominator).toFixed(4)) : null;
const reportState = (value) => String(value || "OPEN").trim().toUpperCase().replaceAll(" ", "_");
const jobRoute = (job) => {
  if (job.cacheHit === true) return "CACHED_INTELLIGENCE";
  if (/publisher|rss/i.test(String(job.provenance?.sourceType || job.transcript?.sourceType || ""))) return "PUBLISHER_TRANSCRIPT";
  if (job.allowAudio === true || /audio|transcrib/i.test(String(job.processingStage || job.phase || ""))) return "AUDIO_TRANSCRIPTION";
  return "UNCLASSIFIED";
};
const jobState = (job) => {
  if (job.state === 'PARTIAL_READY' && job.completedAt) return 'PARTIAL_READY';
  if (job.state === "BLOCKED" && job.code === "BUDGET_LIMIT") return "BUDGET_PAUSED";
  if (activeJobStates.has(job.state) && job.state !== "QUEUED") return "PROCESSING";
  return job.state || "NOT_RECORDED";
};
const severityRank = Object.freeze({ CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 });

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
  audit({ limit = 100, actor = "", action = "", from = "", to = "" } = {}) {
    const fromAt = dateMs(from), toAt = dateMs(to);
    const actorQuery = safeText(actor, 120).toLowerCase(), actionQuery = safeText(action, 120).toLowerCase();
    return this.store.all("admin-audit").map(([, entry]) => entry)
      .filter((entry) => !actorQuery || `${entry.actor?.id || ""} ${entry.actor?.name || ""}`.toLowerCase().includes(actorQuery))
      .filter((entry) => !actionQuery || String(entry.action || "").toLowerCase().includes(actionQuery))
      .filter((entry) => !Number.isFinite(fromAt) || entry.at >= fromAt)
      .filter((entry) => !Number.isFinite(toAt) || entry.at <= toAt)
      .sort((a, b) => b.at - a.at)
      .slice(0, Math.max(1, Math.min(500, Number(limit) || 100)));
  }
  async overview({ ledger, pipeline, rights, translation, skips, infrastructure = null } = {}) {
    const jobs = this.store.all("intelligence").map(([, value]) => value), jobCounts = Object.fromEntries(["QUEUED", "PROCESSING", "READY", "FAILED", "BLOCKED"].map((state) => [state, jobs.filter((job) => job.state === state).length]));
    const reports = this.store.all("problem-report").map(([, value]) => value), listeners = this.store.all("installation").length || this.store.all("listener").length || this.store.all("listener-profile").length;
    const observedInfrastructure = infrastructure ? await infrastructure() : { status: "UNKNOWN", reason: "Infrastructure telemetry is not configured for this server." };
    return { generatedAt: this.now(), dataStatus: "MEASURED", listeners: { total: listeners, follows: this.store.all("follow").length, pilotDevices: this.store.all("pilot-device").length, reportsOpen: reports.filter((report) => openReportStates.has(reportState(report.status))).length }, intelligence: { ...jobCounts, total: jobs.length, budget: ledger ? { controls: ledger.controls, totals: ledger.totals() } : null }, rights: { policy: rights?.policy() || null, records: rights?.list().length || 0, reservations: rights?.controlCentre().reservations.length || 0, takedowns: rights?.controlCentre().takedowns.length || 0 }, translation: translation ? translation.status() : null, operations: { transcriptRecords: this.store.all("transcript").length, auditEvents: this.store.all("admin-audit").length }, infrastructure: observedInfrastructure };
  }
  async operations({ ledger, rights, translation, skips, infrastructure = null } = {}) {
    ledger?.refresh();
    const now = this.now();
    const jobs = asArray(this.store, "intelligence");
    const reports = asArray(this.store, "problem-report");
    const follows = asArray(this.store, "follow");
    const rightsRecords = rights?.list?.() || [];
    const projectedJobs = jobs.map((job) => {
      const startedAt = dateMs(job.startedAt || job.queuedAt);
      const completedAt = dateMs(job.completedAt);
      const measuredDurationMs = numeric(job.processingMs) ?? (startedAt && completedAt ? Math.max(0, completedAt - startedAt) : null);
      const queuedAt = dateMs(job.queuedAt || job.startedAt);
      const lifecycle = Array.isArray(job.lifecycle) ? job.lifecycle : [];
      const workerStartedAt = dateMs(lifecycle.find((event) => event.type === "WORKER_STARTED")?.at);
      const queueWaitMs = queuedAt && workerStartedAt ? Math.max(0, workerStartedAt - queuedAt) : null;
      return {
        jobId: job.jobId || null,
        feedUrl: job.feedUrl || job.episode?.feedUrl || null,
        episodeId: job.episodeId || job.episode?.id || null,
        episodeTitle: job.episode?.title || job.episodeId || "Episode not recorded",
        podcast: job.episode?.showName || job.episode?.publisher || "Podcast not recorded",
        state: jobState(job), rawState: job.state || null, stage: job.processingStage || job.phase || null,
        code: job.code || null, reason: job.reason || null, route: jobRoute(job),
        queuedAt: job.queuedAt || null, startedAt: job.startedAt || null, updatedAt: job.updatedAt || job.completedAt || job.startedAt || null,
        completedAt: job.completedAt || null, deadlineAt: job.deadlineAt || null,
        elapsedMs: startedAt ? Math.max(0, (completedAt || now) - startedAt) : null,
        processingMs: measuredDurationMs, queueWaitMs, retryEligible: job.retryable === true && (job.attempts || 0) < 2,
        attempts: Number(job.attempts || 0), cacheHit: job.cacheHit === true,
        followerImpact: follows.filter((follow) => follow.feedUrl === (job.feedUrl || job.episode?.feedUrl)).length,
      };
    });
    const ready = projectedJobs.filter((job) => job.state === "READY");
    const failures = projectedJobs.filter((job) => job.state === "FAILED");
    const completed = projectedJobs.filter((job) => job.completedAt && ["READY", "FAILED", "CANCELLED", "BUDGET_PAUSED", "BLOCKED"].includes(job.state));
    const routeMetrics = Object.fromEntries(["PUBLISHER_TRANSCRIPT", "AUDIO_TRANSCRIPTION", "CACHED_INTELLIGENCE"].map((route) => {
      const routeJobs = projectedJobs.filter((job) => job.route === route);
      const complete = routeJobs.filter((job) => job.completedAt);
      return [route, {
        jobs: routeJobs.length,
        completed: complete.length,
        averageProcessingMs: average(complete.map((job) => job.processingMs)),
        medianProcessingMs: median(complete.map((job) => job.processingMs)),
        p95ProcessingMs: percentile(complete.map((job) => job.processingMs), 0.95),
        failureRate: ratio(routeJobs.filter((job) => job.state === "FAILED").length, routeJobs.length),
      }];
    }));
    const totals = ledger ? ledger.totals(now) : null;
    const controls = ledger?.controls || null;
    const freeAiUsage = ledger ? ledger.usage.filter((row) => row.kind !== "transcription") : [];
    const audioUsage = ledger ? ledger.usage.filter((row) => row.kind === "transcription") : [];
    const reservations = ledger ? [...ledger.reservations.values()] : [];
    const cost = {
      freeAi: { actualUsd: Number(freeAiUsage.reduce((sum, row) => sum + Number(row.usd || 0), 0).toFixed(6)), reservationsUsd: Number(reservations.filter((row) => row.kind !== "transcription").reduce((sum, row) => sum + Number(row.usd || 0), 0).toFixed(6)) },
      audioTranscription: { actualUsd: Number(audioUsage.reduce((sum, row) => sum + Number(row.usd || 0), 0).toFixed(6)), seconds: audioUsage.reduce((sum, row) => sum + Number(row.seconds || 0), 0), reservationsUsd: Number(reservations.filter((row) => row.kind === "transcription").reduce((sum, row) => sum + Number(row.usd || 0), 0).toFixed(6)) },
      translation: translation ? translation.status() : { status: "NOT_AVAILABLE" },
      aws: { status: "NOT_AVAILABLE", reason: "AWS billing is not available from the application ledger; Cost Explorer remains an operator-only delayed billing source." },
    };
    const observedInfrastructure = infrastructure ? await infrastructure() : { status: "UNKNOWN", reason: "Infrastructure telemetry is not configured for this server." };
    const attention = [];
    const addAttention = (item) => { if (!attention.some(row => row.resource === item.resource && row.reason === item.reason && row.feedUrl === item.feedUrl && row.episodeId === item.episodeId)) attention.push({ id: digest(JSON.stringify([item.kind, item.feedUrl || null, item.episodeId || null, item.resource, item.reason])), ...item }); };
    for (const job of failures) addAttention({ kind: "PROCESSING_FAILURE", severity: job.followerImpact ? "HIGH" : "MEDIUM", resource: job.episodeTitle, feedUrl: job.feedUrl, episodeId: job.episodeId, reason: job.reason || "Processing failed without a listener-facing reason.", detectedAt: job.updatedAt, listenerImpact: job.followerImpact, action: job.retryEligible ? "Review and retry the eligible job." : "Inspect the recorded blocker before any new request.", destination: "processing" });
    for (const job of projectedJobs.filter((job) => activeJobStates.has(job.rawState) && dateMs(job.deadlineAt) && dateMs(job.deadlineAt) < now)) addAttention({ kind: "STALLED_PROCESSING", severity: "CRITICAL", resource: job.episodeTitle, feedUrl: job.feedUrl, episodeId: job.episodeId, reason: "The recorded processing deadline has passed.", detectedAt: job.deadlineAt, listenerImpact: job.followerImpact, action: "Open the job and verify its lifecycle before retrying.", destination: "processing" });
    for (const job of projectedJobs.filter((job) => job.state === "BUDGET_PAUSED")) addAttention({ kind: "BUDGET_PAUSED", severity: "HIGH", resource: job.episodeTitle, feedUrl: job.feedUrl, episodeId: job.episodeId, reason: job.reason || "The paid intelligence allowance prevented this request.", detectedAt: job.updatedAt, listenerImpact: job.followerImpact, action: "Inspect current allowance; do not raise a cap without approval.", destination: "costs" });
    for (const report of reports.filter((report) => openReportStates.has(reportState(report.status)))) addAttention({ kind: "LISTENER_REPORT", severity: ["incorrect_skip", "missed_advert"].includes(report.category) ? "HIGH" : "MEDIUM", resource: report.category?.replaceAll("_", " ") || "Listener report", feedUrl: report.feedUrl || null, episodeId: report.episodeId || null, reason: "A listener report is awaiting an operational response.", detectedAt: report.createdAt, listenerImpact: 1, action: "Review diagnostic context and record the outcome.", destination: "listeners" });
    for (const record of rightsRecords.filter((record) => /PENDING|REVIEW|UNASSESSED/i.test(String(record.assessmentStatus || "")))) addAttention({ kind: "RIGHTS_REVIEW", severity: "HIGH", resource: record.podcast || record.feedUrl, feedUrl: record.feedUrl, episodeId: record.episodeId || null, reason: "A rights assessment requires an administrator decision.", detectedAt: record.updatedAt || record.createdAt || null, listenerImpact: follows.filter((follow) => follow.feedUrl === record.feedUrl).length, action: "Review the rights record; policy controls do not substitute for permission.", destination: "rights" });
    if (controls && totals && totals.day >= controls.dailyUsd) addAttention({ kind: "AI_BUDGET", severity: "CRITICAL", resource: "Daily AI allowance", reason: "The server-side daily AI allowance is exhausted.", detectedAt: now, listenerImpact: null, action: "Wait for the reset or investigate recorded provider usage.", destination: "costs" });
    else if (controls && totals && totals.day / controls.dailyUsd >= 0.8) addAttention({ kind: "AI_BUDGET", severity: "HIGH", resource: "Daily AI allowance", reason: "The server-side daily AI allowance has reached 80%.", detectedAt: now, listenerImpact: null, action: "Review new requests and cache reuse before spending more.", destination: "costs" });
    if (skips?.operations) {
      const skip = skips.operations();
      if (skip.counts?.disputed) addAttention({ kind: "AD_SKIP_DISPUTE", severity: "HIGH", resource: "Ad Skip evidence", reason: `${skip.counts.disputed} disputed interval${skip.counts.disputed === 1 ? "" : "s"} will never be automatically skipped.`, detectedAt: now, listenerImpact: null, action: "Inspect the safety evidence and listener reports.", destination: "adSkip" });
      if (skip.counts?.missedAdvertReports) addAttention({ kind: "MISSED_ADVERT", severity: "MEDIUM", resource: "Ad Skip reports", reason: `${skip.counts.missedAdvertReports} missed-advert report${skip.counts.missedAdvertReports === 1 ? "" : "s"} require review.`, detectedAt: now, listenerImpact: null, action: "Review reports; a listener report cannot verify an interval.", destination: "adSkip" });
    }
    for (const component of observedInfrastructure.components || []) if (["UNAVAILABLE", "DEGRADED"].includes(component.status)) addAttention({ kind: "INFRASTRUCTURE", severity: component.status === "UNAVAILABLE" ? "CRITICAL" : "HIGH", resource: component.name, reason: component.reason || "A measured infrastructure component needs attention.", detectedAt: observedInfrastructure.generatedAt || now, listenerImpact: null, action: "Open Operations and inspect the component evidence.", destination: "operations" });
    attention.sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || (b.listenerImpact || 0) - (a.listenerImpact || 0) || (dateMs(a.detectedAt) || now) - (dateMs(b.detectedAt) || now));
    const knownEpisodeIds = new Set(projectedJobs.map((job) => `${job.feedUrl || ""}:${job.episodeId || ""}`).filter((value) => value !== ":"));
    const result = {
      generatedAt: now,
      dataStatus: "MEASURED",
      summary: {
        listeners: asArray(this.store, "installation").length || asArray(this.store, "listener").length || asArray(this.store, "listener-profile").length,
        follows: follows.length,
        jobs: projectedJobs.length,
        ready: ready.length,
        preparing: projectedJobs.filter((job) => ["QUEUED", "PROCESSING"].includes(job.state)).length,
        unavailable: projectedJobs.filter((job) => ["BLOCKED", "BUDGET_PAUSED"].includes(job.state)).length,
        failed: failures.length,
        openReports: reports.filter((report) => openReportStates.has(reportState(report.status))).length,
      },
      coverage: { scope: "Persisted operations records", knownEpisodes: knownEpisodeIds.size, ready: ready.length, preparing: projectedJobs.filter((job) => ["QUEUED", "PROCESSING"].includes(job.state)).length, unavailable: projectedJobs.filter((job) => ["BLOCKED", "BUDGET_PAUSED"].includes(job.state)).length, failed: failures.length, notYetProcessed: null, denominatorNote: "The global RSS catalogue is not enumerated here; coverage is limited to persisted operations records." },
      processing: { jobs: projectedJobs.sort((a, b) => (dateMs(b.updatedAt) || 0) - (dateMs(a.updatedAt) || 0)), counts: Object.fromEntries(["QUEUED", "PROCESSING", "READY", "FAILED", "CANCELLED", "BLOCKED", "BUDGET_PAUSED"].map((state) => [state, projectedJobs.filter((job) => job.state === state).length])), performance: { averageQueueWaitMs: average(completed.map((job) => job.queueWaitMs)), medianProcessingMs: median(completed.map((job) => job.processingMs)), p95ProcessingMs: percentile(completed.map((job) => job.processingMs), 0.95), successRate: ratio(ready.length, completed.length), failureRate: ratio(failures.length, projectedJobs.length), cacheHitRate: ratio(projectedJobs.filter((job) => job.cacheHit).length, projectedJobs.length), retryRate: ratio(projectedJobs.filter((job) => job.attempts > 1).length, projectedJobs.length), routes: routeMetrics } },
      listeners: { total: asArray(this.store, "installation").length || asArray(this.store, "listener").length || asArray(this.store, "listener-profile").length, follows: follows.length, pilotDevices: asArray(this.store, "pilot-device").filter((device) => !device.revokedAt).length, reports: reports.map((report) => ({ id: report.id, category: report.category, status: reportState(report.status), feedUrl: report.feedUrl || null, episodeId: report.episodeId || null, feature: report.feature || null, createdAt: report.createdAt || null, resolutionNote: report.resolutionNote || null, updatedAt: report.updatedAt || null })), experience: { episodeOpened: null, playbackStarted: null, intelligenceRequested: null, intelligenceReady: ready.length, intelligenceUnavailable: projectedJobs.filter((job) => ["BLOCKED", "BUDGET_PAUSED"].includes(job.state)).length, adSkipExecuted: asArray(this.store, "skip-execution").filter((entry) => entry.kind === "automatic_skip").length } },
      cost: { controls, totals, ...cost },
      attention,
      infrastructure: observedInfrastructure,
    };
    result.commandCentre = commandCentre(this.store, result, ledger, now);
    result.processing.jobs = result.commandCentre.processing;
    for (const record of rightsRecords) {
      if (!record.feedUrl || !rights?.assessment) continue;
      for (const advisory of rights.assessment(record.feedUrl,record.episodeId).advisories || []) {
        addAttention({kind:'RIGHTS_ADVISORY',severity:'MEDIUM',resource:record.episodeTitle || record.podcast || record.feedUrl,feedUrl:record.feedUrl,episodeId:record.episodeId || null,reason:advisory.reason,evidence:[advisory.code, ...(advisory.evidence || []).map(item => `${item.type} (${item.scope}, ${item.source}): ${item.value}${item.url ? ` — ${item.url}` : ''}`)].join('\n'),features:advisory.features || ['Intelligence'],detectedAt:record.updatedAt || record.createdAt || null,action:advisory.recommendedAction,destination:'rights'});
      }
    }
    for (const job of projectedJobs.filter(j => ['TRANSCRIPT_UNAVAILABLE','TRANSCRIPT_INVALID','LEGAL_BASIS_NOT_ESTABLISHED','RIGHTS_RESTRICTED'].includes(j.code))) {
      addAttention({ kind: 'PROCESSING_ADVISORY', severity: 'MEDIUM', resource: job.episodeTitle, feedUrl: job.feedUrl, episodeId: job.episodeId, reason: job.reason || job.code, detectedAt: job.updatedAt, action: 'Inspect source evidence and the current enforced decision.', destination: 'processing', features: ['Intelligence'], evidence: job.code });
    }
    for (const item of skips?.operations?.().diagnostics || []) {
      if (!item.code || ['READY','NO_ADVERTS_DETECTED'].includes(item.code)) continue;
      addAttention({ kind: 'AD_SKIP_ADVISORY', severity: /DISPUT|MISMATCH/.test(item.code) ? 'HIGH' : 'LOW', resource: item.title, feedUrl: item.feedUrl, episodeId: item.episodeId, reason: item.nextAction || item.code, evidence: item.code, detectedAt: item.timeline?.at(-1)?.at || null, features: ['Ad Skip'], action: item.nextAction, destination: 'adSkip' });
    }
    result.attention = attention.map(item => {
      const review = this.store.get('admin-advisory-review', item.id);
      return { ...item, features: item.features || [item.destination], evidence: item.evidence || item.reason, status: review?.status || 'NEW', version: review?.version || 0, review: review ? { reason: review.reason, updatedAt: review.updatedAt, updatedBy: review.updatedBy } : null };
    }).sort((a,b) => severityRank[b.severity] - severityRank[a.severity] || (b.listenerImpact || 0) - (a.listenerImpact || 0) || (dateMs(a.detectedAt) || now) - (dateMs(b.detectedAt) || now));
    return result;
  }
  updateAdvisory(input, actor, currentItems) {
    if (actor?.role !== 'SUPER_ADMIN' || actor.source !== 'session') throw Error('An authenticated Super Admin session is required.');
    const item = currentItems.find(row => row.id === input.id);
    if (!item) throw Error('This advisory is no longer active. Refresh the inbox.');
    if (!['ACKNOWLEDGED','RESOLVED','DISMISSED'].includes(input.status)) throw Error('Choose a valid review outcome.');
    const reason = safeText(input.reason, 1000);
    if (!reason) throw Error('Record a review reason.');
    const previous = this.store.get('admin-advisory-review', item.id);
    if (input.expectedVersion !== (previous?.version || 0)) throw Error('This advisory changed. Refresh before saving.');
    const next = { id: item.id, status: input.status, reason, version: (previous?.version || 0) + 1, updatedAt: this.now(), updatedBy: actor.id };
    this.store.transaction(() => {
      this.store.set('admin-advisory-review', item.id, next);
      this.appendAudit({ actor, action: 'advisory-reviewed', resource: item.id, previousState: previous || { status: 'NEW' }, newState: next, reason, outcome: 'ALLOWED' });
    });
    return { advisory: next, outcome: { requested: input.status, succeeded: true, changed: 'Advisory review only. No policy or rights decision changed.', affectedEpisodes: 0, processingStarted: false, next: 'Enforced restrictions and processing safeguards remain unchanged.' } };
  }
  updateReport(input, actor) {
    const id = safeText(input?.id, 160);
    const existing = this.store.get("problem-report", id);
    const status = reportState(input?.status);
    const resolutionNote = safeText(input?.resolutionNote, 1000);
    if (!existing) throw Error("The listener report could not be found.");
    if (!reportStates.has(status)) throw Error("Choose a valid report status.");
    if (["RESOLVED", "DISMISSED"].includes(status) && !resolutionNote) throw Error("A resolution note is required when closing a listener report.");
    const next = { ...existing, status, resolutionNote: resolutionNote || existing.resolutionNote || null, updatedAt: this.now(), updatedBy: actor.id };
    this.store.transaction(() => {
      this.store.set("problem-report", id, next);
      this.appendAudit({ actor, action: "listener-report-updated", resource: id, previousState: { status: reportState(existing.status) }, newState: { status }, reason: resolutionNote || null, outcome: "ALLOWED" });
    });
    return next;
  }
  globalSearch(query, actor, { jobs = [], rightsRecords = [] } = {}) {
    const needle = safeText(query, 120).toLowerCase();
    if (needle.length < 2) throw Error("Enter at least two characters to search operations records.");
    const includes = (...values) => values.some((value) => String(value || "").toLowerCase().includes(needle));
    const groups = [];
    if (this.can(actor, "rights:read")) {
      const podcasts = new Map();
      for (const record of rightsRecords) if (includes(record.feedUrl, record.podcast, record.publisher)) podcasts.set(record.feedUrl, { type: "PODCAST", title: record.podcast || "Podcast record", subtitle: record.publisher || "Rights record", feedUrl: record.feedUrl });
      for (const job of jobs) if (includes(job.feedUrl, job.episode?.showName, job.episode?.publisher)) podcasts.set(job.feedUrl, { type: "PODCAST", title: job.episode?.showName || job.episode?.publisher || "Podcast record", subtitle: "Processing record", feedUrl: job.feedUrl });
      groups.push({ type: "PODCASTS", items: [...podcasts.values()].slice(0, 12) });
    }
    if (this.can(actor, "intelligence:read")) groups.push({ type: "EPISODES", items: jobs.filter((job) => includes(job.episode?.title, job.episodeId, job.feedUrl)).slice(0, 12).map((job) => ({ type: "EPISODE", title: job.episode?.title || job.episodeId || "Episode record", subtitle: `${job.state || "NOT_RECORDED"} · ${job.episode?.showName || "Podcast not recorded"}`, feedUrl: job.feedUrl, episodeId: job.episodeId || job.episode?.id || null })) });
    if (this.can(actor, "support:read")) groups.push({ type: "REPORTS", items: asArray(this.store, "problem-report").filter((report) => includes(report.category, report.feedUrl, report.episodeId, report.feature)).slice(0, 12).map((report) => ({ type: "REPORT", title: String(report.category || "Listener report").replaceAll("_", " "), subtitle: `${reportState(report.status)} · ${report.feature || "General support"}`, reportId: report.id })) });
    if (this.can(actor, "listeners:read")) groups.push({ type: "LISTENERS", items: asArray(this.store, "installation").filter((listener) => includes(listener.id)).slice(0, 12).map((listener) => ({ type: "LISTENER", title: `Anonymous listener · ${String(listener.id).slice(-8)}`, subtitle: listener.onboardedAt ? "Onboarded installation" : "Installation not onboarded", listenerId: listener.id })) });
    if (this.can(actor, "rights:read")) groups.push({ type: "RIGHTS", items: rightsRecords.filter((record) => includes(record.feedUrl, record.podcast, record.publisher, record.classification, record.assessmentStatus)).slice(0, 12).map((record) => ({ type: "RIGHTS", title: record.podcast || "Rights record", subtitle: `${record.classification || "UNASSESSED"} · ${record.assessmentStatus || "Not assessed"}`, feedUrl: record.feedUrl, episodeId: record.episodeId || null })) });
    return { query: needle, groups: groups.filter((group) => group.items.length) };
  }
}
