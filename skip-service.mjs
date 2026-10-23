import { createHash, randomUUID } from "node:crypto";
import { episodeKey } from "./episode-pipeline.mjs";
import { feedback, Verification } from "./ad-skip.mjs";
import { intervalDecision } from "./ad-skip.mjs";
import { ListenerError } from "./listener-service.mjs";
import { skipDiagnostics } from "./skip-diagnostics.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const nowIso = () => new Date().toISOString();
const categories = new Set(["advert", "intro", "title_sequence", "preview", "outro"]);
const candidateVersion = "transcript-candidates-v5";
const sponsorLanguage = /\b(sponsored by|sponsor of|our sponsors?|brought to you by|made possible by|thanks to .{1,50} for sponsoring)\b/i;
const commercialOffer = /\b(promo code|discount code|use (?:the )?code|free trial|percent off|visit .{1,80}(?: to |sign up|signup)|go to .{1,60} for|sign up at|get started at|head (?:over )?to .{1,70} (?:for|to))\b|\d+% off/i;
const sponsorshipDenial = /\b(?:not sponsored|(?:no|without) (?:a )?sponsors?|isn't (?:a )?sponsor|not (?:an? )?(?:ad|advertisement))\b/i;
const verificationInput = (value, candidates) => hash(JSON.stringify([value?.transcript?.audioContentHash || null, value?.transcript?.transcriptVersion, value?.transcript?.audioVariant, value?.episode?.audioUrl, candidates.map(row => [row.id,row.startMs,row.endMs])]));
const validEventId = (value) =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{8,120}$/.test(value);

function candidateForSegment({ segment, transcript, feed, key, previous, all }) {
  if (!Number.isFinite(segment.startMs) || !Number.isFinite(segment.endMs) || segment.endMs <= segment.startMs)
    return null;
  const text = String(segment.text || "");
  const sponsorship = sponsorLanguage.test(text);
  const cta = commercialOffer.test(text);
  const denied = sponsorshipDenial.test(text);
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
    confidence: disputed || denied ? 0.5 : transcriptConfidence,
    verificationState: disputed ? Verification.DISPUTED : denied ? Verification.REJECTED : Verification.CANDIDATE,
    disputed,
    processingVersion: candidateVersion,
    qualifiesForAudioVerification: !denied && type === "advert" && sponsorship && cta,
    decisionReason: denied ? "Explicit non-advertising context; not eligible for automatic verification." : sponsorship && cta ? "Sponsor declaration and commercial offer; independent audio evidence still required." : "Single contextual cue only; insufficient evidence for automatic verification.",
    evidence: [
      {
        source: "transcript",
        signal: denied ? "editorial_sponsorship_context" : sponsorship && cta ? "sponsorship_and_offer" : sponsorship ? "sponsorship_language" : cta ? "offer_call_to_action" : `${type}_language`,
        confidence: denied ? 0.5 : transcriptConfidence,
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
  if (!value.transcript?.segments?.length) {
    if (["FAILED", "CANCELLED"].includes(value.state)) return ["FAILED", value.reason || "Episode preparation failed."];
    if (["BLOCKED", "BUDGET_PAUSED", "UNAVAILABLE"].includes(value.state)) return ["UNAVAILABLE", value.reason || "Episode preparation is unavailable."];
    if (!["READY", "PARTIAL_READY"].includes(value.state)) return ["ANALYSING", "Waiting for an authorised transcript; summary completion is not required."];
    return ["UNAVAILABLE", "No authorised timestamped transcript is available for advert detection."];
  }
  if (!intervals.length) return ["NO_ADVERTS_DETECTED", "No advert candidates were found in the analysed transcript."];
  if (intervals.every(item => [Verification.REJECTED, Verification.DISPUTED].includes(item.verificationState))) return ["NO_VERIFIED_INTERVALS", "Detected signals were rejected or disputed; no safe skip is available."];
  if (intervals.some((item) => item.verificationState === Verification.VERIFIED)) return ["READY", "Verified, audio-matched intervals are ready for this exact source variant."];
  if (["QUEUED", "PROCESSING"].includes(verification?.state)) return ["VERIFYING", "Checking candidate boundaries against the authorised audio source."];
  if (verification?.state === "DYNAMIC_VARIANT") return ["UNAVAILABLE", "This publisher delivery can change between listens, so Ad Skip stays off."];
  if (verification?.state === "FAILED") return ["FAILED", "Audio boundary verification did not complete. Automatic skipping remains off."];
  if (verification?.state === "UNAVAILABLE") return ["UNAVAILABLE", verification.reason || "Audio verification is not authorised for this episode."];
  if (verification?.state === "READY") return ["NO_VERIFIED_INTERVALS", "Candidates did not meet the independent boundary-evidence threshold."];
  return ["CANDIDATES_FOUND", "Candidates are recorded; automatic skipping needs independent audio evidence."];
}

export class SkipService {
  constructor(store, pipeline, { verifyAudio = null, canVerifyAudio = () => ({ allowed: false, reason: "Audio verification is not authorised for this episode." }), automaticEnabled = () => false, testingContext = () => null, maxAudioSeconds = 7200, clock = Date.now } = {}) {
    this.store = store;
    this.pipeline = pipeline;
    this.verifyAudio = verifyAudio;
    this.canVerifyAudio = canVerifyAudio;
    this.automaticEnabled = automaticEnabled;
    this.testingContext = testingContext;
    this.maxAudioSeconds = maxAudioSeconds;
    this.clock = clock;
    this.inflight = new Map();
    this.verificationTail = Promise.resolve();
  }
  verification(key) { return this.store.get("skip-audio-verification", key) || null; }
  inspect(feed, episode, context = {}) {
    const rights = this.pipeline.rights;
    const refusal = rights && ["ad-detection", "intelligence-processing"].map(feature => rights.evaluate({ feature, feedUrl: feed, episodeId: episode })).find(decision => !decision.allowed);
    if (refusal) return { state: "UNAVAILABLE", code: refusal.code || "RIGHTS_NOT_ESTABLISHED", reason: refusal.reason, intervals: [], activeIntervals: [], verifiedCount: 0, candidateCount: null, automaticSkipping: false };
    const stored = this.pipeline.status(feed, episode);
    const value = stored && { ...stored, ...(context.testingContext ? { testingContext: context.testingContext } : {}) }, key = episodeKey(feed, episode), transcript = value?.transcript;
    const all = this.store.all("skip-interval").map(([, item]) => item);
    const prior = all.filter((item) => item.episodeKey === key);
    const input = transcript?.segments?.length ? hash(JSON.stringify([transcript.transcriptVersion, transcript.contentHash, transcript.audioVariant, transcript.audioContentHash, transcript.segments, candidateVersion])) : null;
    const cachedAnalysis = this.store.get("skip-analysis", key);
    const needsAnalysis = Boolean(input && cachedAnalysis?.input !== input);
    const segments = needsAnalysis ? [...transcript.segments] : [];
    // Whisper often separates the sponsor declaration from its offer. Join
    // only adjacent short speech spans, retaining every original citation.
    for (let index = 0; needsAnalysis && index < transcript.segments.length; index++) {
      const first = transcript.segments[index];
      if (!sponsorLanguage.test(first.text || "") || sponsorshipDenial.test(first.text || "") || commercialOffer.test(first.text || "")) continue;
      const group = [first];
      for (const next of transcript.segments.slice(index + 1, index + 33)) {
        if (!Number.isFinite(next.startMs) || !Number.isFinite(next.endMs) || next.startMs < group.at(-1).endMs || next.startMs - group.at(-1).endMs > 3000 || next.endMs - first.startMs > 120000) break;
        group.push(next);
        if (commercialOffer.test(next.text || "")) {
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
    if (needsAnalysis) this.store.set("skip-analysis", key, { episodeKey: key, feedUrl: feed, episodeId: episode, input, processingVersion:candidateVersion, state: "COMPLETE", candidateCount: intervals.length, rejectedCount:intervals.filter(row=>row.verificationState===Verification.REJECTED).length, at: nowIso() });
    this.scheduleVerification(feed, episode, value, intervals, context.preparedAudio);
    const verification = this.verification(key), [state, reason] = listenerState({ value, intervals, verification });
    return {
      automaticSkipping: false,
      transcriptAvailable: Boolean(transcript?.segments?.length),
      state,
      reason,
      code: verification?.code || (state === "FAILED" || state === "UNAVAILABLE" ? value?.code || "TRANSCRIPT_UNAVAILABLE" : state === "CANDIDATES_FOUND" ? "CANDIDATES_UNVERIFIED" : state),
      candidateCount: intervals.length,
      verificationState: verification?.state || null,
      intervals: intervals.map(({ id, type, startMs, endMs, verificationState, excerpt }) => ({ id, type, startMs, endMs, verificationState, excerpt })),
      verifiedCount: intervals.filter((item) => item.verificationState === Verification.VERIFIED && item.boundaryVerified && !item.disputed && Boolean(item.audioVariantFingerprint)).length,
    };
  }
  scheduleVerification(feed, episode, value, intervals, preparedAudio = null) {
    const key = episodeKey(feed, episode);
    const eligible = intervals.filter((item) => item.qualifiesForAudioVerification && item.verificationState === Verification.CANDIDATE && !item.disputed);
    if (!eligible.length || !value?.episode?.audioUrl) return;
    const permission = this.canVerifyAudio({ feedUrl: feed, episodeId: episode, value });
    const policy = typeof permission === "boolean" ? { allowed: permission } : permission || {};
    const previous = this.verification(key);
    if (!policy.allowed || !this.verifyAudio) {
      if (!previous || previous.state !== "UNAVAILABLE" || previous.reason !== policy.reason)
        this.store.set("skip-audio-verification", key, { ...previous, episodeKey: key, state: "UNAVAILABLE", code: policy.code || "AUDIO_VERIFICATION_NOT_AUTHORISED", reason: policy.reason || "Audio boundary verification is not configured.", updatedAt: nowIso() });
      return;
    }
    const inputKey = verificationInput(value, eligible);
    if (this.inflight.has(key) || (["READY", "DYNAMIC_VARIANT"].includes(previous?.state) && previous.inputKey === inputKey)) return;
    // A missing transcript/audio binding is not transient. Retry only if the
    // bound source changes, rather than rewriting a failed job on every poll.
    const sameInput = !previous?.inputKey || previous.inputKey === inputKey;
    if (previous?.state === "UNAVAILABLE" && previous.inputKey === inputKey && ["AUDIO_BINDING_REQUIRED","SOURCE_CHANGED"].includes(previous.code)) return;
    if (sameInput && (previous?.attempts || 0) >= 2) {
      if (["QUEUED","PROCESSING"].includes(previous?.state)) this.store.set("skip-audio-verification",key,{...previous,state:"FAILED",code:"VERIFICATION_RETRY_EXHAUSTED",reason:"Interrupted audio verification reached its bounded retry limit.",updatedAt:nowIso()});
      return;
    }
    if (sameInput && previous?.state === "FAILED" && Date.parse(previous.retryAfter || "") > this.clock()) return;
    const attempt = (sameInput ? previous?.attempts || 0 : 0) + 1;
    this.store.set("skip-audio-verification", key, { episodeKey: key, state: "QUEUED", inputKey, attempts: attempt, updatedAt: nowIso(), reason: null });
    const pending = this.verificationTail.then(() => this.verify(feed, episode, value, eligible, attempt, inputKey, preparedAudio)).finally(() => this.inflight.delete(key));
    this.verificationTail = pending.catch(() => {});
    this.inflight.set(key, pending);
  }
  async verify(feed, episode, value, candidates, attempt, inputKey, preparedAudio) {
    const key = episodeKey(feed, episode);
    this.store.set("skip-audio-verification", key, { episodeKey: key, state: "PROCESSING", inputKey, attempts: attempt, updatedAt: nowIso(), reason: null });
    const currentSource = () => verificationInput(this.pipeline.status(feed,episode),candidates) === inputKey;
    const allowed = () => { const p=this.canVerifyAudio({feedUrl:feed,episodeId:episode,value});return typeof p==="boolean"?p:p?.allowed; };
    try {
      if (!currentSource() || !allowed()) {
        this.store.set("skip-audio-verification",key,{episodeKey:key,state:"UNAVAILABLE",inputKey,attempts:attempt,code:currentSource()?"AUDIO_VERIFICATION_NOT_AUTHORISED":"SOURCE_CHANGED",reason:"The source or permission changed before verification began.",updatedAt:nowIso()});return;
      }
      const result = await this.verifyAudio({ audioUrl: value.episode.audioUrl, candidates, preparedAudio, expectedContentHash: value.transcript?.audioContentHash, maxSeconds: typeof this.maxAudioSeconds === "function" ? this.maxAudioSeconds(value) : this.maxAudioSeconds });
      this.store.transaction(() => {
        if (!currentSource()) {
          this.store.set("skip-audio-verification",key,{episodeKey:key,state:"UNAVAILABLE",inputKey,attempts:attempt,code:"SOURCE_CHANGED",reason:"The transcript or audio source changed during verification; no intervals were published.",updatedAt:nowIso()});return;
        }
        const permission = this.canVerifyAudio({ feedUrl: feed, episodeId: episode, value });
        if (!(typeof permission === "boolean" ? permission : permission?.allowed)) {
          this.store.set("skip-audio-verification", key, { episodeKey: key, state: "UNAVAILABLE", inputKey, attempts: attempt, updatedAt: nowIso(), reason: permission?.reason || "Audio verification permission changed." });
          return;
        }
        const at = nowIso();
        this.store.set("skip-audio-verification", key, {
          episodeKey: key, state: result.state || "READY", inputKey, code: result.code || (result.state === "DYNAMIC_VARIANT" ? "VARIANT_MISMATCH" : result.state === "UNAVAILABLE" ? "AUDIO_BINDING_REQUIRED" : null), inputHash: value.transcript?.audioContentHash || null, attempts: attempt, updatedAt: at, completedAt: at, reason: result.reason || null,
          variant: result.variant ? { deliveryUrl: result.variant.deliveryUrl, etag: result.variant.etag, contentLength: result.variant.contentLength, audioVariantFingerprint: result.variant.audioVariantFingerprint, durationMs: result.variant.durationMs, windows: result.variant.windows || [] } : null,
        });
        if (result.state !== "READY" || !result.variant) return;
        const outcomes = new Map((result.candidates || []).map((item) => [item.id, item]));
        for (const candidate of candidates) {
          const current = this.store.get("skip-interval", candidate.id), outcome = outcomes.get(candidate.id);
          if (!current || current.disputed || current.verificationState !== Verification.CANDIDATE || !outcome) continue;
          if (!outcome.boundaryVerified) {
            this.store.set("skip-interval", current.id, { ...current, verificationState: Verification.VARIANT_MATCHED, code: outcome.code || "BOUNDARY_EVIDENCE_INSUFFICIENT", lastVerifiedAt: at });
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
        episodeKey: key, state: "FAILED", inputKey, attempts: attempt, updatedAt: nowIso(), retryAfter:attempt<2?new Date(this.clock()+60_000).toISOString():null,
        code: "AUDIO_VERIFICATION_FAILED", reason: "Audio boundary verification could not complete.", diagnostic: String(error?.message || "verification failed").slice(0, 500),
      });
    }
  }
  playback(feed, episode, { audioUrl, audioVariantFingerprint, audioMatchCode, listener, preferences = {} } = {}) {
    const inspection = this.inspect(feed, episode, { testingContext: this.testingContext(listener) }), value = this.pipeline.status(feed, episode);
    const exactSource = typeof audioUrl === "string" && Boolean(value?.episode?.audioUrl) && audioUrl === value.episode.audioUrl;
    const verification = this.verification(episodeKey(feed, episode));
    const variant = verification?.state === "READY" ? verification.variant : null;
    const displayAllowed = !this.pipeline.rights || ["intelligence-display", "automatic-skipping"].every(feature => this.pipeline.rights.evaluate({ feature, feedUrl: feed, episodeId: episode }).allowed);
    const permitted = exactSource && displayAllowed && inspection.state !== "UNAVAILABLE" && this.automaticEnabled(listener) && preferences.adSkipEnabled === true;
    const sourceMatched = Boolean(permitted && variant?.audioVariantFingerprint && audioVariantFingerprint === variant.audioVariantFingerprint);
    const activeIntervals = sourceMatched ? this.store.all("skip-interval").map(([, item]) => item)
      .filter((item) => item.episodeKey === episodeKey(feed, episode) && categories.has(item.type) && preferences[item.type] === true && intervalDecision({ interval: item, variantFingerprint: audioVariantFingerprint, durationMs: variant.durationMs, positionMs: item.startMs, flags: { ad_skip: "on", intro_skip: "on", title_sequence_skip: "on", preview_skip: "on", outro_skip: "on" } }).skip)
      .map(({ id, type, startMs, endMs }) => ({ id, type, startMs, endMs, targetMs: endMs })) : [];
    const matchFailure = ["AUDIO_PRECONDITION_UNSUPPORTED", "AUDIO_VARIANT_CHANGED", "AUDIO_WITNESS_MISMATCH", "AUDIO_MATCH_FAILED", "BOUNDED_PROOF_UNAVAILABLE"].includes(audioMatchCode) ? audioMatchCode : null;
    const code = !displayAllowed ? "DISPLAY_NOT_AUTHORISED" : !this.automaticEnabled(listener) ? "PILOT_DISABLED" : preferences.adSkipEnabled !== true ? "PREFERENCE_DISABLED" : !exactSource ? "SOURCE_URL_MISMATCH" : !variant ? inspection.code : !audioVariantFingerprint ? matchFailure || "AUDIO_MATCH_NOT_CHECKED" : !sourceMatched ? "VARIANT_MISMATCH" : !activeIntervals.length ? "NO_ELIGIBLE_INTERVALS" : "READY";
    if (this.automaticEnabled(listener)) {
      const key = episodeKey(feed, episode), analysis = this.store.get("skip-analysis", key);
      const playback = { code, sourceMatched, matchAttempted: Boolean(audioVariantFingerprint), enabled: activeIntervals.length > 0 };
      if (analysis && JSON.stringify(analysis.playback) !== JSON.stringify(playback)) this.store.set("skip-analysis", key, { ...analysis, playback, playbackAt: nowIso() });
    }
    return { ...inspection, code, automaticSkipping: activeIntervals.length > 0, activeIntervals, sourceMatched, pilotEnabled: Boolean(this.automaticEnabled(listener)),
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
  recordPlaybackEvent(listener, feed, episode, { eventId, intervalId, kind, positionMs, authorisationId, code }) {
    const stages = ["skip_requested", "seek_attempted", "seek_failed", "undo_requested", "undo_failed"];
    if (!validEventId(eventId) || !["automatic_skip", "undo", ...stages].includes(kind)) throw new ListenerError("Choose a valid Ad Skip playback event.");
    if (!Number.isFinite(positionMs) || positionMs < 0 || positionMs > 24 * 3600000) throw new ListenerError("A valid playback position is required.");
    const key = episodeKey(feed, episode), interval = typeof intervalId === "string" ? this.store.get("skip-interval", intervalId) : null;
    const lease = typeof authorisationId === "string" ? this.store.get("skip-authorisation", authorisationId) : null;
    if (stages.includes(kind)) {
      if (!interval || interval.episodeKey !== key || (!this.automaticEnabled(listener) && !(kind.startsWith("undo_") && lease?.owner === listener.id && lease.executedAt))) throw new ListenerError("This diagnostic event is not authorised.");
      if (authorisationId && (!lease || lease.owner !== listener.id || lease.episodeKey !== key || lease.intervalId !== intervalId)) throw new ListenerError("This playback authorisation is unavailable.");
      if (kind === "seek_attempted" && !lease) throw new ListenerError("An authorised seek is required.");
      const id = hash(`${listener.id}:${eventId}`);
      if (this.store.get("skip-execution", id)) return { recorded: true };
      if (this.store.all("skip-execution").filter(([, row]) => row.owner === listener.id && Date.parse(row.createdAt) > Date.now() - 3600000).length >= 120) throw new ListenerError("Ad Skip diagnostics are temporarily limited.", 429);
      const reason = ["INTERVAL_PASSED", "AUTHORISATION_FAILED", "SEEK_NOT_CONFIRMED", "SOURCE_CHANGED", "UNDO_NOT_CONFIRMED"].includes(code) ? code : kind === "seek_failed" ? "SEEK_NOT_CONFIRMED" : kind === "undo_failed" ? "UNDO_NOT_CONFIRMED" : null;
      this.store.set("skip-execution", id, { id, owner: listener.id, episodeKey: key, intervalId, kind, positionMs, code: reason, evaluation: Boolean(this.pipeline.status(feed, episode)?.episode?.ownedFixtureAudioHash), provenance: "client_reported_stage", createdAt: nowIso() });
      return { recorded: true };
    }
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
      diagnostics: skipDiagnostics(this.store, this.pipeline.rights),
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
