import type { CatalogueShow } from "./api";
import type { ListenerState, StoredEpisode } from "./listenerState";
export function recentFollowedEpisodes(
  state: ListenerState,
  now?: number,
): StoredEpisode[];
export function catalogueCategories(shows: CatalogueShow[]): string[];
export function rememberSearch(
  history: string[],
  query: string,
  enabled: boolean,
): string[];
