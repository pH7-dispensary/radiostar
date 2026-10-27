export function positionSnapshot<T>(
  source: T,
  positionMs: number,
  speed: number,
  savedAt?: number,
): {
  source: T;
  savedAt: number;
  snapshot: { positionMs: number; speed: number };
};
export function recoveredSleepPosition(
  stored: {
    source: { feedUrl?: string; episodeId: string; url: string };
    savedAt?: number;
    snapshot: { positionMs: number };
  },
  sleep: unknown,
): number;
