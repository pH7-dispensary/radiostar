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
  const listenerHeaders = { "content-type": "application/json", "x-star-cast-pilot-token": enrolledValue.token, authorization: `Bearer ${"a".repeat(64)}` };
  const register = credential => call("/api/listener/register", { method: "POST", headers: listenerHeaders, body: JSON.stringify({credential}) });
  assert.equal((await register("a".repeat(64))).status, 200);
  assert.equal((await register("b".repeat(64))).status, 403, "one pilot cannot mint arbitrary listeners");
  assert.equal((await call("/api/listener/subscriptions", {headers:listenerHeaders})).status, 200);
  const [deviceKey,deviceRecord]=app.store.all('pilot-device')[0];
  const expired=new Date(Date.now()-1000).toISOString();app.store.set('pilot-device',deviceKey,{...deviceRecord,expiresAt:expired});
  assert.equal((await call('/api/listener/subscriptions',{headers:listenerHeaders})).status,403);
  const renewal={deviceId:deviceKey,expectedExpiresAt:expired,expiresAt:new Date(Date.now()+3600000).toISOString(),confirmation:'RENEW PILOT ACCESS',reason:'Explicit bounded test renewal'};
  const renew=auth=>call('/api/admin/pilot/devices/renew',{method:'POST',headers:auth,body:JSON.stringify(renewal)});
  assert.equal((await renew(headers)).status,403,'raw administrator credentials cannot renew pilot duration');
  const login=await call('/api/admin/session',{method:'POST',headers,body:JSON.stringify({adminToken:admin,emergency:true})});assert.equal(login.status,201);
  const cookies=login.headers.getSetCookie().map(s=>s.split(';')[0]);
  const protectedHeaders={'content-type':'application/json','x-star-cast-dev-token':device,cookie:cookies.join('; '),'x-star-cast-csrf':decodeURIComponent(cookies.find(s=>s.startsWith('starcast_admin_csrf=')).split('=').slice(1).join('='))};
  assert.equal((await renew({...protectedHeaders,'x-star-cast-csrf':'wrong'})).status,403);
  renewal.expectedExpiresAt='stale';assert.equal((await renew(protectedHeaders)).status,409);
  renewal.expectedExpiresAt=expired;renewal.expiresAt=new Date(Date.now()+22*86400000).toISOString();assert.equal((await renew(protectedHeaders)).status,409);
  renewal.expiresAt=new Date(Date.now()+21*86400000-1000).toISOString();assert.equal((await renew(protectedHeaders)).status,200);
  assert.equal((await call('/api/listener/subscriptions',{headers:listenerHeaders})).status,200,'same credential works after explicit renewal');
  app.store.set('pilot-device',deviceKey,{...app.store.get('pilot-device',deviceKey),revokedAt:new Date().toISOString()});
  assert.equal((await renew(protectedHeaders)).status,409,'renewal cannot resurrect compromised credentials');
  app.store.set('pilot-device',deviceKey,{...app.store.get('pilot-device',deviceKey),revokedAt:undefined});
  await call('/api/admin/session',{method:'DELETE',headers:protectedHeaders});
  assert.equal((await call("/api/listener/delete", {method:"POST",headers:listenerHeaders,body:"{}"})).status, 400);
  assert.ok(enrolledValue.token.length >= 32);
  assert.equal((await call("/api/intelligence/status?feedUrl=https%3A%2F%2Fpublisher.example%2Ffeed&episodeId=episode", { headers: { "x-star-cast-pilot-token": enrolledValue.token } })).status, 200);
  assert.equal((await call("/api/pilot/enroll", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: invite.code }) })).status, 400, "a consumed invite is rejected");
  assert.equal((await call("/api/listener/privacy", {method:"POST",headers:listenerHeaders,body:JSON.stringify({intelligenceEnabled:false})})).status,200);
  assert.equal((await call("/api/listener/delete", {method:"POST",headers:listenerHeaders,body:JSON.stringify({confirm:true})})).status,200);
  assert.equal((await call("/api/listener/summary", {headers:listenerHeaders})).status,403,"deletion revokes beta credential");
  const revoked = await call("/api/admin/pilot/devices/revoke", { method: "POST", headers, body: JSON.stringify({ deviceId: app.store.all("pilot-device")[0][1].id }) });
  assert.equal(revoked.status, 200);
  assert.equal((await call("/api/intelligence/status?feedUrl=https%3A%2F%2Fpublisher.example%2Ffeed&episodeId=episode", { headers: { "x-star-cast-pilot-token": enrolledValue.token } })).status, 403, "revoked pilot tokens are rejected");
} finally {
  await new Promise((resolve) => app.server.close(resolve));
  app.store.close();
}
console.log("Private-beta pilot enrollment, expiry and revocation checks passed");
