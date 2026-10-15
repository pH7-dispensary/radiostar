import assert from "node:assert/strict";
import { createStarCastServer } from "./server.mjs";
import { LocalStore } from "./persistence.mjs";

const device = "legacy-private-pilot-token";
const admin = "separate-administrator-token";
const app = createStarCastServer({
  store: new LocalStore(":memory:"),
  env: { STARCAST_PRIVATE_PILOT: "enabled", STARCAST_DEV_INTELLIGENCE_TOKEN: device, STARCAST_ADMIN_TOKEN: admin },
});
await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
const base = "http://127.0.0.1:" + app.server.address().port;
const call = (path, init = {}) => fetch(base + path, init);
const headers = { "content-type": "application/json", "x-star-cast-dev-token": device, "x-star-cast-admin-token": admin };
try {
  assert.equal((await call("/api/intelligence/status?feedUrl=https%3A%2F%2Fpublisher.example%2Ffeed&episodeId=episode")).status, 403);
  const issued = await call("/api/admin/pilot/invites", { method: "POST", headers, body: JSON.stringify({ label: "TestFlight contract", maxUses: 1 }) });
  assert.equal(issued.status, 201);
  const invite = await issued.json();
  assert.match(invite.code, /^sc_/);
  const enrolled = await call("/api/pilot/enroll", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: invite.code }) });
  assert.equal(enrolled.status, 201);
  const enrolledValue = await enrolled.json();
  assert.ok(enrolledValue.token.length >= 32);
  assert.equal((await call("/api/intelligence/status?feedUrl=https%3A%2F%2Fpublisher.example%2Ffeed&episodeId=episode", { headers: { "x-star-cast-pilot-token": enrolledValue.token } })).status, 200);
  assert.equal((await call("/api/pilot/enroll", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: invite.code }) })).status, 400, "a consumed invite is rejected");
  const revoked = await call("/api/admin/pilot/devices/revoke", { method: "POST", headers, body: JSON.stringify({ deviceId: app.store.all("pilot-device")[0][1].id }) });
  assert.equal(revoked.status, 200);
  assert.equal((await call("/api/intelligence/status?feedUrl=https%3A%2F%2Fpublisher.example%2Ffeed&episodeId=episode", { headers: { "x-star-cast-pilot-token": enrolledValue.token } })).status, 403, "revoked pilot tokens are rejected");
} finally {
  await new Promise((resolve) => app.server.close(resolve));
  app.store.close();
}
console.log("Private-beta pilot enrollment, expiry and revocation checks passed");
