import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { applyCloudAuthority } from "./config.mjs";
import { createStarCastServer } from "./server.mjs";
import { LocalStore } from "./persistence.mjs";

const directory = mkdtempSync(join(tmpdir(), "starcast-cloud-test-"));
try {
  writeFileSync(join(directory, "cloud-authority.json"), "{}");
  const env = { STARCAST_PAID_INTELLIGENCE: "enabled", STARCAST_AUDIO_TRANSCRIPTION: "enabled" };
  applyCloudAuthority(env, directory);
  assert.equal(env.STARCAST_PAID_INTELLIGENCE, "disabled");
  assert.equal(env.STARCAST_AUDIO_TRANSCRIPTION, "disabled");
  assert.equal(env.STARCAST_CLOUD_API_URL, undefined);
  const token = "test-cloud-token-".repeat(4);
  writeFileSync(join(directory, "cloud-connection.json"), JSON.stringify({ url: "https://example.cloudfront.net", token }));
  applyCloudAuthority(env, directory);
  assert.equal(env.STARCAST_CLOUD_API_URL, "https://example.cloudfront.net");
  writeFileSync(join(directory, "cloud-connection.json"), JSON.stringify({ url: "http://untrusted.example", token }));
  applyCloudAuthority(env, directory);
  assert.equal(env.STARCAST_CLOUD_API_URL, undefined);
} finally { rmSync(directory, { recursive: true }); }

const upstreamRequests = [];
const upstream = createServer(async (req, res) => {
  let data = "";
  for await (const part of req) data += part;
  upstreamRequests.push({ path: req.url, token: req.headers["x-star-cast-dev-token"], authorization: req.headers.authorization, data });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ cloud: true }));
});
await new Promise(r => upstream.listen(0, "127.0.0.1", r));
const app = createStarCastServer({ store: new LocalStore(":memory:"), env: {
  NODE_ENV: "production", STARCAST_PRIVATE_PILOT: "enabled",
  STARCAST_DEV_INTELLIGENCE_TOKEN: "local-test-device",
  STARCAST_CLOUD_API_URL: "http://127.0.0.1:" + upstream.address().port,
  STARCAST_CLOUD_DEVICE_TOKEN: "cloud-test-device",
} });
await new Promise(r => app.server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + app.server.address().port;
try {
  assert.equal((await fetch(base + "/api/health")).status, 200);
  for (const path of ["/api/catalogue/search?q=test", "/api/admin/intelligence", "/api/intelligence/status", "/"])
    assert.equal((await fetch(base + path)).status, 403);
  assert.equal(upstreamRequests.length, 0);
  for (const path of ["/api/search/conversations", "/api/intelligence/preflight", "/api/listener/register", "/api/skips/feedback", "/api/captions/window", "/api/reports"])
    assert.deepEqual(await (await fetch(base + path, { method: "POST", headers: { "x-star-cast-dev-token": "local-test-device", authorization: "Bearer listener-test", "content-type": "application/json" }, body: JSON.stringify({ query: "real transcript evidence" }) })).json(), { cloud: true });
  assert.equal(upstreamRequests.length, 6);
  assert.ok(upstreamRequests.every(r => r.token === "cloud-test-device" && r.authorization === "Bearer listener-test" && JSON.parse(r.data).query === "real transcript evidence"));
  assert.equal(app.store.all("budget").length, 0, "Proxy must not create a second paid ledger");
} finally {
  await new Promise(r => app.server.close(r)); app.store.close();
  await new Promise(r => upstream.close(r));
}
console.log("Cloud authority, private pilot access, authenticated proxy and search routing passed");
