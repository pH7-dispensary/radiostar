export type CatalogueShow = {
  id: string;
  name: string;
  publisher: string;
  topic: string;
  art?: string;
  feedUrl?: string;
};
export type CatalogueEpisode = {
  id: string;
  title: string;
  publishedAt?: string;
  duration?: string;
  description?: string;
  audioUrl: string;
  hasPublisherTranscript?: boolean;
};
export type IntelligenceStatus = {
  state:
    | "NOT_REQUESTED"
    | "TRANSCRIPT_READY"
    | "READY"
    | "UNAVAILABLE"
    | "FAILED";
  readiness?: "FULLY_READY" | "TEXT_ONLY" | "PARTIAL" | "UNUSABLE";
  reason?: string;
  brief?: { overview: string; themes: string[]; detail: string };
  chapters?: Array<{
    title: string;
    description: string;
    startMs: number;
    endMs: number;
    sourceSegmentIds: string[];
  }>;
  provenance?: { sourceType: string; originalFormat: string; language: string };
  paid?: { configured: boolean; enabled: boolean };
};
export type EpisodeMoment = {
  rank: number;
  label: string;
  segmentId: string;
  startMs: number;
  endMs: number;
  context: string;
};
const base = () =>
  process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";
const developmentIntelligenceToken =
  process.env.EXPO_PUBLIC_DEV_INTELLIGENCE_TOKEN || "";
async function request(path: string, init?: RequestInit) {
  let origin = base();
  if (!origin)
    throw Error(
      "Set EXPO_PUBLIC_API_BASE_URL to your Star Cast server LAN address (not localhost).",
    );
  let response = await fetch(`${origin}${path}`, init),
    body = await response.json();
  if (!response.ok)
    throw Error(body.error || "Star Cast is temporarily unavailable.");
  return body;
}
export async function searchCatalogue(
  query: string,
): Promise<{ provider: string; results: CatalogueShow[] }> {
  return request(`/api/catalogue/search?q=${encodeURIComponent(query)}`);
}
export async function loadFeed(
  feedUrl: string,
): Promise<{
  title: string;
  publisher: string;
  art?: string;
  episodes: CatalogueEpisode[];
}> {
  return request(`/api/catalogue/feed?url=${encodeURIComponent(feedUrl)}`).then(
    (x) => x.feed,
  );
}
export async function loadIntelligenceStatus(
  feedUrl: string,
  episodeId: string,
): Promise<IntelligenceStatus> {
  return request(
    `/api/intelligence/status?feedUrl=${encodeURIComponent(feedUrl)}&episodeId=${encodeURIComponent(episodeId)}`,
  ).then((x) => x.status);
}
function developmentHeaders() {
  if (!developmentIntelligenceToken)
    throw Error(
      "Episode analysis is available only in this configured local development build.",
    );
  return {
    "content-type": "application/json",
    "x-star-cast-dev-token": developmentIntelligenceToken,
  };
}
export async function requestEpisodeIntelligence(
  feedUrl: string,
  episodeId: string,
  capability: "brief" | "chapters" | "moment" = "brief",
): Promise<IntelligenceStatus> {
  return request("/api/intelligence/request", {
    method: "POST",
    headers: developmentHeaders(),
    body: JSON.stringify({ feedUrl, episodeId, capability }),
  }).then((x) => x.status);
}
export async function findEpisodeMoment(
  feedUrl: string,
  episodeId: string,
  query: string,
): Promise<{ status: IntelligenceStatus; moments: EpisodeMoment[] }> {
  return request("/api/intelligence/moment", {
    method: "POST",
    headers: developmentHeaders(),
    body: JSON.stringify({ feedUrl, episodeId, query }),
  });
}
