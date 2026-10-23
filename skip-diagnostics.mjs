import { episodeKey } from "./episode-pipeline.mjs";

/** Read-only projection of existing records; absence of analysis is not no ads. */
export function skipDiagnostics(store, rights) {
  const rows = kind => store.all(kind).map(([key, value]) => ({ key, ...value }));
  const jobs = new Map(rows("intelligence").map(row => [row.key, row]));
  const encounters = new Map(rows("intelligence-encounter").map(row => [episodeKey(row.feedUrl, row.episodeId), row]));
  const attention = new Map(rows("intelligence-attention").map(row => [episodeKey(row.feedUrl, row.episodeId), row]));
  const analyses = new Map(rows("skip-analysis").map(row => [row.episodeKey, row]));
  const verification = new Map(rows("skip-audio-verification").map(row => [row.episodeKey, row]));
  const intervals = rows("skip-interval"), events = rows("skip-execution");
  const keys = new Set([...jobs.keys(), ...encounters.keys(), ...analyses.keys(), ...verification.keys(), ...intervals.map(row => row.episodeKey)]);
  return [...keys].map(key => {
    const job = jobs.get(key), encounter = encounters.get(key), analysis = analyses.get(key), verified = verification.get(key);
    const feedUrl = job?.feedUrl || job?.episode?.feedUrl || encounter?.feedUrl || analysis?.feedUrl;
    const episodeId = job?.episodeId || job?.episode?.id || encounter?.episodeId || analysis?.episodeId;
    const candidates = intervals.filter(row => row.episodeKey === key && (!job?.transcript?.audioVariant || (row.sourceVariantKey || row.audioVariant) === job.transcript.audioVariant));
    const receipts = events.filter(row => row.episodeKey === key);
    const safe = candidates.filter(row => row.verificationState === "VERIFIED" && row.boundaryVerified && !row.disputed);
    const decision = feedUrl && episodeId ? rights?.evaluate({ feature: "ad-detection", feedUrl, episodeId }) : null;
    const latestPlayback = analysis?.playback;
    const failures = receipts.filter(row => row.kind === "seek_failed");
    const successes = receipts.filter(row => row.kind === "automatic_skip");
    let code, nextAction;
    if (decision && !decision.allowed) { code = decision.code || "RIGHTS_NOT_ESTABLISHED"; nextAction = "Review the recorded rights assessment and evidence."; }
    else if (!analysis && !candidates.length) { code = ["FAILED", "BLOCKED", "CANCELLED", "BUDGET_PAUSED"].includes(job?.state) ? job.code || "PREPARATION_FAILED" : "NOT_ANALYSED"; nextAction = job?.transcript ? "Open this episode as the authorised tester to inspect cached transcript candidates." : "Resolve episode preparation before inspecting advertisements."; }
    else if (!candidates.length) { code = "NO_ADVERTS_DETECTED"; nextAction = "No candidate found in this transcript; this is not proof of ad-free audio."; }
    else if (!safe.length) { code = verified?.code || (verified?.state === "FAILED" ? "AUDIO_VERIFICATION_FAILED" : "CANDIDATES_UNVERIFIED"); nextAction = verified?.reason || "Review transcript/audio alignment and independent boundary evidence."; if(verified?.retryAfter && Date.parse(verified.retryAfter)>Date.now()) nextAction="A bounded automatic retry is scheduled; normal playback remains available."; }
    else if (failures.length && Date.parse(failures.at(-1).createdAt) > Date.parse(successes.at(-1)?.createdAt || "1970-01-01")) { code = "SEEK_FAILED"; nextAction = "Inspect the recorded failure and retry playback after resolving it."; }
    else if (latestPlayback && latestPlayback.code !== "READY") { code = latestPlayback.code; nextAction = "Check the tester preference, exact source and audio matching status."; }
    else if (successes.length) { code = "SUCCESSFULLY_SKIPPED"; nextAction = "Review Undo and incorrect-skip feedback; client receipts do not establish accuracy."; }
    else { code = "PLAYBACK_NOT_OBSERVED"; nextAction = "Play the verified source and confirm the seek on the target device."; }
    const timeline = [
      encounter?.at && { at: encounter.at, stage: "Episode encountered", code: encounter.source },
      analysis?.at && { at: analysis.at, stage: "Transcript candidates inspected", code: `${analysis.candidateCount} candidates` },
      verified?.updatedAt && { at: verified.updatedAt, stage: "Audio verification", code: verified.code || verified.state },
      analysis?.playbackAt && { at: analysis.playbackAt, stage: "Tester playback check", code: latestPlayback.code },
      ...receipts.map(row => ({ at: row.createdAt, stage: row.kind, code: row.code || row.provenance })),
    ].filter(Boolean).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    return { episodeKey: key, feedUrl, episodeId, title: job?.episode?.title || attention.get(key)?.title || episodeId || "Episode metadata unavailable", podcast: job?.episode?.showName || attention.get(key)?.podcast || null,
      analysis: analysis ? "COMPLETE" : candidates.length ? "LEGACY_EVIDENCE" : "NOT_STARTED", transcriptAvailable: Boolean(job?.transcript?.segments?.length),
      candidates: analysis || candidates.length ? candidates.length : null, verified: safe.length,
      audioMatching: latestPlayback ? latestPlayback.sourceMatched ? "MATCHED" : latestPlayback.matchAttempted ? "MISMATCHED" : "UNKNOWN" : "UNKNOWN",
      automaticSkipping: latestPlayback ? latestPlayback.enabled ? "ENABLED" : "DISABLED" : "UNKNOWN",
      attempts: receipts.filter(row => row.kind === "seek_attempted").length, successes: successes.length, failures: failures.length,
      undos:receipts.filter(row=>row.kind==="undo").length, undoFailures:receipts.filter(row=>row.kind==="undo_failed").length,
      verificationAttempts:verified?.attempts || 0, retryAfter:verified?.retryAfter || null,
      code, nextAction, evaluation: Boolean(job?.episode?.ownedFixtureAudioHash), timeline: timeline.slice(-50),
    };
  });
}
