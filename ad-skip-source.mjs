import { transcribeOnDemand } from './transcription.mjs';
import { prepareAdAudioWindow, AD_WINDOW_SECONDS } from './bounded-audio.mjs';
import { episodeKey } from './episode-pipeline.mjs';
import {S3Client,GetObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';

// A reviewed dynamic-insertion variant may no longer be served by the RSS
// URL. Deliver the SAME preserved private bytes through the existing native
// If-Match/range verifier, rather than transferring its timestamps to new ads.
let sourceClient;
export async function signedAdSkipVariant(variant, {bucket,sign=getSignedUrl,client}={}) {
  if(!variant?.privateCache)return variant;
  const {privateCache,...publicVariant}=variant;
  if(!bucket || privateCache.bucket!==bucket || !/^[a-f0-9]{64}$/.test(variant.audioVariantFingerprint || '') || !new RegExp('^seed/ad-skip-[a-z0-9-]+/'+variant.audioVariantFingerprint+'\\.mp3$').test(privateCache.key) || !/^"[^"\r\n]+"$/.test(variant.etag || '') || !variant.windows?.length)throw Error('Verified private source delivery is unavailable.');
  const deliveryUrl=await sign(client || (sourceClient ||= new S3Client({region:'eu-west-2'})),new GetObjectCommand({Bucket:bucket,Key:privateCache.key}),{expiresIn:7200});
  return {...publicVariant,deliveryUrl};
}

// Publisher transcripts commonly omit inserted pre-rolls. Acquire only the
// bounded opening when no source-aligned transcript exists. This is private
// detector input, never a replacement for the canonical episode transcript.
export async function prepareAdSkipOpening({ feedUrl, episodeId, audioUrl, ledger, store, client, authorised, audioFactory = prepareAdAudioWindow, transcribe = transcribeOnDemand }) {
  const check = () => { if (!authorised()) throw Error('Audio preparation is not authorised.'); };
  check();
  ledger.refresh();
  const windowSeconds = AD_WINDOW_SECONDS;
  const audio = await audioFactory(audioUrl, { windowSeconds });
  try {
    check();
    if (!(audio.durationMs > 0) || !/^[a-f0-9]{64}$/.test(audio.contentHash || '')) throw Error('Acquired audio has no duration or content hash.');
    const coverageEndMs = Math.min(windowSeconds * 1000, audio.windowProof?.coverageEndMs ?? audio.durationMs);
    const cached = store.get('skip-window-transcript', audio.contentHash);
    const reused=cached?.transcript ? cached : store.all('skip-source').map(([,row])=>row).find(row=>row.state==='READY' && row.transcript?.audioContentHash===audio.contentHash && row.transcript.coverageStartMs===0 && row.transcript.coverageEndMs>=coverageEndMs);
    const remember = transcript => {
      const key=episodeKey(feedUrl,episodeId), origins=[...new Set([...(cached?.origins || []),key])];
      store.set('skip-window-transcript',audio.contentHash,{transcript,origins,lastUsedAt:new Date().toISOString()});
    };
    if(reused && reused.transcript.coverageEndMs>=coverageEndMs){if(audio.windowProof)remember(reused.transcript);return {preparedAudio:audio,transcript:{...reused.transcript,episodeId},cacheReused:true};}
    // Reuse before budgeting. The existing transcription adapter reserves each
    // chunk atomically, including concurrent workers and uncertain outcomes.
    const totals = ledger.totals(), seconds = Math.ceil(coverageEndMs / 1000);
    if (!ledger.controls.enabled || totals.day + seconds * .0001 > ledger.controls.dailyUsd || totals.month + seconds * .0001 > ledger.controls.monthlyUsd || totals.transcriptionSeconds + seconds > ledger.controls.dailyTranscriptionSeconds) throw Error('The intelligence budget has been reached.');
    const acquired = await transcribe({ episodeId, audioUrl, durationMs: coverageEndMs, chunkFactory: audio.chunkFactory, client, ledger,
      requestId: `ad-opening:${audio.contentHash}`, checkpointStore: store, checkpointPrefix: `${episodeKey(feedUrl,episodeId)}:ad-opening:${audio.contentHash}`,
      authorised: true, beforePaid: check, canPersist: () => authorised(), model: ledger.controls.transcriptionModel });
    check();
    const transcript = { ...acquired, audioContentHash: audio.contentHash, audioVariant: audio.contentHash,
      durationMs: audio.durationMs, coverageStartMs: 0, coverageEndMs, complete: audio.completeSource === true, windowProof: audio.windowProof || null,
      provenance: { sourceType: 'on_demand_audio', sourceUri: audioUrl, audioContentHash: audio.contentHash, scope: 'opening_only' } };
    if (audio.windowProof) remember(transcript);
    return {preparedAudio:audio,transcript};
  } catch (error) { await audio.cleanup(); throw error; }
}
