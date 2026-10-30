import { episodeKey, durationMs, activeStates, listenerProcessingStatus, recoverableTechnicalJob } from "./episode-pipeline.mjs";
import { createHash } from "node:crypto";
import { measuredProcessingEstimate } from "./processing-estimate.mjs";
import { publicUrl } from "./safe-network.mjs";
import { setImmediate as yieldToRequests } from "node:timers/promises";

const kind = "followed-preparation";
const iso = () => new Date().toISOString();
const waitCodes = new Set(["BUDGET_LIMIT", "SERVER_BUSY", "SERVER_UNAVAILABLE"]);
const completed = job => job?.state === "READY" || job?.state === "PARTIAL_READY" && Boolean(job.completedAt);
export function latestPublishedEpisodes(episodes, now = Date.now()) {
  const seen = new Set();
  return episodes.filter(e => e.id && publicUrl(e.audioUrl) &&
    !e.withdrawn && !e.deleted && Number.isFinite(Date.parse(e.publishedAt)) && Date.parse(e.publishedAt) <= now)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || String(a.id).localeCompare(String(b.id)))
    .filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; }).slice(0, 3);
}
const recent = (row, listeners) => listeners.has(row.encounterOwner) && Date.now() - Date.parse(row.encounteredAt || "") < 86400000;
const priorityFor = (row, listeners) => Math.max(row.manualPriority || 0,
  recent(row, listeners) ? row.encounterPriority || 80 : 0, row.inWindow ? 70 - row.rank * 10 : 0);

