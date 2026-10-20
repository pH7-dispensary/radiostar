import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { parseVtt, transcriptRefsFromItem } from "./transcripts.mjs";
import {
  BudgetLedger,
  defaultControls,
  openAIStatus,
} from "./openai-intelligence.mjs";
import { LocalStore } from "./persistence.mjs";
import { measuredProcessingEstimate } from "./processing-estimate.mjs";
import { EpisodePipeline, availabilityCode as availabilityCodeFor, canonicalEpisodeId, durationMs, episodeKey, listenerProcessingStatus, publicIntelligence } from "./episode-pipeline.mjs";
import { publicUrl, fetchPublicText } from "./safe-network.mjs";
import { projectRoot, loadCredentials } from "./config.mjs";
import { acquireServerLock } from "./server-lock.mjs";
import { ListenerService, ListenerError } from "./listener-service.mjs";
import { SkipService } from "./skip-service.mjs";
import { verifyAdSkipAudio } from "./ad-skip-verification.mjs";
import { RightsRegistry } from "./rights-registry.mjs";
import { assessPublisherRights, publisherRightsEvidence } from "./rights-assessment.mjs";
import { IntelligencePolicyRegistry, intelligenceLevel } from "./intelligence-policy.mjs";
import { processingQueueFromEnv } from "./processing-queue.mjs";
import { approvedTestCorpus, approvedTestTranscriptVtt } from "./approved-test-corpus.mjs";
import { subscriptionsFromEnv } from "./subscriptions.mjs";
import { TranslationService, validLanguage } from "./translation.mjs";
import { AdminService } from "./admin-service.mjs";

export const decodeHtmlEntity = (value) =>
  String(value || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, token) => {
    const named = { amp: "&", quot: '"', apos: "'", nbsp: " ", lt: "<", gt: ">" };
    if (named[token.toLowerCase()] !== undefined) return named[token.toLowerCase()];
    const code = token[1]?.toLowerCase() === "x" ? Number.parseInt(token.slice(2), 16) : token[0] === "#" ? Number.parseInt(token.slice(1), 10) : NaN;
    return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  });
export const cleanMetadata = (s) =>
  decodeHtmlEntity(String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, ""))
    .trim();
const tag = (xml, name) =>
  cleanMetadata(
    (xml.match(
      new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"),
    ) || [])[1],
  );
