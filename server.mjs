import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash, timingSafeEqual } from "node:crypto";
import { transcriptRefsFromItem } from "./transcripts.mjs";
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

const clean = (s) =>
  String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .trim();
const tag = (xml, name) =>
  clean(
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
const featureControls = Object.freeze({
  episodeBriefs: true,
  exploreEpisode: true,
  momentSearch: true,
  conversationSearch: true,
  adSkip: false,
});
function send(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(JSON.stringify(body));
}
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
  const trusted = (req) => {
    const expected = env.STARCAST_DEV_INTELLIGENCE_TOKEN,
      received = req.headers["x-star-cast-dev-token"];
    return (
      typeof received === "string" &&
      Boolean(expected) &&
      Buffer.byteLength(received) === Buffer.byteLength(expected) &&
      timingSafeEqual(Buffer.from(received), Buffer.from(expected))
    );
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
      const url = clean(match[1]);
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
  });
  const listeners = new ListenerService(store, {
    inviteOrigin: env.STARCAST_INVITE_ORIGIN,
    friendBonusMinutes: Number(env.STARCAST_FRIEND_BONUS_MINUTES || 0),
  });
  const skips = new SkipService(store, pipeline);
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
  const valid = (r) =>
    publicUrl(r.feedUrl) &&
    typeof r.episodeId === "string" &&
    r.episodeId.length > 0 &&
    r.episodeId.length <= 2000;
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
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
          "content-type,x-star-cast-dev-token,authorization",
        );
        res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
        if (req.method === "OPTIONS") {
          res.writeHead(204);
          return res.end();
        }
      }
      if (!url.pathname.startsWith("/api/")) {
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
          features: featureControls,
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
      if (!trusted(req))
        return send(res, 403, {
          error: "Analysis requires an authorised Star Cast device.",
          code: "DEVICE_UNAUTHORISED",
        });
      if (url.pathname === "/api/listener/register" && req.method === "POST") {
        if (env.NODE_ENV === "production")
          return send(res, 503, {
            error: "Verified installation enrollment is not configured.",
          });
        const input = await body(req);
        const listener = listeners.register(input.credential);
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
        if (req.method !== "POST")
          return send(res, 405, { error: "Method not allowed." });
        const input = await body(req);
        if (url.pathname === "/api/listener/onboard")
          return send(res, 200, listeners.onboard(listener));
        if (url.pathname === "/api/listener/attribute")
          return send(res, 200, listeners.attribute(listener, input.code));
        if (url.pathname === "/api/listener/preferences")
          return send(res, 200, listeners.preferences(listener, input));
        if (url.pathname === "/api/listener/heartbeat")
          return send(res, 200, listeners.heartbeat(listener, input));
        if (url.pathname === "/api/listener/offline")
          return send(res, 200, listeners.offline(listener, input));
        if (!valid(input))
          return send(res, 400, {
            error: "A valid publisher episode is required.",
          });
        if (url.pathname === "/api/skips/status")
          return send(res, 200, skips.inspect(input.feedUrl, input.episodeId));
        if (url.pathname === "/api/skips/feedback")
          return send(
            res,
            200,
            skips.report(listener, input.feedUrl, input.episodeId, input),
          );
        return send(res, 404, { error: "Not found" });
      }
      if (url.pathname === "/api/admin/intelligence" && req.method === "GET") {
        ledger.refresh();
        return send(res, 200, {
          controls: {
            ...ledger.controls,
            audioAnalysisEnabled: pipeline.audioEnabled,
          },
          features: featureControls,
          usage: ledger.usage,
          reservations: [...ledger.reservations.values()],
          totals: ledger.totals(),
          jobs: store.all("intelligence").map(([, v]) => publicIntelligence(v)),
        });
      }
      if (url.pathname === "/api/intelligence/status" && req.method === "GET") {
        const feed = url.searchParams.get("feedUrl"),
          id = url.searchParams.get("episodeId");
        return send(res, 200, {
          status: publicIntelligence(pipeline.status(feed, id)),
          features: featureControls,
        });
      }
      if (req.method !== "POST")
        return send(res, 405, { error: "Method not allowed." });
      const input = await body(req);
      if (url.pathname === "/api/search/conversations") {
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
        const status = await pipeline.request({
          ...input,
          allowAudio: input.allowAudio === true,
          retry: input.retry === true,
          trigger: input.trigger === "automatic" ? "automatic" : "manual",
        });
        return send(res, status.state === "QUEUED" ? 202 : 200, { status });
      }
      if (url.pathname === "/api/intelligence/transcript")
        return send(
          res,
          200,
          pipeline.transcriptPage(
            input.feedUrl,
            input.episodeId,
            input.offset,
            input.query,
          ),
        );
      if (url.pathname === "/api/intelligence/moment") {
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
  return { server, store, ledger, pipeline, listeners, skips };
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
