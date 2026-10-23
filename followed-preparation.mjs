import { episodeKey, durationMs, activeStates } from "./episode-pipeline.mjs";
import { setImmediate as yieldToRequests } from "node:timers/promises";

const kind = "followed-preparation";
const iso = () => new Date().toISOString();
const waitCodes = new Set(["BUDGET_LIMIT", "SERVER_BUSY", "SERVER_UNAVAILABLE"]);

// Durable demand, not a second AI pipeline. Every dispatch uses the canonical
// pipeline and its transactional outbox, rights checks and shared cost ledger.
export class FollowedPreparation {
  constructor({ store, pipeline, ledger, testingMode, rights, discover, assess, enabled, allowed, inspect, status }) {
    Object.assign(this, { store, pipeline, ledger, testingMode, rights, discover, assess, enabled, allowed, inspect, status });
    this.refreshing = null; this.draining = null;
  }
  configuration() { return this.store.get(kind, "configuration") || { enabled: false, version: 0 }; }
  listeners() {
    const devices = this.store.all("pilot-device").map(([, v]) => v);
    return this.store.all("installation").map(([, v]) => v).filter(v => !v.revokedAt && v.intelligenceEnabled !== false &&
      (!devices.some(d => d.listenerId === v.id) || devices.some(d => d.listenerId === v.id && !d.revokedAt && Date.parse(d.expiresAt) > Date.now())));
  }
  follows() {
    const ids = new Set(this.listeners().map(v => v.id));
    return this.store.all("follow").map(([, v]) => v).filter(v => ids.has(v.owner) && v.intelligenceEnabled !== false);
  }
  rows() { return this.store.all("followed-demand").map(([, v]) => v); }
  put(row) { this.store.set("followed-demand", row.key, row); return row; }
  async refresh({ force = false, newlyFollowed = null } = {}) {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.plan({ force, newlyFollowed }).finally(() => { this.refreshing = null; });
    return this.refreshing;
  }
  async plan({ force, newlyFollowed }) {
    const prior = this.store.get(kind, "snapshot");
    const follows = this.follows(), feeds = [...new Set(follows.map(v => v.feedUrl))].sort();
    const signature = JSON.stringify(follows.map(v => [v.owner, v.feedUrl]).sort());
    if (!force && !newlyFollowed && prior?.signature === signature && Date.now() - Date.parse(prior.at) < 3600000) return this.summary();
    const errors = [], windowKeys = [];
    // Serial feed discovery bounds RSS and assessment traffic as well as memory.
    for (const feedUrl of feeds) {
      try {
        const episodes = await this.discover(feedUrl);
        for (const [rank, episode] of episodes.slice(0, 3).entries()) {
          await yieldToRequests();
          const key = episodeKey(feedUrl, episode.id), old = this.store.get("followed-demand", key);
          windowKeys.push(key);
          const { episode: resolved } = await this.assess(feedUrl, episode.id);
          const processing = this.rights.evaluate({ feature: "intelligence-processing", feedUrl, episodeId: episode.id });
          const decision = processing;
          const cached = this.pipeline.status(feedUrl, episode.id);
          const sourceNeedsRefresh = cached?.state === "READY" && (cached.episode?.audioUrl !== resolved.audioUrl || JSON.stringify(cached.episode?.refs) !== JSON.stringify(resolved.refs) || Date.now() - Date.parse(cached.sourceCheckedAt || cached.completedAt) >= 86400000);
          const seconds = durationMs(resolved.duration) / 1000 || null;
          const hasTranscript = Boolean(cached?.transcript?.segments?.length || this.store.get("transcript", key)?.segments?.length);
          const audioUsd = hasTranscript || resolved.refs?.length ? 0 : seconds == null ? null : Math.ceil(seconds) * 0.0001;
          this.put({ ...old, key, feedUrl, episodeId: episode.id, title: resolved.title, podcast: resolved.showName,
            rank, inWindow: true, sourceNeedsRefresh, priority: Math.max(old?.manualPriority || 0, newlyFollowed === feedUrl ? 90 - rank : 70 - rank * 10),
            source: newlyFollowed === feedUrl ? "new-follow" : "followed", assessedAt: iso(), createdAt: old?.createdAt || iso(),
            eligible: processing.allowed, retryAfter: processing.allowed && old?.eligible === false ? null : old?.retryAfter,
            ...(processing.allowed && old?.eligible === false ? { state: "NOT_REQUESTED", code: null, reason: null } : {}),
            decision: { code: decision.code, reason: decision.reason, evidence: this.rights.resolve(feedUrl, episode.id).assessmentEvidence || [] },
            // Planning estimate, not a reservation. Publisher references may fail;
            // actual fallback is still atomically budgeted before any paid call.
            estimate: { audioUsd, textUsd: cached?.state === "READY" ? 0 : seconds ? Math.max(0.01, seconds / 3600 * 0.05) : null, basis: "RSS duration; Whisper $0.006/min; planning text allowance $0.05/hour; publisher references assumed usable" },
          });
        }
      } catch { errors.push({ feedUrl, code: "SOURCE_UNAVAILABLE", reason: "Feed or episode discovery failed; it will be retried at the next refresh." }); }
    }
    const known = new Set(windowKeys);
    for (const row of this.rows()) if (!known.has(row.key) && !errors.some(e => e.feedUrl === row.feedUrl)) this.put({ ...row, inWindow: false });
    // This snapshot is committed BEFORE dispatch; a restart cannot bypass the estimate.
    this.store.set(kind, "snapshot", { at: iso(), signature, activeUsers: this.listeners().length, follows: follows.length, feeds: feeds.length, errors });
    return this.summary();
  }
  async encounter(listenerId, feedUrl, episodeId, source) {
    if (!this.configuration().enabled || !this.listeners().some(v => v.id === listenerId)) return;
    const key = episodeKey(feedUrl, episodeId), old = this.store.get("followed-demand", key);
    const row = { ...old, key, feedUrl, episodeId, priority: source === "playing" ? 100 : 80, source, encounterOwner: listenerId, encounteredAt: iso(), createdAt: old?.createdAt || iso() };
    this.put(row);
    void this.drain().catch(() => {});
  }
  async drain() {
    if (this.draining) return this.draining;
    this.draining = this.dispatch().finally(() => { this.draining = null; });
    return this.draining;
  }
  async dispatch() {
    if (!this.configuration().enabled || !this.enabled() || !this.store.get(kind, "snapshot")) return;
    const feeds = new Set(this.follows().map(v => v.feedUrl)), listeners = new Set(this.listeners().map(v => v.id));
    let slots = Math.max(0, 2 - this.store.all("intelligence").filter(([, j]) => activeStates.has(j.state) && !j.completedAt).length);
    for (const row of this.rows().sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt))) {
      await yieldToRequests();
      if (row.paused || Date.parse(row.retryAfter || "") > Date.now()) continue;
      const recentEncounter = listeners.has(row.encounterOwner) && Date.now() - Date.parse(row.encounteredAt || "") < 86400000;
      if (!(row.inWindow && feeds.has(row.feedUrl)) && !recentEncounter) continue;
      const cached = this.pipeline.status(row.feedUrl, row.episodeId);
      if (cached?.state === "READY" && !row.sourceNeedsRefresh) { this.inspect(row.feedUrl, row.episodeId); continue; }
      if (activeStates.has(cached?.state) && !cached.completedAt) {
        if ((cached.priority || 0) < row.priority) this.store.set("intelligence", row.key, { ...cached, priority: row.priority });
        continue;
      }
      if (!slots) break;
      try {
        const { episode } = await this.assess(row.feedUrl, row.episodeId);
        const processing = this.rights.evaluate({ feature: "intelligence-processing", feedUrl: row.feedUrl, episodeId: row.episodeId });
        const decision = processing;
        if (!processing.allowed) {
          this.testingMode.attention({ ...row, title: episode.title, podcast: episode.showName, decision: { ...decision, rights: this.rights.resolve(row.feedUrl, row.episodeId) } });
          this.put({ ...row, eligible: false, state: "REVIEW_REQUIRED", code: decision.code, reason: decision.reason, retryAfter: new Date(Date.now() + 3600000).toISOString() });
          continue;
        }
        if (!this.allowed(row.feedUrl, row.episodeId)) { this.put({ ...row, state: "PAUSED", code: "AUTOMATIC_PREPARATION_DISABLED" }); continue; }
        this.store.delete("intelligence-attention", row.key);
        const status = await this.pipeline.request({ feedUrl: row.feedUrl, episodeId: row.episodeId, trigger: "automatic", platformProcessing: true, allowAudio: true, priority: row.priority, retry: row.retry === true, testingContext: this.testingMode.platformContext() });
        this.put({ ...row, sourceNeedsRefresh: false, eligible: true, title: episode.title, podcast: episode.showName, state: status.state, code: status.code || null, reason: status.reason || null, retry: false,
          firstQueuedAt: row.firstQueuedAt || (status.jobId ? iso() : null), retryAfter: waitCodes.has(status.code) ? new Date(Date.now() + 60000).toISOString() : null });
        if (status.jobId && activeStates.has(status.state)) slots--;
      } catch { this.put({ ...row, state: "WAITING", code: "SOURCE_UNAVAILABLE", retryAfter: new Date(Date.now() + 300000).toISOString() }); }
    }
  }
  summary() {
    this.ledger.refresh();
    const snapshot = this.store.get(kind, "snapshot"), rows = this.rows().filter(v => v.inWindow || v.encounterOwner).map(row => {
      const job = this.pipeline.status(row.feedUrl, row.episodeId);
      const recovered = this.pipeline.rightsRecovery?.(row.feedUrl, row.episodeId);
      const state = row.paused ? "PAUSED" : row.eligible === false ? "REVIEW_REQUIRED" : recovered ? "NOT_REQUESTED" : job?.code === "BUDGET_LIMIT" ? "WAITING" : job?.state || row.state || "NOT_REQUESTED";
      return { ...row, ...this.status?.(row.feedUrl, row.episodeId), state, code: row.eligible === false ? row.decision?.code || row.code : recovered || job?.state === "READY" ? null : job?.code || row.code, jobId: job?.jobId || null, completedAt: job?.completedAt || null, processingMs: job?.processingMs || null };
    });
    const window = rows.filter(v => v.inWindow), counts = {};
    for (const row of window) counts[row.state] = (counts[row.state] || 0) + 1;
    const pending = window.filter(v => v.state !== "READY"), estimates = pending.map(v => v.estimate);
    const knownUsd = estimates.reduce((n, v) => n + (v?.audioUsd || 0) + (v?.textUsd || 0), 0);
    const completedLast24Hours = window.filter(v => v.state === "READY" && Date.parse(v.completedAt) >= Date.now() - 86400000).length;
    return { configuration: this.configuration(), refreshInProgress: Boolean(this.refreshing), snapshot, counts, uniqueEpisodes: window.length, requiringPreparation: pending.length,
      estimate: { knownUsd, unknownEpisodes: estimates.filter(v => v?.audioUsd == null || v?.textUsd == null).length, eligibleKnownUsd: pending.filter(v => v.eligible).reduce((n,v) => n + (v.estimate?.audioUsd || 0) + (v.estimate?.textUsd || 0), 0), completionEta: null, reason: "End-to-end ETA unavailable until comparable followed-backlog throughput is measured; rights review and budget waits are not predictable." },
      throughput: { completedLast24Hours, episodesPerHour: completedLast24Hours / 24, observationWindowHours: 24 },
      expenditure: { ...this.ledger.totals(), actualMonthUsd: this.ledger.usage.filter(v => v.at.startsWith(iso().slice(0,7))).reduce((n,v) => n + v.usd, 0), reservedUsd: [...this.ledger.reservations.values()].reduce((n,v) => n + v.usd, 0) }, rows: rows.sort((a,b) => b.priority-a.priority).slice(0, 100), totalRows: rows.length };
  }
  action(input, actor) {
    if (actor.role !== "SUPER_ADMIN") throw Error("Super administrator access is required.");
    if (actor.source !== "session") throw Error("An interactive Super administrator session is required for operational controls.");
    if (!String(input.reason || "").trim()) throw Error("Provide a reason for this operational change.");
    if (["activate", "suspend"].includes(input.action)) {
      if (!this.store.get(kind, "snapshot")) throw Error("Estimate the followed backlog before activation.");
      if (input.action === "activate" && this.refreshing) throw Error("Wait for backlog discovery to finish before activation.");
      if (input.confirmation !== "CONFIRM") throw Error("Confirm the platform-wide change.");
      const old = this.configuration();
      if (input.expectedVersion !== old.version) throw Error("Configuration changed. Reload before saving.");
      this.store.set(kind, "configuration", { enabled: input.action === "activate", version: old.version + 1, at: iso(), actor: actor.id });
      return { previous: old, current: this.configuration() };
    } else {
      const row = this.store.get("followed-demand", input.key);
      if (!row || !["pause", "retry", "prioritise"].includes(input.action)) throw Error("Choose a known preparation job and action.");
      if (input.action === "pause" && activeStates.has(this.pipeline.status(row.feedUrl, row.episodeId)?.state)) throw Error("An accepted job must finish or be cancelled from episode operations before pausing future dispatch.");
      const current = this.put({ ...row, paused: input.action === "pause", retry: input.action === "retry", retryAfter: null, ...(input.action === "prioritise" ? { priority: 95, manualPriority: 95 } : {}) });
      return { previous: row, current };
    }
  }
}
