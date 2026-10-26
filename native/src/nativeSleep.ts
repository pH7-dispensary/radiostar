import { requireOptionalNativeModule } from 'expo';
import type { AudioPlayer } from 'expo-audio';
import type { Source } from './PlaybackProvider';
export type SleepRecord = {id: string; sourceKey: string; sourceJSON: string; kind: string; state: string; deadlineAt: number; fadeMs: number; positionMs?: number; recoveryMs?: number; completedAt?: number; reason?: string};
export type SleepDriver = { available: boolean; arm(id: string, kind: string, deadlineAt: number, fadeMs: number): Promise<SleepRecord>; extend(id: string, extraMs: number): Promise<SleepRecord>; cancel(id?: string): Promise<SleepRecord | null>; state(): Promise<SleepRecord | null> };
const native = requireOptionalNativeModule('RadioStarSleep');
let privacyEpoch = 0;
export const nativeSleepAvailable = Boolean(native);
export function createSleepDriver(player: AudioPlayer, currentSource: () => Source | null): SleepDriver {
  const epoch = privacyEpoch;
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {const next = tail.then(fn,fn); tail = next.catch(() => {}); return next;};
  return {
    available: nativeSleepAvailable,
    arm(id,kind,deadlineAt,fadeMs) {
      const source = currentSource();
      if (!native || !source) return Promise.reject(Error('Native sleep deadlines require the next native build. Keep this build open for foreground sleep.'));
      return serial(async () => {
        if (epoch !== privacyEpoch || currentSource() !== source) throw Error('Playback source changed before sleep could start.');
        const remaining = kind === 'end' ? (player.duration-player.currentTime)*1000/Math.max(.1,player.playbackRate) : deadlineAt-Date.now();
        return JSON.parse(await native.arm(player,id,JSON.stringify([source.feedUrl||'',source.episodeId,source.url]),JSON.stringify(source),kind,remaining,fadeMs));
      });
    },
    extend: (id,extraMs) => serial(async () => { if(!native || epoch !== privacyEpoch) throw Error("Native sleep unavailable"); return JSON.parse(await native.extend(id,extraMs)); }),
    cancel: id => serial(async () => native ? JSON.parse(await native.cancel(id ?? null)) : null),
    state: () => serial(async () => native && epoch === privacyEpoch ? JSON.parse(await native.state()) : null),
  };
}

export async function readNativeSleepRecord(): Promise<SleepRecord | null> { return native ? JSON.parse(await native.state()) : null; }
export async function clearNativeSleepRecord() { privacyEpoch++; if(native) await native.clear(); }
