import { episodeIdentity } from "./episode-identity.mjs";
import { createHash, randomUUID } from "node:crypto";
import { fetchPublisherTranscript, assessTranscript, PUBLISHER_TRANSCRIPT_PARSER_VERSION } from "./transcripts.mjs";
import {
  generateLongFormIntelligence,
  BudgetLedger,
  createOpenAIClient,
  PROCESSING_VERSION,
} from "./openai-intelligence.mjs";
import { prepareAudio, transcribeOnDemand, TRANSCRIPTION_ASSEMBLY_VERSION } from "./transcription.mjs";
import { hybridRetrieve } from "./intelligence.mjs";
import { groundResult } from "./grounded-result.mjs";
import { captionWindow } from "./captions.mjs";
import { processingTiming } from "./processing-estimate.mjs";
import { DELIVERY_VERSION, transcriptFingerprint, buildSearchIndex, groundedTopics, deliveryValidation } from "./intelligence-delivery.mjs";

export const activeStates = new Set([
  "QUEUED",
  "DISCOVERING",
  "TRANSCRIBING",
  "UNDERSTANDING",
  "ORGANISING",
  "PROCESSING",
  "PARTIAL_READY",
]);
export const listenerActiveStates = new Set([
  "CHECKING",
  "QUEUED",
  "ACQUIRING_TRANSCRIPT",
  "TRANSCRIBING",
  "ANALYSING",
  "INDEXING",
]);
const terminalStates = new Set(["READY", "FAILED", "BLOCKED", "CANCELLED"]);
const lifecycleLimit = 80;
const completed = (value) =>
  value?.state === "READY" ||
  (value?.state === "PARTIAL_READY" && !!value.completedAt);
const hash = (value) => createHash("sha256").update(value).digest("hex");
export const episodeKey = (feedUrl, episodeId) =>
  hash(episodeIdentity(feedUrl, episodeId));
export const canonicalEpisodeId = (feedUrl, episodeId) =>
  `${hash(String(feedUrl)).slice(0, 16)}:${hash(String(episodeId)).slice(0, 16)}`;

export const recoverableTechnicalJob = (job) => job?.state === "FAILED" && job.retryable !== false &&
  ["QUEUE_TIMEOUT", "INTERRUPTED", "ANALYSIS_FAILED", "PROVIDER_TIMEOUT", "PROCESSING_TIMEOUT", "SOURCE_VALIDATION_FAILED", "PROVIDER_UNAVAILABLE"].includes(job.code) &&
  (job.recoveries || 0) < 2;

// The persisted worker state deliberately remains backward-compatible. This
// projection is the one shared by listener clients and operations views. It
// prevents a client from guessing progress from a timer or from raw provider
// fields that do not mean the same thing as listener-visible progress.
export function listenerProcessingStatus(value) {
  if (!value) return { state: "NOT_REQUESTED", stage: null, processing: false };
  if (value.state === "READY" || (value.state === "PARTIAL_READY" && value.completedAt))
    return { state: value.state, stage: value.state, processing: false };
  if (value.state === "FAILED")
    return { state: "FAILED", stage: null, processing: false };
  if (value.state === "CANCELLED" || value.code === "CANCELLED")
    return { state: "CANCELLED", stage: null, processing: false };
  if (value.state === "BLOCKED") {
    if (value.code === "BUDGET_LIMIT")
      return { state: "BUDGET_PAUSED", stage: null, processing: false };
    return { state: "UNAVAILABLE", stage: null, processing: false };
  }
  if (value.state === "QUEUED")
    return { state: "QUEUED", stage: "QUEUED", processing: true };
  const stage = value.processingStage || value.phase || "CHECKING";
  const state = {
    DISCOVERING: "CHECKING",
    CHECKING: "CHECKING",
    ACQUIRING_TRANSCRIPT: "ACQUIRING_TRANSCRIPT",
    PREPARING_AUDIO: "ACQUIRING_TRANSCRIPT",
    TRANSCRIBING: "TRANSCRIBING",
    UNDERSTANDING: "ANALYSING",
    ANALYSING: "ANALYSING",
    ORGANISING: "INDEXING",
    INDEXING: "INDEXING",
    TRANSCRIPT_READY: "ANALYSING",
  }[stage] || "CHECKING";
  return { state, stage, processing: true };
}

const lifecycleType = (value, previous) => {
  if (value.state === "QUEUED") return "JOB_QUEUED";
  if (value.state === "READY" || (value.state === "PARTIAL_READY" && value.completedAt)) return "INTELLIGENCE_READY";
  if (value.state === "FAILED") return "PROCESSING_FAILED";
  if (value.state === "BLOCKED") return "PROCESSING_UNAVAILABLE";
  if (value.state === "CANCELLED") return "PROCESSING_CANCELLED";
  switch (value.processingStage || value.phase) {
    case "CHECKING": return previous?.state === "QUEUED" ? "WORKER_STARTED" : "TRANSCRIPT_CACHE_CHECK";
    case "ACQUIRING_TRANSCRIPT": return "TRANSCRIPT_ACQUISITION";
    case "PREPARING_AUDIO": return "AUDIO_PREPARATION";
    case "TRANSCRIBING": return "AUDIO_TRANSCRIPTION";
    case "TRANSCRIPT_READY": return "TRANSCRIPT_READY";
    case "ANALYSING": return "AI_ANALYSIS";
    case "INDEXING": return "SEARCH_INDEX";
    default: return "PROCESSING_UPDATED";
  }
};

const transitionAllowed = (from, to) => {
  if (!from || from === to) return true;
  if (from === "QUEUED") return ["PROCESSING", "PARTIAL_READY", "FAILED", "BLOCKED", "CANCELLED"].includes(to);
  if (["PROCESSING", "PARTIAL_READY"].includes(from))
    return ["PROCESSING", "PARTIAL_READY", "READY", "FAILED", "BLOCKED", "CANCELLED"].includes(to);
  if (["FAILED", "BLOCKED", "CANCELLED", "READY"].includes(from)) return false;
  return false;
};
export function durationMs(value) {
  if (!value) return null;
  const parts = String(value).split(":").map(Number);
  if (parts.some((x) => !Number.isFinite(x) || x < 0) || parts.length > 3)
    return null;
  const seconds = parts.reduce((n, x) => n * 60 + x, 0);
  return seconds > 0 ? seconds * 1000 : null;
}
export function publicIntelligence(value) {
  if (!value) return { state: "NOT_REQUESTED" };
  const { transcript, episode, refs, lifecycle, estimateHistory, timing, testingContext, ...safe } = value;
  return {
    ...safe,
    // Job identity is safe and necessary for operations.  Do not leak the
    // enclosure URL, publisher transcript references, or transcript body.
    episode: episode
      ? {
          id: episode.id,
          title: episode.title,
          showName: episode.showName,
          publisher: episode.publisher,
          publishedAt: episode.publishedAt,
          duration: episode.duration,
          artworkUrl: episode.artworkUrl,
          feedUrl: episode.feedUrl,
        }
      : undefined,
    state:
      activeStates.has(safe.state) && safe.state !== "QUEUED"
          ? transcript
            ? "PARTIAL_READY"
            : "PROCESSING"
          : safe.state,
    processing: activeStates.has(safe.state) && !safe.completedAt,
    transcriptAvailable: !!transcript?.segments?.length,
    canonicalEpisodeId: value.feedUrl && value.episodeId
      ? canonicalEpisodeId(value.feedUrl, value.episodeId)
      : undefined,
  };
}

// Keep the durable codes stable for installed clients and operational history,
// while giving newer clients one precise availability classification. Some
// older codes describe the mechanism (for example AUDIO_CONSENT_REQUIRED),
// not the listener-visible result (no usable transcript is available yet).
export function availabilityCode(code) {
  if (!code) return null;
  if (["AUDIO_CONSENT_REQUIRED", "AUDIO_DISABLED", "DURATION_UNKNOWN"].includes(code))
    return "TRANSCRIPT_UNAVAILABLE";
  if (["TIMEOUT", "QUEUE_TIMEOUT"].includes(code)) return "PROCESSING_TIMEOUT";
  if (["PROVIDER_UNAVAILABLE", "PROVIDER_TIMEOUT"].includes(code))
    return "PROVIDER_FAILURE";
  return code;
}

