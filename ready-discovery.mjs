import { publicUrl } from "./safe-network.mjs";

// A view over the existing canonical cache, never an acquisition/paid-work path.
// Re-evaluate delivery permissions on every request so revocations take effect.
export function readyDiscovery({ store, status, limit = 12 }) {
  const seen = new Set(), episodes = [];
  const candidates = store.all("intelligence").map(([, job]) => job)
    .filter(job => ["READY", "PARTIAL_READY"].includes(job.state) && job.episode &&
      publicUrl(job.feedUrl) && publicUrl(job.episode.audioUrl) &&
      !job.episode.ownedFixtureAudioHash && !new URL(job.feedUrl).pathname.startsWith("/fixtures/"))
    .sort((a, b) => (Date.parse(b.episode.publishedAt) || 0) - (Date.parse(a.episode.publishedAt) || 0));
  for (const job of candidates) {
    const identity = JSON.stringify([job.feedUrl, job.episodeId]);
    if (seen.has(identity)) continue;
    seen.add(identity);
    const current = status(job.feedUrl, job.episodeId);
    if (!["READY", "PARTIAL_READY"].includes(current.state) ||
        !Object.values(current.availableFeatures || {}).some(Boolean)) continue;
    const episode = job.episode;
    episodes.push({
      id: job.episodeId, feedUrl: job.feedUrl, title: episode.title,
      showName: episode.showName, publisher: episode.publisher,
      artworkUrl: publicUrl(episode.artworkUrl) ? episode.artworkUrl : undefined,
      audioUrl: episode.audioUrl, publishedAt: episode.publishedAt, duration: episode.duration,
      availableFeatures: current.availableFeatures,
    });
    if (episodes.length >= Math.max(1, Math.min(24, limit))) break;
  }
  return { episodes, coverage: "Authorised episodes with available cached intelligence", generatedAt: new Date().toISOString() };
}
