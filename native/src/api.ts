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
    | "QUEUED"
    | "PROCESSING"
    | "PARTIAL_READY"
    | "BLOCKED"
    | "DISCOVERING"
    | "TRANSCRIBING"
    | "UNDERSTANDING"
    | "ORGANISING"
    | "TRANSCRIPT_READY"
    | "READY"
    | "UNAVAILABLE"
    | "FAILED";
  readiness?: "FULLY_READY" | "TEXT_ONLY" | "PARTIAL" | "UNUSABLE";
  processing?: boolean;
  transcriptAvailable?: boolean;
  qualityNote?: string;
  jobId?: string;
  deadlineAt?: string;
  reason?: string;
  code?: string;
  retryable?: boolean;
  requiresAudioConsent?: boolean;
  cacheHit?: boolean;
  brief?: {
    overview: string;
    themes: string[];
    detail: string;
    mode?: "extractive";
  };
  chapters?: Array<{
    title: string;
    description: string;
    startMs: number;
    endMs: number;
    sourceSegmentIds: string[];
  }>;
  provenance?: {
    sourceType: string;
    sourceUri: string;
    originalFormat: string;
    language: string;
    transcriptVersion: string;
  };
  paid?: { configured: boolean; enabled: boolean };
};
export type EpisodeMoment = {
  relatedChapters?: Array<{ title: string; startMs: number; endMs: number }>;
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
export async function request(path: string, init?: RequestInit) {
  let origin = base();
  if (!origin)
    throw Error(
      "Connect this device to your Star Cast listening server to continue.",
    );
  const headers = new Headers(init?.headers);
  if (developmentIntelligenceToken && !headers.has("x-star-cast-dev-token"))
    headers.set("x-star-cast-dev-token", developmentIntelligenceToken);
  let response = await fetch(`${origin}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(20_000),
    }),
    body = await response.json();
  if (!response.ok)
    throw Object.assign(
      Error(body.error || "Star Cast is temporarily unavailable."),
      { userFacing: true },
    );
  return body;
}
export async function searchCatalogue(
  query: string,
): Promise<{ provider: string; results: CatalogueShow[] }> {
  return request(`/api/catalogue/search?q=${encodeURIComponent(query)}`);
}
export async function loadFeed(feedUrl: string): Promise<{
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
    { headers: developmentHeaders() },
  ).then((x) => x.status);
}
export function developmentHeaders() {
  if (!developmentIntelligenceToken)
    throw Error("Episode analysis is not available on this device yet.");
  return {
    "content-type": "application/json",
    "x-star-cast-dev-token": developmentIntelligenceToken,
  };
}
export async function requestEpisodeIntelligence(
  feedUrl: string,
  episodeId: string,
  capability: "brief" | "chapters" | "moment" = "brief",
  options: {
    allowAudio?: boolean;
    retry?: boolean;
    trigger?: "automatic" | "manual";
  } = {},
): Promise<IntelligenceStatus> {
  return request("/api/intelligence/request", {
    method: "POST",
    headers: developmentHeaders(),
    body: JSON.stringify({ feedUrl, episodeId, capability, ...options }),
  }).then((x) => x.status);
}

export const isProcessing = (status: IntelligenceStatus | null) =>
  !!status &&
  status.processing !== false &&
  [
    "QUEUED",
    "PROCESSING",
    "PARTIAL_READY",
    "DISCOVERING",
    "TRANSCRIBING",
    "UNDERSTANDING",
    "ORGANISING",
  ].includes(status.state);
const processingLabels: Record<string, string> = {
  QUEUED: "Waiting to analyse",
  DISCOVERING: "Finding a transcript",
  TRANSCRIBING: "Transcribing the audio",
  UNDERSTANDING: "Understanding the conversation",
  ORGANISING: "Organising chapters",
  READY: "Ready to explore",
};
export const processingLabel = (status: IntelligenceStatus | null) =>
  processingLabels[status?.state || ""] ||
  status?.reason ||
  "Discover this episode";
export type AnalysisPreflight = {
  hasPublisherTranscript: boolean;
  durationMs: number | null;
  withinLimit: boolean;
  audioEnabled: boolean;
  analysisEnabled: boolean;
  requiresAudioConsent: boolean;
  estimatedAudioCost: number | null;
};
export async function preflightEpisode(
  feedUrl: string,
  episodeId: string,
): Promise<AnalysisPreflight> {
  return request("/api/intelligence/preflight", {
    method: "POST",
    headers: developmentHeaders(),
    body: JSON.stringify({ feedUrl, episodeId }),
  });
}
export type ConversationMatch = EpisodeMoment & {
  speaker?: string;
  episode: CatalogueEpisode & {
    feedUrl: string;
    showName: string;
    artworkUrl?: string;
  };
  provenance: NonNullable<IntelligenceStatus["provenance"]>;
};
export type ConversationResults = {
  query: string;
  coverage: {
    processedEpisodes: number;
    matchedEpisodes: number;
    scope: string;
  };
  synthesis: string;
  synthesisType: string;
  matches: ConversationMatch[];
  followUps: string[];
};
export async function searchConversations(
  query: string,
  feedUrls?: string[],
  mode = "Conversations",
): Promise<ConversationResults> {
  return request("/api/search/conversations", {
    method: "POST",
    headers: developmentHeaders(),
    body: JSON.stringify({ query, feedUrls, mode }),
  });
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
export type TranscriptPage = {
  segments: Array<{
    id: string;
    text: string;
    speaker?: string;
    startMs: number | null;
    endMs: number | null;
  }>;
  nextOffset: number | null;
  total: number;
};
export async function loadEpisodeTranscript(
  feedUrl: string,
  episodeId: string,
  offset = 0,
  query = "",
): Promise<TranscriptPage> {
  return request("/api/intelligence/transcript", {
    method: "POST",
    headers: developmentHeaders(),
    body: JSON.stringify({ feedUrl, episodeId, offset, query }),
  });
}
export const episodeIntelligenceApi = {
  status: loadIntelligenceStatus,
  request: (
    feed: string,
    id: string,
    options: {
      allowAudio?: boolean;
      retry?: boolean;
      trigger?: "automatic" | "manual";
    },
  ) => requestEpisodeIntelligence(feed, id, "brief", options),
};
