const stages = new Set(["CHECKING", "QUEUED", "ACQUIRING_TRANSCRIPT", "PREPARING_AUDIO", "TRANSCRIBING", "ANALYSING", "INDEXING"]);
const aliases = { DISCOVERING: "CHECKING", UNDERSTANDING: "ANALYSING", ORGANISING: "INDEXING", PROCESSING: "CHECKING", PARTIAL_READY: "ANALYSING" };
const labels = {
  READY: "Your conversation is ready.",
  PARTIAL_READY: "Some insights are ready.",
  CHECKING: "Checking this conversation.",
  QUEUED: "Your episode is getting ready.",
  ACQUIRING_TRANSCRIPT: "Preparing the conversation.",
  PREPARING_AUDIO: "Preparing the conversation.",
  TRANSCRIBING: "Preparing the conversation.",
  ANALYSING: "Finding the interesting moments.",
  INDEXING: "Making everything searchable.",
  UNAVAILABLE: "AI insights aren't available for this episode.",
  REVIEW_REQUIRED: "This conversation needs a rights review.",
  FAILED: "Preparation was interrupted.",
  BUDGET_PAUSED: "Preparation is temporarily paused.",
  NOT_REQUESTED: "This conversation hasn't been prepared.",
  WAITING: "Waiting for a status update.",
  DISABLED: "Episode intelligence is off.",
};
const explanations = {
  DURATION_LIMIT: "This episode exceeds the current audio transcription limit. An authorised publisher transcript can still support insights.",
  TRANSCRIPT_UNAVAILABLE: "We couldn't find a usable transcript for this episode.",
  AUDIO_CONSENT_REQUIRED: "No usable transcript was found. Audio preparation needs separate approval.",
  AUDIO_DISABLED: "No usable transcript was found and audio preparation is currently unavailable.",
  AUDIO_TRANSCRIPTION_NOT_AUTHORISED: "Audio transcription isn't authorised for this episode.",
  DURATION_UNKNOWN: "The episode's audio duration is unknown, so audio preparation cannot start safely.",
  TRANSCRIPT_TOO_LARGE: "The available transcript exceeds the current analysis limit.",
  LEGAL_BASIS_NOT_ESTABLISHED: "A suitable basis for preparing and displaying AI insights hasn't been established. You can keep listening.",
  RIGHTS_RESTRICTED: "The current rights assessment doesn't allow these insights. You can keep listening.",
  PUBLISHER_RESTRICTION: "The publisher has restricted this use. You can keep listening.",
  RIGHTS_RESERVED: "A recorded rights reservation prevents this use.",
  FEATURE_NOT_AUTHORISED: "The current assessment doesn't authorise this feature.",
  TAKEDOWN: "These insights are unavailable following a removal request.",
  DISPUTED: "These insights are paused while a rights dispute is reviewed.",
  BUDGET_LIMIT: "The preparation allowance has been reached. Check again when capacity is available; your podcast keeps playing.",
  PROCESSING_TIMEOUT: "Preparation didn't finish within its time limit.",
  TIMEOUT: "Preparation didn't finish within its time limit.",
  QUEUE_TIMEOUT: "Preparation couldn't begin within its waiting limit.",
  PROVIDER_TIMEOUT: "The AI service didn't respond in time.",
  PROVIDER_FAILURE: "The AI service is temporarily unavailable.",
  PROVIDER_UNAVAILABLE: "The AI service is temporarily unavailable.",
  SOURCE_VALIDATION_FAILED: "The available source couldn't be validated reliably.",
  FEATURE_DISABLED: "This feature is currently disabled.",
  TESTING_EXPIRED: "Internal testing has ended or been disabled. Previously prepared insights remain available where authorised.",
  PROVIDER_OUTCOME_UNKNOWN: "A processing request needs an administrator's review before it can safely continue. Your podcast keeps playing.",
};

