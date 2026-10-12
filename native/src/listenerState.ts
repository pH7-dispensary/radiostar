import * as SecureStore from "expo-secure-store";
import type { CatalogueEpisode, CatalogueShow } from "./api";

const KEY = "star-cast-listener-state-v1";
export type StoredEpisode = CatalogueEpisode & {
  showId: string;
  showName: string;
  artworkUrl?: string;
  playedAt?: number;
  positionMs?: number;
};
export type ListenerState = {
  following: CatalogueShow[];
  saved: StoredEpisode[];
  history: StoredEpisode[];
  feedEpisodes: Record<string, StoredEpisode[]>;
  nightMode: boolean;
  onboardingComplete: boolean;
};
export const emptyListenerState = (): ListenerState => ({
  following: [],
  saved: [],
  history: [],
  feedEpisodes: {},
  nightMode: true,
  onboardingComplete: false,
});
export async function loadListenerState(): Promise<ListenerState> {
  try {
    let raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return emptyListenerState();
    let value = JSON.parse(raw);
    return {
      ...emptyListenerState(),
      ...value,
      following: Array.isArray(value.following) ? value.following : [],
      saved: Array.isArray(value.saved) ? value.saved : [],
      history: Array.isArray(value.history) ? value.history : [],
      feedEpisodes:
        value.feedEpisodes && typeof value.feedEpisodes === "object"
          ? value.feedEpisodes
          : {},
      onboardingComplete: value.onboardingComplete === true,
    };
  } catch {
    return emptyListenerState();
  }
}
export async function saveListenerState(value: ListenerState) {
  await SecureStore.setItemAsync(KEY, JSON.stringify(value));
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
    { ...episode, playedAt: Date.now() },
    ...history.filter((x) => x.id !== episode.id),
  ].slice(0, 100);
}
