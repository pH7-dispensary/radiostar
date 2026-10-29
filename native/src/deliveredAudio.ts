import { requireOptionalNativeModule } from 'expo';
import type { AudioPlayer } from 'expo-audio';
import type { Source } from './PlaybackProvider';
import type { SkipStatus } from './listenerApi';
import { localPrivacyState } from './localStorage';
import { matchDeliveredPrefix } from './deliveredAudioProof.mjs';

const native = requireOptionalNativeModule('RadioStarSleep');
const key = (source: Source) => JSON.stringify([source.feedUrl || '', source.episodeId, source.url]);
export async function replaceWithDeliveredAudio(player: AudioPlayer, source: Source): Promise<boolean> {
  if (localPrivacyState().paused || typeof native?.replaceWithDeliveredAudio !== 'function') return false;
  try { return await native.replaceWithDeliveredAudio(player, source.url, key(source)); } catch { return false; }
}
export async function matchActiveAudio(player: AudioPlayer, source: Source, variant: NonNullable<SkipStatus['variant']>, current: () => boolean): Promise<string | null> {
  const privacy = localPrivacyState();
  if (privacy.paused || typeof native?.matchDeliveredAudio !== 'function') return null;
  return matchDeliveredPrefix(variant, {
    match: (bytes: number, hash: string) => native.matchDeliveredAudio(player, key(source), bytes, hash),
    current: () => current() && !localPrivacyState().paused && localPrivacyState().revision === privacy.revision,
  });
}