export function intelligencePresentation(status, { enabled = true, error = "", paused = false, sourceAvailable = true, now = Date.now() } = {}) {
  if (!sourceAvailable) return { state: "UNAVAILABLE", label: labels.UNAVAILABLE,
    explanation: "Open this episode from its podcast so Radio Star can check the publisher source.",
    processing: false, eta: null, action: null, ready: false };
  const code = status?.code || status?.availabilityCode;
  const completed = status?.state === "READY" || (status?.state === "PARTIAL_READY" && status?.processing === false);
  const stage = status?.processingStage || aliases[status?.state] || status?.state;
  const active = !!status && !completed && status.processing !== false && stages.has(stage) && !["UNAVAILABLE", "BLOCKED", "FAILED", "CANCELLED", "BUDGET_PAUSED"].includes(status.state);
  let state = completed ? status.state : active ? stage : status?.state || "WAITING";
  if (["UNAVAILABLE", "BLOCKED", "CANCELLED", "TRANSCRIPT_READY"].includes(state)) state = "UNAVAILABLE";
  if (code === "BUDGET_LIMIT") state = "BUDGET_PAUSED";
  if (status?.availabilityState === "REVIEW_REQUIRED") state = "REVIEW_REQUIRED";
  if (!enabled && !completed) state = "DISABLED";
  else if ((error || paused) && !completed) state = "WAITING";
  const processing = active && enabled && !error && !paused;
  const estimate = status?.estimatedCompletion;
  const age = now - Date.parse(estimate?.updatedAt || "");
  const validEta = processing && state !== "QUEUED" && estimate?.sampleCount >= 3 &&
    ["medium", "high"].includes(estimate?.confidence) && age >= 0 && age < 90_000 &&
    Number.isFinite(estimate.minimumMs) && Number.isFinite(estimate.maximumMs) &&
    estimate.minimumMs >= 0 && estimate.maximumMs > 0 && estimate.maximumMs >= estimate.minimumMs;
  const eta = validEta
    ? `Usually ready in ${Math.max(1, Math.ceil(estimate.minimumMs / 60_000))}–${Math.max(1, Math.ceil(estimate.maximumMs / 60_000))} minutes.`
    : null;
  let explanation = explanations[code] || "AI insights aren't currently available for this episode. You can keep listening.";
  if (state === "READY") explanation = "Your brief, chapters and available moments are ready to explore.";
  if (state === "PARTIAL_READY") explanation = status.qualityNote || "Use the available insights below. Some features are not ready.";
  else if (state === "DISABLED") explanation = "Turn on intelligence to prepare eligible conversations while you listen.";
  else if (state === "WAITING") explanation = error === "Your listening-service session needs to be restored." || error === "The listening service is temporarily unavailable. Your audio is unaffected."
    ? error
    : error ? "We couldn't update the preparation status. Your audio is unaffected. Check the connection and try again." : paused ? "Live updates are paused. Check the latest status to see whether preparation has finished." : "The listening service hasn't returned an episode status yet.";
  else if (state === "NOT_REQUESTED") explanation = "Preparation hasn't started. Radio Star can check whether this conversation is eligible.";
  else if (processing) explanation = state === "QUEUED" ? "Waiting to begin preparation." : "Your podcast keeps playing while intelligence is prepared.";
  const action = state === "DISABLED" ? "enable"
    : state === "WAITING" ? "refresh"
    : state === "NOT_REQUESTED" ? "prepare"
    : state === "FAILED" && (status?.retryEligible === true || status?.retryable === true) ? "retry"
    : state === "UNAVAILABLE" && status?.requiresAudioConsent && ["AUDIO_CONSENT_REQUIRED", "TRANSCRIPT_UNAVAILABLE"].includes(code) ? "audio"
    : state === "BUDGET_PAUSED" ? "refresh" : null;
  const work = status?.work;
  const count = (done, total, name) => Number.isInteger(done) && Number.isInteger(total) && done >= 0 && total > 0 && done <= total ? `${done} of ${total} ${name} complete.` : null;
  const progress = processing ? state === "TRANSCRIBING" ? count(work?.completedChunks, work?.totalChunks, "audio chunks") : state === "ANALYSING" ? count(work?.completedBatches, work?.totalBatches, "analysis batches") : null : null;
  return { state, label: labels[state] || labels.UNAVAILABLE, explanation, processing, eta, progress, action, ready: completed && state === "READY" };
}
// Completed features remain usable while independent stages fail or recover.
export function intelligenceCapabilities(status) {
  const permitted=name=>status?.availableFeatures?.[name]!==false;
  const brief=Boolean(status?.brief && permitted("brief"));
  const moments=Boolean(permitted("moments") && (status?.availableFeatures?.moments===true || status?.state==="READY"&&status?.transcriptAvailable));
  const explore=Boolean(moments || permitted("chapters")&&status?.chapters?.length || permitted("topics")&&status?.topics?.length);
  return {brief,explore,moments};
}
