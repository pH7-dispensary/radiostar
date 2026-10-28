import { prepareAudio, transcribeOnDemand } from './transcription.mjs';
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
export async function prepareAdSkipOpening({ feedUrl, episodeId, audioUrl, ledger, store, client, authorised, audioFactory = prepareAudio, transcribe = transcribeOnDemand }) {
  const check = () => { if (!authorised() || !ledger.controls.enabled) throw Error('Audio preparation is not authorised.'); };
  check();
  ledger.refresh();
  const totals = ledger.totals(), windowSeconds = 180;
  if (totals.day + windowSeconds * .0001 > ledger.controls.dailyUsd || totals.month + windowSeconds * .0001 > ledger.controls.monthlyUsd || totals.transcriptionSeconds + windowSeconds > ledger.controls.dailyTranscriptionSeconds) throw Error('The intelligence budget has been reached.');
  const audio = await audioFactory(audioUrl, ledger.controls.maxEpisodeSeconds);
  try {
    check();
    if (!(audio.durationMs > 0) || audio.durationMs > ledger.controls.maxEpisodeSeconds * 1000 || !/^[a-f0-9]{64}$/.test(audio.contentHash || '')) throw Error('Exact source exceeds processing limits or has no hash.');
    const coverageEndMs = Math.min(windowSeconds * 1000, audio.durationMs);
    const reused=store.all('skip-source').map(([,row])=>row).find(row=>row.state==='READY' && row.transcript?.audioContentHash===audio.contentHash && row.transcript.coverageStartMs===0 && row.transcript.coverageEndMs>=coverageEndMs);
    if(reused)return {preparedAudio:audio,transcript:{...reused.transcript,episodeId},cacheReused:true};
    const acquired = await transcribe({ episodeId, audioUrl, durationMs: coverageEndMs, chunkFactory: audio.chunkFactory, client, ledger,
      requestId: `ad-opening:${audio.contentHash}`, checkpointStore: store, checkpointPrefix: `${episodeKey(feedUrl,episodeId)}:ad-opening:${audio.contentHash}`,
      authorised: true, beforePaid: check, canPersist: () => authorised(), model: ledger.controls.transcriptionModel });
    check();
    return { preparedAudio: audio, transcript: { ...acquired, audioContentHash: audio.contentHash, audioVariant: audio.contentHash,
      durationMs: audio.durationMs, coverageStartMs: 0, coverageEndMs, complete: coverageEndMs === audio.durationMs,
      provenance: { sourceType: 'on_demand_audio', sourceUri: audioUrl, audioContentHash: audio.contentHash, scope: 'opening_only' } } };
  } catch (error) { await audio.cleanup(); throw error; }
}
