import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";
import { createServer } from "node:net";
import { join } from "node:path";
import { loadCredentials, projectRoot } from "../config.mjs";

const configured = loadCredentials(),
  children = new Set();
let stopping = false;
const port = Number(process.env.PORT || 4173),
  expoPort = Number(process.env.STARCAST_EXPO_PORT || 8081);
const lan =
  process.env.STARCAST_LAN_HOST ||
  Object.entries(networkInterfaces())
    .filter(([name]) => /^en\d/.test(name))
    .flatMap(([, addresses]) => addresses || [])
    .find((x) => x.family === "IPv4" && !x.internal)?.address;
if (!configured.configured || !configured.authorisedDevice)
  throw Error(
    "The ignored server credential file must contain OPENAI_API_KEY and STARCAST_DEV_INTELLIGENCE_TOKEN. No credentials were printed.",
  );
if (!lan)
  throw Error(
    "Connect this Mac to Wi-Fi, or set STARCAST_LAN_HOST to its LAN address.",
  );
const origin = "http://127.0.0.1:" + port,
  headers = {
    "x-star-cast-dev-token": process.env.STARCAST_DEV_INTELLIGENCE_TOKEN,
  };
async function free(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "0.0.0.0", () => server.close(() => resolve(true)));
  });
}
function child(command, args, env, cwd = projectRoot) {
  const process = spawn(command, args, { cwd, stdio: "inherit", env });
  children.add(process);
  process.on("exit", () => {
    children.delete(process);
    if (!stopping) stop();
  });
  return process;
}
function stop() {
  if (stopping) return;
  stopping = true;
  for (const process of children) process.kill("SIGTERM");
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
if (!(await free(expoPort)))
  throw Error(
    "Expo port " +
      expoPort +
      " is occupied. Close the previous Expo session or set STARCAST_EXPO_PORT. No process was stopped.",
  );
if (await free(port)) {
  child(process.execPath, ["server.mjs"], {
    ...process.env,
    PORT: String(port),
    STARCAST_PAID_INTELLIGENCE: "enabled",
    STARCAST_AUDIO_TRANSCRIPTION: "enabled",
    STARCAST_PREVIEW_ORIGIN: "http://localhost:" + expoPort,
  });
} else {
  try {
    const response = await fetch(origin + "/api/admin/intelligence", {
        headers,
        signal: AbortSignal.timeout(2000),
      }),
      data = await response.json();
    if (
      !response.ok ||
      !data.controls.enabled ||
      !data.controls.audioAnalysisEnabled
    )
      throw Error();
    console.log(
      "Reusing the authorised Star Cast backend. It will remain running when this launcher exits.",
    );
  } catch {
    throw Error(
      "Backend port " +
        port +
        " is occupied by an incompatible or unauthorised server. Close that Star Cast session yourself; no process was stopped.",
    );
  }
}
let health;
for (let attempt = 0; attempt < 30 && !stopping; attempt++) {
  try {
    const response = await fetch(origin + "/api/health", {
      signal: AbortSignal.timeout(1000),
    });
    if (response.ok) {
      health = await response.json();
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 250));
}
if (!health || stopping) {
  stop();
  throw Error(
    "The backend did not become ready. Review the backend message above.",
  );
}
console.log("Backend ready: http://" + lan + ":" + port);
if (process.env.STARCAST_CLOUD_API_URL)
  console.log("Paid-processing authority and native API: " + process.env.STARCAST_CLOUD_API_URL + ". Local paid processing is disabled.");
console.log(
  "OpenAI configured. Provider " +
    (health.providerVerified
      ? "previously verified by a completed request."
      : "not yet verified by a live request."),
);
console.log(
  "Paid text and explicitly requested audio processing authorised: $5/day, $25/month, 3 audio hours/day, 2 hours/episode.",
);
console.log(
  "Starting Expo. When its QR code appears, scan it with your iPhone on the same Wi-Fi. iPhone connection pending.",
);
// Only the private-pilot device token enters Expo. Never ship this pilot build publicly.
// The OpenAI key is removed from its environment.
const expoEnv = {
  ...process.env,
  EXPO_PUBLIC_API_BASE_URL: process.env.STARCAST_CLOUD_API_URL || "http://" + lan + ":" + port,
  EXPO_PUBLIC_DEV_INTELLIGENCE_TOKEN:
    process.env.STARCAST_CLOUD_DEVICE_TOKEN || process.env.STARCAST_DEV_INTELLIGENCE_TOKEN,
  REACT_NATIVE_PACKAGER_HOSTNAME: lan,
};
delete expoEnv.OPENAI_API_KEY;
delete expoEnv.STARCAST_DEV_INTELLIGENCE_TOKEN;
delete expoEnv.STARCAST_CLOUD_DEVICE_TOKEN;
child(
  process.execPath,
  [
    join(projectRoot, "native/node_modules/expo/bin/cli"),
    "start",
    "--lan",
    "--port",
    String(expoPort),
  ],
  expoEnv,
  join(projectRoot, "native"),
).on("spawn", () =>
  console.log("Expo is starting; its ready status and QR code follow."),
);
