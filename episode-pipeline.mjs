import { createHash, randomUUID } from "node:crypto";
import { fetchPublisherTranscript, assessTranscript } from "./transcripts.mjs";
import {
  generateEpisodeIntelligence,
  createOpenAIClient,
  PROCESSING_VERSION,
} from "./openai-intelligence.mjs";
import { prepareAudio, transcribeOnDemand } from "./transcription.mjs";
import { hybridRetrieve } from "./intelligence.mjs";

export const activeStates = new Set([
  "QUEUED",
  "DISCOVERING",
  "TRANSCRIBING",
  "UNDERSTANDING",
  "ORGANISING",
]);
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
  return safe;
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
  if (/401|403|key|quota|billing/.test(message))
    return {
      code: "PROVIDER_UNAVAILABLE",
      reason:
        "Analysis is temporarily unavailable. Your listening can continue.",
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
    enabled = false,
    audioEnabled = false,
    configured = false,
    client,
    fetchTranscript = fetchPublisherTranscript,
    audioFactory = prepareAudio,
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
    });
    this.inflight = new Map();
    this.audioInflight = new Map();
    for (const [key, value] of store.all("intelligence"))
      if (activeStates.has(value.state))
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
    const value = this.store.get("intelligence", episodeKey(feed, id));
    return value?.processingVersion === PROCESSING_VERSION ? value : null;
  }
  async preflight(feed, id) {
    const episode = await this.resolveEpisode(feed, id),
      duration = durationMs(episode.duration);
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
    };
  }
  async request({ feedUrl, episodeId, allowAudio = false, retry = false }) {
    const key = episodeKey(feedUrl, episodeId);
    let previous = this.status(feedUrl, episodeId),
      forcePublisherRefresh = false;
    if (previous?.state === "READY") {
      const episode = await this.resolveEpisode(feedUrl, episodeId);
      const signature = hash(JSON.stringify([episode.audioUrl, episode.refs]));
      const priorSignature = hash(
        JSON.stringify([previous.episode.audioUrl, previous.episode.refs]),
      );
      if (
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
    if (this.inflight.size >= 2)
      return {
        state: "UNAVAILABLE",
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
        state: "UNAVAILABLE",
        code: "SERVER_UNAVAILABLE",
        reason: "Episode analysis is temporarily unavailable.",
        retryable: false,
      };
    const attempts =
      (previous?.state === "READY" ? 0 : previous?.attempts || 0) + 1;
    const initial = {
      state: "QUEUED",
      jobId: randomUUID(),
      attempts,
      processingVersion: PROCESSING_VERSION,
      startedAt: new Date().toISOString(),
      cacheHit: false,
    };
    this.store.set("intelligence", key, initial);
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
    const update = (patch) => {
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
    try {
      update({ state: "DISCOVERING" });
      const episode = await this.resolveEpisode(feedUrl, episodeId),
        duration = durationMs(episode.duration),
        variant = hash(episode.audioUrl || "");
      if (duration && duration > this.ledger.controls.maxEpisodeSeconds * 1000)
        throw Error(
          "This episode is longer than the current two-hour processing limit.",
        );
      let transcript = forcePublisherRefresh
        ? null
        : this.store.get("transcript", key + ":" + variant);
      if (!transcript) {
        for (const ref of episode.refs) {
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
      if (!transcript) {
        if (!this.audioEnabled || !allowAudio) {
          update({
            state: "UNAVAILABLE",
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
        if (!duration) {
          update({
            state: "UNAVAILABLE",
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
      transcript = {
        ...transcript,
        episodeId,
        audioVariant: variant,
        quality: assessTranscript({
          segments: transcript.segments,
          durationMs: duration,
          language: transcript.language,
        }),
      };
      this.store.set("transcript", key + ":" + variant, transcript);
      if (
        previous?.state === "READY" &&
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
        },
      });
      const generated = await generateEpisodeIntelligence({
        transcript,
        ledger: this.ledger,
        requestId: value.jobId + ":text",
        client: this.client,
        onProviderResponse: (response) =>
          this.store.set("provider-result", value.jobId, response),
      });
      update({ state: "ORGANISING", ...generated });
      update({
        state: "READY",
        sourceCheckedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        processingMs: Date.now() - Date.parse(value.startedAt),
      });
    } catch (error) {
      const detail = failure(error);
      update({
        state: "FAILED",
        ...detail,
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
    }
  }
  moments(feed, id, query) {
    const value = this.status(feed, id);
    return value?.state === "READY"
      ? hybridRetrieve(value.transcript, query, 5).filter(
          (m) => Number.isFinite(m.startMs) && Number.isFinite(m.endMs),
        )
      : [];
  }
  search(query, { feedUrls = null, momentsOnly = false } = {}) {
    const corpus = this.store
      .all("intelligence")
      .map(([, v]) => v)
      .filter(
        (v) =>
          v.state === "READY" &&
          v.processingVersion === PROCESSING_VERSION &&
          (!feedUrls || feedUrls.includes(v.episode.feedUrl)),
      );
    const matches = corpus
      .flatMap((v) =>
        hybridRetrieve(v.transcript, query, 3)
          .filter((m) => !momentsOnly || Number.isFinite(m.startMs))
          .map((m) => ({
            ...m,
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