async function appleSearch(query, limit = 12) {
  let url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("media", "podcast");
  url.searchParams.set("entity", "podcast");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("term", query);
  let r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw Error(`Catalogue provider returned ${r.status}`);
  let data = await r.json();
  return data.results.map((x) => ({
    id: `apple:${x.collectionId}`,
    name: x.collectionName,
    publisher: x.artistName,
    topic: x.primaryGenreName || "Podcast",
    art: x.artworkUrl600 || x.artworkUrl100,
    feedUrl: x.feedUrl,
    source: "Apple Podcasts",
  }));
}
async function podcastIndexSearch(query, limit = 12) {
  let key = process.env.PODCAST_INDEX_KEY,
    secret = process.env.PODCAST_INDEX_SECRET;
  if (!key || !secret) return null;
  let date = Math.floor(Date.now() / 1000).toString(),
    authorization = createHash("sha1")
      .update(key + secret + date)
      .digest("hex"),
    url = new URL("https://api.podcastindex.org/api/1.0/search/byterm");
  url.searchParams.set("q", query);
  url.searchParams.set("max", String(limit));
  let r = await fetch(url, {
    headers: {
      "X-Auth-Key": key,
      "X-Auth-Date": date,
      Authorization: authorization,
      "User-Agent": "StarCastCatalogue/0.1",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw Error(`Podcast Index returned ${r.status}`);
  let data = await r.json();
  return (data.feeds || []).map((x) => ({
    id: `podcastindex:${x.id}`,
    name: x.title,
    publisher: x.author || x.ownerName || "Unknown publisher",
    topic: x.categories ? Object.values(x.categories)[0] : "Podcast",
    art: x.image || x.artwork,
    feedUrl: x.url,
    source: "Podcast Index",
  }));
}
const MAX_CATALOGUE_EPISODES = 30;
// A listener can legitimately reopen an older episode from their library or a
// shared link. Keep catalogue responses compact, while allowing a bounded
// look-back for an explicit episode request. The publisher document has
// already passed the server's 8 MB network limit.
const MAX_RESOLVABLE_EPISODES = 120;

class PublisherEpisodeError extends Error {
  constructor(message, code = "EPISODE_NOT_FOUND") {
    super(message);
    this.name = "PublisherEpisodeError";
    this.code = code;
    this.status = 404;
  }
}

function feedParts(xml, feed, limit = MAX_CATALOGUE_EPISODES) {
  let channel = xml.match(/<channel[\s\S]*?<\/channel>/i)?.[0] || xml,
    items = [...channel.matchAll(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi)]
      .map((m) => m[0])
      .slice(0, limit);
  return { channel, items, feed };
}
function episodesFromFeed(xml, feed, limit = MAX_CATALOGUE_EPISODES) {
  let { channel, items } = feedParts(xml, feed, limit);
  return {
    title: tag(channel, "title"),
    publisher: tag(channel, "itunes:author") || tag(channel, "author"),
    art: (channel.match(/<itunes:image[^>]+href=["']([^"']+)/i) || [])[1],
    episodes: items.map((item, index) => {
      let enclosure = (item.match(/<enclosure[^>]+url=["']([^"']+)/i) ||
          item.match(/<link[^>]+href=["']([^"']+)/i) ||
          [])[1],
        guid = tag(item, "guid") || tag(item, "id") || `${feed}:${index}`,
        refs = transcriptRefsFromItem(item);
      return {
        id: guid,
        title: tag(item, "title") || "Untitled episode",
        publishedAt: tag(item, "pubDate") || tag(item, "published"),
        duration: tag(item, "itunes:duration"),
        description: tag(item, "description"),
        audioUrl: enclosure || null,
        hasPublisherTranscript: refs.length > 0,
        rightsEvidence: publisherRightsEvidence({ channelXml: channel, itemXml: item, feedUrl: feed }),
      };
    }),
  };
}
async function body(req) {
  let chunks = [],
    size = 0;
  for await (let chunk of req) {
    size += chunk.length;
    if (size > 20_000) throw Error("Request is too large.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || "{}");
  } catch {
    throw Error("Request body must be valid JSON.");
  }
}
const staticFiles = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/styles.css", "styles.css"],
  ["/app.js", "app.js"],
  ["/admin", "admin.html"],
  ["/admin/", "admin.html"],
  ["/admin.html", "admin.html"],
  ["/admin.css", "admin.css"],
  ["/admin.js", "admin.js"],
  ...[
    "playback",
    "playback-ui",
    "sleep",
    "sleep-ui",
    "intelligence",
    "search",
    "ad-skip",
  ].map((name) => ["/" + name + ".mjs", name + ".mjs"]),
]);
function send(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(JSON.stringify(body));
}
const tokenHash = (value) =>
  createHash("sha256").update(String(value || "")).digest("hex");
const enrollmentCode = () => `sc_${randomBytes(18).toString("base64url")}`;
const pilotToken = () => randomBytes(32).toString("base64url");
export function createStarCastServer({
  store,
  env = process.env,
  resolveEpisode,
  client,
  fetchTranscript,
  fetchFeed,
  audioFactory,
} = {}) {
  const cache = new Map(),
    windows = new Map();
  const serverStartedAt = new Date().toISOString();
  store ||= new LocalStore(
    env.STARCAST_DATA_FILE ||
      join(projectRoot, ".starcast", "development.sqlite"),
  );
  const ledger = new BudgetLedger(
    {
      ...defaultControls,
      enabled: env.STARCAST_PAID_INTELLIGENCE === "enabled",
    },
    store,
  );
  const rights = new RightsRegistry(store);
  const adminService = new AdminService(store);
  // A zero-percent rollout is an actual server-side off switch. Client UI must
  // never make a disabled rollout available by itself.
  const featureEnabled = (id) => {
    const feature = adminService.featureFlags().find((candidate) => candidate.id === id);
    return Boolean(feature && feature.state !== "DISABLED" && feature.rolloutPercent > 0);
  };
  const listenerFeatures = () => ({
    episodeBriefs: featureEnabled("episodeBrief"),
    exploreEpisode: featureEnabled("smartChapters"),
    momentSearch: featureEnabled("findMoment"),
    conversationSearch: featureEnabled("conversationSearch"),
    adSkip: featureEnabled("adSkip"),
  });
  const trusted = (req) => {
    const expected = env.STARCAST_DEV_INTELLIGENCE_TOKEN,
      received = req.headers["x-star-cast-dev-token"],
      enrolled = req.headers["x-star-cast-pilot-token"];
    if (
      typeof received === "string" &&
      Boolean(expected) &&
      Buffer.byteLength(received) === Buffer.byteLength(expected) &&
      timingSafeEqual(Buffer.from(received), Buffer.from(expected))
    ) return true;
    if (typeof enrolled !== "string" || enrolled.length < 32) return false;
    const device = store.get("pilot-device", tokenHash(enrolled));
    return Boolean(
      device &&
        !device.revokedAt &&
        Date.parse(device.expiresAt || "") > Date.now(),
    );
  };
  const administrator = (req) => {
    const expected = env.STARCAST_ADMIN_TOKEN,
      received = req.headers["x-star-cast-admin-token"];
    return (
      typeof received === "string" &&
      Boolean(expected) &&
      Buffer.byteLength(received) === Buffer.byteLength(expected) &&
      timingSafeEqual(Buffer.from(received), Buffer.from(expected))
    );
  };
  const cookies = (req) => Object.fromEntries(String(req.headers.cookie || "").split(/;\s*/).filter(Boolean).map((item) => {
    const at = item.indexOf("=");
    return at < 0 ? [item, ""] : [item.slice(0, at), decodeURIComponent(item.slice(at + 1))];
  }));
  const adminActor = (req, permission, { write = false } = {}) => {
    const tokenActor = adminService.actorForToken(env.STARCAST_ADMIN_TOKEN, req.headers["x-star-cast-admin-token"]);
    if (tokenActor) return tokenActor;
    const cookie = cookies(req).starcast_admin;
    const actor = adminService.authenticate(cookie, req.headers["x-star-cast-csrf"], { write });
    return adminService.can(actor, permission) ? actor : null;
  };
  async function cached(key, fn, ttl = 300_000) {
    const hit = cache.get(key);
    if (hit && hit.until > Date.now()) return hit.value;
    const value = await fn();
    cache.set(key, { value, until: Date.now() + ttl });
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    return value;
  }
  async function feedXml(feed) {
    if (!publicUrl(feed))
      throw Error("A public HTTPS publisher feed is required.");
    return cached(
      "feed:" + feed,
      async () => {
        const value = fetchFeed
          ? await fetchFeed(feed)
          : (await fetchPublicText(feed, 8_000_000)).text;
        return String(value || "");
      },
      600_000,
    );
  }
  async function resolve(feed, id) {
    const xml = await feedXml(feed),
      parts = feedParts(xml, feed, MAX_RESOLVABLE_EPISODES),
      items = parts.items,
      parsed = episodesFromFeed(xml, feed, MAX_RESOLVABLE_EPISODES),
      index = parsed.episodes.findIndex((x) => x.id === id);
    if (index < 0)
      throw new PublisherEpisodeError("This episode is no longer available in the publisher feed's supported history.");
    const item = items[index],
      refs = transcriptRefsFromItem(item);
    // Explicit publisher transcript links, without scraping arbitrary page navigation.
    for (const match of item.matchAll(
      /<a\b[^>]*href=["']([^"']+)["'][^>]*>[^<]*transcript[^<]*<\/a>/gi,
    )) {
      const url = cleanMetadata(match[1]);
      if (publicUrl(url))
        refs.push({
          url,
          type: /\.vtt(?:\?|$)/i.test(url)
            ? "text/vtt"
            : /\.srt(?:\?|$)/i.test(url)
              ? "application/x-subrip"
              : "text/html",
          language: "und",
        });
    }
    return {
      ...parsed.episodes[index],
      showName: parsed.title,
      publisher: parsed.publisher,
      artworkUrl: parsed.art,
      refs,
      rightsEvidence: publisherRightsEvidence({ channelXml: parts.channel, itemXml: item, feedUrl: feed }),
    };
  }
  const queue = processingQueueFromEnv(env);
  const releaseMetadata = () => {
    try {
      const value = JSON.parse(readFileSync(env.STARCAST_RELEASE_METADATA_FILE || "/var/lib/starcast/release.json", "utf8"));
      return {
        status: /^[a-f0-9]{64}$/i.test(value.releaseSha || "") ? "HEALTHY" : "UNKNOWN",
        releaseSha: /^[a-f0-9]{64}$/i.test(value.releaseSha || "") ? value.releaseSha : null,
        deployedAt: Number.isFinite(Date.parse(value.deployedAt || "")) ? value.deployedAt : null,
        previousReleaseSha: /^[a-f0-9]{64}$/i.test(value.previousReleaseSha || "") ? value.previousReleaseSha : null,
        rollbackAvailable: value.rollbackAvailable === true,
        reason: /^[a-f0-9]{64}$/i.test(value.releaseSha || "") ? "Release metadata was read from the protected server record." : "Release metadata is not recorded for this server.",
      };
    } catch {
      return { status: "UNKNOWN", releaseSha: null, deployedAt: null, previousReleaseSha: null, rollbackAvailable: null, reason: "Release metadata is not recorded for this server." };
    }
  };
  const infrastructureStatus = async () => cached("admin-infrastructure", async () => {
    let database;
    try {
      const check = store.db.prepare("PRAGMA quick_check").get();
      database = { name: "Durable database", status: Object.values(check)[0] === "ok" ? "HEALTHY" : "UNAVAILABLE", reason: Object.values(check)[0] === "ok" ? "SQLite quick check passed for the active server store." : "SQLite quick check did not pass." };
    } catch {
      database = { name: "Durable database", status: "UNAVAILABLE", reason: "The active server store could not be verified." };
    }
    const observedQueue = queue ? await queue.metrics() : null;
    const release = releaseMetadata();
    const components = [
      { name: "Backend API", status: "HEALTHY", reason: "This authenticated operations request reached the active backend.", observedAt: new Date().toISOString() },
      database,
      queue ? { name: "Processing queue", status: observedQueue.status, reason: observedQueue.reason, observedAt: observedQueue.observedAt, detail: observedQueue.processing } : { name: "Processing queue", status: "UNKNOWN", reason: "A processing queue is not configured for this server release." },
      queue ? { name: "Dead-letter queue", status: observedQueue.status === "UNAVAILABLE" ? "UNAVAILABLE" : observedQueue.deadLetter.visible > 0 ? "DEGRADED" : "HEALTHY", reason: observedQueue.status === "UNAVAILABLE" ? observedQueue.reason : observedQueue.deadLetter.visible > 0 ? "Messages require operator investigation." : "No messages are waiting in the dead-letter queue.", observedAt: observedQueue.observedAt, detail: observedQueue.deadLetter } : { name: "Dead-letter queue", status: "UNKNOWN", reason: "A processing queue is not configured for this server release." },
      { name: "Processing worker", status: queue ? (observedQueue.status === "UNAVAILABLE" ? "UNAVAILABLE" : queue.running ? "HEALTHY" : "DEGRADED") : "UNKNOWN", reason: queue ? (queue.running ? "The single durable queue consumer is running." : "The queue consumer is not running.") : "No queue worker is configured for this server release." },
      { name: "CloudWatch logs", status: "UNKNOWN", reason: "Log delivery is not queried by the application; no browser credentials are exposed." },
      { name: "S3 backups", status: "UNKNOWN", reason: "Backup object freshness is not queried by the application; no browser credentials are exposed." },
      { name: "Deployment", status: release.status, reason: release.reason, observedAt: release.deployedAt, detail: { releaseSha: release.releaseSha, previousReleaseSha: release.previousReleaseSha, rollbackAvailable: release.rollbackAvailable } },
    ];
    const statuses = components.map((component) => component.status);
    const status = statuses.includes("UNAVAILABLE") ? "UNAVAILABLE" : statuses.includes("DEGRADED") || statuses.includes("UNKNOWN") ? "DEGRADED" : "HEALTHY";
    return { status, generatedAt: new Date().toISOString(), serverStartedAt, components, release };
  }, 15_000);
  const intelligencePolicy = new IntelligencePolicyRegistry(store);
  const pipeline = new EpisodePipeline({
    store,
    ledger,
    resolveEpisode: resolveEpisode || resolve,
    enabled: ledger.controls.enabled,
    audioEnabled: env.STARCAST_AUDIO_TRANSCRIPTION === "enabled",
    configured: Boolean(env.OPENAI_API_KEY),
    client,
    fetchTranscript,
    audioFactory,
    rights,
    intelligencePolicy,
    queue,
    onCompleted: ({ feedUrl, episodeId }) => skips?.inspect(feedUrl, episodeId),
  });
  const assessEpisodeRights = async (feedUrl, episodeId, suppliedEpisode = null) => {
    const episode = suppliedEpisode?.rightsEvidence
      ? suppliedEpisode
      : await (resolveEpisode ? resolveEpisode(feedUrl, episodeId) : resolve(feedUrl, episodeId));
    const assessment = assessPublisherRights({
      feedUrl,
      episode,
      evidence: episode.rightsEvidence,
    });
    const result = rights.assessAutomatic({
      feedUrl,
      episodeId,
      publisher: episode.publisher || null,
      podcast: episode.showName || episode.podcast || null,
      episodeTitle: episode.title || null,
      ...assessment,
    });
    return { episode, assessment: result.record, reused: result.reused, mandatory: result.mandatory };
  };
  const listeners = new ListenerService(store, {
    inviteOrigin: env.STARCAST_INVITE_ORIGIN,
    friendBonusMinutes: Number(env.STARCAST_FRIEND_BONUS_MINUTES || 0),
  });
  const skips = new SkipService(store, pipeline, {
    verifyAudio: verifyAdSkipAudio,
    automaticEnabled: () => featureEnabled("adSkip"),
    maxAudioSeconds: ledger.controls.maxEpisodeSeconds,
    canVerifyAudio: ({ feedUrl, episodeId }) => {
      if (!featureEnabled("adSkip"))
        return {
          allowed: false,
          reason: "Ad Skip is not enabled for this controlled rollout.",
        };
      const permission = rights.resolve(feedUrl, episodeId);
      const processing = rights.evaluate({
        feature: "intelligence-processing",
        feedUrl,
        episodeId,
      });
      const display = rights.evaluate({
        feature: "intelligence-display",
        feedUrl,
        episodeId,
      });
      if (!processing.allowed || !display.allowed || !permission.canTranscribeAudio)
        return {
          allowed: false,
          reason: !processing.allowed
            ? processing.reason
            : !display.allowed
              ? display.reason
              : "Audio verification is not authorised for this episode.",
        };
      return { allowed: true };
    },
  });
  const subscriptions = subscriptionsFromEnv(store, env);
  const translation = new TranslationService({ rights, subscriptions, intelligencePolicy, env, store });
  const fixtureIdentity = () => {
    const origin = String(env.STARCAST_TEST_CORPUS_ORIGIN || "").replace(/\/$/, "");
    if (!/^https:\/\/[a-z0-9]+\.cloudfront\.net$/.test(origin)) throw Error("The owned translation fixture origin is unavailable.");
    return { feedUrl: origin + approvedTestCorpus.feedPath, episodeId: approvedTestCorpus.episodeId,
      audioVariant: "starcast-owned-source-v1", sourceLanguage: "en", targetLanguage: "pt",
      voiceProfile: "polly-neural-pt-PT-Ines", translationVersion: "aws-v1", rightsVersion: "owned-fixture-v1" };
  };
  const scheduleFollowedFeed = async (feedUrl) => {
    if (adminService.configuration().values.processing?.automaticFollowPreparation === false)
      return { state: "DISABLED", code: "AUTOMATIC_PREPARATION_DISABLED", reason: "Automatic preparation is currently paused by an administrator." };
    if (!featureEnabled("automaticProcessing")) return { state: "DISABLED", code: "FEATURE_DISABLED" };
    const parsed = episodesFromFeed(await feedXml(feedUrl), feedUrl);
    const episode = [...parsed.episodes]
      .filter((item) => item.id)
      .sort((a, b) => Date.parse(b.publishedAt || "") - Date.parse(a.publishedAt || ""))[0];
    if (!episode) return { state: "UNAVAILABLE", code: "NO_EPISODE" };
    const assessed = await assessEpisodeRights(feedUrl, episode.id);
    const permission = assessed.assessment;
    const processing = rights.evaluate({ feature: "intelligence-processing", feedUrl, episodeId: episode.id, audit: true });
    const display = rights.evaluate({ feature: "intelligence-display", feedUrl, episodeId: episode.id, audit: true });
    const operational = intelligencePolicy.allows(feedUrl, episode.id, "intelligence");
    if (!permission.canAcquireTranscript || !processing.allowed || !display.allowed || !operational.allowed)
      return { state: "BLOCKED", code: !operational.allowed ? "INTELLIGENCE_POLICY_HIGH" : "RIGHTS_RESTRICTED", reason: !operational.allowed ? "New intelligence processing is paused by the podcast intelligence policy." : !permission.canAcquireTranscript ? "The publisher has not authorised transcript acquisition." : processing.allowed ? display.reason : processing.reason };
    // Following is never consent to paid audio. Publisher transcripts only.
    return pipeline.request({ feedUrl, episodeId: episode.id, trigger: "automatic" });
  };
  const latestEpisode = async (feedUrl) => {
    const parsed = episodesFromFeed(await feedXml(feedUrl), feedUrl);
    const episode = [...parsed.episodes]
      .filter((item) => item.id)
      .sort((a, b) => Date.parse(b.publishedAt || "") - Date.parse(a.publishedAt || ""))[0];
    if (!episode) throw Error("The publisher feed has no eligible episode to process.");
    return { ...episode, podcast: parsed.title, publisher: parsed.publisher };
  };
  const processingEstimate = () => {
    const samples = store.all("intelligence").map(([, value]) => value.processingMs)
      .filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
    return samples.length ? samples[Math.floor(samples.length / 2)] : null;
  };
  // ETA is intentionally withheld until comparable completed work exists.
  // It is a measured range, not worker progress expressed as a percentage.
  const processingEstimateFor = (job) => {
    if (!job || !listenerProcessingStatus(job).processing) return null;
    const estimate = measuredProcessingEstimate(job, store.all("intelligence").map(([, value]) => value));
    if (estimate && !job.estimateHistory?.some((entry) => entry.stage === estimate.stage)) {
      // At most one observation per stage, in the existing job record. Polling
      // never rewrites lifecycle timestamps or invents progress events.
      const key = episodeKey(job.feedUrl, job.episodeId);
      const current = store.get("intelligence", key);
      if (current?.jobId === job.jobId)
        store.set("intelligence", key, { ...current, estimateHistory: [...(current.estimateHistory || []), estimate].slice(-8) });
    }
    return estimate;
  };
  const blockedContent = () => {
    const entries = new Map();
    const add = ({ feedUrl, episodeId = "", source = null, job = null } = {}) => {
      if (!feedUrl || !publicUrl(feedUrl)) return;
      const rightsRecord = rights.resolve(feedUrl, episodeId);
      const processing = rights.evaluate({ feature: "intelligence-processing", feedUrl, episodeId });
      const display = rights.evaluate({ feature: "intelligence-display", feedUrl, episodeId });
      // A RESTRICTED classification without an explicit reservation can mean
      // that no affirmative assessment has yet been recorded. It is eligible
      // for Super Admin review, unlike a reservation, dispute or takedown.
      const mandatory = rightsRecord.id && (rightsRecord.suspendedAt || rightsRecord.deletedAt || rightsRecord.rightsReserved || rightsRecord.classification === "DISPUTED");
      const state = job ? publicIntelligence(job) : null;
      if (processing.allowed && display.allowed && state?.state !== "BLOCKED") return;
      const id = `${feedUrl}\u0000${episodeId}`;
      const duration = durationMs(job?.episode?.duration);
      entries.set(id, {
        feedUrl,
        episodeId: episodeId || null,
        podcast: rightsRecord.podcast || job?.episode?.showName || null,
        publisher: rightsRecord.publisher || job?.episode?.publisher || null,
        episodeTitle: rightsRecord.episodeTitle || job?.episode?.title || null,
        currentRestriction: rightsRecord.blockerCode || (rightsRecord.id ? rightsRecord.classification : "UNASSESSED"),
        refusalReason: state?.reason || (!processing.allowed ? processing.reason : display.reason),
        processingEligibility: mandatory ? "MANDATORY_RESTRICTION" : !rightsRecord.id ? "ASSESS_ON_REQUEST" : processing.allowed && display.allowed ? "ELIGIBLE" : rightsRecord.blockerCode === "LEGAL_BASIS_NOT_ESTABLISHED" ? "LEGAL_BASIS_REQUIRED" : "REQUIRES_APPROVED_BASIS",
        canApprove: !mandatory,
        previousAttempts: job?.attempts || 0,
        status: state?.state || "BLOCKED",
        phase: state?.phase || null,
        retryable: state?.retryable === true,
        transcriptAvailable: state?.transcriptAvailable === true,
        estimatedAudioCostUsd: duration && rightsRecord.canTranscribeAudio ? Number((duration / 1000 * 0.0001).toFixed(4)) : null,
        source,
      });
    };
    for (const record of rights.list()) add({ feedUrl: record.feedUrl, episodeId: record.episodeId || "", source: "rights-record" });
    for (const audit of store.all("rights-policy-audit").map(([, value]) => value))
      if (audit.decision === "BLOCKED") add({ feedUrl: audit.feedUrl, episodeId: audit.episodeId || "", source: "rights-decision" });
    for (const [, job] of store.all("intelligence"))
      if (job.feedUrl && (job.state === "BLOCKED" || job.state === "FAILED")) add({ feedUrl: job.feedUrl, episodeId: job.episodeId || job.episode?.id || "", source: "processing-job", job });
    const groups = new Map();
    for (const entry of entries.values()) {
      const group = groups.get(entry.feedUrl) || { feedUrl: entry.feedUrl, podcast: entry.podcast || "Podcast", publisher: entry.publisher || null, channelRestriction: entry.episodeId ? null : entry.currentRestriction, channelCanApprove: entry.episodeId ? true : entry.canApprove, episodes: [], status: entry.status };
      if (!entry.episodeId) Object.assign(group, { podcast: entry.podcast || group.podcast, publisher: entry.publisher || group.publisher, channelRestriction: entry.currentRestriction, channelCanApprove: entry.canApprove, status: entry.status });
      else group.episodes.push(entry);
      groups.set(entry.feedUrl, group);
    }
    return {
      generatedAt: new Date().toISOString(),
      measuredMedianProcessingMs: processingEstimate(),
      groups: [...groups.values()].sort((a, b) => a.podcast.localeCompare(b.podcast)),
    };
  };
  const intelligencePolicyCatalogue = () => {
    const channels = new Map();
    const jobs = store.all("intelligence").map(([, job]) => job);
    const add = (feedUrl, metadata = {}) => {
      if (!feedUrl || !publicUrl(feedUrl)) return;
      const item = channels.get(feedUrl) || { feedUrl, podcast: metadata.podcast || "Podcast", publisher: metadata.publisher || null, artworkUrl: metadata.artworkUrl || null, episodeCount: 0, blockedIntelligenceCount: 0, lastProcessingActivity: null, episodes: [] };
      if (metadata.podcast) item.podcast = metadata.podcast;
      if (metadata.publisher) item.publisher = metadata.publisher;
      if (metadata.artworkUrl) item.artworkUrl = metadata.artworkUrl;
      if (metadata.episodeId && !item.episodes.some((episode) => episode.episodeId === metadata.episodeId)) item.episodes.push(metadata);
      channels.set(feedUrl, item);
    };
    for (const record of rights.list()) add(record.feedUrl, { podcast: record.podcast, publisher: record.publisher, episodeId: record.episodeId, episodeTitle: record.episodeTitle });
    for (const [, follow] of store.all("follow")) add(follow.feedUrl, { source: "listener-follow" });
    for (const job of jobs) {
      add(job.feedUrl, { podcast: job.episode?.showName, publisher: job.episode?.publisher, artworkUrl: job.episode?.artworkUrl, episodeId: job.episodeId || job.episode?.id, episodeTitle: job.episode?.title });
      const channel = channels.get(job.feedUrl); if (!channel) continue;
      if (["BLOCKED", "FAILED"].includes(job.state)) channel.blockedIntelligenceCount++;
      const at = Date.parse(job.completedAt || job.updatedAt || job.startedAt || "");
      if (Number.isFinite(at) && (!channel.lastProcessingActivity || at > channel.lastProcessingActivity)) channel.lastProcessingActivity = at;
    }
    for (const policy of intelligencePolicy.records()) add(policy.feedUrl, { episodeId: policy.episodeId });
    const global = intelligencePolicy.global();
    const podcasts = [...channels.values()].map((channel) => {
      const history = jobs.filter((job) => job.feedUrl === channel.feedUrl).map((job) => publicIntelligence(job)).sort((a, b) => Date.parse(b.completedAt || b.startedAt || "") - Date.parse(a.completedAt || a.startedAt || "")).slice(0, 20);
      const policy = intelligencePolicy.effective(channel.feedUrl);
      return { ...channel, episodeCount: channel.episodes.length, rights: rights.resolve(channel.feedUrl), policy: { ...policy, level: intelligenceLevel(policy.tier) }, effectivePermissions: intelligencePolicy.features(channel.feedUrl), processingHistory: history, episodes: channel.episodes.map((episode) => ({ ...episode, rights: rights.resolve(channel.feedUrl, episode.episodeId), policy: { ...intelligencePolicy.effective(channel.feedUrl, episode.episodeId), level: intelligenceLevel(intelligencePolicy.effective(channel.feedUrl, episode.episodeId).tier) }, effectivePermissions: intelligencePolicy.features(channel.feedUrl, episode.episodeId) })) };
    }).sort((a, b) => a.podcast.localeCompare(b.podcast));
    return {
      generatedAt: new Date().toISOString(), global: { ...global, level: intelligenceLevel(global.tier), inheritingPodcastCount: podcasts.filter((podcast) => podcast.policy.source === "global").length },
      policies: intelligencePolicy.records(), audit: intelligencePolicy.audit(),
      metrics: Object.fromEntries(["READY", "QUEUED", "PROCESSING", "BLOCKED", "FAILED"].map((state) => [state, jobs.filter((job) => job.state === state).length])),
      podcasts,
    };
  };
  // The operational catalogue deliberately starts with records that Radio Star
  // already knows: follows, rights work, processing, and scoped policies.  RSS
  // remains the source for display metadata; no third-party catalogue claim is
  // presented as a listener's collection.
  const canonicalFeedId = (feedUrl) =>
    createHash("sha256").update(String(feedUrl)).digest("hex").slice(0, 16);
  const knownPodcastFeeds = () => {
    const feeds = new Map();
    const add = (feedUrl, metadata = {}) => {
      if (!publicUrl(feedUrl)) return;
      const current = feeds.get(feedUrl) || { feedUrl, metadata: {} };
      feeds.set(feedUrl, { ...current, metadata: { ...current.metadata, ...Object.fromEntries(Object.entries(metadata).filter(([, value]) => value != null && value !== "")) } });
    };
    for (const [, follow] of store.all("follow")) add(follow.feedUrl, { source: "listener-follow" });
    for (const record of rights.list()) add(record.feedUrl, { title: record.podcast, publisher: record.publisher, source: "rights" });
    for (const [, job] of store.all("intelligence")) add(job.feedUrl, { title: job.episode?.showName, publisher: job.episode?.publisher, artworkUrl: job.episode?.artworkUrl, source: "processing" });
    for (const policy of intelligencePolicy.records()) add(policy.feedUrl, { source: "intelligence-policy" });
    for (const [, approval] of store.all("processing-approval")) add(approval.feedUrl, { title: approval.podcast, source: "processing-approval" });
    return [...feeds.values()];
  };
  const followedCount = (feedUrl) => store.all("follow").filter(([, value]) => value.feedUrl === feedUrl).length;
  const jobsForEpisode = (feedUrl, episodeId) => store.all("intelligence")
    .map(([, job]) => job)
    .filter((job) => job.feedUrl === feedUrl && (job.episodeId === episodeId || job.episode?.id === episodeId));
  const failureCategory = (code) => {
    if (!code) return null;
    if (["RIGHTS_RESTRICTED", "LEGAL_BASIS_NOT_ESTABLISHED", "AUDIO_CONSENT_REQUIRED", "AUDIO_DISABLED", "AUDIO_TRANSCRIPTION_NOT_AUTHORISED", "DURATION_LIMIT", "DURATION_UNKNOWN", "AUDIO_FORMAT_UNSUPPORTED", "TRANSCRIPT_INVALID", "TRANSCRIPT_UNAVAILABLE", "TRANSCRIPT_TOO_LARGE", "FEATURE_DISABLED"].includes(code)) return "UNAVAILABLE";
    if (code === "BUDGET_LIMIT") return "BUDGET";
    if (["PROVIDER_TIMEOUT", "TIMEOUT", "PROVIDER_UNAVAILABLE", "PROVIDER_FAILURE"].includes(code)) return "PROVIDER";
    if (["QUEUE_TIMEOUT", "PROCESSING_TIMEOUT", "INTERRUPTED"].includes(code)) return "WORKER";
    return "PROCESSING";
  };
  const listenerStatus = (feedUrl, episodeId) => {
    const job = pipeline.status(feedUrl, episodeId) || jobsForEpisode(feedUrl, episodeId)
      .sort((a, b) => Date.parse(b.updatedAt || b.completedAt || b.startedAt || "") - Date.parse(a.updatedAt || a.completedAt || a.startedAt || ""))[0] || null;
    const safe = publicIntelligence(job);
    const processing = rights.evaluate({ feature: "intelligence-processing", feedUrl, episodeId });
    const display = rights.evaluate({ feature: "intelligence-display", feedUrl, episodeId });
    const operational = intelligencePolicy.allows(feedUrl, episodeId, "intelligence");
    const flags = listenerFeatures();
    const availableFeatures = {
      brief: Boolean(flags.episodeBriefs && job?.brief),
      chapters: Boolean(flags.exploreEpisode && job?.chapters?.length),
      topics: Boolean(flags.exploreEpisode && (job?.topics?.length || job?.brief?.themes?.length)),
      moments: Boolean(flags.momentSearch && job?.transcript?.segments?.some((segment) => Number.isFinite(segment.startMs))),
    };
    let projected = listenerProcessingStatus(job);
    let code = job?.code || null;
    let availabilityCode = job?.availabilityCode || availabilityCodeFor(code);
    let reason = job?.reason || null;
    let rightsCode = null;
    if (!display.allowed || !processing.allowed) {
      projected = { state: "UNAVAILABLE", stage: null, processing: false };
      rightsCode = !processing.allowed ? processing.code : display.code;
      code = rightsCode;
      availabilityCode = availabilityCodeFor(code);
      reason = !processing.allowed ? processing.reason : display.reason;
    } else if (!operational.allowed && projected.state !== "READY") {
      // An operational hold stops new work but never revokes intelligence that
      // was already lawfully prepared and persisted.
      projected = { state: "UNAVAILABLE", stage: null, processing: false };
      code = operational.code || "INTELLIGENCE_POLICY_HIGH";
      availabilityCode = availabilityCodeFor(code);
      reason = operational.reason || "New intelligence processing is paused by the podcast intelligence policy.";
    } else if (!flags.episodeBriefs) {
      projected = { state: "UNAVAILABLE", stage: null, processing: false };
      code = "FEATURE_DISABLED";
      availabilityCode = availabilityCodeFor(code);
      reason = "AI insights are not available for this episode.";
    }
    const eta = projected.processing ? processingEstimateFor(job) : null;
    const nextAction = projected.state === "READY" ? "VIEW_INTELLIGENCE"
      : projected.state === "NOT_REQUESTED" ? "PREPARE"
      : projected.processing ? "KEEP_LISTENING"
      : projected.state === "FAILED" && job?.retryable ? "RETRY"
      : projected.state === "BUDGET_PAUSED" ? "WAIT_FOR_BUDGET"
      : "EXPLORE_ANOTHER_EPISODE";
    return {
      ...safe,
      legacyState: safe.state,
      ...projected,
      canonicalEpisodeId: canonicalEpisodeId(feedUrl, episodeId),
      processingStage: projected.stage,
      jobId: job?.jobId || null,
      startedAt: job?.startedAt || null,
      lastUpdatedAt: job?.updatedAt || job?.completedAt || job?.startedAt || null,
      completedAt: job?.completedAt || null,
      failureCategory: failureCategory(availabilityCode || code),
      retryEligible: job?.retryable === true,
      retryable: job?.retryable === true,
      code,
      availabilityCode,
      rightsCode,
      reason,
      availableFeatures,
      estimatedCompletion: eta,
      nextAction,
    };
  };
  const episodeOperationsState = (feedUrl, episode) => {
    const job = pipeline.status(feedUrl, episode.id) || jobsForEpisode(feedUrl, episode.id)
      .sort((a, b) => Date.parse(b.completedAt || b.startedAt || "") - Date.parse(a.completedAt || a.startedAt || ""))[0] || null;
    const publicJob = job ? publicIntelligence(job) : null;
    const processing = rights.evaluate({ feature: "intelligence-processing", feedUrl, episodeId: episode.id });
    const display = rights.evaluate({ feature: "intelligence-display", feedUrl, episodeId: episode.id });
    const search = rights.evaluate({ feature: "conversation-search", feedUrl, episodeId: episode.id });
    const briefDecision = rights.evaluate({ feature: "episode-brief", feedUrl, episodeId: episode.id });
    const chapterDecision = rights.evaluate({ feature: "smart-chapters", feedUrl, episodeId: episode.id });
    const topicsDecision = rights.evaluate({ feature: "topics", feedUrl, episodeId: episode.id });
    const momentDecision = rights.evaluate({ feature: "find-moment", feedUrl, episodeId: episode.id });
    const adDetectionDecision = rights.evaluate({ feature: "ad-detection", feedUrl, episodeId: episode.id });
    const permissions = rights.resolve(feedUrl, episode.id);
    const policy = intelligencePolicy.effective(feedUrl, episode.id);
    const operational = intelligencePolicy.features(feedUrl, episode.id);
    const active = new Set(["QUEUED", "DISCOVERING", "TRANSCRIBING", "UNDERSTANDING", "ORGANISING", "PROCESSING", "PARTIAL_READY"]);
    let state = "NOT_PREPARED", reason = "This episode has not been prepared yet.", code = "NOT_PREPARED";
    if (!processing.allowed || !display.allowed) [state, reason, code] = ["UNAVAILABLE", !processing.allowed ? processing.reason : display.reason, !processing.allowed ? processing.code : display.code];
    // PAUSED stops new work; it does not make a previously permitted cached
    // result disappear. A distinct state keeps that operational distinction
    // visible without changing the underlying rights decision.
    else if (publicJob?.state === "READY") [state, reason, code] = ["READY", "Authorised intelligence is ready.", "READY"];
    else if (!operational.intelligence) [state, reason, code] = ["PAUSED", "New intelligence processing is paused by the podcast intelligence policy.", "INTELLIGENCE_POLICY_HIGH"];
    else if (publicJob?.state === "FAILED") [state, reason, code] = ["FAILED", publicJob.reason || "The latest preparation attempt failed.", publicJob.code || "ANALYSIS_FAILED"];
    else if (publicJob?.state === "BLOCKED") [state, reason, code] = ["UNAVAILABLE", publicJob.reason || "Preparation is currently unavailable.", publicJob.code || "PROCESSING_BLOCKED"];
    else if (publicJob?.state === "QUEUED") [state, reason, code] = ["QUEUED", "Preparation is waiting for the processing worker.", "QUEUED"];
    else if (publicJob && active.has(publicJob.state)) [state, reason, code] = ["PREPARING", "Preparation is in progress.", publicJob.phase || publicJob.state];
    const ready = state === "READY";
    const preparing = state === "PREPARING" || state === "QUEUED";
    const failed = state === "FAILED";
    const statusFor = (allowed, available) => available ? "READY" : !allowed ? "RESTRICTED" : failed ? "FAILED" : preparing ? state : "ELIGIBLE";
    const derivedAvailable = ready && Boolean(job?.brief || job?.chapters || job?.topics || job?.transcript?.segments?.length);
    const intelligenceReason = !processing.allowed ? processing.reason : !display.allowed ? display.reason : !operational.intelligence ? "Core intelligence is paused by the podcast intelligence policy." : null;
    const captionDecision = rights.evaluate({ feature: "captions", feedUrl, episodeId: episode.id });
    const dubbingDecision = rights.evaluate({ feature: "dubbing-audio", feedUrl, episodeId: episode.id });
    const transcriptReady = Boolean(job?.transcript?.segments?.length);
    const canPrepareTranscript = processing.allowed && permissions.canAcquireTranscript && operational.intelligence;
    const transcriptionState = transcriptReady ? "READY"
      : !canPrepareTranscript ? "RESTRICTED"
      : preparing ? state
      : episode.hasPublisherTranscript ? "ELIGIBLE"
      : permissions.canTranscribeAudio && pipeline.audioEnabled && ledger.controls.enabled ? "EXPLICIT_AUTHORISATION_REQUIRED"
      : "RESTRICTED";
    const transcriptionReason = transcriptReady ? "A transcript is recorded in the authorised intelligence cache."
      : !processing.allowed ? processing.reason
      : !permissions.canAcquireTranscript ? "The current rights record does not allow transcript acquisition."
      : !operational.intelligence ? "Transcript preparation is paused by the intelligence policy."
      : preparing ? "Transcript acquisition is part of the active preparation job."
      : episode.hasPublisherTranscript ? "A publisher transcript reference can be evaluated before any paid audio fallback."
      : permissions.canTranscribeAudio && pipeline.audioEnabled && ledger.controls.enabled ? "Audio fallback needs explicit administrator selection and remains subject to the hard budget."
      : "No authorised transcript source is currently available; paid audio fallback is not enabled for this request.";
    const skipIntervals = store.all("skip-interval").map(([, value]) => value)
      .filter((value) => value.episodeKey === episodeKey(feedUrl, episode.id));
    const verifiedSkips = skipIntervals.filter((value) => value.verificationState === "VERIFIED" && value.boundaryVerified && value.audioVariantFingerprint && !value.disputed);
    const adCandidates = skipIntervals.filter((value) => value.verificationState === "CANDIDATE");
    const skipInspection = skips.inspect(feedUrl, episode.id);
    const adSkipFeature = featureEnabled("adSkip");
    const autoSkipState = !processing.allowed || !display.allowed ? "RESTRICTED"
      : !adSkipFeature ? "DISABLED"
      : preparing ? state
      : verifiedSkips.length ? "PRIVATE_BETA_READY"
      : ready ? skipInspection.state === "NO_ADVERTS_DETECTED" ? "NO_ADVERTS_DETECTED" : "EVIDENCE_REQUIRED"
      : !operational.adCandidates ? "RESTRICTED"
      : "ELIGIBLE";
    const autoSkipReason = !processing.allowed ? processing.reason
      : !display.allowed ? display.reason
      : !adSkipFeature ? "Ad Skip is disabled for this controlled rollout."
      : preparing ? "Evidence is being prepared with the active intelligence job."
      : !operational.adCandidates ? "Ad candidate preparation is paused by the intelligence policy."
      : verifiedSkips.length ? "Verified segments can execute only for an exact matching source in the enabled private rollout; production release remains disabled pending measured safety evidence."
      : adCandidates.length ? "Transcript candidates exist; independent audio and boundary evidence is still required."
      : ready ? skipInspection.reason || "No automatic skip is enabled without independent evidence and a verified audio variant."
      : "Preparation can identify candidates; it cannot enable automatic skipping.";
    const features = [
      ["Transcription", transcriptionState, transcriptionReason],
      ["Episode brief", statusFor(processing.allowed && display.allowed && briefDecision.allowed && operational.intelligence, Boolean(job?.brief)), !briefDecision.allowed ? briefDecision.reason : intelligenceReason],
      ["Smart chapters", statusFor(processing.allowed && display.allowed && chapterDecision.allowed && operational.chapters, Boolean(job?.chapters?.length)), !chapterDecision.allowed ? chapterDecision.reason : intelligenceReason || (!operational.chapters ? "Chapters are paused by the podcast intelligence policy." : null)],
      ["Topics", statusFor(processing.allowed && display.allowed && topicsDecision.allowed && operational.topics, Boolean(job?.topics?.length || job?.brief?.topics?.length)), !topicsDecision.allowed ? topicsDecision.reason : intelligenceReason || (!operational.topics ? "Topics are paused by the podcast intelligence policy." : null)],
      ["Find a moment", statusFor(processing.allowed && display.allowed && momentDecision.allowed && operational.moments, Boolean(job?.transcript?.segments?.some((segment) => Number.isFinite(segment.startMs)))), !momentDecision.allowed ? momentDecision.reason : intelligenceReason || (!operational.moments ? "Moment search is paused by the podcast intelligence policy." : null)],
      ["Conversation search", statusFor(search.allowed && operational.conversationSearch, Boolean(job?.transcript?.segments?.length)), !search.allowed ? search.reason : !operational.conversationSearch ? "Conversation search is paused by the podcast intelligence policy." : null],
      ["Advert detection", statusFor(processing.allowed && display.allowed && adDetectionDecision.allowed && operational.adCandidates, adCandidates.length > 0), !adDetectionDecision.allowed ? adDetectionDecision.reason : intelligenceReason || "Candidate detection never enables automatic skipping."],
      ["Automatic Ad Skip", autoSkipState, autoSkipReason],
      ["Captions", statusFor(captionDecision.allowed && operational.captions, false), !captionDecision.allowed ? captionDecision.reason : !operational.captions ? "Captions are paused by the podcast intelligence policy." : "Caption delivery has its own rights and policy gate."],
      ["Private AI Dubbing", statusFor(dubbingDecision.allowed && operational.dubbing, false), !dubbingDecision.allowed ? dubbingDecision.reason : !operational.dubbing ? "Private AI Dubbing is paused by the intelligence policy." : "Private AI Dubbing remains separately authorised, beta-only and budget-limited."],
    ].map(([name, featureState, detail]) => ({ name, state: featureState, reason: detail || (featureState === "READY" ? "Available from the authorised processing record." : null) }));
    const action = ready ? { type: "VIEW_RESULTS", label: "View intelligence" }
      : preparing ? { type: "VIEW_PROCESSING", label: "View processing" }
      : failed && publicJob?.retryable && processing.allowed && display.allowed ? { type: "RETRY", label: "Retry eligible failure" }
      : state === "NOT_PREPARED" ? { type: "PREPARE", label: "Prepare intelligence" }
      : state === "PAUSED" ? { type: "RESUME", label: "Resume processing" }
      : { type: "REVIEW", label: "Review rights and policy" };
    const blockers = [
      !processing.allowed ? { code: processing.code, reason: processing.reason, type: "RIGHTS" } : null,
      !display.allowed ? { code: display.code, reason: display.reason, type: "RIGHTS" } : null,
      !operational.intelligence && !ready ? { code: "INTELLIGENCE_POLICY_HIGH", reason: "New intelligence processing is paused by the selected policy.", type: "POLICY" } : null,
      failed ? { code, reason, type: "PROCESSING" } : null,
    ].filter(Boolean);
    const expectedProcessing = ready ? "Permitted cached intelligence remains available."
      : state === "PAUSED" ? "No new work will start until an administrator changes the intelligence level."
      : preparing ? "The existing job will continue through the recorded pipeline stages."
      : episode.hasPublisherTranscript ? "Preparation will evaluate the publisher transcript before any paid audio fallback."
      : "Preparation will reuse a canonical cache where available; audio fallback is never automatic.";
    return {
      ...episode,
      canonicalEpisodeId: canonicalEpisodeId(feedUrl, episode.id),
      state, code, reason, action, job: publicJob, policy: { ...policy, level: intelligenceLevel(policy.tier) }, rights: permissions,
      processingStatus: listenerStatus(feedUrl, episode.id),
      rightsDecisions: { processing, display, search, brief: briefDecision, chapters: chapterDecision, topics: topicsDecision, moments: momentDecision, adDetection: adDetectionDecision }, features,
      effectivePolicy: { level: intelligenceLevel(policy.tier), source: policy.source, version: policy.version, availability: state, eligible: state === "NOT_PREPARED", blockers, expectedProcessing },
      adSkip: { candidateCount: adCandidates.length, verifiedCount: verifiedSkips.length, state: skipInspection.state, verificationState: skipInspection.verificationState, controlledRolloutEnabled: adSkipFeature, productionAutomaticSkipping: false },
      transcript: job?.provenance ? { ...job.provenance, readiness: job.readiness || null, quality: job.quality || null } : { publisherReference: episode.hasPublisherTranscript === true, availability: episode.hasPublisherTranscript ? "PUBLISHER_REFERENCE" : "NOT_DISCOVERED" },
      hasUsableIntelligence: derivedAvailable,
    };
  };
  const readPodcast = async (entry) => {
    const feedUrl = entry.feedUrl;
    try {
      const parsed = episodesFromFeed(await feedXml(feedUrl), feedUrl);
      const title = parsed.title || entry.metadata.title || "Untitled podcast";
      const episodes = parsed.episodes.map((episode) => episodeOperationsState(feedUrl, episode));
      const counts = Object.fromEntries(["READY", "PREPARING", "QUEUED", "UNAVAILABLE", "FAILED", "PAUSED", "NOT_PREPARED"].map((state) => [state, episodes.filter((episode) => episode.state === state).length]));
      return {
        feedUrl, canonicalFeedId: canonicalFeedId(feedUrl), title, publisher: parsed.publisher || entry.metadata.publisher || "Publisher unavailable", artworkUrl: parsed.art || entry.metadata.artworkUrl || null,
        metadataStatus: "READY", episodes, counts, followerCount: followedCount(feedUrl), source: entry.metadata.source || "persisted-record",
      };
    } catch (error) {
      const jobs = store.all("intelligence").map(([, job]) => job).filter((job) => job.feedUrl === feedUrl);
      const metadata = entry.metadata || {};
      return {
        feedUrl, canonicalFeedId: canonicalFeedId(feedUrl), title: metadata.title || jobs[0]?.episode?.showName || "Podcast metadata unavailable", publisher: metadata.publisher || jobs[0]?.episode?.publisher || "Publisher unavailable", artworkUrl: metadata.artworkUrl || jobs[0]?.episode?.artworkUrl || null,
        metadataStatus: "UNAVAILABLE", metadataReason: "The publisher feed could not be read right now.", episodes: [], counts: {}, followerCount: followedCount(feedUrl), source: metadata.source || "persisted-record",
      };
    }
  };
  const catalogueSort = (items, sort) => {
    const copy = [...items];
    if (sort === "latest") return copy.sort((a, b) => Math.max(...b.episodes.map((episode) => Date.parse(episode.publishedAt || "") || 0), 0) - Math.max(...a.episodes.map((episode) => Date.parse(episode.publishedAt || "") || 0), 0));
    if (sort === "ready") return copy.sort((a, b) => (b.counts.READY || 0) - (a.counts.READY || 0) || a.title.localeCompare(b.title));
    return copy.sort((a, b) => a.title.localeCompare(b.title));
  };
  const podcastCatalogue = async ({ query = "", page = 1, pageSize = 20, sort = "title" } = {}) => {
    const safePage = Math.max(1, Math.floor(Number(page) || 1));
    const safeSize = Math.max(1, Math.min(50, Math.floor(Number(pageSize) || 20)));
    const models = await Promise.all(knownPodcastFeeds().map(readPodcast));
    const needle = String(query || "").trim().toLowerCase();
    const filtered = catalogueSort(models.filter((item) => !needle || [item.title, item.publisher, item.feedUrl, item.canonicalFeedId].join(" ").toLowerCase().includes(needle)), sort);
    const start = (safePage - 1) * safeSize;
    return { generatedAt: new Date().toISOString(), query: needle, sort, page: safePage, pageSize: safeSize, total: filtered.length, totalPages: Math.max(1, Math.ceil(filtered.length / safeSize)), items: filtered.slice(start, start + safeSize).map(({ episodes, ...item }) => item) };
  };
  const podcastDetail = async (feedUrl, { episodeQuery = "", page = 1, pageSize = 20 } = {}) => {
    const entry = knownPodcastFeeds().find((item) => item.feedUrl === feedUrl);
    if (!entry) throw Error("This RSS source is not in the Radio Star operations catalogue.");
    const podcast = await readPodcast(entry);
    const needle = String(episodeQuery || "").trim().toLowerCase();
    const matching = podcast.episodes.filter((episode) => !needle || [episode.title, episode.id, episode.canonicalEpisodeId].join(" ").toLowerCase().includes(needle));
    const safePage = Math.max(1, Math.floor(Number(page) || 1));
    const safeSize = Math.max(1, Math.min(50, Math.floor(Number(pageSize) || 20)));
    const start = (safePage - 1) * safeSize;
    const futurePolicy = intelligencePolicy.effective(feedUrl);
    const episodes = podcast.episodes;
    const primaryAction = episodes.some((episode) => episode.state === "PAUSED")
      ? { type: "RESUME", label: "Resume processing", reason: "New intelligence is paused for one or more current episodes." }
      : episodes.some((episode) => ["PREPARING", "QUEUED"].includes(episode.state))
        ? { type: "VIEW_PREPARATION", label: "View preparation", reason: "At least one current episode has active preparation." }
        : episodes.some((episode) => episode.state === "NOT_PREPARED")
          ? { type: "PREPARE", label: "Prepare intelligence", reason: "Eligible current episodes are not prepared yet." }
          : episodes.some((episode) => episode.state === "UNAVAILABLE")
            ? { type: "RESOLVE", label: "Resolve availability", reason: "A rights or policy decision needs attention before work can start." }
            : episodes.some((episode) => episode.state === "READY")
              ? { type: "VIEW_RESULTS", label: "View intelligence", reason: "Permitted intelligence is ready for at least one current episode." }
              : { type: "REVIEW", label: "Review availability", reason: "No current RSS episode is ready for a processing decision." };
    const policySummary = {
      level: intelligenceLevel(futurePolicy.tier), source: futurePolicy.source, version: futurePolicy.version,
      appliesToFuture: futurePolicy.applyToFuture !== false,
      inheritance: futurePolicy.source === "global" ? "Inherited from the global default." : "Explicit podcast policy; episode overrides can be more restrictive or different.",
      primaryAction,
    };
    return { ...podcast, futurePolicy: { ...futurePolicy, level: intelligenceLevel(futurePolicy.tier) }, policySummary, estimatedMedianProcessingMs: processingEstimate(), episodePage: { page: safePage, pageSize: safeSize, total: matching.length, totalPages: Math.max(1, Math.ceil(matching.length / safeSize)), items: matching.slice(start, start + safeSize) } };
  };
  const episodeDetail = async (feedUrl, episodeId) => {
    const detail = await podcastDetail(feedUrl, { pageSize: 50 });
    const episode = detail.episodes.find((candidate) => candidate.id === episodeId);
    if (!episode) throw Error("This episode no longer appears in the publisher feed.");
    const history = jobsForEpisode(feedUrl, episodeId).map((job) => publicIntelligence(job)).sort((a, b) => Date.parse(a.startedAt || "") - Date.parse(b.startedAt || ""));
    const timeline = [{ at: episode.publishedAt || null, type: "PUBLISHER_METADATA", label: "Published in the current publisher feed." }];
    const recordedEvents = pipeline.eventsFor(feedUrl, episodeId);
    if (recordedEvents.length) {
      for (const event of recordedEvents)
        timeline.push({
          at: event.at,
          // Keep the established Admin event name for existing consumers while
          // deriving it from the durable READY transition, never from a timer.
          type: event.type === "INTELLIGENCE_READY" ? "PROCESSING_COMPLETED" : event.type,
          eventType: event.type,
          label: event.reason || (event.stage ? `Recorded ${String(event.stage).toLowerCase().replaceAll("_", " ")} stage.` : "Recorded processing transition."),
          state: listenerProcessingStatus({ state: event.state, processingStage: event.stage, code: event.code }).state,
          stage: event.stage,
          jobId: event.jobId,
          code: event.code,
        });
    } else {
      // Pre-instrumentation jobs retain only their persisted timestamps. Label
      // them as such rather than inventing detailed stages retroactively.
      for (const job of history) {
        if (job.startedAt) timeline.push({ at: job.startedAt, type: "LEGACY_PROCESSING_REQUEST", label: "Recorded processing request from a pre-timeline job.", state: job.state, jobId: job.jobId });
        if (job.completedAt) timeline.push({ at: job.completedAt, type: "LEGACY_PROCESSING_COMPLETION", label: "Recorded completion from a pre-timeline job.", state: job.state, jobId: job.jobId });
      }
    }
    const status = listenerStatus(feedUrl, episodeId);
    const workerStarted = recordedEvents.find((event) => event.type === "WORKER_STARTED")?.at || null;
    const queuedAt = Date.parse(status.startedAt || "");
    const workerAt = Date.parse(workerStarted || "");
    const jobCost = status.jobId ? ledger.usage.filter((row) => row.id.startsWith(`${status.jobId}:`)).reduce((sum, row) => sum + row.usd, 0) : 0;
    return {
      podcast: { feedUrl, title: detail.title, publisher: detail.publisher, artworkUrl: detail.artworkUrl, canonicalFeedId: detail.canonicalFeedId },
      episode: { ...episode, processingStatus: status },
      processingHistory: history,
      timeline: timeline.filter((item) => item.at).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
      estimatedMedianProcessingMs: processingEstimate(),
      estimatedCompletion: status.estimatedCompletion,
      processing: {
        state: status.state,
        stage: status.processingStage,
        jobId: status.jobId,
        startedAt: status.startedAt,
        lastUpdatedAt: status.lastUpdatedAt,
        completedAt: status.completedAt,
        elapsedMs: queuedAt ? Math.max(0, Date.now() - queuedAt) : null,
        queueWaitMs: queuedAt && workerAt ? Math.max(0, workerAt - queuedAt) : null,
        failureCategory: status.failureCategory,
        failureCode: status.availabilityCode || status.code || null,
        failureReason: status.reason || null,
        retryEligible: status.retryEligible,
        audioTranscriptionRequired: status.transcriptChecks?.audioTranscriptionRequired === true,
        transcriptChecks: status.transcriptChecks
          ? {
              cacheChecked: status.transcriptChecks.cacheChecked === true,
              cacheHit: status.transcriptChecks.cacheHit === true,
              publisherTranscriptChecked:
                status.transcriptChecks.publisherTranscriptChecked === true,
              publisherTranscriptFound:
                status.transcriptChecks.publisherTranscriptFound === true,
              publisherTranscriptReferenceCount: Number(
                status.transcriptChecks.publisherTranscriptReferenceCount || 0,
              ),
            }
          : null,
        actualCostUsd: Number(jobCost.toFixed(6)),
        estimatedCompletion: status.estimatedCompletion,
      },
    };
  };
  const policyImpact = async (input = {}) => {
    if (!publicUrl(input.feedUrl)) throw Error("A valid podcast RSS URL is required.");
    const entry = knownPodcastFeeds().find((item) => item.feedUrl === input.feedUrl);
    if (!entry) throw Error("This RSS source is not in the Radio Star operations catalogue.");
    const tier = ["ZERO", "LOW", "MEDIUM", "HIGH"].includes(input.tier) ? input.tier : intelligencePolicy.effective(input.feedUrl, input.episodeId || "").tier;
    const source = await readPodcast(entry);
    const limit = Math.max(1, Math.min(3, Math.floor(Number(input.maxEpisodes) || 1)));
    const candidates = (input.episodeId ? source.episodes.filter((episode) => episode.id === input.episodeId) : source.episodes)
      .sort((a, b) => Date.parse(b.publishedAt || "") - Date.parse(a.publishedAt || "")).slice(0, limit);
    const currentPolicy = intelligencePolicy.effective(input.feedUrl, input.episodeId || "");
    const proposedEnabled = tier !== "HIGH";
    const includeAudio = input.includeAuthorisedAudio === true;
    const impacts = candidates.map((episode) => {
      const rightsAllowed = episode.rightsDecisions.processing.allowed && episode.rightsDecisions.display.allowed;
      const currentEnabled = intelligencePolicy.features(input.feedUrl, episode.id).intelligence;
      const audioSeconds = durationMs(episode.duration);
      const audioFallback = includeAudio && !episode.transcript.publisherReference && episode.rights.canTranscribeAudio && pipeline.audioEnabled && audioSeconds && audioSeconds <= ledger.controls.maxEpisodeSeconds;
      const estimatedAudioFallbackCostUsd = audioFallback ? Number((audioSeconds / 1000 * 0.0001).toFixed(4)) : 0;
      const newlyEligible = proposedEnabled && rightsAllowed && !currentEnabled && episode.state !== "READY";
      const stillRestricted = !rightsAllowed || (proposedEnabled && !episode.rights.canAcquireTranscript && !audioFallback);
      const proposedFeatures = {
        captions: ["ZERO", "MEDIUM"].includes(tier),
        dubbing: ["ZERO", "MEDIUM"].includes(tier),
      };
      const featureChanges = [
        ["Transcription", proposedEnabled && episode.rights.canAcquireTranscript],
        ["AI Episode Brief", proposedEnabled && rightsAllowed],
        ["Smart Chapters", proposedEnabled && rightsAllowed],
        ["Topics", proposedEnabled && rightsAllowed],
        ["Find a Moment", proposedEnabled && rightsAllowed],
        ["Conversation Search", proposedEnabled && episode.rightsDecisions.search.allowed],
        ["Advert Detection", proposedEnabled && rightsAllowed],
        ["Synchronised Captions", proposedFeatures.captions && rights.evaluate({ feature: "captions", feedUrl: input.feedUrl, episodeId: episode.id }).allowed],
        ["Private AI Dubbing", proposedFeatures.dubbing && rights.evaluate({ feature: "dubbing-audio", feedUrl: input.feedUrl, episodeId: episode.id }).allowed],
      ];
      return {
        episodeId: episode.id, title: episode.title, currentState: episode.state,
        proposedState: tier === "HIGH" && episode.state !== "READY" ? "PAUSED" : stillRestricted ? "RESTRICTED" : newlyEligible ? "ELIGIBLE" : episode.state,
        newlyEligible, stillRestricted, existingReady: episode.state === "READY", wouldBePaused: tier === "HIGH" && episode.state !== "READY",
        estimatedAudioFallbackCostUsd, audioFallbackRequested: Boolean(audioFallback),
        featureChanges: featureChanges.map(([name, eligible]) => ({ name, eligible, reason: eligible ? "Eligible only after the normal rights, budget and processing checks." : "Not made available by this policy change or its independent gate." })),
      };
    });
    ledger.refresh();
    const totals = ledger.totals();
    const estimatedAudioFallbackCostUsd = Number(impacts.reduce((sum, episode) => sum + episode.estimatedAudioFallbackCostUsd, 0).toFixed(4));
    const summary = {
      affectedEpisodes: impacts.length,
      existingReady: impacts.filter((episode) => episode.existingReady).length,
      newlyEligible: impacts.filter((episode) => episode.newlyEligible).length,
      stillRestricted: impacts.filter((episode) => episode.stillRestricted).length,
      wouldPause: impacts.filter((episode) => episode.wouldBePaused).length,
    };
    const enabledFeatureNames = [...new Set(impacts.flatMap((episode) => episode.featureChanges.filter((feature) => feature.eligible).map((feature) => feature.name)))];
    const unavailableFeatureNames = [...new Set(impacts.flatMap((episode) => episode.featureChanges.filter((feature) => !feature.eligible).map((feature) => feature.name)))];
    return {
      scope: input.episodeId ? "episode" : "podcast", maximumExistingEpisodes: limit,
      current: { tier: currentPolicy.tier, level: intelligenceLevel(currentPolicy.tier), source: currentPolicy.source, version: currentPolicy.version },
      proposed: { tier, level: intelligenceLevel(tier), applyToFuture: input.applyToFuture !== false },
      impacts, summary,
      features: { becomeEligible: enabledFeatureNames, remainUnavailable: unavailableFeatureNames },
      cost: {
        estimatedAudioFallbackCostUsd, audioFallbackIncluded: includeAudio,
        note: includeAudio ? "This is the maximum measurable audio-fallback estimate for this bounded request; a publisher transcript or cache can reduce it." : "Audio transcription is excluded. Publisher transcripts and existing caches are checked first.",
      },
      budget: {
        dailyRemainingUsd: Number(Math.max(0, ledger.controls.dailyUsd - totals.day).toFixed(4)),
        monthlyRemainingUsd: Number(Math.max(0, ledger.controls.monthlyUsd - totals.month).toFixed(4)),
        dailyTranscriptionSecondsRemaining: Math.max(0, ledger.controls.dailyTranscriptionSeconds - totals.transcriptionSeconds),
        maximumEpisodeSeconds: ledger.controls.maxEpisodeSeconds,
      },
      futureEpisodeBehaviour: tier === "HIGH" ? "Future episodes inherit a pause for new intelligence. Existing permitted cache remains available." : "Future eligible episodes inherit this level and still pass independent rights, feature, queue and budget checks.",
      note: "This preview does not queue work, grant rights, reserve budget or change the current policy.",
    };
  };
  const prepareEpisode = async (input, actor) => {
    if (!publicUrl(input.feedUrl) || typeof input.episodeId !== "string" || !input.episodeId) throw Error("Choose a valid publisher episode.");
    await assessEpisodeRights(input.feedUrl, input.episodeId);
    const detail = await episodeDetail(input.feedUrl, input.episodeId);
    const current = detail.episode;
    if (!["PREPARE", "RETRY"].includes(current.action.type)) throw Error(current.reason || "This episode is not eligible for preparation.");
    const requested = await pipeline.request({ feedUrl: input.feedUrl, episodeId: input.episodeId, retry: current.action.type === "RETRY", allowAudio: false, trigger: "admin" });
    const status = listenerStatus(input.feedUrl, input.episodeId);
    rights.audit("admin-episode-processing-requested", `${input.feedUrl}:${input.episodeId}`, actor.id, { jobId: requested.jobId || null, state: status.state, audio: false });
    adminService.appendAudit({ actor, action: "admin-episode-processing-requested", resource: `${input.feedUrl}:${input.episodeId}`, newState: { state: status.state, jobId: requested.jobId || null }, reason: "Explicit operational request; audio transcription remains off.", outcome: "ALLOWED" });
    return { status, audioTranscription: "NOT_REQUESTED", estimatedMedianProcessingMs: processingEstimate() };
  };
  const applyIntelligencePolicy = async (input, actor) => {
    const scope = input.scope === "global" ? "global" : input.scope === "episode" ? "episode" : "podcast";
    if (input.confirmation !== "SAVE POLICY") throw Error("Type SAVE POLICY before changing intelligence automation.");
    if (scope !== "global" && (!publicUrl(input.feedUrl) || !knownPodcastFeeds().some((item) => item.feedUrl === input.feedUrl)))
      throw Error("Choose a podcast from the Radio Star operations catalogue.");
    if (scope === "episode" && (typeof input.episodeId !== "string" || !input.episodeId))
      throw Error("Choose a publisher episode before creating an episode override.");
    const policy = scope === "global" ? intelligencePolicy.setGlobal(input, { actor: actor.id }) : intelligencePolicy.set({ ...input, episodeId: scope === "episode" ? input.episodeId : undefined }, { actor: actor.id });
    const jobs = [];
    // Existing work is deliberately bounded, and audio is opt-in even where a
    // recorded rights permission exists. This never becomes a back-catalogue bill.
    if (scope !== "global" && policy.applyToExisting && policy.tier !== "HIGH") {
      const maximum = Math.max(1, Math.min(3, Math.floor(Number(input.maxEpisodes) || 1)));
      const candidates = scope === "episode" ? [await pipeline.resolveEpisode(input.feedUrl, input.episodeId)] : [...(await (async () => {
        const parsed = episodesFromFeed(await feedXml(input.feedUrl), input.feedUrl);
        return parsed.episodes.filter((episode) => episode.id).sort((a, b) => Date.parse(b.publishedAt || "") - Date.parse(a.publishedAt || "")).slice(0, maximum);
      })())];
      for (const episode of candidates) {
        await assessEpisodeRights(input.feedUrl, episode.id, episode);
        const processing = rights.evaluate({ feature: "intelligence-processing", feedUrl: input.feedUrl, episodeId: episode.id, audit: true });
        const display = rights.evaluate({ feature: "intelligence-display", feedUrl: input.feedUrl, episodeId: episode.id, audit: true });
        const permission = rights.resolve(input.feedUrl, episode.id);
        if (!processing.allowed || !display.allowed) { jobs.push({ episodeId: episode.id, state: "BLOCKED", code: "RIGHTS_RESTRICTED", reason: !processing.allowed ? processing.reason : display.reason }); continue; }
        try {
          jobs.push(await pipeline.request({ feedUrl: input.feedUrl, episodeId: episode.id, allowAudio: input.includeAuthorisedAudio === true && permission.canTranscribeAudio === true, trigger: "admin" }));
        } catch (error) {
          jobs.push({ episodeId: episode.id, state: "FAILED", code: "PROCESSING_REQUEST_FAILED", reason: String(error?.message || "The preparation request could not be recorded.") });
        }
      }
    }
    const createdJobs = jobs.filter((job) => job.jobId).map((job) => ({ episodeId: job.episodeId, jobId: job.jobId, state: job.state }));
    rights.audit("intelligence-policy-changed", policy.id, actor.id, { scope, tier: policy.tier, version: policy.version, affectedEpisodes: jobs.length, jobsCreated: createdJobs.length });
    adminService.appendAudit({ actor, action: "intelligence-policy-changed", resource: policy.id, previousState: { source: scope, expectedVersion: input.expectedVersion ?? null }, newState: { scope, tier: policy.tier, level: intelligenceLevel(policy.tier).label, version: policy.version, affectedEpisodes: jobs.length, jobsCreated: createdJobs }, reason: policy.reason, outcome: "ALLOWED" });
    return { policy: { ...policy, level: intelligenceLevel(policy.tier) }, jobs, createdJobs, processingStarted: createdJobs.length > 0 };
  };
  const resetIntelligencePolicy = (input, actor) => {
    if (input.confirmation !== "RESET POLICY") throw Error("Type RESET POLICY before resetting an override.");
    const scope = input.scope === "episode" ? "episode" : "podcast";
    if (!publicUrl(input.feedUrl) || !knownPodcastFeeds().some((item) => item.feedUrl === input.feedUrl))
      throw Error("Choose a podcast from the Radio Star operations catalogue.");
    if (scope === "episode" && (typeof input.episodeId !== "string" || !input.episodeId))
      throw Error("Choose an episode override to reset.");
    const outcome = intelligencePolicy.clear(input.feedUrl, scope === "episode" ? input.episodeId : "", { actor: actor.id, expectedVersion: input.expectedVersion, reason: input.reason });
    adminService.appendAudit({ actor, action: "intelligence-policy-reset", resource: outcome.previous.id, previousState: { tier: outcome.previous.tier, version: outcome.previous.version }, newState: { tier: outcome.effective.tier, level: intelligenceLevel(outcome.effective.tier).label, source: outcome.effective.source, version: outcome.effective.version }, reason: input.reason || "Reset to inherited policy.", outcome: "ALLOWED" });
    return { previous: outcome.previous, effective: { ...outcome.effective, level: intelligenceLevel(outcome.effective.tier) } };
  };
  const approveAndProcess = async (input, actor) => {
    const scope = input.scope === "podcast" ? "podcast" : "episode";
    if (!publicUrl(input.feedUrl) || (scope === "episode" && (typeof input.episodeId !== "string" || !input.episodeId)))
      throw Error("Choose a valid podcast channel and episode.");
    const target = scope === "podcast" ? await latestEpisode(input.feedUrl) : await pipeline.resolveEpisode(input.feedUrl, input.episodeId);
    const approval = rights.approveProcessing({ ...input, episodeId: scope === "episode" ? input.episodeId : undefined }, { actor: actor.id });
    // A documented approval is an explicit operational decision as well as a
    // rights assessment. Keep it at LOW: core intelligence only, with no
    // implication that captions, dubbing or voice features are authorised.
    let operationalPolicy = intelligencePolicy.effective(input.feedUrl, target.id);
    if (!intelligencePolicy.allows(input.feedUrl, target.id, "intelligence").allowed)
      operationalPolicy = intelligencePolicy.set({
        feedUrl: input.feedUrl,
        episodeId: scope === "episode" ? target.id : undefined,
        tier: "LOW", applyToExisting: false, applyToFuture: scope === "podcast",
        reason: "Documented Super Admin approval enabled bounded core intelligence.",
      }, { actor: actor.id });
    const status = await pipeline.request({
      feedUrl: input.feedUrl,
      episodeId: target.id,
      allowAudio: approval.record.canTranscribeAudio === true,
      retry: true,
      trigger: "admin",
    });
    const record = {
      id: randomUUID(), at: Date.now(), actor: actor.id, scope,
      feedUrl: input.feedUrl, episodeId: target.id, episodeTitle: target.title || input.episodeTitle || null,
      podcast: target.showName || target.podcast || input.podcast || null,
      classification: approval.record.classification, legalBasis: approval.record.legalBasis,
      audioTranscriptionApproved: approval.record.canTranscribeAudio,
      status: status.state, jobId: status.jobId || null, intelligenceTier: operationalPolicy.tier,
    };
    store.set("processing-approval", record.id, record);
    rights.audit("super-admin-processing-queued", record.id, actor.id, { scope, feedUrl: record.feedUrl, episodeId: record.episodeId, jobId: record.jobId, status: record.status });
    adminService.appendAudit({ actor, action: "super-admin-processing-approved", resource: record.id, newState: { scope, feedUrl: record.feedUrl, episodeId: record.episodeId, status: record.status }, reason: approval.reason, outcome: "ALLOWED" });
    return { approval: record, status, rights: approval.record };
  };
  let followMonitor = null;
  if (env.STARCAST_FOLLOW_MONITOR === "enabled") {
    const refresh = () => Promise.allSettled(listeners.followedFeeds().map(scheduleFollowedFeed));
    followMonitor = setInterval(refresh, 6 * 60 * 60 * 1000);
    followMonitor.unref?.();
    setTimeout(refresh, 5_000).unref?.();
  }
  const captionWindows = new Map();
  const enrollmentWindows = new Map();
  const adminLoginWindows = new Map();
  const captionRate = (listener) => {
    const now = Date.now();
    const windows = (captionWindows.get(listener.id) || []).filter((at) => now - at < 60_000);
    if (windows.length >= 24) return false;
    windows.push(now);
    captionWindows.set(listener.id, windows);
    return true;
  };
  function rate(req) {
    const key = req.socket.remoteAddress || "unknown",
      now = Date.now(),
      list = (windows.get(key) || []).filter((t) => now - t < 60_000);
    if (list.length >= 120) return false;
    list.push(now);
    windows.set(key, list);
    if (windows.size > 2000)
      for (const [k, v] of windows)
        if (v.at(-1) < now - 60_000) windows.delete(k);
    return true;
  }
  const enrollmentRate = (req) => {
    const key = req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const attempts = (enrollmentWindows.get(key) || []).filter(
      (at) => now - at < 15 * 60_000,
    );
    if (attempts.length >= 8) return false;
    attempts.push(now);
    enrollmentWindows.set(key, attempts);
    return true;
  };
  const adminLoginRate = (req) => {
    const key = req.socket.remoteAddress || "unknown", now = Date.now();
    const attempts = (adminLoginWindows.get(key) || []).filter((at) => now - at < 15 * 60_000);
    if (attempts.length >= 8) return false;
    attempts.push(now); adminLoginWindows.set(key, attempts);
    return true;
  };
  // CloudFront terminates viewer TLS before its private HTTP origin, so the
  // origin socket is not encrypted even though the browser connection is.
  const secureCookie = (req) => env.NODE_ENV === "production" || req.socket.encrypted || req.headers["x-forwarded-proto"] === "https" || req.headers["cloudfront-forwarded-proto"] === "https";
  const adminCookie = (value, req, maxAge = 8 * 60 * 60) => `starcast_admin=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureCookie(req) ? "; Secure" : ""}`;
  const csrfCookie = (value, req, maxAge = 8 * 60 * 60) => `starcast_admin_csrf=${encodeURIComponent(value)}; Path=/; SameSite=Strict; Max-Age=${maxAge}${secureCookie(req) ? "; Secure" : ""}`;
  const issuePilotInvite = (input) => {
    const maxUses = Math.max(1, Math.min(100, Math.floor(Number(input.maxUses) || 1)));
    const expiresAt = new Date(input.expiresAt || Date.now() + 30 * 86400_000);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now() || expiresAt.getTime() > Date.now() + 90 * 86400_000)
      throw Error("A pilot invite expiry within the next 90 days is required.");
    const code = enrollmentCode();
    const record = {
      id: randomBytes(16).toString("hex"),
      codeHash: tokenHash(code),
      label: typeof input.label === "string" ? input.label.slice(0, 120) : "Private beta",
      maxUses,
      uses: 0,
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString(),
      revokedAt: null,
    };
    store.set("pilot-invite", record.id, record);
    return { code, invite: { ...record, codeHash: undefined } };
  };
  const enrollPilot = (input) => {
    const code = typeof input.code === "string" ? input.code.trim() : "";
    if (!/^sc_[A-Za-z0-9_-]{20,}$/.test(code)) throw Error("A valid private-beta access code is required.");
    const now = Date.now();
    const invite = store.all("pilot-invite").map(([, value]) => value).find(
      (value) => value.codeHash === tokenHash(code),
    );
    if (!invite || invite.revokedAt || invite.uses >= invite.maxUses || Date.parse(invite.expiresAt) <= now)
      throw Error("This private-beta access code is unavailable.");
    const token = pilotToken();
    const device = {
      id: tokenHash(token),
      inviteId: invite.id,
      label: invite.label,
      enrolledAt: new Date(now).toISOString(),
      expiresAt: invite.expiresAt,
      revokedAt: null,
      lastSeenAt: new Date(now).toISOString(),
    };
    store.transaction(() => {
      store.set("pilot-invite", invite.id, { ...invite, uses: invite.uses + 1 });
      store.set("pilot-device", device.id, device);
    });
    return { token, expiresAt: device.expiresAt };
  };
  const valid = (r) =>
    publicUrl(r.feedUrl) &&
    typeof r.episodeId === "string" &&
    r.episodeId.length > 0 &&
    r.episodeId.length <= 2000;
  const testCorpusEnabled = env.STARCAST_APPROVED_TEST_CORPUS === "enabled";
  const testCorpusOrigin = /^https:\/\/[a-z0-9]+\.cloudfront\.net$/.test(env.STARCAST_TEST_CORPUS_ORIGIN || "")
    ? env.STARCAST_TEST_CORPUS_ORIGIN
    : null;
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/api/apple/notifications" && req.method === "POST") {
        if (!rate(req)) return send(res, 429, { error: "Please retry later." });
        return send(res, 200, await subscriptions.notification((await body(req)).signedPayload));
      }
      if (url.pathname === "/api/pilot/enroll" && req.method === "POST") {
        if (!enrollmentRate(req)) return send(res, 429, { error: "Too many enrollment attempts. Please wait before trying again." });
        const enrollment = enrollPilot(await body(req));
        return send(res, 201, enrollment);
      }
      if (url.pathname === "/api/admin/session" && req.method === "POST") {
        if (!adminLoginRate(req)) return send(res, 429, { error: "Too many administrator login attempts. Please wait before trying again." });
        const input = await body(req);
        const actor = adminService.actorForToken(env.STARCAST_ADMIN_TOKEN, input.adminToken);
        if (!actor) return send(res, 401, { error: "Administrator authentication failed." });
        const session = adminService.startSession(actor);
        res.setHeader("set-cookie", [adminCookie(session.id, req), csrfCookie(session.csrf, req)]);
        return send(res, 201, { actor, permissions: adminService.permissionsFor(actor.role), expiresAt: session.expiresAt });
      }
      if (url.pathname === "/api/admin/session" && req.method === "GET") {
        const actor = adminActor(req, "overview:read");
        if (!actor) return send(res, 401, { error: "Administrator authentication is required." });
        return send(res, 200, { actor, permissions: adminService.permissionsFor(actor.role) });
      }
      if (url.pathname === "/api/admin/session" && req.method === "DELETE") {
        const actor = adminActor(req, "overview:read", { write: true });
        if (!actor) return send(res, 403, { error: "A valid administrator session and CSRF token are required." });
        adminService.revokeSession(cookies(req).starcast_admin, actor);
        res.setHeader("set-cookie", [adminCookie("", req, 0), csrfCookie("", req, 0)]);
        return send(res, 200, { revoked: true });
      }
      const corpus = testCorpusEnabled && testCorpusOrigin && approvedTestCorpus.response(url.pathname, testCorpusOrigin);
      const isAdminSurface = url.pathname === "/admin" || url.pathname.startsWith("/admin.") || url.pathname.startsWith("/api/admin/");
      if (env.STARCAST_PRIVATE_PILOT === "enabled" && url.pathname !== "/api/health" && !isAdminSurface && !corpus && req.method !== "OPTIONS" && !trusted(req))
        return send(res, 403, { error: "Your private-beta access has expired or been revoked. Reconnect with a new invitation.", code: "DEVICE_UNAUTHORISED" });
      if (
        req.headers.origin &&
        [
          env.STARCAST_PREVIEW_ORIGIN,
          "http://localhost:8081",
          "http://localhost:8082",
        ]
          .filter(Boolean)
          .includes(req.headers.origin)
      ) {
        res.setHeader("access-control-allow-origin", req.headers.origin);
        res.setHeader("vary", "Origin");
        res.setHeader(
          "access-control-allow-headers",
          "content-type,x-star-cast-dev-token,x-star-cast-pilot-token,authorization",
        );
        res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
        if (req.method === "OPTIONS") {
          res.writeHead(204);
          return res.end();
        }
      }
      if (!url.pathname.startsWith("/api/")) {
        if (corpus && ["GET", "HEAD"].includes(req.method)) {
          res.writeHead(200, {
            "content-type": corpus.type,
            "cache-control": "public, max-age=300",
            "x-content-type-options": "nosniff",
          });
          return res.end(req.method === "HEAD" ? undefined : corpus.body);
        }
        const invitation = url.pathname.match(
          /^\/invite\/([a-zA-Z0-9_-]{12})$/,
        );
        if (invitation && req.method === "GET") {
          const code = invitation[1];
          if (!store.get("invite-code", code))
            return send(res, 404, { error: "Invite unavailable." });
          res.writeHead(200, {
            "content-type": "text/html; charset=utf-8",
            "content-security-policy":
              "default-src 'none'; style-src 'unsafe-inline'",
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
            "referrer-policy": "no-referrer",
          });
          return res.end(
            `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Share the listening — Star Cast</title><style>body{background:#17181d;color:#f8f6f2;font:18px system-ui;margin:0;padding:10vh 8vw}main{max-width:520px;margin:auto}a{display:inline-block;color:#c8bbff;padding:18px 0}p{line-height:1.6}code{font-size:22px}</style><main><p>STAR CAST</p><h1>Share the listening.</h1><p>A friend has invited you to Star Cast.</p><a href="starcast://invite/${code}">Open Star Cast</a><p>If Star Cast is not installed, save this invite code for onboarding:</p><code>${code}</code><p>The native app is currently in development. Ask your friend for access; there is no public App Store download yet.</p></main></html>`,
          );
        }
        if (!["GET", "HEAD"].includes(req.method))
          return send(res, 405, { error: "Method not allowed." });
        const file = staticFiles.get(url.pathname);
        if (!file) return send(res, 404, { error: "Not found" });
        const data = await readFile(join(projectRoot, file));
        res.writeHead(200, {
          "content-type": file.endsWith(".css")
            ? "text/css"
            : file.endsWith(".html")
              ? "text/html"
              : "text/javascript",
          "x-content-type-options": "nosniff",
          ...(file.startsWith("admin") ? { "cache-control": "no-store", "content-security-policy": "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; script-src 'self'; style-src 'self'" } : {}),
        });
        return res.end(req.method === "HEAD" ? undefined : data);
      }
      if (!rate(req))
        return send(res, 429, {
          error: "Too many requests. Please retry shortly.",
        });
      if (url.pathname === "/api/health" && req.method === "GET")
        return send(res, 200, {
          service: "star-cast",
          backend: "ready",
          openai: openAIStatus(env),
          persistence: "sqlite",
          features: listenerFeatures(),
          providerVerified: ledger.usage.some(
            (x) => !x.failed && !x.uncertain && x.kind === "text",
          ),
        });
      if (url.pathname === "/api/catalogue/search" && req.method === "GET") {
        const q = url.searchParams.get("q")?.trim();
        if (!q || q.length > 300)
          return send(res, 400, { error: "Enter a shorter search term." });
        try {
          let indexed = null;
          try {
            indexed = await cached("index:" + q, () => podcastIndexSearch(q));
          } catch {}
          return send(res, 200, {
            provider: indexed ? "Podcast Index" : "Apple Podcasts",
            results:
              indexed || (await cached("search:" + q, () => appleSearch(q))),
          });
        } catch {
          return send(res, 503, {
            error: "Podcast discovery is temporarily unavailable.",
            results: [],
          });
        }
      }
      if (url.pathname === "/api/catalogue/feed" && req.method === "GET") {
        const feed = url.searchParams.get("url");
        try {
          return send(res, 200, {
            feed: episodesFromFeed(await feedXml(feed), feed),
          });
        } catch {
          return send(res, 502, {
            error: "This publisher feed is unavailable or could not be read.",
          });
        }
      }
      if (!trusted(req) && !url.pathname.startsWith("/api/admin/"))
        return send(res, 403, {
          error: "Analysis requires an authorised Star Cast device.",
          code: "DEVICE_UNAUTHORISED",
        });
      if (env.STARCAST_CLOUD_API_URL && /^\/api\/(intelligence|search|listener|skips|captions|reports)(\/|$)/.test(url.pathname)) {
        const payload = req.method === "POST" ? await body(req) : undefined;
        const upstream = await fetch(env.STARCAST_CLOUD_API_URL + url.pathname + url.search, {
          method: req.method,
          headers: { "content-type": "application/json", "x-star-cast-dev-token": env.STARCAST_CLOUD_DEVICE_TOKEN,
            ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) },
          body: payload ? JSON.stringify(payload) : undefined,
          redirect: "error", signal: AbortSignal.timeout(25000),
        });
        return send(res, upstream.status, await upstream.json());
      }
      if (url.pathname === "/api/listener/register" && req.method === "POST") {
        if (env.NODE_ENV === "production" && env.STARCAST_PRIVATE_PILOT !== "enabled")
          return send(res, 503, {
            error: "Verified installation enrollment is not configured.",
          });
        const input = await body(req);
        const deviceId = typeof req.headers["x-star-cast-pilot-token"] === "string"
          ? tokenHash(req.headers["x-star-cast-pilot-token"]) : null;
        const device = deviceId ? store.get("pilot-device", deviceId) : null;
        if (device?.listenerId) {
          const existing = listeners.authenticate(input.credential);
          if (!existing || existing.id !== device.listenerId)
            return send(res, 403, { error: "This beta access belongs to another listener profile." });
        }
        const listener = listeners.register(input.credential);
        if (device) store.set("pilot-device", deviceId, { ...device, listenerId: listener.id });
        return send(res, 200, listeners.summary(listener));
      }
      if (
        url.pathname.startsWith("/api/listener/") ||
        url.pathname.startsWith("/api/skips/")
      ) {
        const listener = listeners.authenticate(
          req.headers.authorization?.replace(/^Bearer /, ""),
        );
        if (!listener)
          return send(res, 401, {
            error: "Reconnect your listener profile to continue.",
          });
        if (url.pathname === "/api/listener/summary" && req.method === "GET")
          return send(res, 200, listeners.summary(listener));
        if (url.pathname === "/api/listener/subscriptions" && req.method === "GET")
          return send(res, 200, subscriptions.config(listener));
        if (url.pathname === "/api/listener/translation" && req.method === "GET")
          return translation.visible(listener) ? send(res, 200, translation.config(listener)) : send(res, 404, { error: "Not found." });
        if (url.pathname === "/api/listener/translation/audio" && req.method === "GET") {
          if (!translation.visible(listener)) return send(res, 404, { error: "Not found." });
          const identity = fixtureIdentity();
          if (url.searchParams.get("feedUrl") !== identity.feedUrl || url.searchParams.get("episodeId") !== identity.episodeId)
            return send(res, 404, { error: "Not found." });
          const audioUrl = await translation.signedAudioUrl(identity);
          return audioUrl ? send(res, 200, { audioUrl, identity, record: translation.cacheStatus(identity) }) : send(res, 404, { error: "No translated audio is ready." });
        }
        if (req.method !== "POST")
          return send(res, 405, { error: "Method not allowed." });
        const input = await body(req);
        if (!listeners.authenticate(req.headers.authorization?.replace(/^Bearer /, "")))
          return send(res, 401, { error: "This listener profile is no longer active." });
        if (url.pathname === "/api/listener/subscriptions/verify")
          return send(res, 200, await subscriptions.refresh(listener, input.signedTransaction));
        if (url.pathname === "/api/listener/delete") {
          if (input.confirm !== true) return send(res, 400, { error: "Confirm listener profile deletion." });
          return send(res, 200, listeners.deleteProfile(listener));
        }
        if (url.pathname === "/api/listener/onboard")
          return send(res, 200, listeners.onboard(listener));
        if (url.pathname === "/api/listener/attribute")
          return send(res, 200, listeners.attribute(listener, input.code));
        if (url.pathname === "/api/listener/preferences")
          return send(res, 200, listeners.preferences(listener, input));
        if (url.pathname === "/api/listener/translation") {
          if (!translation.visible(listener)) return send(res, 404, { error: "Not found." });
          if (input.listeningLanguage !== undefined && !validLanguage(input.listeningLanguage))
            return send(res, 400, { error: "Choose a supported listening language." });
          const preference = listeners.languagePreferences(listener, input);
          return send(res, 200, { ...translation.config(listeners.authenticate(req.headers.authorization?.replace(/^Bearer /, ""))), preference });
        }
        if (url.pathname === "/api/listener/privacy")
          return send(res, 200, listeners.privacy(listener, input));
        if (url.pathname === "/api/listener/follow") {
          if (!publicUrl(input.feedUrl))
            return send(res, 400, { error: "A public publisher feed is required." });
          const result = listeners.follow(listener, input);
          if (!result.following) return send(res, 200, result);
          if (listener.intelligenceEnabled === false) return send(res, 200, { ...result, processing: { state: "DISABLED" } });
          try {
            return send(res, 202, { ...result, processing: await scheduleFollowedFeed(input.feedUrl) });
          } catch {
            return send(res, 202, { ...result, processing: { state: "UNAVAILABLE", code: "FEED_UNAVAILABLE" } });
          }
        }
        if (url.pathname === "/api/listener/heartbeat")
          return send(res, 200, listeners.heartbeat(listener, input));
        if (url.pathname === "/api/listener/offline")
          return send(res, 200, listeners.offline(listener, input));
        if (!valid(input))
          return send(res, 400, {
            error: "A valid publisher episode is required.",
          });
        if (url.pathname === "/api/skips/status") {
          const preferences = listeners.summary(listener).preferences || {};
          return send(res, 200, {
            ...skips.playback(input.feedUrl, input.episodeId, {
              audioUrl: input.audioUrl,
              preferences,
            }),
            preferenceEnabled: preferences.adSkipEnabled === true,
          });
        }
        if (url.pathname === "/api/skips/feedback")
          return send(
            res,
            200,
            skips.report(listener, input.feedUrl, input.episodeId, input),
          );
        if (url.pathname === "/api/skips/events")
          return send(
            res,
            200,
            skips.recordPlaybackEvent(
              listener,
              input.feedUrl,
              input.episodeId,
              input,
            ),
          );
        return send(res, 404, { error: "Not found" });
      }
      if (url.pathname === "/api/captions/window" && req.method === "POST") {
        const input = await body(req);
        const listener = listeners.authenticate(
          req.headers.authorization?.replace(/^Bearer /, ""),
        );
        if (!listener)
          return send(res, 401, { error: "Reconnect your listener profile to continue." });
        if (!valid(input) || !Number.isFinite(input.positionMs) || input.positionMs < 0)
          return send(res, 400, { error: "A valid playing episode and position are required." });
        if (!captionRate(listener))
          return send(res, 429, { error: "Caption updates are temporarily limited. Keep listening and try again shortly." });
        const permission = rights.resolve(input.feedUrl, input.episodeId);
        const captionDecision = rights.evaluate({ feature: "captions", feedUrl: input.feedUrl, episodeId: input.episodeId, audit: true });
        const operational = intelligencePolicy.allows(input.feedUrl, input.episodeId, "captions");
        if (!captionDecision.allowed || !operational.allowed) {
          rights.audit("caption-denied", `${input.feedUrl}:${input.episodeId}`, "listener", { classification: permission.classification, code: captionDecision.code });
          return send(res, 200, { available: false, reason: !operational.allowed ? "Captions are paused by the podcast intelligence policy." : "Captions are not authorised for this episode." });
        }
        listeners.captionPlayback(listener, input);
        const window = pipeline.captions(input.feedUrl, input.episodeId, input.positionMs);
        rights.audit("caption-window", `${input.feedUrl}:${input.episodeId}`, "listener", { startMs: window.windowStartMs || null });
        return send(res, 200, window);
      }
      if (url.pathname === "/api/reports" && req.method === "POST") {
        const listener = listeners.authenticate(req.headers.authorization?.replace(/^Bearer /, ""));
        if (!listener) return send(res, 401, { error: "Reconnect your listener profile to continue." });
        return send(res, 200, listeners.reportProblem(listener, await body(req)));
      }
      if (url.pathname === "/api/admin/overview" && req.method === "GET") {
        if (!adminActor(req, "overview:read")) return send(res, 403, { error: "Administrator access is required." });
        ledger.refresh();
        return send(res, 200, await adminService.overview({ ledger, pipeline, rights, translation, skips, infrastructure: infrastructureStatus }));
      }
      if (url.pathname === "/api/admin/operations" && req.method === "GET") {
        if (!adminActor(req, "overview:read")) return send(res, 403, { error: "Administrator access is required." });
        return send(res, 200, await adminService.operations({ ledger, rights, translation, skips, infrastructure: infrastructureStatus }));
      }
      if (url.pathname === "/api/admin/costs" && req.method === "GET") {
        if (!adminActor(req, "finance:read")) return send(res, 403, { error: "Finance administrator access is required." });
        const operations = await adminService.operations({ ledger, rights, translation, skips, infrastructure: infrastructureStatus });
        return send(res, 200, { generatedAt: operations.generatedAt, cost: operations.cost, processing: operations.processing.performance, infrastructure: operations.infrastructure });
      }
      if (url.pathname === "/api/admin/search" && req.method === "GET") {
        const actor = adminActor(req, "overview:read");
        if (!actor) return send(res, 403, { error: "Administrator access is required." });
        try {
          return send(res, 200, adminService.globalSearch(url.searchParams.get("q") || "", actor, { jobs: store.all("intelligence").map(([, value]) => value), rightsRecords: rights.list() }));
        } catch (error) {
          return send(res, 400, { error: String(error?.message || "The operations search could not be completed.") });
        }
      }
      if (url.pathname === "/api/admin/configuration" && ["GET", "POST"].includes(req.method)) {
        const actor = adminActor(req, req.method === "GET" ? "configuration:read" : "configuration:write", { write: req.method === "POST" });
        if (!actor) return send(res, 403, { error: "Administrator access, role permission and CSRF validation are required." });
        if (req.method === "GET") return send(res, 200, { configuration: adminService.configuration() });
        return send(res, 200, { configuration: adminService.setConfiguration(await body(req), actor) });
      }
      if (url.pathname === "/api/admin/features" && ["GET", "POST"].includes(req.method)) {
        const actor = adminActor(req, req.method === "GET" ? "features:read" : "features:write", { write: req.method === "POST" });
        if (!actor) return send(res, 403, { error: "Administrator access, role permission and CSRF validation are required." });
        if (req.method === "GET") return send(res, 200, { features: adminService.featureFlags() });
        return send(res, 200, { feature: adminService.setFeatureFlag(await body(req), actor) });
      }
      if (url.pathname === "/api/admin/ad-skip" && req.method === "GET") {
        if (!adminActor(req, "intelligence:read")) return send(res, 403, { error: "Administrator access is required." });
        return send(res, 200, skips.operations());
      }
      if (url.pathname === "/api/admin/audit" && req.method === "GET") {
        if (!adminActor(req, "audit:read")) return send(res, 403, { error: "Administrator access is required." });
        return send(res, 200, { events: adminService.audit({ limit: url.searchParams.get("limit") }) });
      }
      if (url.pathname === "/api/admin/podcasts" && req.method === "GET") {
        if (!adminActor(req, "rights:read")) return send(res, 403, { error: "Administrator access is required." });
        try {
          return send(res, 200, await podcastCatalogue({
            query: url.searchParams.get("q") || "",
            page: url.searchParams.get("page"),
            pageSize: url.searchParams.get("pageSize"),
            sort: url.searchParams.get("sort") || "title",
          }));
        } catch (error) {
          return send(res, 502, { error: "The operations catalogue could not be refreshed from its persisted records and publisher feeds." });
        }
      }
      if (url.pathname === "/api/admin/podcasts/detail" && req.method === "GET") {
        if (!adminActor(req, "rights:read")) return send(res, 403, { error: "Administrator access is required." });
        try {
          return send(res, 200, await podcastDetail(url.searchParams.get("feedUrl"), {
            episodeQuery: url.searchParams.get("q") || "",
            page: url.searchParams.get("page"),
            pageSize: url.searchParams.get("pageSize"),
          }));
        } catch (error) {
          return send(res, 404, { error: String(error?.message || "The podcast could not be opened.") });
        }
      }
      if (url.pathname === "/api/admin/episodes/detail" && req.method === "GET") {
        if (!adminActor(req, "rights:read")) return send(res, 403, { error: "Administrator access is required." });
        try {
          return send(res, 200, await episodeDetail(url.searchParams.get("feedUrl"), url.searchParams.get("episodeId")));
        } catch (error) {
          return send(res, 404, { error: String(error?.message || "The episode could not be opened.") });
        }
      }
      if (url.pathname === "/api/admin/intelligence/policy-impact" && req.method === "POST") {
        const actor = adminActor(req, "rights:read", { write: true });
        if (!actor) return send(res, 403, { error: "Administrator access and CSRF validation are required." });
        try {
          return send(res, 200, await policyImpact(await body(req)));
        } catch (error) {
          return send(res, 400, { error: String(error?.message || "The policy impact could not be calculated.") });
        }
      }
      if (url.pathname === "/api/admin/episodes/prepare" && req.method === "POST") {
        const actor = adminActor(req, "intelligence:write", { write: true });
        if (!actor) return send(res, 403, { error: "Administrator access, role permission and CSRF validation are required." });
        try {
          return send(res, 202, await prepareEpisode(await body(req), actor));
        } catch (error) {
          return send(res, 409, { error: String(error?.message || "This episode could not be prepared.") });
        }
      }
      if (url.pathname === "/api/admin/administrators" && ["GET", "POST"].includes(req.method)) {
        const actor = adminActor(req, req.method === "GET" ? "administrators:read" : "administrators:write", { write: req.method === "POST" });
        if (!actor) return send(res, 403, { error: "Super administrator access and CSRF validation are required." });
        if (req.method === "GET") return send(res, 200, { administrators: adminService.members() });
        return send(res, 201, { administrator: adminService.addMember(await body(req), actor) });
      }
      if (url.pathname === "/api/admin/intelligence" && req.method === "GET") {
        if (!adminActor(req, "intelligence:read")) return send(res, 403, { error: "Administrator access is required." });
        ledger.refresh();
        return send(res, 200, {
          controls: {
            ...ledger.controls,
            audioAnalysisEnabled: pipeline.audioEnabled,
          },
          features: listenerFeatures(),
          usage: ledger.usage,
          reservations: [...ledger.reservations.values()],
          totals: ledger.totals(),
          jobs: store.all("intelligence").map(([, v]) => ({
            ...publicIntelligence(v),
            processingStatus: v.feedUrl && v.episodeId ? listenerStatus(v.feedUrl, v.episodeId) : null,
          })),
        });
      }
      if (url.pathname === "/api/admin/intelligence/cancel" && req.method === "POST") {
        const actor = adminActor(req, "intelligence:write", { write: true });
        if (!actor) return send(res, 403, { error: "Operations administrator access and CSRF validation are required." });
        const input = await body(req);
        if (!valid(input)) return send(res, 400, { error: "A valid publisher episode is required." });
        try {
          const status = pipeline.cancelQueued(input.feedUrl, input.episodeId);
          adminService.appendAudit({ actor, action: "processing-job-cancelled", resource: `${input.feedUrl}:${input.episodeId}`, newState: { state: status.state, jobId: status.jobId || null }, reason: String(input.reason || "").trim().slice(0, 1000) || null, outcome: "ALLOWED" });
          return send(res, 200, { status });
        } catch (error) {
          return send(res, 409, { error: String(error?.message || "The queued job could not be cancelled.") });
        }
      }
      if (url.pathname === "/api/admin/intelligence/policies" && ["GET", "POST"].includes(req.method)) {
        const actor = adminActor(req, req.method === "GET" ? "rights:read" : "intelligence:write", { write: req.method === "POST" });
        if (!actor || (req.method === "POST" && actor.role !== "SUPER_ADMIN")) return send(res, 403, { error: "Super Administrator access and CSRF validation are required." });
        if (req.method === "GET") return send(res, 200, intelligencePolicyCatalogue());
        try {
          return send(res, 202, await applyIntelligencePolicy(await body(req), actor));
        } catch (error) {
          return send(res, 409, { error: String(error?.message || "The intelligence policy could not be saved.") });
        }
      }
      if (url.pathname === "/api/admin/intelligence/policies/reset" && req.method === "POST") {
        const actor = adminActor(req, "intelligence:write", { write: true });
        if (!actor || actor.role !== "SUPER_ADMIN") return send(res, 403, { error: "Super Administrator access and CSRF validation are required." });
        try {
          return send(res, 200, resetIntelligencePolicy(await body(req), actor));
        } catch (error) {
          return send(res, 409, { error: String(error?.message || "The policy override could not be reset.") });
        }
      }
      if (url.pathname === "/api/admin/intelligence/policies/rollback" && req.method === "POST") {
        const actor = adminActor(req, "intelligence:write", { write: true });
        if (!actor || actor.role !== "SUPER_ADMIN") return send(res, 403, { error: "Super Administrator access and CSRF validation are required." });
        const input = await body(req);
        if (!publicUrl(input.feedUrl)) return send(res, 400, { error: "A valid podcast RSS URL is required." });
        const policy = intelligencePolicy.rollback(input.feedUrl, input.episodeId || "", input.version, { actor: actor.id, reason: input.reason });
        adminService.appendAudit({ actor, action: "intelligence-policy-rolled-back", resource: policy.id, newState: { tier: policy.tier, version: policy.version }, reason: policy.reason, outcome: "ALLOWED" });
        return send(res, 200, { policy });
      }
      if (url.pathname === "/api/admin/rights" && ["GET", "POST"].includes(req.method)) {
        const actor = adminActor(req, req.method === "GET" ? "rights:read" : "rights:write", { write: req.method === "POST" });
        if (!actor) return send(res, 403, { error: "Rights administrator access is required." });
        if (req.method === "GET") return send(res, 200, { records: rights.list() });
        const record = rights.set(await body(req), { actor: actor.id });
        rights.audit("rights-assessment", record.id, actor.id);
        return send(res, 200, { record });
      }
      if (url.pathname === "/api/admin/rights/control-centre" && req.method === "GET") {
        if (!adminActor(req, "rights:read")) return send(res, 403, { error: "Rights administrator access is required." });
        return send(res, 200, rights.controlCentre());
      }
      if (url.pathname === "/api/admin/rights/blocked-content" && req.method === "GET") {
        if (!adminActor(req, "rights:read")) return send(res, 403, { error: "Rights administrator access is required." });
        return send(res, 200, blockedContent());
      }
      if (url.pathname === "/api/admin/rights/assess" && req.method === "POST") {
        const actor = adminActor(req, "rights:write", { write: true });
        if (!actor || actor.role !== "SUPER_ADMIN") return send(res, 403, { error: "Super Administrator access and CSRF validation are required." });
        const input = await body(req);
        if (!publicUrl(input.feedUrl) || typeof input.episodeId !== "string" || !input.episodeId)
          return send(res, 400, { error: "A valid publisher episode is required." });
        const outcome = await assessEpisodeRights(input.feedUrl, input.episodeId);
        rights.audit("rights-reassessed-by-super-admin", `${input.feedUrl}:${input.episodeId}`, actor.id, { reused: outcome.reused, classification: outcome.assessment.classification, blockerCode: outcome.assessment.blockerCode || null });
        adminService.appendAudit({ actor, action: "rights-reassessed", resource: `${input.feedUrl}:${input.episodeId}`, newState: { classification: outcome.assessment.classification, blockerCode: outcome.assessment.blockerCode || null, evidenceCount: outcome.assessment.assessmentEvidence?.length || 0 }, outcome: outcome.reused ? "UNCHANGED" : "ALLOWED" });
        return send(res, 200, { assessment: outcome.assessment, reused: outcome.reused });
      }
      if (url.pathname === "/api/admin/rights/approve-process" && req.method === "POST") {
        const actor = adminActor(req, "rights:write", { write: true });
        if (!actor || actor.role !== "SUPER_ADMIN") return send(res, 403, { error: "Super Administrator access and CSRF validation are required." });
        try {
          return send(res, 202, await approveAndProcess(await body(req), actor));
        } catch (error) {
          // These are expected, administrator-supplied approval validation
          // failures. Return a useful, non-sensitive explanation instead of
          // collapsing them into the generic server-error response.
          const message = String(error?.message || "");
          if (/^(A publisher feed|Episode identity|Choose the documented processing basis|A legal basis|Type APPROVE & PROCESS|This content has a mandatory rights restriction)/.test(message))
            return send(res, 400, { error: message, code: "APPROVAL_INVALID" });
          throw error;
        }
      }
      if (url.pathname === "/api/admin/rights/retry-processing" && req.method === "POST") {
        const actor = adminActor(req, "intelligence:write", { write: true });
        if (!actor || actor.role !== "SUPER_ADMIN") return send(res, 403, { error: "Super Administrator access and CSRF validation are required." });
        const input = await body(req);
        if (!publicUrl(input.feedUrl) || typeof input.episodeId !== "string" || !input.episodeId) return send(res, 400, { error: "A valid publisher episode is required." });
        await assessEpisodeRights(input.feedUrl, input.episodeId);
        const permission = rights.resolve(input.feedUrl, input.episodeId);
        const processing = rights.evaluate({ feature: "intelligence-processing", feedUrl: input.feedUrl, episodeId: input.episodeId, audit: true });
        const display = rights.evaluate({ feature: "intelligence-display", feedUrl: input.feedUrl, episodeId: input.episodeId, audit: true });
        if (!processing.allowed || !display.allowed) return send(res, 409, { error: "This episode is not currently authorised for retry." });
        const status = await pipeline.request({ feedUrl: input.feedUrl, episodeId: input.episodeId, allowAudio: permission.canTranscribeAudio === true, retry: true, trigger: "admin" });
        rights.audit("super-admin-processing-retried", `${input.feedUrl}:${input.episodeId}`, actor.id, { jobId: status.jobId || null, status: status.state });
        adminService.appendAudit({ actor, action: "super-admin-processing-retried", resource: `${input.feedUrl}:${input.episodeId}`, newState: { status: status.state }, outcome: "ALLOWED" });
        return send(res, 202, { status });
      }
      if (url.pathname === "/api/admin/rights/policy" && req.method === "POST") {
        const actor = adminActor(req, "rights:write", { write: true });
        if (!actor) return send(res, 403, { error: "Rights administrator access and CSRF validation are required." });
        const input = await body(req);
        const reason = String(input.reason || "").trim().slice(0, 1000);
        if (!reason || input.confirmation !== "CONFIRM") return send(res, 400, { error: "Provide a reason and type CONFIRM before changing the global rights policy." });
        const policy = rights.setPolicy(input, { actor: actor.id });
        rights.audit("rights-policy-changed", "global", actor.id, { policyVersion: policy.version, mode: policy.mode });
        adminService.appendAudit({ actor, action: "rights-policy-changed", resource: "global", newState: { mode: policy.mode, version: policy.version }, reason, outcome: "ALLOWED" });
        return send(res, 200, { policy });
      }
      if (url.pathname === "/api/admin/rights/policy/preview" && req.method === "POST") {
        if (!adminActor(req, "rights:read")) return send(res, 403, { error: "Rights administrator access is required." });
        return send(res, 200, rights.previewPolicy(await body(req)));
      }
      if (url.pathname === "/api/admin/rights/super-admin-test-mode" && req.method === "POST") {
        const actor = adminActor(req, "rights:write", { write: true });
        if (!actor || actor.role !== "SUPER_ADMIN") return send(res, 403, { error: "Super Administrator access and CSRF validation are required." });
        const policy = rights.setSuperAdminTestMode(await body(req), { actor: actor.id });
        rights.audit("super-admin-test-mode-changed", "global", actor.id, { enabled: policy.testMode.enabled, policyVersion: policy.version });
        adminService.appendAudit({ actor, action: "super-admin-test-mode-changed", resource: "global", newState: { enabled: policy.testMode.enabled, version: policy.version }, reason: policy.testMode.reason, outcome: "ALLOWED" });
        return send(res, 200, { policy });
      }
      if (url.pathname === "/api/admin/rights/override" && req.method === "POST") {
        const actor = adminActor(req, "rights:write", { write: true });
        if (!actor) return send(res, 403, { error: "Rights administrator access and CSRF validation are required." });
        const override = rights.setOverride(await body(req), { actor: actor.id });
        rights.audit("rights-policy-override", override.id, actor.id, { scope: override.episodeId ? "episode" : "publisher" });
        return send(res, 200, { override });
      }
      if (url.pathname === "/api/admin/rights/suspend" && req.method === "POST") {
        const actor = adminActor(req, "rights:write", { write: true });
        if (!actor) return send(res, 403, { error: "Rights administrator access and CSRF validation are required." });
        const input = await body(req);
        if (!publicUrl(input.feedUrl) || (input.episodeId !== undefined && (typeof input.episodeId !== "string" || !input.episodeId || input.episodeId.length > 2000))) return send(res, 400, { error: "A valid publisher feed and optional episode are required." });
        const record = rights.suspend(input.feedUrl, input.episodeId || "", input.reason, { actor: actor.id });
        const removed = input.episodeId ? { ...pipeline.purgeEpisode(input.feedUrl, input.episodeId), ...translation.purgeEpisode(input.feedUrl, input.episodeId) } : { ...pipeline.purgeFeed(input.feedUrl), ...translation.purgeFeed(input.feedUrl) };
        rights.audit("rights-immediate-suspension", record.id, actor.id, { scope: input.episodeId ? "episode" : "publisher", removed });
        adminService.appendAudit({ actor, action: "rights-immediate-suspension", resource: record.id, reason: input.reason, outcome: "ALLOWED" });
        return send(res, 200, { record, removed });
      }
      if (url.pathname === "/api/admin/translation/beta" && req.method === "POST") {
        const actor = adminActor(req, "translation:write", { write: true });
        if (!actor) return send(res, 403, { error: "Operations administrator access and CSRF validation are required." });
        const input = await body(req);
        const record = translation.setBetaAccess(input.listenerId, input.enabled, actor.id);
        adminService.appendAudit({ actor, action: input.enabled ? "translation-beta-authorised" : "translation-beta-revoked", resource: input.listenerId, outcome: "ALLOWED" });
        return send(res, 200, { record });
      }
      if (url.pathname === "/api/admin/translation/status" && req.method === "GET") {
        if (!adminActor(req, "translation:read")) return send(res, 403, { error: "Administrator access is required." });
        return send(res, 200, translation.status());
      }
      if (url.pathname === "/api/admin/translation/fixture" && req.method === "POST") {
        if (!adminActor(req, "translation:write", { write: true })) return send(res, 403, { error: "Operations administrator access and CSRF validation are required." });
        const input = await body(req), listenerId = String(input.listenerId || "");
        if (!/^[0-9a-f-]{36}$/i.test(listenerId)) return send(res, 400, { error: "A private beta listener is required." });
        const result = await translation.generateOwnedFixture({ listener: { id: listenerId }, identity: fixtureIdentity(), segments: parseVtt(approvedTestTranscriptVtt), sourceSeconds: 360 });
        return send(res, result.cacheReuse ? 200 : 201, result);
      }
      if (url.pathname === "/api/admin/pilot/invites" && ["GET", "POST"].includes(req.method)) {
        if (!adminActor(req, req.method === "GET" ? "listeners:read" : "listeners:write", { write: req.method === "POST" })) return send(res, 403, { error: "Administrator access is required." });
        if (req.method === "GET") return send(res, 200, {
          invites: store.all("pilot-invite").map(([, value]) => ({ ...value, codeHash: undefined })),
          devices: store.all("pilot-device").map(([, value]) => value),
        });
        const issued = issuePilotInvite(await body(req));
        return send(res, 201, issued);
      }
      if (url.pathname === "/api/admin/pilot/devices/revoke" && req.method === "POST") {
        const actor = adminActor(req, "listeners:write", { write: true });
        if (!actor) return send(res, 403, { error: "Administrator access is required." });
        const input = await body(req);
        const device = store.get("pilot-device", input.deviceId);
        if (!device) return send(res, 404, { error: "Pilot device not found." });
        const revoked = { ...device, revokedAt: new Date().toISOString() };
        store.set("pilot-device", revoked.id, revoked);
        adminService.appendAudit({ actor, action: "pilot-device-revoked", resource: revoked.id, outcome: "ALLOWED" });
        return send(res, 200, { device: revoked });
      }
      if (url.pathname === "/api/admin/reports" && req.method === "GET") {
        if (!adminActor(req, "support:read")) return send(res, 403, { error: "Administrator access is required." });
        return send(res, 200, { reports: store.all("problem-report").map(([, value]) => value) });
      }
      const reportMatch = url.pathname.match(/^\/api\/admin\/reports\/([a-f0-9]{64})$/i);
      if (reportMatch && req.method === "PATCH") {
        const actor = adminActor(req, "support:write", { write: true });
        if (!actor) return send(res, 403, { error: "Support administrator access and CSRF validation are required." });
        try {
          return send(res, 200, { report: adminService.updateReport({ ...(await body(req)), id: reportMatch[1] }, actor) });
        } catch (error) {
          return send(res, 409, { error: String(error?.message || "The listener report could not be updated.") });
        }
      }
      if (["/api/admin/transcripts/suspend", "/api/admin/transcripts/delete"].includes(url.pathname) && req.method === "POST") {
        const actor = adminActor(req, "rights:write", { write: true });
        if (!actor) return send(res, 403, { error: "Rights administrator access and CSRF validation are required." });
        const input = await body(req);
        if (!valid(input)) return send(res, 400, { error: "A valid publisher episode is required." });
        const reason = typeof input.reason === "string" ? input.reason : "Administrative rights review.";
        if (url.pathname.endsWith("/suspend")) {
          const record = rights.suspend(input.feedUrl, input.episodeId, reason, { actor: actor.id });
          rights.audit("transcript-suspended", record.id, actor.id);
          return send(res, 200, { record });
        }
        const record = rights.markDeleted(input.feedUrl, input.episodeId, reason, { actor: actor.id });
        const removed = { ...pipeline.purgeEpisode(input.feedUrl, input.episodeId), ...translation.purgeEpisode(input.feedUrl, input.episodeId) };
        rights.audit("transcript-deleted", record.id, actor.id, removed);
        adminService.appendAudit({ actor, action: "transcript-deleted", resource: record.id, reason, outcome: "ALLOWED" });
        return send(res, 200, { record, removed });
      }
      if (url.pathname === "/api/intelligence/status" && req.method === "GET") {
        const feed = url.searchParams.get("feedUrl"),
          id = url.searchParams.get("episodeId");
        if (!valid({ feedUrl: feed, episodeId: id }))
          return send(res, 400, { error: "A valid publisher episode is required." });
        return send(res, 200, {
          status: listenerStatus(feed, id),
          features: listenerFeatures(),
        });
      }
      if (req.method !== "POST")
        return send(res, 405, { error: "Method not allowed." });
      const input = await body(req);
      if (url.pathname === "/api/search/conversations") {
        if (!featureEnabled(input.mode === "Moments" ? "findMoment" : "conversationSearch"))
          return send(res, 403, { error: "This search feature is currently unavailable.", code: "FEATURE_DISABLED" });
        if (
          typeof input.query !== "string" ||
          input.query.trim().length < 2 ||
          input.query.length > 600 ||
          (input.feedUrls !== undefined &&
            (!Array.isArray(input.feedUrls) ||
              input.feedUrls.length > 300 ||
              input.feedUrls.some((f) => !publicUrl(f))))
        )
          return send(res, 400, {
            error: "A valid question and podcast scope are required.",
          });
        return send(
          res,
          200,
          pipeline.search(input.query.trim(), {
            feedUrls: input.feedUrls || null,
            momentsOnly: input.mode === "Moments",
          }),
        );
      }
      if (!valid(input))
        return send(res, 400, {
          error: "A valid publisher episode is required.",
        });
      if (url.pathname === "/api/intelligence/preflight") {
        const assessment = await assessEpisodeRights(input.feedUrl, input.episodeId);
        return send(res, 200, { ...(await pipeline.preflight(input.feedUrl, input.episodeId)), assessment: assessment.assessment });
      }
      if (url.pathname === "/api/intelligence/request") {
        if (!["brief", "chapters", "moment"].includes(input.capability))
          return send(res, 400, {
            error: "A valid analysis capability is required.",
          });
        await assessEpisodeRights(input.feedUrl, input.episodeId);
        const decision = rights.evaluate({ feature: "intelligence-display", feedUrl: input.feedUrl, episodeId: input.episodeId, audit: true });
        const rightsFeatureForCapability = { brief: "episode-brief", chapters: "smart-chapters", moment: "find-moment" };
        const capabilityDecision = rights.evaluate({ feature: rightsFeatureForCapability[input.capability], feedUrl: input.feedUrl, episodeId: input.episodeId, audit: true });
        if (!decision.allowed || !capabilityDecision.allowed)
          return send(res, 200, { status: listenerStatus(input.feedUrl, input.episodeId) });
        const featureForCapability = { brief: "episodeBrief", chapters: "smartChapters", moment: "findMoment" };
        if (!featureEnabled(featureForCapability[input.capability]))
          return send(res, 200, { status: listenerStatus(input.feedUrl, input.episodeId) });
        const requested = await pipeline.request({
          ...input,
          allowAudio: input.allowAudio === true,
          retry: input.retry === true,
          trigger: input.trigger === "automatic" ? "automatic" : "manual",
        });
        // A 202 acknowledges the durable QUEUED transition. The worker can
        // legitimately advance before this response is serialized, so clients
        // use the status endpoint for the current state on their next poll.
        // Keeping this acknowledgement stable avoids conflating acceptance
        // with a claim that completed intelligence is already available.
        const current = listenerStatus(input.feedUrl, input.episodeId);
        const accepted = requested.state === "QUEUED" ? listenerProcessingStatus(requested) : null;
        const status = {
          ...current,
          ...(accepted ? {
            ...accepted,
            processingStage: accepted.stage,
            jobId: requested.jobId || current.jobId,
            startedAt: requested.startedAt || current.startedAt,
            lastUpdatedAt: requested.updatedAt || requested.startedAt || current.lastUpdatedAt,
            completedAt: null,
            code: requested.code || null,
            reason: requested.reason || "Your episode is getting ready.",
            nextAction: "KEEP_LISTENING",
          } : {}),
          cacheHit: requested.cacheHit === true || undefined,
        };
        return send(res, requested.state === "QUEUED" ? 202 : 200, { status });
      }
      if (url.pathname === "/api/intelligence/moment") {
        if (!featureEnabled("findMoment")) return send(res, 403, { error: "This feature is currently unavailable.", code: "FEATURE_DISABLED" });
        if (
          typeof input.query !== "string" ||
          input.query.trim().length < 2 ||
          input.query.length > 600
        )
          return send(res, 400, {
            error: "Enter a question about this episode.",
          });
        return send(res, 200, {
          status: publicIntelligence(
            pipeline.status(input.feedUrl, input.episodeId),
          ),
          moments: pipeline.moments(
            input.feedUrl,
            input.episodeId,
            input.query,
          ),
        });
      }
      return send(res, 404, { error: "Not found" });
    } catch (error) {
      if (error instanceof ListenerError)
        return send(res, error.status, { error: error.message });
      if (error instanceof PublisherEpisodeError)
        return send(res, error.status, { error: error.message, code: error.code });
      // Keep listener responses deliberately non-sensitive, but retain a
      // bounded internal reason so an operator can distinguish a bad
      // publisher document from an application regression. Do not log the
      // request body, credentials, or stack trace.
      console.error(JSON.stringify({
        event: "request-failed",
        path: req.url,
        code: error?.name || "REQUEST_FAILED",
        reason: String(error?.message || "Unknown server error").slice(0, 500),
      }));
      return send(res, 400, {
        error: "This request could not be completed. Please try again.",
      });
    }
  });
  server.on("close", () => {
    if (followMonitor) clearInterval(followMonitor);
    queue?.stop();
  });
  if (queue) {
    queue.run({
      execute: (job) => pipeline.executeQueued(job),
      recover: () => pipeline.recoverQueued(),
    }).catch((error) => console.error(JSON.stringify({
      event: "processing-queue-stopped",
      code: error?.name || "QUEUE_STOPPED",
    })));
  }
  return { server, store, ledger, pipeline, listeners, skips, rights, intelligencePolicy, adminService, subscriptions, translation, queue };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  loadCredentials();
  acquireServerLock(join(projectRoot, ".starcast", "backend.lock"));
  const { server } = createStarCastServer();
  server.listen(Number(process.env.PORT || 4173), "0.0.0.0", () =>
    console.log(
      "Star Cast backend ready on port " + (process.env.PORT || 4173),
    ),
  );
  server.on("error", (error) => {
    console.error(
      error.code === "EADDRINUSE"
        ? "Star Cast port is already in use. Close the existing Star Cast session or choose another port."
        : "Backend startup failed.",
    );
    process.exitCode = 1;
  });
}
