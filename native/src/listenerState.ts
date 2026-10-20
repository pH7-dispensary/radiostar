import { readLocalDocument, writeLocalDocument } from "./localStorage";
import type { CatalogueEpisode, CatalogueShow } from "./api";

const KEY = "star-cast-listener-state-v1";
export type StoredEpisode = CatalogueEpisode & {
  showId: string;
  showName: string;
  feedUrl?: string;
  artworkUrl?: string;
  playedAt?: number;
  positionMs?: number;
  playCount?: number;
  listenedMs?: number;
};
export type FollowPreparation = {
  state: "READY" | "PARTIAL_READY" | "QUEUED" | "PROCESSING" | "UNAVAILABLE" | "BLOCKED" | "DISABLED" | "FAILED";
  code?: string;
  reason?: string;
};
export type ListenerState = {
  following: CatalogueShow[];
  saved: StoredEpisode[];
  history: StoredEpisode[];
  historyEnabled: boolean;
  recentSearches?: string[];
  feedEpisodes: Record<string, StoredEpisode[]>;
  followIntelligence: Record<string, FollowPreparation>;
  nightMode: boolean;
  onboardingComplete: boolean;
  intelligenceEnabled: boolean;
  intelligencePreferenceVersion?: number;
  moments: StoredEpisode[];
};
export const emptyListenerState = (): ListenerState => ({
  following: [],
  saved: [],
  history: [],
  historyEnabled: true,
  recentSearches: [],
  feedEpisodes: {},
  followIntelligence: {},
  // Light is the intentional first-run appearance. A persisted boolean remains
  // an explicit listener choice and is never replaced with the device scheme.
  nightMode: false,
  onboardingComplete: false,
  intelligenceEnabled: true,
  intelligencePreferenceVersion: 2,
  moments: [],
});
export async function loadListenerState(): Promise<ListenerState> {
  try {
    let raw = await readLocalDocument(KEY);
    if (!raw) return emptyListenerState();
    let value = JSON.parse(raw);
    return {
      ...emptyListenerState(),
      ...value,
      following: Array.isArray(value.following) ? value.following : [],
      saved: Array.isArray(value.saved) ? value.saved : [],
      history: Array.isArray(value.history) ? value.history : [],
      recentSearches: value.historyEnabled !== false && Array.isArray(value.recentSearches) ? value.recentSearches.filter((item: unknown) => typeof item === "string").slice(0, 6) : [],
      moments: Array.isArray(value.moments) ? value.moments : [],
      feedEpisodes:
        value.feedEpisodes && typeof value.feedEpisodes === "object"
          ? value.feedEpisodes
          : {},
      followIntelligence:
        value.followIntelligence && typeof value.followIntelligence === "object"
          ? value.followIntelligence
          : {},
      onboardingComplete: value.onboardingComplete === true,
      // v1 false meant "not activated", not an explicit opt-out. Migrate once.
      intelligenceEnabled:
        value.intelligencePreferenceVersion === 2
          ? value.intelligenceEnabled !== false
          : true,
      intelligencePreferenceVersion: 2,
    };
  } catch {
    return emptyListenerState();
  }
}
export async function saveListenerState(value: ListenerState) {
  await writeLocalDocument(KEY, JSON.stringify(value));
}
export function toggleById<T extends { id: string }>(items: T[], item: T) {
  return items.some((x) => x.id === item.id)
    ? items.filter((x) => x.id !== item.id)
    : [item, ...items];
}
export function recordHistory(
  history: StoredEpisode[],
  episode: StoredEpisode,
) {
  return [
    {
      ...episode,
      positionMs: undefined,
      listenedMs:
        episode.positionMs ??
        history.find((x) => x.id === episode.id)?.listenedMs,
      playedAt: Date.now(),
      playCount: (history.find((x) => x.id === episode.id)?.playCount || 0) + 1,
    },
    ...history.filter((x) => x.id !== episode.id),
  ].slice(0, 100);
}
