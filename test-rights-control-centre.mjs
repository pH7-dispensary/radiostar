import assert from "node:assert/strict";
import { createStarCastServer } from "./server.mjs";
import { LocalStore } from "./persistence.mjs";

const app = createStarCastServer({
  store: new LocalStore(":memory:"),
  env: { STARCAST_DEV_INTELLIGENCE_TOKEN: "device-test-token", STARCAST_ADMIN_TOKEN: "admin-test-token" },
});
await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;
const admin = { "content-type": "application/json", "x-star-cast-dev-token": "device-test-token", "x-star-cast-admin-token": "admin-test-token" };
const post = (path, body) => fetch(base + path, { method: "POST", headers: admin, body: JSON.stringify(body) });
try {
  assert.equal((await fetch(base + "/api/admin/rights/control-centre")).status, 403, "control centre requires the separate administrator token");
  const policy = await post("/api/admin/rights/policy", { mode: "LITE", features: { intelligenceDisplay: true } });
  assert.equal(policy.status, 200);
  assert.equal((await policy.json()).policy.mode, "LITE");
  const feedUrl = "https://publisher.example/control-centre.xml";
  const override = await post("/api/admin/rights/override", { feedUrl, mode: "MEDIUM", features: { intelligenceProcessing: false }, reason: "Publisher review" });
  assert.equal(override.status, 200);
  const centre = await fetch(base + "/api/admin/rights/control-centre", { headers: admin });
  const body = await centre.json();
  assert.equal(centre.status, 200);
  assert.equal(body.policy.mode, "LITE");
  assert.equal(body.overrides[0].mode, "MEDIUM");
  assert.equal(body.policyHistory.length >= 2, true, "policy and override changes have durable history");
  const suspended = await post("/api/admin/rights/suspend", { feedUrl, reason: "Rights holder review" });
  assert.equal(suspended.status, 200);
  assert.equal(Number.isFinite((await suspended.json()).record.suspendedAt), true);
} finally {
  await new Promise((resolve) => app.server.close(resolve));
  app.store.close();
}
console.log("Rights control-centre authentication, policy, override and immediate suspension checks passed");
