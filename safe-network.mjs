import { request } from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";

export function publicAddress(address) {
  if (isIP(address) === 6) return false; // Conservative: use verified public IPv4 only.
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19))
  );
}
export function publicUrl(value) {
  try {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      (u.port && u.port !== "443")
    )
      return null;
    if (/(^|\.)(localhost|local|internal)$/i.test(u.hostname)) return null;
    if (
      u.hostname.includes(":") ||
      (isIP(u.hostname) && !publicAddress(u.hostname))
    )
      return null;
    return u;
  } catch {
    return null;
  }
}
async function streamPublic(value, redirects = 0) {
  const url = publicUrl(value);
  if (!url || redirects > 5)
    throw Error("A public HTTPS publisher source is required.");
  const addresses = await lookup(url.hostname, { all: true, family: 4 });
  if (!addresses.length || addresses.some((x) => !publicAddress(x.address)))
    throw Error("Publisher address is not permitted.");
  // Pin the resolved address; redirects repeat both validation and DNS checks.
  const response = await new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        signal: AbortSignal.timeout(180_000),
        headers: {
          "user-agent": "StarCast/0.2",
          "accept-encoding": "identity",
        },
        lookup: (_host, options, cb) =>
          options.all
            ? cb(null, [addresses[0]])
            : cb(null, addresses[0].address, 4),
      },
      resolve,
    );
    req.on("error", reject);
    req.setTimeout(30_000, () =>
      req.destroy(Error("Publisher request timed out.")),
    );
    req.end();
  });
  if (response.statusCode >= 300 && response.statusCode < 400) {
    response.resume();
    if (!response.headers.location)
      throw Error("Publisher redirect is missing a location.");
    return streamPublic(
      new URL(response.headers.location, url).href,
      redirects + 1,
    );
  }
  if (response.statusCode !== 200) {
    response.resume();
    throw Error("Publisher source is unavailable.");
  }
  return { response, url: url.href };
}
function limiter(maxBytes) {
  let bytes = 0;
  return new Transform({
    transform(chunk, _encoding, cb) {
      bytes += chunk.length;
      cb(
        bytes > maxBytes
          ? Error("Publisher source exceeds the size limit.")
          : null,
        chunk,
      );
    },
  });
}
export async function fetchPublicText(url, maxBytes = 2_000_000) {
  const result = await streamPublic(url),
    chunks = [];
  await pipeline(result.response, limiter(maxBytes), async (source) => {
    for await (const chunk of source) chunks.push(chunk);
  });
  return {
    text: Buffer.concat(chunks).toString("utf8"),
    url: result.url,
    type: result.response.headers["content-type"] || "text/plain",
  };
}
export async function downloadPublicAudio(url, path, maxBytes = 300_000_000) {
  const result = await streamPublic(url);
  await pipeline(
    result.response,
    limiter(maxBytes),
    createWriteStream(path, { flags: "wx", mode: 0o600 }),
  );
  return result.url;
}
