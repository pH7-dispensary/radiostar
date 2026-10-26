import { setNativeFeedAliases } from "../../episode-identity.mjs";
import { readLocalDocument, writeLocalDocument } from "./localStorage";
import { getIdentity, setIdentity, removeIdentity, resumeLocalWrites } from "./localStorage";

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
export type ReadyEpisode = CatalogueEpisode & {
  feedUrl: string;
  showName: string;
  publisher?: string;
  artworkUrl?: string;
  availableFeatures: { brief: boolean; chapters: boolean; topics: boolean; moments: boolean; search: boolean };
};
export async function loadReadyEpisodes(): Promise<{ episodes: ReadyEpisode[] }> {
  return request("/api/intelligence/ready");
}
export type IntelligenceStatus = {
  state:
    | "NOT_REQUESTED"
    | "CHECKING"
    | "QUEUED"
    | "ACQUIRING_TRANSCRIPT"
    | "ANALYSING"
    | "INDEXING"
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
    | "FAILED"
    | "CANCELLED"
    | "BUDGET_PAUSED";
  legacyState?: string;
  availabilityState?: string;
  work?: { completedChunks?: number; totalChunks?: number; completedBatches?: number; totalBatches?: number; synthesisPending?: boolean };
  canonicalEpisodeId?: string;
  processingStage?:
    | "QUEUED"
    | "CHECKING"
    | "ACQUIRING_TRANSCRIPT"
    | "PREPARING_AUDIO"
    | "TRANSCRIBING"
    | "ANALYSING"
    | "INDEXING"
    | "READY"
    | null;
  readiness?: "FULLY_READY" | "TEXT_ONLY" | "PARTIAL" | "UNUSABLE";
  processing?: boolean;
  phase?: "DISCOVERING" | "TRANSCRIBING" | "UNDERSTANDING" | "ORGANISING";
  transcriptAvailable?: boolean;
  featureStatus?: Record<string,{state:string;code?:string;candidateCount?:number|null}>;
  topics?: Array<{id:string;label:string;sourceSegmentIds:string[];startMs:number|null;endMs:number|null;chapterTitle?:string|null;transcriptVersion:string}>;
  qualityNote?: string;
  jobId?: string;
  startedAt?: string | null;
  lastUpdatedAt?: string | null;
  completedAt?: string | null;
  deadlineAt?: string;
  reason?: string;
  code?: string;
  // Additive listener-facing classification. `code` remains the durable
  // server code for installed clients and operations history.
  availabilityCode?:
    | "RIGHTS_RESTRICTED"
    | "LEGAL_BASIS_NOT_ESTABLISHED"
    | "DURATION_LIMIT"
    | "TRANSCRIPT_UNAVAILABLE"
    | "TRANSCRIPT_TOO_LARGE"
    | "AUDIO_TRANSCRIPTION_NOT_AUTHORISED"
    | "BUDGET_LIMIT"
    | "PROCESSING_TIMEOUT"
    | "PROVIDER_FAILURE"
    | "SOURCE_VALIDATION_FAILED"
    | "FEATURE_DISABLED"
    | string
    | null;
  rightsCode?: string | null;
  failureCategory?: "UNAVAILABLE" | "BUDGET" | "PROVIDER" | "WORKER" | "PROCESSING" | null;
  retryEligible?: boolean;
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
  availableFeatures?: {
    brief: boolean;
    chapters: boolean;
    topics: boolean;
    moments: boolean;
    search?: boolean;
  };
  estimatedCompletion?: {
    route: "cache" | "publisher" | "audio";
    sampleCount: number;
    minimumMs: number;
    maximumMs: number;
    label: string;
    estimatedCompletionAt: string;
    confidence?: "medium" | "high";
    updatedAt?: string;
  } | null;
  nextAction?: "VIEW_INTELLIGENCE" | "PREPARE" | "KEEP_LISTENING" | "RETRY" | "WAIT_FOR_BUDGET" | "EXPLORE_ANOTHER_EPISODE";
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
const cloudOrigin = "https://d3ri12f40b85i3.cloudfront.net";
const pilotTokenKey = "star-cast-pilot-token";
const legacyDevelopmentToken =
  process.env.EXPO_PUBLIC_ALLOW_LEGACY_TOKEN === "enabled"
    ? process.env.EXPO_PUBLIC_DEV_INTELLIGENCE_TOKEN || ""
    : "";
let pilotToken: Promise<string | null> | null = null;
const sessionListeners = new Set<() => void>();
export function onSessionEnded(callback: () => void) {
  sessionListeners.add(callback);
  return () => { sessionListeners.delete(callback); };
}
export async function endPilotSession() {
  pilotToken = Promise.resolve(null);
  await removeIdentity(pilotTokenKey);
  sessionListeners.forEach((callback) => callback());
}
const base = () => {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
  const local =
    process.env.EXPO_PUBLIC_ALLOW_INSECURE_LOCAL_API === "enabled" &&
    configured &&
    /^http:\/\/(127\.0\.0\.1|localhost|192\.168\.\d+\.\d+)(?::\d+)?$/.test(configured);

  // Expo loads ignored .env files after the launch script has supplied its
  // environment. A stale LAN value must never override the pinned production
  // origin for a physical-device build. Local HTTP is deliberately opt-in.
  return local ? configured : cloudOrigin;
};
const storedPilotToken = () =>
  (pilotToken ||= getIdentity(pilotTokenKey));
export async function hasPilotAccess() {
  return Boolean(legacyDevelopmentToken || (await storedPilotToken()));
}
export async function enrollPrivatePilot(code: string) {
  const response = await fetch(`${base()}/api/pilot/enroll`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: code.trim() }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.token !== "string" || body.token.length < 32)
    throw Error(body.error || "That private-beta access code could not be accepted.");
  await setIdentity(pilotTokenKey, body.token);
  pilotToken = Promise.resolve(body.token);
  resumeLocalWrites();
  return { expiresAt: typeof body.expiresAt === "string" ? body.expiresAt : null };
}
async function pilotHeaders(headers: Headers) {
  if (legacyDevelopmentToken && !headers.has("x-star-cast-dev-token"))
    headers.set("x-star-cast-dev-token", legacyDevelopmentToken);
  const enrolled = await storedPilotToken();
  if (enrolled && !headers.has("x-star-cast-pilot-token"))
    headers.set("x-star-cast-pilot-token", enrolled);
  return headers;
}
export async function request(path: string, init?: RequestInit) {
  let origin = base();
  if (!origin)
    throw Error(
      "Connect this device to your Star Cast listening server to continue.",
    );
  const headers = new Headers(init?.headers);
  await pilotHeaders(headers);
  let response = await fetch(`${origin}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(20_000),
    }),
    body = await response.json().catch(() => ({}));
  if (response.status === 403 && body.code === "DEVICE_UNAUTHORISED")
    await endPilotSession();
  if (!response.ok)
    throw Object.assign(
      Error(body.error || "Star Cast is temporarily unavailable."),
      { userFacing: true, status: response.status, code: body.code },
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
  canonicalFeedUrl?: string;
  feedAliases?: string[];
}> {
  return request(`/api/catalogue/feed?url=${encodeURIComponent(feedUrl)}`).then(
    async (x) => {
      if (x.feed.canonicalFeedUrl && Array.isArray(x.feed.feedAliases)) {
        const aliases = {...JSON.parse(await readLocalDocument("star-cast-feed-aliases-v1") || "{}"),
          ...Object.fromEntries(x.feed.feedAliases.map((alias: string) => [alias,x.feed.canonicalFeedUrl]))};
        setNativeFeedAliases(aliases);
        await writeLocalDocument("star-cast-feed-aliases-v1",JSON.stringify(aliases));
      }
      return x.feed;
    },
  );
}
export async function loadIntelligenceStatus(
  feedUrl: string,
  episodeId: string,
  source = "opened",
): Promise<IntelligenceStatus> {
  return request(
    `/api/intelligence/status?feedUrl=${encodeURIComponent(feedUrl)}&episodeId=${encodeURIComponent(episodeId)}&source=${encodeURIComponent(source)}`,
    { headers: developmentHeaders() },
  ).then((x) => x.status);
}
export function developmentHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (legacyDevelopmentToken) headers["x-star-cast-dev-token"] = legacyDevelopmentToken;
  return headers;
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
    "CHECKING",
    "QUEUED",
    "ACQUIRING_TRANSCRIPT",
    "ANALYSING",
    "INDEXING",
    "PROCESSING",
    "PARTIAL_READY",
    "DISCOVERING",
    "TRANSCRIBING",
    "UNDERSTANDING",
    "ORGANISING",
  ].includes(status.state);
const processingLabels: Record<string, string> = {
  CHECKING: "Checking this conversation.",
  QUEUED: "Your episode is queued for preparation.",
  ACQUIRING_TRANSCRIPT: "Preparing the conversation.",
  TRANSCRIBING: "Preparing the conversation.",
  ANALYSING: "Finding the interesting moments.",
  INDEXING: "Making everything searchable.",
  DISCOVERING: "Checking this conversation.",
  UNDERSTANDING: "Finding the interesting moments.",
  ORGANISING: "Making everything searchable.",
  READY: "Your conversation is ready.",
  BUDGET_PAUSED: "AI insights are paused for this episode.",
  CANCELLED: "AI insights aren't available for this episode.",
  UNAVAILABLE: "AI insights aren't available for this episode.",
  FAILED: "We couldn't prepare this episode.",
};
const availabilityLabels: Record<string, string> = {
  RIGHTS_RESTRICTED: "AI preparation isn't currently available for this episode.",
  LEGAL_BASIS_NOT_ESTABLISHED:
    "AI preparation isn't currently available for this episode.",
  DURATION_LIMIT: "This episode exceeds the current audio transcription limit.",
  TRANSCRIPT_UNAVAILABLE: "We couldn't find a usable transcript for this episode.",
  TRANSCRIPT_TOO_LARGE:
    "The available transcript is too large for the current grounded analysis limit.",
  AUDIO_TRANSCRIPTION_NOT_AUTHORISED:
    "Audio transcription isn't authorised for this episode.",
  BUDGET_LIMIT: "Preparation is temporarily paused.",
  PROCESSING_TIMEOUT: "Preparation was interrupted.",
  PROVIDER_FAILURE:
    "Preparation is temporarily unavailable. Your listening can continue.",
  SOURCE_VALIDATION_FAILED:
    "We couldn't validate the available source for this episode. Please retry once.",
  FEATURE_DISABLED: "AI preparation is currently disabled for this episode.",
};
export const processingLabel = (status: IntelligenceStatus | null) =>
  availabilityLabels[status?.availabilityCode || status?.code || ""] ||
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
