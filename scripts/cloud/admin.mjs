import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const connectionPath = ".starcast/cloud-connection.json";
const adminPath = ".starcast/cloud-admin.json";
if (!existsSync(connectionPath) || !existsSync(adminPath))
  throw Error("Run the secure cloud secret provisioning command before using rights administration.");
const connection = JSON.parse(readFileSync(connectionPath, "utf8"));
const admin = JSON.parse(readFileSync(adminPath, "utf8"));
const apiUrl = connection.url || admin.url;
if (!/^https:\/\/[a-z0-9]+\.cloudfront\.net$/.test(apiUrl || "") ||
    typeof connection.token !== "string" || connection.token.length < 32 ||
    typeof admin.token !== "string" || admin.token.length < 32)
  throw Error("The local Star Cast administration connection is invalid.");

const [area, action, inputPath, ...flags] = process.argv.slice(2);
const actions = {
  "rights:list": { method: "GET", path: "/api/admin/rights" },
  "rights:control-centre": { method: "GET", path: "/api/admin/rights/control-centre" },
  "rights:policy": { method: "POST", path: "/api/admin/rights/policy" },
  "rights:override": { method: "POST", path: "/api/admin/rights/override" },
  "rights:suspend": { method: "POST", path: "/api/admin/rights/suspend" },
  "reports:list": { method: "GET", path: "/api/admin/reports" },
  "intelligence:status": { method: "GET", path: "/api/admin/intelligence" },
  "ad-skip:status": { method: "GET", path: "/api/admin/ad-skip" },
  "translation:status": { method: "GET", path: "/api/admin/translation/status" },
  "translation:fixture": { method: "POST", path: "/api/admin/translation/fixture" },
  "rights:apply": { method: "POST", path: "/api/admin/rights" },
  "transcripts:suspend": { method: "POST", path: "/api/admin/transcripts/suspend" },
  "transcripts:delete": { method: "POST", path: "/api/admin/transcripts/delete" },
  "pilot:list": { method: "GET", path: "/api/admin/pilot/invites" },
  "pilot:issue": { method: "POST", path: "/api/admin/pilot/invites" },
  "pilot:revoke": { method: "POST", path: "/api/admin/pilot/devices/revoke" },
};
const operation = actions[`${area}:${action}`];
if (!operation) {
  console.error("Use: rights list | rights control-centre | rights apply INPUT.json | rights policy INPUT.json | rights override INPUT.json | rights suspend INPUT.json | transcripts suspend INPUT.json | transcripts delete INPUT.json | reports list | intelligence status | pilot list | pilot issue INPUT.json [--write PATH] | pilot revoke INPUT.json");
  process.exitCode = 2;
} else {
  let body;
  if (operation.method === "POST") {
    if (!inputPath) throw Error("An owner-controlled JSON input file is required for this change.");
    const path = resolve(inputPath);
    body = JSON.parse(readFileSync(path, "utf8"));
  }
  const response = await fetch(apiUrl + operation.path, {
    method: operation.method,
    headers: {
      "x-star-cast-dev-token": connection.token,
      "x-star-cast-admin-token": admin.token,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json().catch(() => ({ error: "Invalid server response." }));
  if (!response.ok) throw Error(result.error || `Administrative request failed (${response.status}).`);
  if (`${area}:${action}` === "pilot:issue") {
    const flag = flags.indexOf("--write");
    const target = resolve(flag >= 0 && flags[flag + 1] ? flags[flag + 1] : ".starcast/latest-pilot-invite.json");
    writeFileSync(target, JSON.stringify(result), { mode: 0o600 });
    console.log(JSON.stringify({ invite: result.invite, codeWritten: target, credentialPrinted: false }, null, 2));
  } else console.log(JSON.stringify(result, null, 2));
}
