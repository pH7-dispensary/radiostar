export function recentFollowedEpisodes(state, now = Date.now()) {
  const seen = new Set();
  return state.following
    .flatMap((show) =>
      (state.feedEpisodes[show.id] || []).map((episode) => ({
        ...episode,
        feedUrl: episode.feedUrl || show.feedUrl,
        showId: show.id,
        showName: show.name,
        artworkUrl: episode.artworkUrl || show.art,
      })),
    )
    .filter((episode) => {
      const key = JSON.stringify([episode.feedUrl, episode.id]),
        time = Date.parse(episode.publishedAt || "");
      if (
        !episode.audioUrl ||
        !Number.isFinite(time) ||
        time > now ||
        seen.has(key)
      )
        return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, 12);
}
export function catalogueCategories(shows) {
  return [
    ...new Set(
      shows
        .map((show) => show.topic?.trim())
        .filter(
          (topic) =>
            topic && !["Podcast", "Podcasts", "Unknown"].includes(topic),
        ),
    ),
  ].slice(0, 10);
}
export function rememberSearch(history, query, enabled) {
  if (!enabled) return [];
  const text = query.trim().slice(0, 240);
  return text.length < 2
    ? history
    : [
        text,
        ...history.filter((item) => item.toLowerCase() !== text.toLowerCase()),
      ].slice(0, 6);
}
