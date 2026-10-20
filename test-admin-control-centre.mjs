import assert from "node:assert/strict";
import { AdminService, AdministratorRole } from "./admin-service.mjs";
import { LocalStore } from "./persistence.mjs";
import { createStarCastServer } from "./server.mjs";

const store = new LocalStore(":memory:");
const service = new AdminService(store, { now: () => 1_000 });
assert.equal(service.can({ role: AdministratorRole.RIGHTS_ADMIN }, "rights:write"), true);
assert.equal(service.can({ role: AdministratorRole.SUPPORT_AGENT }, "rights:write"), false, "role checks are server-side and explicit");
assert.throws(() => service.setFeatureFlag({ id: "episodeBrief", state: "ENABLED", rolloutPercent: 100, reason: "test" }, { id: "root", name: "Root", role: AdministratorRole.SUPER_ADMIN }), /CONFIRM/);
store.close();

const app = createStarCastServer({ store: new LocalStore(":memory:"), env: { NODE_ENV: "production", STARCAST_DEV_INTELLIGENCE_TOKEN: "device-token", STARCAST_ADMIN_TOKEN: "admin-token" } });
await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;
try {
  assert.equal((await fetch(base + "/admin")).status, 200, "admin shell is served without a listener token");
  assert.equal((await fetch(base + "/api/admin/overview")).status, 403, "operational data is not public");
  assert.equal((await fetch(base + "/api/admin/ad-skip")).status, 403, "Ad Skip evidence is not public");
  const denied = await fetch(base + "/api/admin/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ adminToken: "wrong" }) });
  assert.equal(denied.status, 401);
  const login = await fetch(base + "/api/admin/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ adminToken: "admin-token" }) });
  assert.equal(login.status, 201);
  const cookies = login.headers.getSetCookie();
  assert.equal(cookies.some((value) => /HttpOnly/.test(value) && /SameSite=Strict/.test(value) && /Secure/.test(value)), true, "production sessions are HttpOnly, same-site and secure");
  assert.equal((await login.json()).actor.role, "SUPER_ADMIN");
  const cookie = cookies.map((value) => value.split(";")[0]).join("; ");
  assert.equal((await fetch(base + "/api/admin/overview", { headers: { cookie } })).status, 200, "session may read permitted operations");
  const adSkip = await fetch(base + "/api/admin/ad-skip", { headers: { cookie } });
  assert.equal(adSkip.status, 200, "authorised operations staff can inspect real Ad Skip safety records");
  assert.equal((await adSkip.json()).release.productionAutomaticSkipping, false, "operations data cannot claim a production release without measured evidence");
  const csrf = cookie.match(/starcast_admin_csrf=([^;]+)/)?.[1];
  const noCsrf = await fetch(base + "/api/admin/features", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ id: "episodeBrief", state: "PRIVATE_BETA", rolloutPercent: 0, reason: "test" }) });
  assert.equal(noCsrf.status, 403, "state changes require CSRF validation");
  const saved = await fetch(base + "/api/admin/features", { method: "POST", headers: { cookie, "x-star-cast-csrf": csrf, "content-type": "application/json" }, body: JSON.stringify({ id: "episodeBrief", state: "PRIVATE_BETA", rolloutPercent: 0, reason: "authorised test" }) });
  assert.equal(saved.status, 200);
  const disabled = await fetch(base + "/api/admin/features", { method: "POST", headers: { cookie, "x-star-cast-csrf": csrf, "content-type": "application/json" }, body: JSON.stringify({ id: "episodeBrief", state: "DISABLED", rolloutPercent: 0, reason: "authorised test", confirmation: "CONFIRM" }) });
  assert.equal(disabled.status, 200);
  const listenerView = await fetch(base + "/api/intelligence/status?feedUrl=https%3A%2F%2Fpublisher.example%2Ffeed.xml&episodeId=episode", { headers: { "x-star-cast-dev-token": "device-token" } });
  assert.equal((await listenerView.json()).features.episodeBriefs, false, "feature settings change the enforced listener capability map");
  const audit = await fetch(base + "/api/admin/audit", { headers: { cookie } });
  const auditBody = await audit.json();
  assert.equal(auditBody.events.some((event) => event.action === "feature-flag-changed" && event.hash && event.previousHash !== undefined), true, "configuration mutations are audit chained");
} finally {
  await new Promise((resolve) => app.server.close(resolve));
  app.store.close();
}
console.log("Administrator sessions, CSRF, role enforcement, feature controls and audit chaining passed");
