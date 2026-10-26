/** Availability, not the toggle alone, determines whether skipping is ready. */
export function adSkipStatusText(status, enabled, error = '') {
  if (error) return error;
  if (!status || ['NOT_ANALYSED','ANALYSING'].includes(status.state)) return 'Checking this episode';
  if (status.state === 'VERIFYING') return 'Verifying boundaries';
  if (status.state === 'NO_ADVERTS_DETECTED') return 'No adverts detected after analysis';
  if (status.state === 'FAILED') return 'Advert checks failed. Playback is unaffected.';
  if (['AUDIO_VARIANT_CHANGED','AUDIO_WITNESS_MISMATCH','VARIANT_MISMATCH','AUDIO_MATCH_FAILED','AUDIO_PRECONDITION_UNSUPPORTED','BOUNDED_PROOF_UNAVAILABLE'].includes(status.code)) return 'Audio variant unavailable · normal playback continues';
  if (status.state === 'UNAVAILABLE') return status.reason || 'No verified adverts yet';
  if (status.verifiedCount) {
    if (!enabled) return 'Verified adverts available · Ad Skip is off';
    if (status.automaticSkipping) return 'Ad Skip ready';
    return status.pilotEnabled ? 'Audio matching needed · normal playback continues' : 'Internal pilot only';
  }
  if (status.state === 'CANDIDATES_FOUND') return 'Adverts detected · awaiting verification';
  return 'No verified adverts yet';
}
