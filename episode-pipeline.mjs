import { createHash, randomUUID } from "node:crypto";
import { fetchPublisherTranscript, assessTranscript, PUBLISHER_TRANSCRIPT_PARSER_VERSION } from "./transcripts.mjs";
import {
  generateEpisodeIntelligence,
  createOpenAIClient,
  PROCESSING_VERSION,
} from "./openai-intelligence.mjs";
import { prepareAudio, transcribeOnDemand } from "./transcription.mjs";
import { hybridRetrieve } from "./intelligence.mjs";
import { groundResult } from "./grounded-result.mjs";
import { captionWindow } from "./captions.mjs";

export const activeStates = new Set([
  "QUEUED",
  "DISCOVERING",
  "TRANSCRIBING",
  "UNDERSTANDING",
  "ORGANISING",
  "PROCESSING",
  "PARTIAL_READY",
]);
const completed = (value) =>
  value?.state === "READY" ||
  (value?.state === "PARTIAL_READY" && !!value.completedAt);
const hash = (value) => createHash("sha256").update(value).digest("hex");
export const episodeKey = (feedUrl, episodeId) =>
  hash(JSON.stringify([feedUrl, episodeId]));
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
  const { transcript, episode, refs, ...safe } = value;
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
  };
}
function failure(error) {
  const message = String(error?.message || "");
  if (/incomplete|JSON|source validation/.test(message))
    return {
      code: "SOURCE_VALIDATION_FAILED",
      reason: "Analysis could not be completed reliably. Please retry once.",
      retryable: true,
    };
  if (/two-hour|duration limit|processing limit/.test(message))
    return {
      code: "DURATION_LIMIT",
      reason:
        "This episode exceeds the current processing limit. Try a shorter episode.",
      retryable: false,
    };
  if (/budget/.test(message))
    return {
      code: "BUDGET_LIMIT",
      reason:
        "The analysis allowance has been reached. Please try another day.",
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
      reason:
        "Analysis is temporarily unavailable. Your listening can continue.",
      retryable: true,
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
    jobTimeoutMs = 15 * 60 * 1000,
  }) {
    Object.assign(this, {
      store,
      ledger,
      resolveEpisode,
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
      jobTimeoutMs,
    });
    this.inflight = new Map();
    this.audioInflight = new Map();
    for (const [key, value] of store.all("intelligence"))
      if (activeStates.has(value.state) && !value.completedAt)
        // A durable queued job has not started and can be recovered by the
        // single consumer. In-progress work remains failed on restart because
        // its provider outcome may be unknown and must not be retried blindly.
        if (!(this.queue && value.state === "QUEUED"))
        store.set("intelligence", key, {
          ...value,
          state: "FAILED",
          code: "INTERRUPTED",
          reason:
            "Analysis was interrupted when the server restarted. Please retry.",
          retryable: value.attempts < 2,
        });
    // Unknown provider outcomes are never refunded or retried automatically.
    for (const [id, row] of ledger.reservations)
      ledger.reconcile(id, { usd: row.usd, failed: true, uncertain: true });
  }
  status(feed, id) {
    const key = episodeKey(feed, id);
    let value = this.store.get("intelligence", key);
    if (completed(value) && value.transcript && !value.groundingVersion) {
      value = groundResult(value, value.transcript);
      if (value.partialResult) value.state = "PARTIAL_READY";
      this.store.set("intelligence", key, value);
    }
    return value?.processingVersion === PROCESSING_VERSION ? value : null;
  }
  async preflight(feed, id) {
    const episode = await this.resolveEpisode(feed, id),
      duration = durationMs(episode.duration),
      rights = this.rights?.resolve(feed, id);
    return {
      hasPublisherTranscript: episode.refs.length > 0,
      durationMs: duration,
      withinLimit:
        duration === null ||
        duration <= this.ledger.controls.maxEpisodeSeconds * 1000,
      audioEnabled: this.audioEnabled,
      analysisEnabled: this.enabled && this.configured,
      requiresAudioConsent: !episode.refs.length,
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
  async request({
    feedUrl,
    episodeId,
    allowAudio = false,
    retry = false,
    trigger = "manual",
  }) {
    const key = episodeKey(feedUrl, episodeId);
    // Global activation is never consent to pay for audio or retry failed work.
    if (trigger === "automatic") {
      allowAudio = false;
      retry = false;
    }
    let previous = this.status(feedUrl, episodeId),
      forcePublisherRefresh = false;
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
      ["FAILED", "BLOCKED", "UNAVAILABLE"].includes(previous.state)
    )
      return publicIntelligence(previous);
    if (!completed(previous) && previous?.attempts >= 2)
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
      (!retry || previous.attempts >= 2 || !previous.retryable)
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
    const processingDecision = this.rights?.evaluate({ feature: "intelligence-processing", feedUrl, episodeId, audit: true });
    const displayDecision = this.rights?.evaluate({ feature: "intelligence-display", feedUrl, episodeId, audit: true });
    if ((processingDecision && !processingDecision.allowed) || (displayDecision && !displayDecision.allowed))
      return {
        state: "BLOCKED",
        code: "RIGHTS_RESTRICTED",
        reason: processingDecision?.allowed === false ? processingDecision.reason : displayDecision.reason,
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
      feedUrl,
      episodeId,
      deadlineAt: new Date(Date.now() + this.jobTimeoutMs).toISOString(),
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
    this.store.set("intelligence", key, initial);
    if (this.queue) {
      const queued = {
        jobId: initial.jobId,
        key,
        feedUrl,
        episodeId,
        allowAudio,
        // A completed cache entry can request a source recheck (for example,
        // after a parser safety upgrade). This must survive SQS dispatch; the
        // worker is the authority that fetches the transcript.
        forcePublisherRefresh,
        queuedAt: initial.startedAt,
      };
      // The SQLite outbox is persisted before attempting SQS. If AWS is
      // temporarily unavailable, the single consumer will reconcile it later.
      this.store.set("processing-outbox", initial.jobId, queued);
      try {
        await this.queue.enqueue(queued);
        this.store.delete("processing-outbox", initial.jobId);
      } catch (error) {
        console.error(JSON.stringify({
          event: "processing-queue-enqueue-deferred",
          jobId: initial.jobId,
          code: error?.name || "QUEUE_UNAVAILABLE",
        }));
      }
      return publicIntelligence(initial);
    }
    const task = this.run({
      key,
      feedUrl,
      episodeId,
      allowAudio,
      initial,
      previous,
      forcePublisherRefresh,
    }).finally(() => this.inflight.delete(key));
    this.inflight.set(key, task);
    return publicIntelligence(initial);
  }
  async recoverQueued() {
    if (!this.queue) return;
    const now = Date.now();
    for (const [key, status] of this.store.all("intelligence")) {
      if (
        activeStates.has(status?.state) &&
        !completed(status) &&
        status.deadlineAt &&
        Date.parse(status.deadlineAt) <= now
      ) {
        const queued = status.state === "QUEUED";
        this.store.set("intelligence", key, {
          ...status,
          state: "FAILED",
          code: queued ? "QUEUE_TIMEOUT" : "PROCESSING_TIMEOUT",
          reason: queued
            ? "The processing worker did not start before its queue deadline. You can retry once."
            : "Processing did not finish before its deadline. You can retry once.",
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
  async executeQueued(queued) {
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
      allowAudio: queued.allowAudio === true,
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
  }) {
    let value = { ...initial };
    let expired = false;
    const controller = new AbortController();
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
      value = { ...value, ...patch };
      this.store.set("intelligence", key, value);
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
          "This analysis took too long. Check back before retrying; any uncertain provider cost remains counted.",
        retryable: value.attempts < 2,
      });
      expired = true;
      controller.abort();
    }, this.jobTimeoutMs);
    timeout.unref?.();
    try {
      update({ state: "DISCOVERING" });
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
      if (duration && duration > this.ledger.controls.maxEpisodeSeconds * 1000)
        throw Error(
          "This episode is longer than the current two-hour processing limit.",
        );
      let transcript = forcePublisherRefresh
        ? null
        : this.store.get("transcript", key + ":" + variant);
      if (!transcript) {
        if (rights && !rights.canAcquireTranscript)
          throw Error("Rights permission does not allow transcript acquisition for this episode.");
        for (const ref of episode.refs) {
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
      }
      if (!transcript) transcript = this.store.get("audio-transcript", variant);
      controller.signal.throwIfAborted();
      if (!transcript) {
        if (!this.audioEnabled || !allowAudio) {
          update({
            state: "BLOCKED",
            attempts: Math.max(0, value.attempts - 1),
            code: this.audioEnabled
              ? "AUDIO_CONSENT_REQUIRED"
              : "AUDIO_DISABLED",
            reason: this.audioEnabled
              ? "No usable publisher transcript was found. Analyse the audio to continue."
              : "No usable publisher transcript was found. Audio analysis is unavailable.",
            requiresAudioConsent: this.audioEnabled,
            retryable: false,
          });
          return;
        }
        if (rights && !rights.canTranscribeAudio)
          throw Error("Rights permission does not allow audio transcription for this episode.");
        if (!duration) {
          update({
            state: "BLOCKED",
            attempts: Math.max(0, value.attempts - 1),
            code: "DURATION_UNKNOWN",
            reason:
              "The publisher has not supplied a duration. This episode cannot be analysed safely yet.",
            retryable: false,
          });
          return;
        }
        // Check budget before downloading; actual measured duration is reserved before provider calls.
        this.ledger.refresh();
        const totals = this.ledger.totals();
        if (
          totals.day + (duration / 1000) * 0.0001 >
            this.ledger.controls.dailyUsd ||
          totals.month + (duration / 1000) * 0.0001 >
            this.ledger.controls.monthlyUsd ||
          totals.transcriptionSeconds + duration / 1000 >
            this.ledger.controls.dailyTranscriptionSeconds
        )
          throw Error("The intelligence budget has been reached.");
        let audioTask = this.audioInflight.get(variant);
        if (!audioTask) {
          audioTask = (async () => {
            const audio = await this.audioFactory(
              episode.audioUrl,
              this.ledger.controls.maxEpisodeSeconds,
            );
            try {
              controller.signal.throwIfAborted();
              update({ state: "TRANSCRIBING" });
              const acquired = await transcribeOnDemand({
                episodeId,
                audioUrl: episode.audioUrl,
                durationMs: audio.durationMs,
                chunkFactory: audio.chunkFactory,
                client: this.client || createOpenAIClient(),
                ledger: this.ledger,
                requestId: value.jobId + ":audio",
                authorised: true,
                signal: controller.signal,
              });
              this.store.set("audio-transcript", variant, acquired);
              return acquired;
            } finally {
              await audio.cleanup();
            }
          })().finally(() => this.audioInflight.delete(variant));
          this.audioInflight.set(variant, audioTask);
        } else update({ state: "TRANSCRIBING" });
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
        transcript,
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
      const generated = await generateEpisodeIntelligence({
        transcript,
        ledger: this.ledger,
        requestId: value.jobId + ":text",
        client: this.client,
        signal: controller.signal,
        outputProfile: policyDecision?.outputProfile || "standard",
        onProviderResponse: (response) => {
          if (rightsAllowed()) this.store.set("provider-result", value.jobId, response);
        },
      });
      if (!rightsAllowed())
        throw Error("Rights permission no longer allows AI processing for this episode.");
      update({ state: "ORGANISING", ...generated });
      update({
        state: generated.partialResult ? "PARTIAL_READY" : "READY",
        sourceCheckedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        processingMs: Date.now() - Date.parse(value.startedAt),
      });
      // Candidate creation is conservative and persisted separately. It never
      // enables automatic skipping; the callback may only inspect grounded,
      // completed transcript material.
      try {
        this.onCompleted?.({ feedUrl, episodeId, intelligence: value });
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
      ].includes(detail.code);
      update({
        state: blocked ? "BLOCKED" : "FAILED",
        ...detail,
        ...(["DURATION_LIMIT", "BUDGET_LIMIT"].includes(detail.code)
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
    const removed = { intelligence: 0, transcripts: 0, providerResults: 0, skipIntervals: 0 };
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
    return removed;
  }
  purgeFeed(feed) {
    const totals = { intelligence: 0, transcripts: 0, providerResults: 0, skipIntervals: 0 };
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
    return value?.transcript
      ? hybridRetrieve(value.transcript, query, 5)
          .filter((m) => Number.isFinite(m.startMs) && Number.isFinite(m.endMs))
          .map((moment) => ({
            ...moment,
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
          completed(v) &&
          v.processingVersion === PROCESSING_VERSION &&
          (!this.rights || this.rights.evaluate({ feature: "conversation-search", feedUrl: v.episode.feedUrl, episodeId: v.episode.id }).allowed) &&
          (!feedUrls || feedUrls.includes(v.episode.feedUrl)),
      );
    const matches = corpus
      .flatMap((v) =>
        hybridRetrieve(v.transcript, query, 3)
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
      : "No processed transcript passages matched this question. Analyse an episode to expand your searchable library.";
    const followUps = [
      ...new Set(
        corpus
          .filter((v) => matches.some((m) => m.episode.id === v.episode.id))
          .flatMap((v) => v.brief.themes),
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
