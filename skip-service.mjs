import { createHash, randomUUID } from "node:crypto";
import { episodeKey } from "./episode-pipeline.mjs";
import { feedback, Verification } from "./ad-skip.mjs";
import { intervalDecision } from "./ad-skip.mjs";
import { ListenerError } from "./listener-service.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const nowIso = () => new Date().toISOString();
const categories = new Set(["advert", "intro", "title_sequence", "preview", "outro"]);
const validEventId = (value) =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{8,120}$/.test(value);

function candidateForSegment({ segment, transcript, feed, key, previous, all }) {
  if (!Number.isFinite(segment.startMs) || !Number.isFinite(segment.endMs) || segment.endMs <= segment.startMs)
    return null;
  const text = String(segment.text || "");
  const sponsorship = /\b(sponsored by|sponsor of|our sponsors?|brought to you by|thanks to .{1,50} for sponsoring)\b/i.test(text);
  const cta = /\b(promo code|discount code|use code|free trial|percent off|% off|visit .{1,60} to|go to .{1,60} for)\b/i.test(text);
  const early = segment.startMs < 180000;
  const late = Number.isFinite(transcript.durationMs) && segment.startMs > transcript.durationMs * 0.8;
  const type = sponsorship || cta ? "advert" : early && /\[(?:opening |theme |intro )music\]/i.test(text) ? "title_sequence" : (early || late) && /\b(coming up (?:next|on)|in (?:our|the) next episode)\b/i.test(text) ? "preview" : early && /\b(hello and welcome to|welcome back to (?:the|our))\b/i.test(text) ? "intro" : late && /\b(thanks? (?:you )?for listening|that'?s all for (?:today|this episode))\b/i.test(text) ? "outro" : null;
  if (!type) return null;
  const disputed = previous.some((item) => item.disputed && (item.sourceVariantKey || item.audioVariant) === transcript.audioVariant && item.startMs < segment.endMs && item.endMs > segment.startMs);
  const transcriptConfidence = sponsorship && cta ? 0.95 : 0.62;
  return {
    id: hash(`${key}:${transcript.transcriptVersion || transcript.contentHash}:${segment.id}`),
    episodeKey: key,
    type,
    startMs: segment.startMs,
    endMs: segment.endMs,
    // A cache/source key is deliberately not an acoustic fingerprint.
    sourceVariantKey: transcript.audioVariant || null,
    audioVariantFingerprint: null,
    confidence: disputed ? 0.5 : transcriptConfidence,
    verificationState: disputed ? Verification.DISPUTED : Verification.CANDIDATE,
    disputed,
    processingVersion: "transcript-candidates-v3",
    qualifiesForAudioVerification: type === "advert" && sponsorship && cta,
    evidence: [
      {
        source: "transcript",
        signal: sponsorship && cta ? "sponsorship_and_offer" : sponsorship ? "sponsorship_language" : cta ? "offer_call_to_action" : `${type}_language`,
        confidence: transcriptConfidence,
        sourceSegmentIds: segment.sourceSegmentIds || [segment.id],
        provenance: transcript.provenance || null,
      },
      ...all.filter((item) => item.episodeKey !== key && item.publisherFeed === feed && item.excerpt === text.slice(0, 600) && text.length >= 80).slice(0, 1).map((item) => ({
        source: "cross_episode",
        originFamily: "transcript",
        signal: "repeated_publisher_text",
        confidence: 0.7,
        referenceIntervalId: item.id,
      })),
    ],
    publisherFeed: feed,
    boundaryVerified: false,
    excerpt: text.slice(0, 600),
    createdAt: nowIso(),
  };
}

function listenerState({ value, intervals, verification }) {
  if (!value) return ["NOT_ANALYSED", "Ad detection has not been prepared for this episode."];
  if (!["READY", "PARTIAL_READY"].includes(value.state)) return ["ANALYSING", "Ad candidates will be checked after authorised episode intelligence is ready."];
  if (!value.transcript?.segments?.length) return ["UNAVAILABLE", "No authorised timestamped transcript is available for advert detection."];
  if (!intervals.length) return ["NO_ADVERTS_DETECTED", "No advert candidates were found in the analysed transcript."];
  if (intervals.some((item) => item.verificationState === Verification.VERIFIED)) return ["READY", "Verified, audio-matched intervals are ready for this exact source variant."];
  if (["QUEUED", "PROCESSING"].includes(verification?.state)) return ["VERIFYING", "Checking candidate boundaries against the authorised audio source."];
  if (verification?.state === "DYNAMIC_VARIANT") return ["UNAVAILABLE", "This publisher delivery can change between listens, so Ad Skip stays off."];
  if (verification?.state === "FAILED") return ["FAILED", "Audio boundary verification did not complete. Automatic skipping remains off."];
  if (verification?.state === "UNAVAILABLE") return ["UNAVAILABLE", verification.reason || "Audio verification is not authorised for this episode."];
  if (verification?.state === "READY") return ["NO_VERIFIED_INTERVALS", "Candidates did not meet the independent boundary-evidence threshold."];
  return ["CANDIDATES_FOUND", "Candidates are recorded; automatic skipping needs independent audio evidence."];
}

export class SkipService {
  constructor(store, pipeline, { verifyAudio = null, canVerifyAudio = () => ({ allowed: false, reason: "Audio verification is not authorised for this episode." }), automaticEnabled = () => false, maxAudioSeconds = 7200 } = {}) {
    this.store = store;
    this.pipeline = pipeline;
    this.verifyAudio = verifyAudio;
    this.canVerifyAudio = canVerifyAudio;
    this.automaticEnabled = automaticEnabled;
    this.maxAudioSeconds = maxAudioSeconds;
    this.inflight = new Map();
    this.verificationTail = Promise.resolve();
  }
  verification(key) { return this.store.get("skip-audio-verification", key) || null; }
  inspect(feed, episode) {
    const rights = this.pipeline.rights;
    if (rights && (!rights.evaluate({ feature: "ad-detection", feedUrl: feed, episodeId: episode }).allowed ||
        !rights.evaluate({ feature: "intelligence-processing", feedUrl: feed, episodeId: episode }).allowed))
      return { state: "UNAVAILABLE", reason: "Advert detection is not authorised by the current assessment.", intervals: [], activeIntervals: [], verifiedCount: 0, candidateCount: 0, automaticSkipping: false };
    const value = this.pipeline.status(feed, episode), key = episodeKey(feed, episode), transcript = value?.transcript;
    const all = this.store.all("skip-interval").map(([, item]) => item);
    const prior = all.filter((item) => item.episodeKey === key);
    const segments = [...(transcript?.segments || [])];
    // Whisper often separates the sponsor declaration from its offer. Join
    // only adjacent short speech spans, retaining every original citation.
    for (let index = 0; index < (transcript?.segments?.length || 0); index++) {
      const first = transcript.segments[index];
      if (!/\b(sponsored by|our sponsors?|brought to you by)\b/i.test(first.text || "") || /\b(use code|promo code|free trial|discount code)\b/i.test(first.text || "")) continue;
      const group = [first];
      for (const next of transcript.segments.slice(index + 1, index + 4)) {
        if (next.startMs - group.at(-1).endMs > 3000 || next.endMs - first.startMs > 120000) break;
        group.push(next);
        if (/\b(use code|promo code|free trial|discount code)\b/i.test(next.text || "")) {
          segments.push({ ...first, id: group.map(row => row.id).join(":"), sourceSegmentIds: group.map(row => row.id), endMs: next.endMs, text: group.map(row => row.text).join(" ") }); break;
        }
      }
    }
    if (transcript?.segments?.length) for (const segment of segments) {
      const candidate = candidateForSegment({ segment, transcript, feed, key, previous: prior, all });
      const existing = candidate && this.store.get("skip-interval", candidate.id);
      if (!candidate) continue;
      // A prior transcript-only candidate may be upgraded to the current
      // verifier schema.  Disputes/rejections are never reinstated or changed.
      if (existing) {
        if (existing.verificationState === Verification.CANDIDATE && !existing.disputed)
          this.store.set("skip-interval", candidate.id, {
            ...candidate,
            createdAt: existing.createdAt || candidate.createdAt,
          });
        continue;
      }
      this.store.set("skip-interval", candidate.id, candidate);
    }
    const intervals = this.store.all("skip-interval").map(([, item]) => item)
      .filter((item) => item.episodeKey === key && (item.sourceVariantKey || item.audioVariant) === transcript?.audioVariant);
    this.scheduleVerification(feed, episode, value, intervals);
    const verification = this.verification(key), [state, reason] = listenerState({ value, intervals, verification });
    return {
      automaticSkipping: false,
      transcriptAvailable: Boolean(transcript?.segments?.length),
      state,
      reason,
      verificationState: verification?.state || null,
      intervals: intervals.map(({ id, type, startMs, endMs, verificationState, excerpt }) => ({ id, type, startMs, endMs, verificationState, excerpt })),
      verifiedCount: intervals.filter((item) => item.verificationState === Verification.VERIFIED && item.boundaryVerified && !item.disputed && Boolean(item.audioVariantFingerprint)).length,
    };
  }
  scheduleVerification(feed, episode, value, intervals) {
    const key = episodeKey(feed, episode);
    const eligible = intervals.filter((item) => item.qualifiesForAudioVerification && item.verificationState === Verification.CANDIDATE && !item.disputed);
    if (!eligible.length || !value?.episode?.audioUrl) return;
    const permission = this.canVerifyAudio({ feedUrl: feed, episodeId: episode, value });
    const policy = typeof permission === "boolean" ? { allowed: permission } : permission || {};
    const previous = this.verification(key);
    if (!policy.allowed || !this.verifyAudio) {
      if (!previous || previous.state !== "UNAVAILABLE" || previous.reason !== policy.reason)
        this.store.set("skip-audio-verification", key, { episodeKey: key, state: "UNAVAILABLE", reason: policy.reason || "Audio boundary verification is not configured.", updatedAt: nowIso() });
      return;
    }
    if (this.inflight.has(key) || ["READY", "DYNAMIC_VARIANT"].includes(previous?.state)) return;
    if (previous?.state === "FAILED" && (previous.attempts || 0) >= 2) return;
    const attempt = (previous?.attempts || 0) + 1;
    this.store.set("skip-audio-verification", key, { episodeKey: key, state: "QUEUED", attempts: attempt, updatedAt: nowIso(), reason: null });
    const pending = this.verificationTail.then(() => this.verify(feed, episode, value, eligible, attempt)).finally(() => this.inflight.delete(key));
    this.verificationTail = pending.catch(() => {});
    this.inflight.set(key, pending);
  }
  async verify(feed, episode, value, candidates, attempt) {
    const key = episodeKey(feed, episode);
    this.store.set("skip-audio-verification", key, { episodeKey: key, state: "PROCESSING", attempts: attempt, updatedAt: nowIso(), reason: null });
    try {
      const result = await this.verifyAudio({ audioUrl: value.episode.audioUrl, candidates, expectedContentHash: value.transcript?.audioContentHash, maxSeconds: typeof this.maxAudioSeconds === "function" ? this.maxAudioSeconds(value) : this.maxAudioSeconds });
      this.store.transaction(() => {
        const permission = this.canVerifyAudio({ feedUrl: feed, episodeId: episode, value });
        if (!(typeof permission === "boolean" ? permission : permission?.allowed)) {
          this.store.set("skip-audio-verification", key, { episodeKey: key, state: "UNAVAILABLE", attempts: attempt, updatedAt: nowIso(), reason: permission?.reason || "Audio verification permission changed." });
          return;
        }
        const at = nowIso();
        this.store.set("skip-audio-verification", key, {
          episodeKey: key, state: result.state || "READY", attempts: attempt, updatedAt: at, completedAt: at, reason: result.reason || null,
          variant: result.variant ? { deliveryUrl: result.variant.deliveryUrl, etag: result.variant.etag, contentLength: result.variant.contentLength, audioVariantFingerprint: result.variant.audioVariantFingerprint, durationMs: result.variant.durationMs } : null,
        });
        if (result.state !== "READY" || !result.variant) return;
        const outcomes = new Map((result.candidates || []).map((item) => [item.id, item]));
        for (const candidate of candidates) {
          const current = this.store.get("skip-interval", candidate.id), outcome = outcomes.get(candidate.id);
          if (!current || current.disputed || current.verificationState !== Verification.CANDIDATE || !outcome) continue;
          if (!outcome.boundaryVerified) {
            this.store.set("skip-interval", current.id, { ...current, verificationState: Verification.VARIANT_MATCHED, lastVerifiedAt: at });
            continue;
          }
          const startMs = outcome.startMs, endMs = outcome.endMs;
          if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < current.startMs || endMs > current.endMs || endMs <= startMs || endMs + 300 > result.variant.durationMs) continue;
          this.store.set("skip-interval", current.id, {
            ...current, startMs, endMs, boundaryVerified: true, audioVariantFingerprint: result.variant.audioVariantFingerprint,
            verificationState: Verification.VERIFIED, confidence: 0.97, verifiedAt: at, lastVerifiedAt: at,
            evidence: [
              ...(current.evidence || []),
              { source: "fingerprint", signal: "actual_audio_pcm_boundary", confidence: 0.99, fingerprint: outcome.boundaryFingerprint },
              { source: "structure", signal: "actual_audio_silence_boundaries", confidence: 0.96, startMs, endMs },
            ],
          });
        }
      });
    } catch (error) {
      this.store.set("skip-audio-verification", key, {
        episodeKey: key, state: "FAILED", attempts: attempt, updatedAt: nowIso(),
        reason: "Audio boundary verification could not complete.", diagnostic: String(error?.message || "verification failed").slice(0, 500),
      });
    }
  }
  playback(feed, episode, { audioUrl, audioVariantFingerprint, listener, preferences = {} } = {}) {
    const inspection = this.inspect(feed, episode), value = this.pipeline.status(feed, episode);
    const exactSource = typeof audioUrl === "string" && Boolean(value?.episode?.audioUrl) && audioUrl === value.episode.audioUrl;
    const verification = this.verification(episodeKey(feed, episode));
    const variant = verification?.state === "READY" ? verification.variant : null;
    const permitted = exactSource && inspection.state !== "UNAVAILABLE" && this.automaticEnabled(listener) && preferences.adSkipEnabled === true;
    const sourceMatched = Boolean(permitted && variant?.audioVariantFingerprint && audioVariantFingerprint === variant.audioVariantFingerprint);
    const activeIntervals = sourceMatched ? this.store.all("skip-interval").map(([, item]) => item)
      .filter((item) => item.episodeKey === episodeKey(feed, episode) && categories.has(item.type) && preferences[item.type] === true && intervalDecision({ interval: item, variantFingerprint: audioVariantFingerprint, durationMs: variant.durationMs, positionMs: item.startMs, flags: { ad_skip: "on", intro_skip: "on", title_sequence_skip: "on", preview_skip: "on", outro_skip: "on" } }).skip)
      .map(({ id, type, startMs, endMs }) => ({ id, type, startMs, endMs, targetMs: endMs })) : [];
    return { ...inspection, automaticSkipping: activeIntervals.length > 0, activeIntervals, sourceMatched, pilotEnabled: Boolean(this.automaticEnabled(listener)),
      // Never send a playable lease based only on a URL. The native player must
      // hash and play a local copy of the exact verified publisher bytes.
      variant: permitted && inspection.verifiedCount > 0 && variant ? variant : null };
  }
  authorise(listener, feed, episode, input, preferences) {
    if (this.store.all("skip-authorisation").filter(([, row]) => row.owner === listener.id && row.expiresAt > Date.now() - 60000).length >= 10) throw new ListenerError("Ad Skip checks are temporarily limited.", 429);
    const status = this.playback(feed, episode, { ...input, listener, preferences });
    const interval = status.activeIntervals.find((row) => row.id === input.intervalId && Number.isFinite(input.positionMs) && input.positionMs >= row.startMs && input.positionMs < row.endMs);
    if (!interval) throw new ListenerError("No current verified interval is authorised for this playback.");
    const id = randomUUID(), expiresAt = Date.now() + 10_000;
    this.store.set("skip-authorisation", id, { id, owner: listener.id, episodeKey: episodeKey(feed, episode), intervalId: interval.id, audioVariantFingerprint: input.audioVariantFingerprint, positionMs: input.positionMs, targetMs: interval.targetMs, expiresAt });
    for (const [key, row] of this.store.all("skip-authorisation")) if (row.expiresAt < Date.now() - 86400000) this.store.delete("skip-authorisation", key);
    return { ...interval, authorisationId: id, expiresAt };
  }
  report(listener, feed, episode, { eventId, intervalId, kind, positionMs, audioVariantFingerprint }) {
    if (!validEventId(eventId) || !["good", "skipped_conversation", "missed"].includes(kind)) throw new ListenerError("Choose valid skip feedback.");
    const key = episodeKey(feed, episode), reportId = hash(`${listener.id}:${eventId}`);
    this.store.transaction(() => {
      if (this.store.get("skip-feedback", reportId)) return;
      const interval = typeof intervalId === "string" ? this.store.get("skip-interval", intervalId) : null;
      if (kind !== "missed" && (!interval || interval.episodeKey !== key)) throw new ListenerError("This interval is unavailable.");
      if (interval && interval.episodeKey !== key) throw new ListenerError("This interval belongs to a different episode.");
      if (kind === "missed" && (!Number.isFinite(positionMs) || positionMs < 0 || positionMs > 24 * 3600000)) throw new ListenerError("A valid report position is required.");
      const voteKey = hash(`${listener.id}:${key}:${interval?.id || Math.floor(positionMs / 10000)}:${kind}`);
      if (this.store.get("skip-vote", voteKey)) return;
      this.store.set("skip-vote", voteKey, { reportId });
      if (interval) this.store.set("skip-interval", interval.id, feedback(interval, kind));
      this.store.set("skip-feedback", reportId, { owner: listener.id, intervalId: interval?.id || null, episodeKey: key, kind, positionMs: Number.isFinite(positionMs) ? positionMs : null, audioVariantFingerprint: interval?.audioVariantFingerprint || (/^[a-f0-9]{64}$/.test(audioVariantFingerprint || "") ? audioVariantFingerprint : null), createdAt: nowIso(), provenance: "listener_report" });
    });
    return this.inspect(feed, episode);
  }
  recordPlaybackEvent(listener, feed, episode, { eventId, intervalId, kind, positionMs, authorisationId }) {
    if (!validEventId(eventId) || !["automatic_skip", "undo"].includes(kind)) throw new ListenerError("Choose a valid Ad Skip playback event.");
    if (!Number.isFinite(positionMs) || positionMs < 0 || positionMs > 24 * 3600000) throw new ListenerError("A valid playback position is required.");
    const key = episodeKey(feed, episode), interval = this.store.get("skip-interval", intervalId);
    const lease = this.store.get("skip-authorisation", authorisationId);
    if (!interval || interval.episodeKey !== key || !lease || lease.owner !== listener.id || lease.episodeKey !== key || lease.intervalId !== intervalId) throw new ListenerError("This playback authorisation is unavailable.");
    if (kind === "automatic_skip" && (lease.expiresAt < Date.now() || !this.automaticEnabled(listener) || interval.disputed || Math.abs(positionMs - lease.targetMs) > 350)) throw new ListenerError("This skip did not confirm its authorised destination.");
    if (kind === "undo" && (!lease.executedAt || Math.abs(positionMs - lease.positionMs) > 350)) throw new ListenerError("Undo did not confirm the previous listening position.");
    const id = hash(`${listener.id}:${eventId}`);
    this.store.transaction(() => {
      if (this.store.get("skip-execution", id) || (kind === "automatic_skip" ? lease.executedAt : lease.undoneAt)) return;
      this.store.set("skip-authorisation", authorisationId, { ...lease, [kind === "automatic_skip" ? "executedAt" : "undoneAt"]: nowIso() });
      this.store.set("skip-execution", id, { id, owner: listener.id, episodeKey: key, intervalId, kind, positionMs, audioVariantFingerprint: lease.audioVariantFingerprint, evaluation: Boolean(this.pipeline.status(feed, episode)?.episode?.ownedFixtureAudioHash), provenance: "client_confirmed_seek", createdAt: nowIso() });
    });
    return { recorded: true };
  }
  operations() {
    const intervals = this.store.all("skip-interval").map(([, item]) => item);
    const verification = this.store.all("skip-audio-verification").map(([, item]) => item);
    const feedbackRows = this.store.all("skip-feedback").map(([, item]) => item);
    const executions = this.store.all("skip-execution").map(([, item]) => item);
    const count = (predicate, rows = intervals) => rows.filter(predicate).length;
    return {
      generatedAt: nowIso(),
      counts: {
        candidates: count((item) => item.verificationState === Verification.CANDIDATE), variantMatched: count((item) => item.verificationState === Verification.VARIANT_MATCHED), verified: count((item) => item.verificationState === Verification.VERIFIED), disputed: count((item) => item.verificationState === Verification.DISPUTED), rejected: count((item) => item.verificationState === Verification.REJECTED),
        processing: count((item) => ["QUEUED", "PROCESSING"].includes(item.state), verification), failed: count((item) => item.state === "FAILED", verification), automaticSkips: count((item) => item.kind === "automatic_skip", executions), undoEvents: count((item) => item.kind === "undo", executions), falsePositiveReports: count((item) => item.kind === "skipped_conversation", feedbackRows), missedAdvertReports: count((item) => item.kind === "missed", feedbackRows),
      },
      intervals: intervals.map((item) => ({ id: item.id, episodeKey: item.episodeKey, publisherFeed: item.publisherFeed, type: item.type, startMs: item.startMs, endMs: item.endMs, confidence: item.confidence, verificationState: item.verificationState, boundaryVerified: item.boundaryVerified === true, disputed: item.disputed === true, evidenceSources: (item.evidence || []).map((evidence) => evidence.source), excerpt: item.excerpt?.slice(0, 180) || null, createdAt: item.createdAt, verifiedAt: item.verifiedAt || null })),
      verification: verification.map(({ diagnostic, ...item }) => item),
      release: {
        evaluationSkips: executions.filter(row => row.evaluation && row.kind === "automatic_skip").length,
        evaluationUndos: executions.filter(row => row.evaluation && row.kind === "undo").length,
        realEpisodeSkips: executions.filter(row => !row.evaluation && row.kind === "automatic_skip").length,
        eventProvenance: "Client-confirmed seek telemetry; not independent accuracy ground truth.",
        productionAutomaticSkipping: false,
        criteria: { labelledEpisodes: 30, verifiedIntervals: 1000, precision: 0.995, conversationSkips: 0, mismatchedVariantSkips: 0, p95DecisionMs: 500, undoRestorationRate: 1 },
        measured: null,
        status: "NOT_EVALUATED",
      },
    };
  }
}