// Durable demand, not a second AI pipeline. Every dispatch uses the canonical
// pipeline and its transactional outbox, rights checks and shared cost ledger.
export class FollowedPreparation {
  constructor({ audienceEligible = () => true, canonicalFeed = async feed => feed, resolveFeedIdentity = feed => feed, store, pipeline, ledger, testingMode, rights, discover, assess, enabled, allowed, inspect, resumeDerived, status }) {
    Object.assign(this, { audienceEligible, canonicalFeed, resolveFeedIdentity, store, pipeline, ledger, testingMode, rights, discover, assess, enabled, allowed, inspect, resumeDerived, status });
    this.refreshing = null; this.draining = null;
  }
  configuration() { return this.store.get(kind, "configuration") || { enabled: true, version: 0 }; }
  listeners() {
    const devices = this.store.all("pilot-device").map(([, v]) => v);
    return this.store.all("installation").map(([, v]) => v).filter(v => !v.revokedAt && v.intelligenceEnabled !== false && this.audienceEligible(v) &&
      (!devices.some(d => d.listenerId === v.id) || devices.some(d => d.listenerId === v.id && !d.revokedAt && Date.parse(d.expiresAt) > Date.now())));
  }
  follows() {
    const ids = new Set(this.listeners().map(v => v.id));
    return this.store.all("follow").map(([, v]) => v).filter(v => ids.has(v.owner) && v.intelligenceEnabled !== false)
      .map(v => ({ ...v, feedUrl: this.resolveFeedIdentity(v.feedUrl) }));
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
    const follows = this.follows().map(follow => ({...follow, feedUrl: this.resolveFeedIdentity(follow.feedUrl)})), feeds = [...new Set(follows.map(v => v.feedUrl))].sort();
    const signature = JSON.stringify(follows.map(v => [v.owner, v.feedUrl]).sort());
    if (!force && !newlyFollowed && prior?.signature === signature && Date.now() - Date.parse(prior.at) < (prior.errors?.length ? 300000 : 3600000)) return this.summary();
    const errors = [], windowKeys = [];
    // Serial feed discovery bounds RSS and assessment traffic as well as memory.
    const visited = new Set();
    for (let feedUrl of feeds) {
      try {
        feedUrl = await this.canonicalFeed(feedUrl);
        if (visited.has(feedUrl)) continue;
        visited.add(feedUrl);
        const episodes = latestPublishedEpisodes(await this.discover(feedUrl));
        for (const [rank, episode] of episodes.entries()) {
          await yieldToRequests();
          const key = episodeKey(feedUrl, episode.id), old = this.store.get("followed-demand", key);
          windowKeys.push(key);
          try {
            const { episode: resolved } = await this.assess(feedUrl, episode.id);
            const processing = this.rights.evaluate({ feature: "intelligence-processing", feedUrl, episodeId: episode.id });
            const decision = processing;
            const recoveredEvidence = processing.allowed && (old?.eligible === false || old?.code === "SOURCE_UNAVAILABLE");
            const cached = this.pipeline.status(feedUrl, episode.id);
            const sourceNeedsRefresh = completed(cached) && (cached.episode?.audioUrl !== resolved.audioUrl || JSON.stringify(cached.episode?.refs) !== JSON.stringify(resolved.refs) || Date.now() - Date.parse(cached.sourceCheckedAt || cached.completedAt) >= 86400000);
            const seconds = durationMs(resolved.duration) / 1000 || null;
            const variant = createHash("sha256").update(resolved.audioUrl || "").digest("hex");
            const hasTranscript = Boolean(this.store.get("transcript", `${key}:${variant}`)?.segments?.length || this.store.get("audio-transcript", variant)?.segments?.length);
            const ready = completed(cached) && !sourceNeedsRefresh;
            const audioUsd = ready || hasTranscript ? 0 : seconds == null ? null : Math.ceil(seconds) * 0.0001;
            const acquisition = { intelligenceCacheHit: ready, transcriptCacheHit: hasTranscript,
              publisherReferences: resolved.refs?.length || 0, publisherTranscriptFound: cached?.episode?.audioUrl === resolved.audioUrl && cached?.transcriptChecks?.publisherTranscriptFound === true,
              requiresAudio: !ready && !hasTranscript && !resolved.refs?.length, durationSeconds: seconds, audioVariant: variant };
            this.put({ ...old, key, feedUrl, episodeId: episode.id, title: resolved.title, podcast: resolved.showName,
              rank, inWindow: true, sourceNeedsRefresh, acquisition, publishedAt: episode.publishedAt,
              priority: priorityFor({ ...old, rank, inWindow: true }, new Set(this.listeners().map(v => v.id))),
              source: newlyFollowed === feedUrl ? "new-follow" : "followed", assessedAt: iso(), createdAt: old?.createdAt || iso(),
              eligible: processing.allowed, retryAfter: recoveredEvidence ? null : old?.retryAfter,
              ...(recoveredEvidence ? { state: "NOT_REQUESTED", code: null, reason: null } : {}),
              decision: { code: decision.code, reason: decision.reason, evidence: this.rights.resolve(feedUrl, episode.id).assessmentEvidence || [] },
              // References are NOT verified transcripts. Include potential fallback
              // until acquisition proves reuse; reservations remain authoritative.
              estimate: { audioUsd, textUsd: ready ? 0 : seconds ? Math.max(0.01, seconds / 3600 * 0.05) : null, basis: "RSS duration; Whisper $0.006/min; text planning allowance $0.05/hour; includes fallback for unverified publisher references" },
            });
          } catch {
            errors.push({ feedUrl, episodeId: episode.id, code: "SOURCE_UNAVAILABLE", reason: "Episode assessment could not reach its source; other episodes continue independently." });
            this.put({ ...old, key, feedUrl, episodeId: episode.id, title: episode.title, rank, inWindow: true,
              createdAt: old?.createdAt || iso(), state: "WAITING", code: "SOURCE_UNAVAILABLE",
              reason: "Episode evidence could not be refreshed. Retrying source discovery.", retryAfter: new Date(Date.now() + 300000).toISOString() });
          }
        }
      } catch { errors.push({ feedUrl, code: "SOURCE_UNAVAILABLE", reason: "Feed or episode discovery failed; it will be retried at the next refresh." }); }
    }
    const known = new Set(windowKeys);
    for (const row of this.rows()) if (!known.has(row.key) && !errors.some(e => e.feedUrl === row.feedUrl && !e.episodeId)) this.put({ ...row, inWindow: false });
    // This snapshot is committed BEFORE dispatch; a restart cannot bypass the estimate.
    this.store.set(kind, "snapshot", { at: iso(), signature, activeUsers: this.listeners().length, follows: follows.length, feeds: feeds.length, errors });
    return this.summary();
  }
  async encounter(listenerId, feedUrl, episodeId, source) {
    if (!this.configuration().enabled || !this.listeners().some(v => v.id === listenerId)) return;
    const key = episodeKey(feedUrl, episodeId), old = this.store.get("followed-demand", key);
    const encounterPriority = Math.max(source === "playing" ? 100 : 80, recent(old || {}, new Set(this.listeners().map(v => v.id))) ? old.encounterPriority || 0 : 0);
    const row = { ...old, key, feedUrl, episodeId, priority: Math.max(old?.manualPriority || 0, encounterPriority), encounterPriority, source, encounterOwner: listenerId, encounteredAt: iso(), createdAt: old?.createdAt || iso() };
    this.put(row);
    // An opened episode may be the first request after installation. Establish
    // the bounded planning snapshot before dispatch, even with no follows yet.
    if (!this.store.get(kind, "snapshot")) await this.refresh();
    else if (this.refreshing) await this.refreshing;
    await this.drain();
  }
  async drain() {
    if (this.draining) return this.draining;
    this.draining = this.dispatch().finally(() => { this.draining = null; });
    return this.draining;
  }
  async dispatch() {
    if (this.refreshing || !this.configuration().enabled || !this.enabled() || !this.store.get(kind, "snapshot")) return;
    const feeds = new Set(this.follows().map(v => v.feedUrl)), listeners = new Set(this.listeners().map(v => v.id));
    let slots = Math.max(0, 2 - this.store.all("intelligence").filter(([, j]) => activeStates.has(j.state) && !j.completedAt).length);
    for (const row of this.rows().map(row => ({ ...row, priority: priorityFor(row, listeners) })).sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt))) {
      await yieldToRequests();
      if (row.paused) continue;
      const recentEncounter = listeners.has(row.encounterOwner) && Date.now() - Date.parse(row.encounteredAt || "") < 86400000;
      if (!(row.inWindow && feeds.has(row.feedUrl)) && !recentEncounter) continue;
      const cached = this.pipeline.status(row.feedUrl, row.episodeId);
      if(Date.parse(row.retryAfter || '')>Date.now()) {
        // Reuse the last assessed metadata for independent Ad Skip while the
        // canonical job backs off; do not turn every poll into another RSS call.
        this.inspect(row.feedUrl,row.episodeId,cached?.episode,{priority:row.priority});
        continue;
      }
      if (completed(cached) && !row.sourceNeedsRefresh) {
        this.inspect(row.feedUrl, row.episodeId, cached.episode, {priority:row.priority});
        if (this.allowed(row.feedUrl,row.episodeId) && this.rights.evaluate({feature:"intelligence-processing",feedUrl:row.feedUrl,episodeId:row.episodeId}).allowed) {
          try { await this.resumeDerived?.(row.feedUrl,row.episodeId); }
          catch { console.error(JSON.stringify({event:"automatic-search-index-deferred",code:"DERIVED_PROCESSING_PENDING"})); }
        }
        continue;
      }
      if (activeStates.has(cached?.state) && !cached.completedAt) {
        this.inspect(row.feedUrl, row.episodeId, cached.episode, {priority:row.priority});
        if ((cached.priority || 0) < row.priority) this.store.set("intelligence", row.key, { ...cached, priority: row.priority });
        continue;
      }
      try {
        const { episode } = await this.assess(row.feedUrl, row.episodeId);
        // Ad-only preparation has its own pilot/permissions/budget. A general
        // rights-review backoff or occupied full-analysis slot cannot block it.
        this.inspect(row.feedUrl, row.episodeId, episode, {priority:row.priority});
        if (Date.parse(row.retryAfter || '') > Date.now() || !slots) continue;
        const processing = this.rights.evaluate({ feature: "intelligence-processing", feedUrl: row.feedUrl, episodeId: row.episodeId });
        const decision = processing;
        if (!processing.allowed) {
          this.testingMode.attention({ ...row, title: episode.title, podcast: episode.showName, decision: { ...decision, rights: this.rights.resolve(row.feedUrl, row.episodeId) } });
          this.put({ ...row, eligible: false, state: "REVIEW_REQUIRED", code: decision.code, reason: decision.reason, retryAfter: new Date(Date.now() + 3600000).toISOString() });
          continue;
        }
        if (!this.allowed(row.feedUrl, row.episodeId)) { this.put({ ...row, state: "PAUSED", code: "AUTOMATIC_PREPARATION_DISABLED" }); continue; }
        this.store.delete("intelligence-attention", row.key);
        // SQS recovery resumes the same job/checkpoints. The local adapter has
        // no queue, so use its existing bounded retry instead, never both.
        const localRecovery = !this.pipeline.queue && recoverableTechnicalJob(cached) && Date.now() - Date.parse(cached.completedAt || "") >= 60000;
        const status = await this.pipeline.request({ feedUrl: row.feedUrl, episodeId: row.episodeId, trigger: "automatic", platformProcessing: true, allowAudio: true, priority: row.priority, retry: row.retry === true || localRecovery, testingContext: this.testingMode.platformContext() });
        this.put({ ...row, sourceNeedsRefresh: false, eligible: true, title: episode.title, podcast: episode.showName, state: status.state, code: status.code || null, reason: status.reason || null, retry: false,
          firstQueuedAt: row.firstQueuedAt || (status.jobId ? iso() : null), retryAfter: waitCodes.has(status.code) ? new Date(Date.now() + 60000).toISOString() : null });
        if (status.jobId && activeStates.has(status.state)) slots--;
      } catch { this.put({ ...row, state: "WAITING", code: "SOURCE_UNAVAILABLE", retryAfter: new Date(Date.now() + 300000).toISOString() }); }
    }
  }
  summary() {
    this.ledger.refresh();
    const feeds = new Set(this.follows().map(v => v.feedUrl)), listeners = new Set(this.listeners().map(v => v.id));
    const history = this.store.all("intelligence").map(([, job]) => job);
    const snapshot = this.store.get(kind, "snapshot"), rows = this.rows().filter(v => v.inWindow && feeds.has(v.feedUrl) || recent(v, listeners)).map(row => {
      const job = this.pipeline.status(row.feedUrl, row.episodeId);
      const recovered = this.pipeline.rightsRecovery?.(row.feedUrl, row.episodeId);
      const projected = job ? listenerProcessingStatus(job) : null;
      const state = row.paused || row.state === "PAUSED" && !this.allowed(row.feedUrl,row.episodeId) ? "PAUSED" : row.state === "WAITING" && row.code === "SOURCE_UNAVAILABLE" ? "WAITING" : row.eligible === false ? "REVIEW_REQUIRED" : recovered || row.sourceNeedsRefresh && completed(job) ? "DISCOVERED" : projected?.state === "NOT_REQUESTED" || !job ? row.code === "BUDGET_LIMIT" ? "BUDGET_PAUSED" : row.state === "FAILED" ? "FAILED" : "DISCOVERED" : projected.state;
      const ready = state === "READY";
      const cachedResult = ready || state === "PARTIAL_READY" && completed(job);
      const matchingVariant = !row.acquisition?.audioVariant || createHash("sha256").update(job?.episode?.audioUrl || "").digest("hex") === row.acquisition.audioVariant;
      const acquisition = { ...row.acquisition, intelligenceCacheHit: cachedResult && !row.sourceNeedsRefresh,
        publisherTranscriptFound: matchingVariant && job?.transcriptChecks?.publisherTranscriptFound === true || row.acquisition?.publisherTranscriptFound === true,
        transcriptCacheHit: matchingVariant && !!job?.transcript?.segments?.length || row.acquisition?.transcriptCacheHit === true };
      return { ...row, acquisition, priority: priorityFor(row, listeners), ...this.status?.(row.feedUrl, row.episodeId), state, stage: projected?.stage || null,
        work: job?.work || null, queuePosition: null, estimatedCompletion: measuredProcessingEstimate(job, history),
        elapsedMs: job?.startedAt ? Math.max(0, Date.parse(job.completedAt || iso()) - Date.parse(job.startedAt)) : null,
        code: row.eligible === false ? row.decision?.code || row.code : recovered || ready ? null : job?.code || row.code, jobId: job?.jobId || null, completedAt: job?.completedAt || null, processingMs: job?.processingMs || null };
    });
    const window = rows.filter(v => v.inWindow), counts = {};
    for (const row of window) counts[row.state] = (counts[row.state] || 0) + 1;
    const pending = window.filter(v => !v.acquisition.intelligenceCacheHit), estimates = pending.map(v => v.estimate);
    const remaining = row => (row.acquisition?.transcriptCacheHit ? 0 : row.estimate?.audioUsd || 0) + (row.estimate?.textUsd || 0);
    const knownUsd = pending.reduce((n, row) => n + remaining(row), 0);
    const limits = { ...this.ledger.controls, ...this.testingMode.limits(this.testingMode.platformContext()) }, totals = this.ledger.totals();
    const audio = pending.filter(v => !v.acquisition?.transcriptCacheHit && v.acquisition?.requiresAudio);
    const completedLast24Hours = window.filter(v => v.state === "READY" && Date.parse(v.completedAt) >= Date.now() - 86400000).length;
    return { configuration: this.configuration(), refreshInProgress: Boolean(this.refreshing), snapshot, counts, uniqueEpisodes: window.length, requiringPreparation: pending.length,
      acquisition: { intelligenceCacheHits: window.filter(v => v.acquisition?.intelligenceCacheHit).length, transcriptCacheHits: window.filter(v => v.acquisition?.transcriptCacheHit).length,
        publisherTranscriptsFound: window.filter(v => v.acquisition?.publisherTranscriptFound).length, publisherReferencesUnverified: pending.filter(v => v.acquisition?.publisherReferences && !v.acquisition?.publisherTranscriptFound && !v.acquisition?.transcriptCacheHit).length,
        requiringAudio: audio.length, eligibleRequiringAudio: audio.filter(v => v.eligible).length, estimatedAudioHours: audio.reduce((n,v) => n + (v.acquisition?.durationSeconds || 0) / 3600, 0), unknownAudioDurations: audio.filter(v => !v.acquisition?.durationSeconds).length },
      budget: { limits, temporaryExpiresAt: this.testingMode.configuration?.().active ? this.testingMode.configuration().expiresAt : null, remainingDailyUsd: Math.max(0, limits.dailyUsd - totals.day), remainingMonthlyUsd: Math.max(0, limits.monthlyUsd - totals.month), remainingAudioSeconds: Math.max(0, limits.dailyTranscriptionSeconds - totals.transcriptionSeconds) },
      estimate: { knownUsd, unknownEpisodes: estimates.filter(v => v?.audioUsd == null || v?.textUsd == null).length, eligibleKnownUsd: pending.filter(v => v.eligible).reduce((n,v) => n + remaining(v), 0), completionEta: null, reason: "End-to-end ETA unavailable until comparable followed-backlog throughput is measured; rights review and budget waits are not predictable." },
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
