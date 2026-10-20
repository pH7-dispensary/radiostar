import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { parseVtt, transcriptRefsFromItem } from "./transcripts.mjs";
import {
  BudgetLedger,
  defaultControls,
  openAIStatus,
} from "./openai-intelligence.mjs";
import { LocalStore } from "./persistence.mjs";
import { EpisodePipeline, publicIntelligence } from "./episode-pipeline.mjs";
import { publicUrl, fetchPublicText } from "./safe-network.mjs";
import { projectRoot, loadCredentials } from "./config.mjs";
import { acquireServerLock } from "./server-lock.mjs";
import { ListenerService, ListenerError } from "./listener-service.mjs";
import { SkipService } from "./skip-service.mjs";
import { RightsRegistry } from "./rights-registry.mjs";
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
function feedParts(xml, feed) {
  let channel = xml.match(/<channel[\s\S]*?<\/channel>/i)?.[0] || xml,
    items = [...channel.matchAll(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi)]
      .map((m) => m[0])
      .slice(0, 30);
  return { channel, items, feed };
}
function episodesFromFeed(xml, feed) {
  let { channel, items } = feedParts(xml, feed);
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
  audioFactory,
} = {}) {
  const cache = new Map(),
    windows = new Map();
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
    adSkip: false,
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
      async () => (await fetchPublicText(feed, 8_000_000)).text,
      600_000,
    );
  }
  async function resolve(feed, id) {
    const xml = await feedXml(feed),
      items = feedParts(xml, feed).items,
      parsed = episodesFromFeed(xml, feed),
      index = parsed.episodes.findIndex((x) => x.id === id);
    if (index < 0)
      throw Error("Episode no longer appears in the publisher feed.");
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
    };
  }
  const queue = processingQueueFromEnv(env);
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
    queue,
  });
  const listeners = new ListenerService(store, {
    inviteOrigin: env.STARCAST_INVITE_ORIGIN,
    friendBonusMinutes: Number(env.STARCAST_FRIEND_BONUS_MINUTES || 0),
  });
  const skips = new SkipService(store, pipeline);
  const subscriptions = subscriptionsFromEnv(store, env);
  const translation = new TranslationService({ rights, subscriptions, env, store });
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
    const permission = rights.resolve(feedUrl, episode.id);
    const processing = rights.evaluate({ feature: "intelligence-processing", feedUrl, episodeId: episode.id, audit: true });
    const display = rights.evaluate({ feature: "intelligence-display", feedUrl, episodeId: episode.id, audit: true });
    if (!permission.canAcquireTranscript || !processing.allowed || !display.allowed)
      return { state: "BLOCKED", code: "RIGHTS_RESTRICTED", reason: !permission.canAcquireTranscript ? "The publisher has not authorised transcript acquisition." : processing.allowed ? display.reason : processing.reason };
    // Following is never consent to paid audio. Publisher transcripts only.
    return pipeline.request({ feedUrl, episodeId: episode.id, trigger: "automatic" });
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
          const inspection = skips.inspect(input.feedUrl, input.episodeId);
          return send(res, 200, {
            ...inspection,
            preferenceEnabled: listeners.summary(listener).preferences?.adSkipEnabled === true,
            // Kept false until verified intervals are safely applied by the
            // native player for the exact matching audio variant.
            automaticSkipping: false,
          });
        }
        if (url.pathname === "/api/skips/feedback")
          return send(
            res,
            200,
            skips.report(listener, input.feedUrl, input.episodeId, input),
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
        if (!captionDecision.allowed) {
          rights.audit("caption-denied", `${input.feedUrl}:${input.episodeId}`, "listener", { classification: permission.classification, code: captionDecision.code });
          return send(res, 200, { available: false, reason: "Captions are not authorised for this episode." });
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
        return send(res, 200, adminService.overview({ ledger, pipeline, rights, translation }));
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
      if (url.pathname === "/api/admin/audit" && req.method === "GET") {
        if (!adminActor(req, "audit:read")) return send(res, 403, { error: "Administrator access is required." });
        return send(res, 200, { events: adminService.audit({ limit: url.searchParams.get("limit") }) });
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
          jobs: store.all("intelligence").map(([, v]) => publicIntelligence(v)),
        });
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
        const decision = rights.evaluate({ feature: "intelligence-display", feedUrl: feed, episodeId: id });
        if (!decision.allowed)
          return send(res, 200, {
            status: {
              state: "BLOCKED",
              code: "RIGHTS_RESTRICTED",
              reason: decision.reason,
              transcriptAvailable: false,
            },
            features: listenerFeatures(),
          });
        return send(res, 200, {
          status: publicIntelligence(pipeline.status(feed, id)),
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
      if (url.pathname === "/api/intelligence/preflight")
        return send(
          res,
          200,
          await pipeline.preflight(input.feedUrl, input.episodeId),
        );
      if (url.pathname === "/api/intelligence/request") {
        if (!["brief", "chapters", "moment"].includes(input.capability))
          return send(res, 400, {
            error: "A valid analysis capability is required.",
          });
        const decision = rights.evaluate({ feature: "intelligence-display", feedUrl: input.feedUrl, episodeId: input.episodeId, audit: true });
        if (!decision.allowed)
          return send(res, 200, { status: { state: "BLOCKED", code: "RIGHTS_RESTRICTED", reason: decision.reason, retryable: false } });
        const featureForCapability = { brief: "episodeBrief", chapters: "smartChapters", moment: "findMoment" };
        if (!featureEnabled(featureForCapability[input.capability]))
          return send(res, 200, { status: { state: "BLOCKED", code: "FEATURE_DISABLED", reason: "This feature is currently unavailable.", retryable: false } });
        const status = await pipeline.request({
          ...input,
          allowAudio: input.allowAudio === true,
          retry: input.retry === true,
          trigger: input.trigger === "automatic" ? "automatic" : "manual",
        });
        return send(res, status.state === "QUEUED" ? 202 : 200, { status });
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
  return { server, store, ledger, pipeline, listeners, skips, rights, adminService, subscriptions, translation, queue };
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