function failure(error) {
  if (error?.code === "TESTING_EXPIRED") return { code: error.code, reason: "Internal testing has ended or been disabled. Cached intelligence remains available.", retryable: false };
  if (error?.code === "PROVIDER_OUTCOME_UNKNOWN") return { code: error.code, reason: "A provider request has an unknown outcome. An administrator must review it before another paid attempt.", retryable: false };
  const message = String(error?.message || "");
  if (/Transcription (timing failed validation|quality was insufficient|returned no usable timestamped speech)/i.test(message))
    return {
      code: "TRANSCRIPT_VALIDATION_FAILED",
      reason: "The transcription could not be validated safely. Completed provider responses are preserved for technical review.",
      retryable: false,
    };
  if (/incomplete|JSON|source validation/.test(message))
    return {
      code: "SOURCE_VALIDATION_FAILED",
      reason: "Analysis could not be completed reliably. Please retry once.",
      retryable: true,
    };
  if (/transcript exceeds the current processing limit/i.test(message))
    return {
      code: "TRANSCRIPT_TOO_LARGE",
      reason:
        "The available transcript is too large for the current grounded analysis limit.",
      retryable: false,
    };
  if (/two-hour|audio transcription.*duration|episode is longer/i.test(message))
    return {
      code: "DURATION_LIMIT",
      reason:
        "This episode exceeds the current audio transcription limit.",
      retryable: false,
    };
  if (/budget/.test(message))
    return {
      code: "BUDGET_LIMIT",
      reason: "Preparation is temporarily paused.",
      retryable: false,
    };
  if (/rights|permission|authoris/i.test(message))
    return {
      code: "RIGHTS_RESTRICTED",
      reason: "This episode is not authorised for this kind of processing.",
      retryable: false,
    };
  if (/401|403|key|quota|billing/.test(message))
    return {
      code: "PROVIDER_UNAVAILABLE",
      reason: "Preparation is temporarily unavailable. Your listening can continue.",
      retryable: true,
    };
  if (/timeout|timed out|abort/i.test(message))
    return {
      code: "PROVIDER_TIMEOUT",
      reason: "Preparation was interrupted. You can retry once while your listening continues.",
      retryable: true,
    };
  if (/format|ffmpeg|decode|unsupported audio/i.test(message))
    return {
      code: "AUDIO_FORMAT_UNSUPPORTED",
      reason: "This audio format cannot be prepared safely on this server.",
      retryable: false,
    };
  if (/malformed transcript|transcript.*invalid|transcript.*unusable/i.test(message))
    return {
      code: "TRANSCRIPT_INVALID",
      reason: "The available transcript could not be validated for intelligence.",
      retryable: false,
    };
  return {
    code: "ANALYSIS_FAILED",
    reason: "This episode could not be analysed right now. You can retry once.",
    retryable: true,
  };
}
export class EpisodePipeline {
  constructor({
    store,
    ledger,
    resolveEpisode,
    canonicalFeed = async feed => feed,
    resolveFeedIdentity = feed => feed,
    enabled = false,
    audioEnabled = false,
    configured = false,
    client,
    fetchTranscript = fetchPublisherTranscript,
    audioFactory = prepareAudio,
    rights = null,
    intelligencePolicy = null,
    queue = null,
    onCompleted = null,
    onTranscriptReady = null,
    testingMode = null,
    jobTimeoutMs = 15 * 60 * 1000,
  }) {
    Object.assign(this, {
      store,
      ledger,
      resolveEpisode,
      canonicalFeed,
      resolveFeedIdentity,
      enabled,
      audioEnabled,
      configured,
      client,
      fetchTranscript,
      audioFactory,
      rights,
      intelligencePolicy,
      queue,
      onCompleted,
      onTranscriptReady,
      testingMode,
      jobTimeoutMs,
    });
    this.inflight = new Map();
    this.requesting = new Map();
    this.audioInflight = new Map();
    for (const [key, value] of store.all("intelligence"))
      if (activeStates.has(value.state) && !value.completedAt)
        // A durable queued job has not started and can be recovered by the
        // single consumer. In-progress work remains failed on restart because
        // its provider outcome may be unknown and must not be retried blindly.
        if (this.queue && (value.platformProcessing || value.testingContext && this.testingMode?.limits(value.testingContext).dailyUsd) && (value.recoveries || 0) < 2 && value.state !== "QUEUED") {
          const recovered = this.transition(key, value, { state: "QUEUED", processingStage: "QUEUED", recoveries: (value.recoveries || 0) + 1, deadlineAt: new Date(Date.now() + 2 * 3600000).toISOString() }, { force: true });
          this.store.set("processing-outbox", value.jobId, { key, ...recovered });
        } else if (!(this.queue && value.state === "QUEUED"))
          this.transition(key, value, {
            state: "FAILED",
            code: "INTERRUPTED",
            reason:
              "Analysis was interrupted when the server restarted. Please retry.",
            retryable: value.attempts < 2,
          // A pre-Phase-4 job may persist one of the legacy detailed states
          // (for example UNDERSTANDING). Recovery is the single safe place to
          // close that unknown provider outcome regardless of the old graph.
          }, { force: true });
    // Unknown provider outcomes are never refunded or retried automatically.
    for (const [id, row] of ledger.reservations)
      ledger.reconcile(id, { usd: row.usd, failed: true, uncertain: true });
  }
  transition(key, current, patch, { force = false, replace = false } = {}) {
    const now = new Date().toISOString();
    return this.store.transaction(() => {
      const stored = this.store.get("intelligence", key) || current || {};
      // A late worker must never overwrite a newer retry or completed record.
      if (current?.jobId && stored.jobId && current.jobId !== stored.jobId)
        return stored;
      let next = { ...(replace ? {} : stored), ...patch };
      if (!transitionAllowed(stored.state, next.state) && !force)
        throw Error(`Invalid processing transition: ${stored.state || "NONE"} to ${next.state || "NONE"}.`);
      const previousStage = stored.processingStage || stored.phase || null;
      const stage = next.processingStage || next.phase || null;
      const changed = Object.entries(patch).some(([field, value]) =>
        JSON.stringify(stored[field]) !== JSON.stringify(value),
      ) || stored.state !== next.state || previousStage !== stage;
      if (!changed) return stored;
      next.updatedAt = now;
      if (terminalStates.has(next.state) && !next.completedAt)
        next.completedAt = now;
      const event = {
        id: `${next.jobId || "job"}:${(stored.lifecycle || []).length + 1}`,
        at: now,
        feedUrl: next.feedUrl || stored.feedUrl || null,
        episodeId: next.episodeId || stored.episodeId || next.episode?.id || null,
        jobId: next.jobId || null,
        previousState: stored.state || null,
        state: next.state || null,
        previousStage,
        stage,
        type: lifecycleType(next, stored),
        code: next.code || null,
        reason: next.reason || null,
        processingVersion: next.processingVersion || null,
      };
      next.lifecycle = [...(replace ? [] : stored.lifecycle || []), event].slice(-lifecycleLimit);
      if (next.completedAt) next.timing = {
        ...processingTiming(next),
        episodeDurationMs: durationMs(next.episode?.duration),
        completedAt: next.completedAt,
        estimates: (next.estimateHistory || []).map((estimate) => ({
          ...estimate,
          actualRemainingMs: Math.max(0, Date.parse(next.completedAt) - Date.parse(estimate.updatedAt)),
        })),
      };
      this.store.set("intelligence", key, next);
      // The per-job history makes restarts and later retries auditable even
      // though the current status record is intentionally one per episode.
      if (event.jobId) this.store.set("processing-event", event.id, event);
      return next;
    });
  }
  createJob(key, value) {
    const now = value.startedAt || new Date().toISOString();
    const initial = {
      ...value,
      queuedAt: value.queuedAt || now,
      startedAt: value.startedAt || now,
      updatedAt: now,
      processingStage: "QUEUED",
      lifecycle: [],
    };
    return this.store.transaction(() => {
      const previous = this.store.get("intelligence", key);
      if (previous?.jobId && previous.jobId !== initial.jobId) {
        // Preserve recorded diagnostics, not a second copy of protected
        // transcripts or derived content outside the existing purge lifecycle.
        const fields = ["jobId", "feedUrl", "episodeId", "state", "code", "reason", "attempts", "retryable", "startedAt", "completedAt", "updatedAt", "processingVersion", "processingStage", "transcriptChecks", "reassessedFromJobId"];
        this.store.set("intelligence-history", previous.jobId, Object.fromEntries(fields.filter((field) => previous[field] !== undefined).map((field) => [field, previous[field]])));
      }
      return this.transition(key, null, initial, { force: true, replace: true });
    });
  }
  eventsFor(feedUrl, episodeId) {
    return this.store.all("processing-event")
      .map(([, event]) => event)
      .filter((event) => event.feedUrl === feedUrl && event.episodeId === episodeId)
      .sort((a, b) => Date.parse(a.at || "") - Date.parse(b.at || ""));
  }
  status(feed, id) {
    feed = this.resolveFeedIdentity(feed);
    const key = episodeKey(feed, id);
    let value = this.store.get("intelligence", key);
    if (completed(value) && value.transcript && !value.groundingVersion) {
      value = groundResult(value, value.transcript);
      if (value.partialResult) value.state = "PARTIAL_READY";
      this.store.set("intelligence", key, value);
    }
    if (value?.processingVersion !== PROCESSING_VERSION) return null;
    return this.deliver(value, key);
  }
  deliver(value, storedKey = null) {
    if (!value?.transcript?.segments?.length) return value;
    // Older completed jobs stored identity only in episode metadata. Recover
    // that shape without changing identity, re-buying analysis or trusting a
    // conflicting record. Transcript and output citations are still validated.
    const feedUrl = value?.feedUrl || value?.episode?.feedUrl;
    const episodeId = value?.episodeId || value?.episode?.id;
    if (feedUrl && episodeId && (!storedKey || storedKey === episodeKey(feedUrl, episodeId)) &&
      (!value.episode?.feedUrl || value.episode.feedUrl === feedUrl) &&
      (!value.episode?.id || value.episode.id === episodeId)) {
      value = { ...value, feedUrl, episodeId };
    } else if (value) {
      return { ...value, state: 'PARTIAL_READY', featureStatus: {}, code: 'EPISODE_IDENTITY_MISMATCH',
        reason: 'Cached episode identity requires repair before intelligence can be delivered.' };
    }
    if (this.rights && !this.rights.evaluate({ feature:"intelligence-processing", feedUrl:value.feedUrl, episodeId:value.episodeId }).allowed) return value;
    const key=episodeKey(value.feedUrl,value.episodeId), transcript=value.transcript;
    let index=this.store.get("search-index",key), derived;
    try {
      if(index?.version!==DELIVERY_VERSION || index.processingVersion!==value.processingVersion || index.fingerprint!==transcriptFingerprint(transcript)) {
        index=buildSearchIndex(transcript,value);
        this.store.set("search-index",key,index);
      }
      const topics=groundedTopics(value,index);
      derived={...value,topics};
      const validation=deliveryValidation(derived,index);
      const pending=!completed(value) && activeStates.has(value.state);
      const features=validation.features;
      if(pending)for(const name of ["brief","chapters","topics"])if(features[name].state==="FAILED")features[name]={state:"ANALYSING"};
      const ads=this.store.get("skip-analysis",key);
      features.adCandidates={state:ads?.state==="COMPLETE"?"READY":"PENDING",candidateCount:ads?.candidateCount ?? null};
      derived={...derived,featureStatus:features,deliveryValidation:{...validation,features:undefined},
        searchIndex:{version:index.version,transcriptVersion:index.transcriptVersion,segmentCount:index.segments.length,indexedAt:index.indexedAt}};
      if(completed(value)) {
        derived.state=validation.complete?"READY":"PARTIAL_READY";
        if(!validation.complete)derived.qualityNote=value.qualityNote || "Some outputs did not pass validation. Available features remain usable.";
      }
    } catch(error) {
      derived={...value,featureStatus:{...value.featureStatus,search:{state:"FAILED",code:"INDEXING_FAILED"},moments:{state:"FAILED",code:"INDEXING_FAILED"}},
        deliveryValidation:{version:DELIVERY_VERSION,complete:false,failures:[{feature:"search",code:"INDEXING_FAILED"}]},
        ...(completed(value)?{state:"PARTIAL_READY",qualityNote:"Search indexing needs recovery. Completed analysis is preserved."}:{})};
    }
    if(JSON.stringify(derived)!==JSON.stringify(value))this.store.set("intelligence",key,derived);
    return derived;
  }
  async preflight(feed, id) {
    const episode = await this.resolveEpisode(feed, id),
      duration = durationMs(episode.duration),
      rights = this.rights?.resolve(feed, id);
    const variant = hash(episode.audioUrl || "");
    const cached = this.store.get("transcript", `${episodeKey(feed, id)}:${variant}`) || this.store.get("audio-transcript", variant);
    const hasCachedTranscript = !!cached?.segments?.length;
    return {
      hasCachedTranscript,
      hasPublisherTranscript: episode.refs.length > 0,
      durationMs: duration,
      withinLimit:
        duration === null ||
        duration <= this.ledger.controls.maxEpisodeSeconds * 1000,
      audioEnabled: this.audioEnabled,
      analysisEnabled: this.enabled && this.configured,
      requiresAudioConsent: !hasCachedTranscript && !episode.refs.length,
      durationLimitAppliesTo: "NEW_AUDIO_TRANSCRIPTION",
      recovery: this.transcriptRecovery(feed, id, episode),
      estimatedAudioCost: duration ? Math.ceil(duration / 1000) * 0.0001 : null,
      rights: rights
        ? {
            classification: rights.classification,
            canProcessForAi: rights.canProcessForAi,
            canTranscribeAudio: rights.canTranscribeAudio,
            canDisplayCaptions: rights.canDisplayCaptions,
          }
        : null,
    };
  }
  transcriptRecovery(feedUrl, episodeId, episode) {
    const previous = this.status(feedUrl, episodeId);
    if (previous?.code !== "DURATION_LIMIT" || !["FAILED", "BLOCKED"].includes(previous.state)) return null;
    const variant = episode.audioUrl ? hash(episode.audioUrl) : null;
    const cached = variant && (this.store.get("transcript", `${episodeKey(feedUrl, episodeId)}:${variant}`) || this.store.get("audio-transcript", variant));
    const cacheFound = !!cached?.segments?.length;
    const publisherReference = Boolean(episode.refs?.length || episode.hasPublisherTranscript);
    // Only the legacy duration-before-discovery defect is automatically
    // reassessed. A current duration refusal is not an unlimited retry token.
    const stale = !previous.transcriptChecks?.publisherTranscriptChecked && !previous.reassessedFromJobId;
    const processing = this.rights?.evaluate({ feature: "intelligence-processing", feedUrl, episodeId });
    const permissions = this.rights?.resolve(feedUrl, episodeId);
    // Reopening old failures is a new processing decision, not a licence
    // inferred from a legacy approval checkbox or an administrator's assertion.
    const documentedBasis = Boolean(permissions?.approvalAssessment ||
      (permissions?.licence && permissions.assessmentEvidence?.some((item) => item.type === "PUBLISHER_LICENSE")) ||
      (permissions?.assessmentSource === "super-admin-technical-review" && permissions.assessmentEvidence?.some((item) => item.type === "INDEPENDENT_FEATURE_AUTHORISATION")) ||
      (permissions?.classification === "OWNED" && permissions.legalBasis && permissions.assessmentEvidence?.length));
    const operational = this.intelligencePolicy?.allows(feedUrl, episodeId, "intelligence");
    this.ledger.refresh();
    const totals = this.ledger.totals();
    const budgetAvailable = this.ledger.controls.enabled && totals.day < this.ledger.controls.dailyUsd && totals.month < this.ledger.controls.monthlyUsd;
    const eligible = stale && documentedBasis && processing?.allowed !== false && operational?.allowed !== false && this.enabled && this.configured && budgetAvailable;
    return {
      historicalFailure: { jobId: previous.jobId, code: previous.code, reason: previous.reason, at: previous.completedAt || previous.startedAt },
      stale, eligible, documentedBasis,
      blockerCode: processing?.allowed === false ? processing.code
        : !documentedBasis ? "LEGAL_BASIS_NOT_ESTABLISHED"
        : operational?.allowed === false ? "INTELLIGENCE_POLICY_HIGH"
        : !this.enabled || !this.configured ? "SERVER_UNAVAILABLE"
        : !budgetAvailable ? "BUDGET_LIMIT" : null,
      reason: processing?.allowed === false ? processing.reason
        : !documentedBasis ? "The historical approval has no supporting permission evidence. Record an independently supported basis before reassessment."
        : operational?.allowed === false ? "New intelligence processing is paused by policy."
        : !this.enabled || !this.configured ? "Episode analysis is temporarily unavailable."
        : !budgetAvailable ? "The intelligence budget is unavailable or exhausted."
        : stale ? "The historical duration refusal predates transcript discovery. Recheck authorised transcripts without paid audio."
        : previous.reason || "Audio transcription exceeds the current duration limit.",
      sources: { canonicalOrMatchingAudioCache: cacheFound ? "FOUND" : "UNAVAILABLE", publisherTranscript: publisherReference ? "REFERENCE_FOUND" : "UNAVAILABLE", publisherTranscriptFetched: "NOT_CHECKED", audioFallback: "NOT_REQUESTED" },
    };
  }
  rightsRecovery(feedUrl, episodeId) {
    const previous = this.store.get("intelligence", episodeKey(feedUrl, episodeId));
    const refusalCodes = new Set(["LEGAL_BASIS_NOT_ESTABLISHED", "RIGHTS_RESTRICTED", "FEATURE_NOT_AUTHORISED", "ASSESSMENT_REQUIRED", "EXPLICIT_AUTHORISATION_REQUIRED", "SCOPED_PUBLISHER_RESTRICTION", "PUBLISHER_RESTRICTION", "RIGHTS_RESERVED", "TAKEDOWN_OR_SUSPENSION"]);
    return previous && ["FAILED", "BLOCKED", "UNAVAILABLE"].includes(previous.state) && refusalCodes.has(previous.code) &&
      this.rights?.evaluate({ feature: "intelligence-processing", feedUrl, episodeId }).allowed ? previous : null;
  }
  async request(input) {
    input = { ...input, feedUrl: await this.canonicalFeed(input.feedUrl) };
    const key = episodeKey(input.feedUrl, input.episodeId);
    if (this.requesting.has(key)) return this.requesting.get(key);
    const pending = this.requestOnce(input);
    this.requesting.set(key, pending);
    try { return await pending; }
    finally { this.requesting.delete(key); }
  }
  async requestOnce({
    feedUrl,
    episodeId,
    allowAudio = false,
    retry = false,
    trigger = "manual",
    testingContext = null,
    priority = 0,
    platformProcessing = false,
  }) {
    const key = episodeKey(feedUrl, episodeId);
    // Re-evaluate publisher evidence before consulting historical failures.
    // The registry deduplicates identical evidence and preserves human holds.
    await this.assessEpisodeRights?.(feedUrl, episodeId);
    const processingDecision = this.rights?.evaluate({ feature: "intelligence-processing", feedUrl, episodeId, audit: true });
    if (processingDecision && !processingDecision.allowed)
      return { state: "BLOCKED", code: processingDecision.code, reason: processingDecision.reason, retryable: false };
    if (!this.testingMode?.limits(testingContext).dailyUsd) testingContext = null;
    // Global activation is never consent to pay for audio or retry failed work.
    if (trigger === "automatic") {
      allowAudio = platformProcessing ? allowAudio : Boolean(testingContext);
      retry = platformProcessing && retry;
    }
    let previous = this.status(feedUrl, episodeId),
      forcePublisherRefresh = false;
    const rightsRecovery = this.rightsRecovery(feedUrl, episodeId);
    if (rightsRecovery) {
      // A rights refusal spent no provider attempt. A newly permitted attempt
      // gets the normal retry cap; a subsequent technical failure does not.
      previous = null;
    }
    let recovery = null;
    if (previous?.code === "DURATION_LIMIT" && ["FAILED", "BLOCKED"].includes(previous.state)) {
      recovery = this.transcriptRecovery(feedUrl, episodeId, await this.resolveEpisode(feedUrl, episodeId));
      if (recovery?.eligible) allowAudio = false;
      if (recovery?.stale && !recovery.documentedBasis)
        return { state: "BLOCKED", code: recovery.blockerCode, reason: recovery.reason, retryable: false };
    }
    // A source-refresh job can fail before it starts (for example after an
    // SQS visibility lease expires). Retry from the preserved completed
    // record so the next worker rechecks the publisher source without
    // discarding valid cached intelligence or repaying for identical input.
    if (previous?.state === "FAILED" && retry && previous.refreshBaseJobId) {
      const preserved = this.store.get("intelligence-refresh", previous.refreshBaseJobId);
      if (completed(preserved)) {
        previous = preserved;
        forcePublisherRefresh = true;
      }
    }
    if (
      trigger === "automatic" &&
      previous &&
      ["FAILED", "BLOCKED", "UNAVAILABLE", "CANCELLED"].includes(previous.state) && !recovery?.eligible && !(platformProcessing && (retry && previous.retryable || ["AUDIO_CONSENT_REQUIRED", "AUDIO_DISABLED", "AUDIO_TRANSCRIPTION_NOT_AUTHORISED", "RIGHTS_RESTRICTED", "LEGAL_BASIS_NOT_ESTABLISHED", "TESTING_EXPIRED"].includes(previous.code))) && !(testingContext && (["AUDIO_CONSENT_REQUIRED", "AUDIO_DISABLED", "DURATION_LIMIT"].includes(previous.code) || (previous.code === "TESTING_EXPIRED" && previous.testingContext?.version !== testingContext.version)))
    )
      return publicIntelligence(previous);
    if (!completed(previous) && previous?.attempts >= 2 && !recovery?.eligible)
      return publicIntelligence(previous);
    if (completed(previous)) {
      const episode = await this.resolveEpisode(feedUrl, episodeId);
      const signature = hash(JSON.stringify([episode.audioUrl, episode.refs, PUBLISHER_TRANSCRIPT_PARSER_VERSION]));
      const priorSignature = previous.sourceSignature || hash(
        JSON.stringify([previous.episode.audioUrl, previous.episode.refs]),
      );
      if (
        !forcePublisherRefresh &&
        signature === priorSignature &&
        Date.now() -
          Date.parse(previous.sourceCheckedAt || previous.completedAt) <
          86400000
      )
        return { ...publicIntelligence(previous), cacheHit: true };
      forcePublisherRefresh = true;
    }
    if (this.inflight.has(key))
      return publicIntelligence(this.status(feedUrl, episodeId));
    if (previous && activeStates.has(previous.state) && !previous.completedAt)
      return publicIntelligence(previous);
    if (this.inflight.size >= 2)
      return {
        state: "BLOCKED",
        code: "SERVER_BUSY",
        reason:
          "Two episodes are already being analysed. Please try again when one is ready.",
        retryable: true,
      };
    if (
      previous?.state === "FAILED" &&
      (!retry || previous.attempts >= 2 || !previous.retryable) && !recovery?.eligible
    )
      return publicIntelligence(previous);
    if (!this.enabled || !this.configured)
      return {
        state: "BLOCKED",
        code: "SERVER_UNAVAILABLE",
        reason: "Episode analysis is temporarily unavailable.",
        retryable: false,
      };
    const operational = this.intelligencePolicy?.allows(feedUrl, episodeId, "intelligence");
    if (operational && !operational.allowed)
      return {
        state: "BLOCKED",
        code: "INTELLIGENCE_POLICY_HIGH",
        reason: "New intelligence processing is paused by the podcast intelligence policy.",
        retryable: false,
      };
    const attempts = (completed(previous) ? 0 : previous?.attempts || 0) + 1;
    const initial = {
      state: "QUEUED",
      jobId: randomUUID(),
      attempts,
      processingVersion: PROCESSING_VERSION,
      rightsPolicy: { mode: processingDecision?.mode || null, version: processingDecision?.policyVersion || null, outputProfile: processingDecision?.outputProfile || "standard" },
      intelligencePolicy: operational ? { tier: operational.tier, source: operational.source, version: operational.policyVersion } : null,
      startedAt: new Date().toISOString(),
      cacheHit: false,
      trigger,
      allowAudio,
      testingContext,
      platformProcessing,
      priority: testingContext || platformProcessing ? Math.max(0, Math.min(100, Number(priority) || 0)) : 0,
      feedUrl,
      episodeId,
      reassessedFromJobId: rightsRecovery?.jobId || (recovery?.eligible ? previous.jobId : undefined),
      deadlineAt: new Date(Date.now() + (testingContext ? 2 * 3600000 : this.jobTimeoutMs)).toISOString(),
      refreshBaseJobId: forcePublisherRefresh && completed(previous) ? null : undefined,
    };
    // The queue message stays deliberately small. A completed result is kept
    // locally by the refresh job id so the worker can restore it when a
    // publisher source recheck yields the identical transcript, rather than
    // spending on duplicate generation.
    if (forcePublisherRefresh && completed(previous)) {
      initial.refreshBaseJobId = initial.jobId;
      this.store.set("intelligence-refresh", initial.jobId, previous);
    }
    const durableInitial = this.createJob(key, initial);
    if (this.queue) {
      const queued = {
        jobId: durableInitial.jobId,
        key,
        feedUrl,
        episodeId,
        allowAudio,
        // A completed cache entry can request a source recheck (for example,
        // after a parser safety upgrade). This must survive SQS dispatch; the
        // worker is the authority that fetches the transcript.
        forcePublisherRefresh,
        queuedAt: durableInitial.queuedAt,
      };
      // The SQLite outbox is persisted before attempting SQS. If AWS is
      // temporarily unavailable, the single consumer will reconcile it later.
      this.store.set("processing-outbox", durableInitial.jobId, queued);
      try {
        await this.queue.enqueue(queued);
        this.store.delete("processing-outbox", durableInitial.jobId);
      } catch (error) {
        console.error(JSON.stringify({
          event: "processing-queue-enqueue-deferred",
          jobId: durableInitial.jobId,
          code: error?.name || "QUEUE_UNAVAILABLE",
        }));
      }
      return publicIntelligence(durableInitial);
    }
    const task = this.run({
      key,
      feedUrl,
      episodeId,
      allowAudio,
      initial: durableInitial,
      previous,
      forcePublisherRefresh,
    }).finally(() => this.inflight.delete(key));
    this.inflight.set(key, task);
    return publicIntelligence(durableInitial);
  }
  cancelQueued(feedUrl, episodeId) {
    const key = episodeKey(feedUrl, episodeId);
    const current = this.store.get("intelligence", key);
    // A cancellation is intentionally limited to the durable waiting state.
    // Once a worker has started, a paid provider outcome may be uncertain and
    // must follow the existing bounded recovery path instead of being hidden.
    if (!current || current.state !== "QUEUED" || current.completedAt)
      throw Error("Only a queued processing job can be cancelled.");
    const cancelled = this.transition(key, current, {
      state: "CANCELLED",
      code: "CANCELLED_BY_ADMINISTRATOR",
      reason: "This queued processing request was cancelled by an administrator before a worker started.",
      retryable: false,
    });
    this.store.delete("processing-outbox", current.jobId);
    return publicIntelligence(cancelled);
  }
  async recoverQueued() {
    if (!this.queue) return;
    const now = Date.now();
    for (const [key, status] of this.store.all("intelligence")) {
      // Repair missing derived indexes/topics without buying analysis again.
      if(status.transcript && status.processingVersion===PROCESSING_VERSION) {
        const delivered = this.deliver(status, key);
        try { if (delivered.code !== 'EPISODE_IDENTITY_MISMATCH') await this.onTranscriptReady?.({feedUrl:delivered.feedUrl,episodeId:delivered.episodeId,intelligence:delivered}); }
        catch { console.error(JSON.stringify({event:"transcript-candidate-inspection-failed",code:"RECOVERY_INSPECTION_FAILED"})); }
      }
      const limits = status.platformProcessing ? { ...this.ledger.controls, ...this.testingMode?.limits(status.testingContext) } : status.testingContext && this.testingMode?.limits(status.testingContext);
      // One bounded software-repair replay of the pre-fix assembly failures.
      // Reuses paid checkpoints; never resets retry counts or unknown outcomes.
      const assemblyRecovery = status.platformProcessing && status.state === "FAILED" && status.code === "ANALYSIS_FAILED" &&
        status.processingStage === "TRANSCRIBING" && !status.transcript && status.transcriptionAssemblyVersion !== TRANSCRIPTION_ASSEMBLY_VERSION &&
        this.store.all("transcription-checkpoint").some(([id, chunk]) => id.startsWith(key + ":") && chunk.state === "READY");
      const safeRetry = recoverableTechnicalJob(status) && !this.inflight.has(key) &&
        now - Date.parse(status.completedAt || status.updatedAt || "") >= 60000 * 2 ** (status.recoveries || 0);
      if (!this.inflight.has(key) && limits?.dailyUsd && ((status.code === "BUDGET_LIMIT" && Date.parse(status.resumeAfter || "") <= now) || safeRetry || assemblyRecovery)) {
        this.ledger.refresh();
        const totals = this.ledger.totals();
        if (totals.day < limits.dailyUsd && totals.month < limits.monthlyUsd && totals.transcriptionSeconds < limits.dailyTranscriptionSeconds) {
          const resumed = this.transition(key, status, { state: "QUEUED", processingStage: "QUEUED", completedAt: null, code: null, reason: null, recoveries: (status.recoveries || 0) + (safeRetry ? 1 : 0),
            ...(assemblyRecovery ? { transcriptionAssemblyVersion: TRANSCRIPTION_ASSEMBLY_VERSION } : {}), deadlineAt: new Date(now + 2 * 3600000).toISOString() }, { force: true });
          this.store.set("processing-outbox", status.jobId, { key, ...resumed });
        } else this.store.set("intelligence", key, { ...status, resumeAfter: new Date(now + 3600000).toISOString() });
      }
      if (
        activeStates.has(status?.state) &&
        !completed(status) &&
        status.deadlineAt &&
        Date.parse(status.deadlineAt) <= now
      ) {
        const queued = status.state === "QUEUED";
        this.transition(key, status, {
          state: "FAILED",
          code: queued ? "QUEUE_TIMEOUT" : "PROCESSING_TIMEOUT",
          reason: queued
            ? "The processing worker did not start before its queue deadline. You can retry once."
            : "Preparation was interrupted. You can retry once.",
          retryable: status.attempts < 2,
        });
        this.store.delete("processing-outbox", status.jobId);
        console.error(JSON.stringify({
          event: "processing-queue-job-expired",
          jobId: status.jobId,
          code: queued ? "QUEUE_TIMEOUT" : "PROCESSING_TIMEOUT",
        }));
      }
    }
    for (const [, queued] of this.store.all("processing-outbox")) {
      const status = this.store.get("intelligence", queued.key);
      if (status?.jobId !== queued.jobId || status.state !== "QUEUED") {
        this.store.delete("processing-outbox", queued.jobId);
        continue;
      }
      try {
        await this.queue.enqueue(queued);
        this.store.delete("processing-outbox", queued.jobId);
      } catch {
        // The persisted record is intentionally retained for the next poll.
      }
    }
  }
  async executeQueued(queued, signal) {
    if (!queued?.jobId || !queued?.key || !queued?.feedUrl || !queued?.episodeId)
      throw Error("Invalid processing queue message.");
    if (this.inflight.has(queued.key)) {
      console.log(JSON.stringify({
        event: "processing-queue-job-deferred",
        jobId: queued.jobId,
        code: "INFLIGHT",
      }));
      return;
    }
    const initial = this.store.get("intelligence", queued.key);
    if (initial?.jobId !== queued.jobId || initial.state !== "QUEUED") {
      console.log(JSON.stringify({
        event: "processing-queue-job-ignored",
        jobId: queued.jobId,
        code: "STALE_OR_SUPERSEDED",
      }));
      return;
    }
    // Standard SQS ordering is not a priority guarantee. Choose only among
    // already-authorised persisted jobs; put the displaced receipt back into
    // the outbox before acknowledging it. Never interrupt active paid work.
    const rank = job => (job.priority || 0) + Math.min(100, Math.floor(Math.max(0,Date.now()-Date.parse(job.queuedAt || new Date().toISOString()))/300000)*5);
    const preferred = this.store.all("intelligence").filter(([, job]) => job.state === "QUEUED" && !job.completedAt && rank(job) > rank(initial)).sort((a, b) => rank(b[1])-rank(a[1]))[0];
    if (preferred) {
      this.store.set("processing-outbox", queued.jobId, queued);
      return this.executeQueued({ key: preferred[0], ...preferred[1] }, signal);
    }
    const previous = this.store.get("intelligence-refresh", queued.jobId) || null;
    console.log(JSON.stringify({
      event: "processing-queue-job-started",
      jobId: queued.jobId,
      forcePublisherRefresh: queued.forcePublisherRefresh === true,
      restoringCompletedCache: Boolean(previous),
    }));
    const task = this.run({
      key: queued.key,
      feedUrl: queued.feedUrl,
      episodeId: queued.episodeId,
      allowAudio: initial.allowAudio === true,
      signal,
      initial,
      previous,
      forcePublisherRefresh: queued.forcePublisherRefresh === true,
    }).finally(() => {
      if (completed(this.store.get("intelligence", queued.key)))
        this.store.delete("intelligence-refresh", queued.jobId);
      this.inflight.delete(queued.key);
    });
    this.inflight.set(queued.key, task);
    await task;
  }
  async run({
    key,
    feedUrl,
    episodeId,
    allowAudio,
    initial,
    previous,
    forcePublisherRefresh,
    signal,
  }) {
    let value = { ...initial };
    const ledger = initial.testingContext ? new BudgetLedger(this.ledger.baseControls, this.store, () => this.testingMode?.limits(initial.testingContext) || {}) : this.ledger;
    let expired = false;
    const controller = new AbortController();
    const recordWork = (work) => {
      const current = this.store.get("intelligence", key);
      if (!expired && current?.jobId === value.jobId && !current.completedAt) {
        value = { ...current, work: { ...current.work, ...work }, updatedAt: new Date().toISOString() };
        this.store.set("intelligence", key, value);
      }
    };
    const abort = () => controller.abort(signal.reason);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    const update = (patch) => {
      if (expired) return;
      if (value.episode && this.rights) {
        const decision = this.rights.evaluate({ feature: "intelligence-processing", feedUrl: value.episode.feedUrl, episodeId: value.episode.id });
        if (!decision.allowed) {
          const { transcript, episode, brief, chapters, provenance, ...redacted } = value;
          value = redacted;
          patch = {
            ...patch,
            state: "BLOCKED",
            code: "RIGHTS_RESTRICTED",
            reason: decision.reason,
            retryable: false,
          };
        }
      }
      if (
        ["DISCOVERING", "TRANSCRIBING", "UNDERSTANDING", "ORGANISING"].includes(
          patch.state,
        )
      )
        patch = {
          ...patch,
          phase: patch.state,
          state:
            patch.transcript || value.transcript
              ? "PARTIAL_READY"
              : "PROCESSING",
        };
      value = this.transition(key, value, patch);
      console.log(
        JSON.stringify({
          event: "intelligence",
          jobId: value.jobId,
          state: value.state,
          code: value.code || null,
        }),
      );
    };
    const timeout = setTimeout(() => {
      update({
        state: "FAILED",
        code: "TIMEOUT",
        reason:
          "Preparation was interrupted. Check back before retrying; any uncertain provider cost remains counted.",
        retryable: value.attempts < 2,
      });
      expired = true;
      controller.abort();
    }, initial.testingContext ? 2 * 3600000 : this.jobTimeoutMs);
    timeout.unref?.();
    try {
      update({ state: "DISCOVERING", processingStage: "CHECKING" });
      const episode = await this.resolveEpisode(feedUrl, episodeId),
        duration = durationMs(episode.duration),
        variant = hash(episode.audioUrl || "");
      const rights = this.rights?.resolve(feedUrl, episodeId);
      const policyDecision = this.rights?.evaluate({ feature: "intelligence-processing", feedUrl, episodeId });
      const rightsAllowed = () => {
        const current = this.rights?.evaluate({ feature: "intelligence-processing", feedUrl, episodeId });
        return !current || current.allowed;
      };
      if (!rightsAllowed())
        throw Error("Rights permission does not allow AI processing for this episode.");
      controller.signal.throwIfAborted();
      // The two-hour cap protects paid audio acquisition and transcription. It
      // is not a limit on an authorised cached or publisher-provided text
      // transcript: those paths do not download or transcribe the episode.
      let transcript = forcePublisherRefresh
        ? null
        : this.store.get("transcript", key + ":" + variant);
      let transcriptChecks = {
        cacheChecked: true,
        cacheHit: Boolean(transcript),
        publisherTranscriptChecked: false,
        publisherTranscriptReferenceCount: Array.isArray(episode.refs)
          ? episode.refs.length
          : 0,
        publisherTranscriptFound: false,
        audioTranscriptionRequired: false,
      };
      update({
        state: "DISCOVERING",
        processingStage: "CHECKING",
        episode: { ...episode, feedUrl, id: episodeId },
        transcriptChecks,
      });
      if (!transcript) {
        transcriptChecks = {
          ...transcriptChecks,
          publisherTranscriptChecked: true,
        };
        update({
          state: "DISCOVERING",
          processingStage: "ACQUIRING_TRANSCRIPT",
          transcriptChecks,
        });
        if (rights && !this.rights.evaluate({ feature: "transcript-acquisition", feedUrl, episodeId }).allowed)
          throw Error("Rights permission does not allow transcript acquisition for this episode.");
        for (const ref of episode.refs || []) {
          controller.signal.throwIfAborted();
          try {
            const candidate = await this.fetchTranscript(ref, {
              durationMs: duration,
            });
            if (
              candidate.quality.readiness !== "UNUSABLE" &&
              candidate.segments.reduce((n, s) => n + s.text.length, 0) >= 100
            ) {
              transcript = candidate;
              break;
            }
          } catch {
            /* Try the next publisher reference before considering audio. */
          }
        }
        transcriptChecks = {
          ...transcriptChecks,
          publisherTranscriptFound: Boolean(transcript),
        };
      }
      if (!transcript) transcript = this.store.get("audio-transcript", variant);
      controller.signal.throwIfAborted();
      if (!transcript) {
        transcriptChecks = {
          ...transcriptChecks,
          audioTranscriptionRequired: true,
        };
        if (!this.audioEnabled || !allowAudio) {
          update({
            state: "BLOCKED",
            attempts: Math.max(0, value.attempts - 1),
            code: this.audioEnabled
              ? "AUDIO_CONSENT_REQUIRED"
              : "AUDIO_DISABLED",
            availabilityCode: "TRANSCRIPT_UNAVAILABLE",
            reason: this.audioEnabled
              ? "We couldn't find a usable transcript for this episode. Audio transcription needs explicit approval."
              : "We couldn't find a usable transcript for this episode.",
            requiresAudioConsent: this.audioEnabled,
            transcriptChecks,
            retryable: false,
          });
          return;
        }
        if (rights && !this.rights.evaluate({ feature: "audio-transcription", feedUrl, episodeId }).allowed) {
          update({
            state: "BLOCKED",
            attempts: Math.max(0, value.attempts - 1),
            code: "AUDIO_TRANSCRIPTION_NOT_AUTHORISED",
            reason: "Audio transcription isn't authorised for this episode.",
            transcriptChecks,
            retryable: false,
          });
          return;
        }
        if (!duration) {
          update({
            state: "BLOCKED",
            attempts: Math.max(0, value.attempts - 1),
            code: "DURATION_UNKNOWN",
            reason:
              "The publisher has not supplied a duration. This episode cannot be analysed safely yet.",
            transcriptChecks,
            retryable: false,
          });
          return;
        }
        if (duration > ledger.controls.maxEpisodeSeconds * 1000) {
          update({
            state: "BLOCKED",
            attempts: Math.max(0, value.attempts - 1),
            code: "DURATION_LIMIT",
            reason: "This episode exceeds the current audio transcription limit.",
            transcriptChecks,
            retryable: false,
          });
          return;
        }
        // Check budget before downloading; actual measured duration is reserved before provider calls.
        ledger.refresh();
        const totals = ledger.totals();
        if (
          totals.day + (duration / 1000) * 0.0001 >
            ledger.controls.dailyUsd ||
          totals.month + (duration / 1000) * 0.0001 >
            ledger.controls.monthlyUsd ||
          totals.transcriptionSeconds + duration / 1000 >
            ledger.controls.dailyTranscriptionSeconds
        )
          throw Error("The intelligence budget has been reached.");
        // Downloading/chunking may take time but is not yet a provider
        // transcription. Keep the listener state in acquisition until the
        // provider call actually begins.
        update({ state: "DISCOVERING", processingStage: "PREPARING_AUDIO", transcriptChecks });
        let audioTask = this.audioInflight.get(variant);
        if (!audioTask) {
          audioTask = (async () => {
            const audio = await this.audioFactory(
              episode.audioUrl,
              ledger.controls.maxEpisodeSeconds,
            );
            try {
              controller.signal.throwIfAborted();
              update({ state: "TRANSCRIBING", processingStage: "TRANSCRIBING" });
              const acquired = await transcribeOnDemand({
                episodeId,
                audioUrl: episode.audioUrl,
                durationMs: audio.durationMs,
                chunkFactory: audio.chunkFactory,
                client: this.client || createOpenAIClient(),
                ledger,
                requestId: value.jobId + ":audio",
                authorised: true,
                signal: controller.signal,
                checkpointStore: this.store,
                canPersist: rightsAllowed,
                checkpointPrefix: audio.contentHash ? `${key}:${audio.contentHash}` : null,
                beforePaid: () => {
                  if (!rightsAllowed() || (this.rights && !this.rights.evaluate({ feature: "audio-transcription", feedUrl, episodeId }).allowed)) throw Error("Rights permission no longer allows audio transcription.");
                  if (initial.testingContext && !initial.platformProcessing && !this.testingMode?.limits(initial.testingContext).dailyUsd) throw Object.assign(Error("Testing authorisation expired or was suspended."), { code: "TESTING_EXPIRED" });
                },
                onProgress: recordWork,
              });
              if (!rightsAllowed()) throw Error("Rights permission no longer allows audio transcript retention.");
              acquired.audioContentHash = audio.contentHash || null;
              this.store.set("audio-transcript", variant, acquired);
              // Reuse the already-downloaded source while it is still on disk.
              // This callback cannot grant rights or initiate another model call.
              update({ transcript: { ...acquired, audioVariant: variant }, episode: { ...episode, feedUrl, id: episodeId } });
              try { await this.onTranscriptReady?.({ feedUrl, episodeId, intelligence: value, preparedAudio: audio }); }
              catch (error) { console.error(JSON.stringify({ event: "audio-candidate-inspection-failed", code: error?.code || "INSPECTION_FAILED" })); }
              return acquired;
            } finally {
              await audio.cleanup();
            }
          })().finally(() => this.audioInflight.delete(variant));
          this.audioInflight.set(variant, audioTask);
        } else update({ state: "TRANSCRIBING", processingStage: "TRANSCRIBING" });
        transcript = await audioTask;
      }
      controller.signal.throwIfAborted();
      // The delivered audio can include dynamically inserted material absent
      // from RSS duration. Reuse the adapter's measured, validated transcript,
      // including older cached entries that predate explicit duration metadata.
      if (transcript.sourceType === "on_demand_audio") {
        const measured = this.store.get("audio-transcript", variant);
        if (measured?.transcriptVersion === transcript.transcriptVersion)
          transcript = measured;
      }
      transcript = {
        ...transcript,
        episodeId,
        audioVariant: variant,
        ...(episode.ownedFixtureAudioHash ? { audioContentHash: episode.ownedFixtureAudioHash } : {}),
        quality:
          transcript.sourceType === "on_demand_audio"
            ? transcript.quality
            : assessTranscript({
                segments: transcript.segments,
                durationMs: duration,
                language: transcript.language,
              }),
      };
      if (!rightsAllowed())
        throw Error("Rights permission no longer allows AI processing for this episode.");
      this.store.set("transcript", key + ":" + variant, transcript);
      if (
        completed(previous) &&
        previous.transcript?.transcriptVersion ===
          transcript.transcriptVersion &&
        previous.transcript?.audioVariant === variant
      ) {
        update({
          ...previous,
          cacheHit: true,
          sourceCheckedAt: new Date().toISOString(),
        });
        return;
      }
      update({
        state: "UNDERSTANDING",
        processingStage: "TRANSCRIPT_READY",
        transcript,
        transcriptChecks,
        episode: { ...episode, feedUrl, id: episodeId },
        readiness: transcript.quality.readiness,
        quality: transcript.quality,
        provenance: {
          sourceType: transcript.sourceType,
          sourceUri: transcript.sourceUri,
          originalFormat: transcript.originalFormat,
          language: transcript.language,
          acquiredAt: transcript.acquiredAt,
          transcriptVersion: transcript.transcriptVersion,
          audioVariant: variant,
          parserVersion: transcript.parserVersion || null,
        },
        sourceSignature: hash(JSON.stringify([episode.audioUrl, episode.refs, PUBLISHER_TRANSCRIPT_PARSER_VERSION])),
      });
      // Ad detection needs the canonical transcript, not successful summary
      // generation. Keep its failure independent from the intelligence job.
      try { await this.onTranscriptReady?.({ feedUrl, episodeId, intelligence: value }); }
      catch (error) { console.error(JSON.stringify({ event: "transcript-candidate-inspection-failed", code: error?.code || "INSPECTION_FAILED" })); }
      value=this.deliver(value);
      update({processingStage:"ANALYSING"});
      const generated = await generateLongFormIntelligence({
        transcript,
        ledger,
        requestId: value.jobId + ":text",
        client: this.client,
        signal: controller.signal,
        outputProfile: policyDecision?.outputProfile || "standard",
        checkpointStore: this.store,
        canPersist: rightsAllowed,
        checkpointPrefix: key,
        beforePaid: () => {
          if (!rightsAllowed()) throw Error("Rights permission no longer allows AI analysis.");
          if (initial.testingContext && !initial.platformProcessing && !this.testingMode?.limits(initial.testingContext).dailyUsd) throw Object.assign(Error("Testing authorisation expired or was suspended."), { code: "TESTING_EXPIRED" });
        },
        onProgress: recordWork,
        onPartial: (partial) => { update(partial); value=this.deliver(value); },
        onProviderResponse: (response) => {
          if (rightsAllowed()) this.store.set("provider-result", value.jobId, response);
        },
      });
      controller.signal.throwIfAborted();
      if (!rightsAllowed())
        throw Error("Rights permission no longer allows AI processing for this episode.");
      // Keep canonical internal analysis for reuse; listener responses enforce
      // each output permission independently, including after a rights change.
      update({ state: "ORGANISING", processingStage: "INDEXING", ...generated });
      value=this.deliver(value);
      update({
        state: generated.partialResult || !value.deliveryValidation?.complete ? "PARTIAL_READY" : "READY",
        sourceCheckedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        processingMs: Date.now() - Date.parse(value.startedAt),
      });
      value=this.deliver(value);
      // Candidate creation is conservative and persisted separately. It never
      // enables automatic skipping; the callback may only inspect grounded,
      // completed transcript material.
      try {
        await this.onCompleted?.({ feedUrl, episodeId, intelligence: value });
      } catch (error) {
        console.error(JSON.stringify({ event: "post-processing-candidate-inspection-failed", code: error?.name || "INSPECTION_FAILED" }));
      }
    } catch (error) {
      const detail = failure(error);
      const blocked = [
        "DURATION_LIMIT",
        "BUDGET_LIMIT",
        "PROVIDER_UNAVAILABLE",
        "RIGHTS_RESTRICTED",
        "TESTING_EXPIRED",
      ].includes(detail.code);
      update({
        state: blocked ? "BLOCKED" : "FAILED",
        ...detail,
        ...(detail.code === "BUDGET_LIMIT" ? { resumeAfter: new Date(Date.now() + 3600000).toISOString() } : {}),
        ...(["DURATION_LIMIT", "BUDGET_LIMIT", "TESTING_EXPIRED"].includes(detail.code)
          ? { attempts: Math.max(0, value.attempts - 1) }
          : {}),
        retryable: detail.retryable && value.attempts < 2,
        ...(detail.retryable && value.attempts >= 2
          ? {
              reason:
                "Analysis could not be completed reliably. The retry limit for this episode has been reached.",
            }
          : {}),
      });
      console.error(
        JSON.stringify({
          event: "intelligence-failure",
          jobId: value.jobId,
          code: detail.code,
          providerStatus:
            typeof error.status === "number" ? error.status : null,
        }),
      );
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }
  internalTranscriptPage(feed, id, offset = 0, query = "") {
    const value = this.status(feed, id);
    const term =
      typeof query === "string"
        ? query.trim().slice(0, 300).toLocaleLowerCase()
        : "";
    const all = value?.transcript?.segments || [];
    const segments = term
      ? all.filter((s) => s.text.toLocaleLowerCase().includes(term))
      : all;
    const start = Math.max(0, Math.floor(Number(offset) || 0));
    return {
      segments: segments
        .slice(start, start + 60)
        .map(({ id, text, speaker, startMs, endMs }) => ({
          id,
          text,
          speaker,
          startMs,
          endMs,
        })),
      nextOffset: start + 60 < segments.length ? start + 60 : null,
      total: segments.length,
      totalSegments: all.length,
      provenance: value?.provenance || null,
    };
  }
  captions(feed, id, positionMs) {
    return captionWindow(this.status(feed, id)?.transcript, positionMs);
  }
  purgeEpisode(feed, id) {
    const key = episodeKey(feed, id);
    const intelligence = this.store.get("intelligence", key);
    const removed = { intelligence: 0, transcripts: 0, providerResults: 0, skipIntervals: 0, skipVerification: 0, skipFeedback: 0, skipExecutions: 0 };
    for (const bucket of ["transcription-checkpoint", "analysis-checkpoint"])
      for (const [checkpoint] of this.store.all(bucket)) if (checkpoint.startsWith(key + ":")) { this.store.delete(bucket, checkpoint); removed.providerResults++; }
    const jobs = new Set([intelligence?.jobId, ...this.store.all("intelligence-history").filter(([, job]) => job.feedUrl === feed && job.episodeId === id).map(([, job]) => job.jobId)]);
    for (const jobId of jobs) if (jobId) {
      if (this.store.get("provider-result", jobId)) removed.providerResults++;
      this.store.delete("provider-result", jobId);
      this.store.delete("intelligence-refresh", jobId);
    }
    if (intelligence?.episode?.audioUrl) {
      const audioKey = hash(intelligence.episode.audioUrl);
      if (this.store.get("audio-transcript", audioKey)) removed.transcripts++;
      this.store.delete("audio-transcript", audioKey);
    }
    if (intelligence) {
      this.store.delete("intelligence", key);
      removed.intelligence++;
      if (intelligence.jobId && this.store.get("provider-result", intelligence.jobId)) {
        this.store.delete("provider-result", intelligence.jobId);
        removed.providerResults++;
      }
    }
    for (const [recordKey] of this.store.all("transcript"))
      if (recordKey.startsWith(key + ":")) {
        this.store.delete("transcript", recordKey);
        removed.transcripts++;
      }
    for (const [recordKey, value] of this.store.all("skip-interval"))
      if (value.episodeKey === key) {
        this.store.delete("skip-interval", recordKey);
        removed.skipIntervals++;
      }
    if (this.store.get("skip-audio-verification", key)) {
      this.store.delete("skip-audio-verification", key);
      removed.skipVerification++;
    }
    this.store.delete("skip-analysis", key);
    this.store.delete("search-index", key);
    for (const [recordKey, value] of this.store.all("skip-feedback"))
      if (value.episodeKey === key) {
        this.store.delete("skip-feedback", recordKey);
        removed.skipFeedback++;
      }
    for (const [recordKey, value] of this.store.all("skip-execution"))
      if (value.episodeKey === key) {
        this.store.delete("skip-execution", recordKey);
        removed.skipExecutions++;
      }
    for (const [recordKey, value] of this.store.all("skip-authorisation"))
      if (value.episodeKey === key) this.store.delete("skip-authorisation", recordKey);
    return removed;
  }
  purgeFeed(feed) {
    const totals = { intelligence: 0, transcripts: 0, providerResults: 0, skipIntervals: 0, skipVerification: 0, skipFeedback: 0, skipExecutions: 0 };
    for (const [, value] of this.store.all("intelligence")) {
      if (value?.episode?.feedUrl !== feed) continue;
      const removed = this.purgeEpisode(feed, value.episode.id);
      for (const [name, count] of Object.entries(removed)) totals[name] += count;
    }
    return totals;
  }
  moments(feed, id, query) {
    const value = this.status(feed, id);
    const decision = this.rights?.evaluate({ feature: "intelligence-display", feedUrl: feed, episodeId: id });
    if (decision && !decision.allowed)
      return [];
    if (this.rights && !this.rights.evaluate({ feature: "find-moment", feedUrl: feed, episodeId: id }).allowed) return [];
    const index=value?.featureStatus?.search?.state==="READY" && this.store.get("search-index",episodeKey(feed,id));
    return index
      ? hybridRetrieve(index, query, 5)
          .filter((m) => Number.isFinite(m.startMs) && Number.isFinite(m.endMs))
          .map((moment) => ({
            ...moment,
            context:String(moment.context || "").slice(0,360),
            episode:{id,feedUrl:feed,title:value.episode?.title,showName:value.episode?.showName},
            relatedChapters: (value.chapters || [])
              .filter((chapter) =>
                chapter.sourceSegmentIds?.includes(moment.segmentId),
              )
              .map(({ title, startMs, endMs }) => ({ title, startMs, endMs })),
          }))
      : [];
  }
  search(query, { feedUrls = null, momentsOnly = false } = {}) {
    const corpus = this.store
      .all("intelligence")
      .map(([, v]) =>
        v.episode ? this.status(v.episode.feedUrl, v.episode.id) : v,
      )
      .filter(
        (v) =>
          v?.featureStatus?.search?.state === "READY" &&
          v.processingVersion === PROCESSING_VERSION &&
          (!this.rights || ["intelligence-processing","intelligence-display"].every(feature=>this.rights.evaluate({feature,feedUrl:v.episode.feedUrl,episodeId:v.episode.id}).allowed)) &&
          (!this.rights || this.rights.evaluate({ feature: "conversation-search", feedUrl: v.episode.feedUrl, episodeId: v.episode.id }).allowed) &&
          (!momentsOnly || !this.rights || this.rights.evaluate({ feature: "find-moment", feedUrl: v.episode.feedUrl, episodeId: v.episode.id }).allowed) &&
          (!feedUrls || feedUrls.includes(v.episode.feedUrl)),
      );
    const matches = corpus
      .flatMap((v) =>
        hybridRetrieve(this.store.get("search-index",episodeKey(v.episode.feedUrl,v.episode.id)), query, 3)
          .filter((m) => !momentsOnly || Number.isFinite(m.startMs))
          .map((m) => ({
            ...m,
            context: String(m.context || "").slice(0, 360),
            episode: { ...v.episode, refs: undefined },
            speaker: v.transcript.segments.find((s) => s.id === m.segmentId)
              ?.speaker,
            provenance: v.provenance,
          })),
      )
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 8);
    const synthesis = matches.length
      ? matches
          .slice(0, 3)
          .map((m, i) => `[${i + 1}] ${m.episode.showName}: “${m.context}”`)
          .join("\n\n")
      : "No processed transcript passages matched this question. Eligible followed episodes are prepared automatically.";
    const followUps = [
      ...new Set(
        corpus
          .filter((v) => matches.some((m) => m.episode.id === v.episode.id))
          .flatMap((v) => (v.topics || []).map(t=>t.label)),
      ),
    ]
      .slice(0, 3)
      .map((theme) => `What was said about ${theme}?`);
    return {
      query,
      coverage: {
        processedEpisodes: corpus.length,
        matchedEpisodes: new Set(matches.map((m) => m.episode.id)).size,
        scope: feedUrls ? "My Podcasts" : "All Processed Podcasts",
      },
      synthesis,
      synthesisType: "extractive",
      matches,
      followUps,
    };
  }
}
