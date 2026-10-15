import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

export const projectRoot = fileURLToPath(new URL(".", import.meta.url));
export function loadCredentials(env = process.env) {
  const file = env.STARCAST_OPENAI_ENV_FILE || join(projectRoot, "continue");
  if (existsSync(file)) {
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    for (const name of ["OPENAI_API_KEY", "STARCAST_DEV_INTELLIGENCE_TOKEN"]) {
      const line = lines.find((value) => value.startsWith(`${name}=`));
      if (!env[name] && line) env[name] = line.slice(name.length + 1).trim();
    }
  }
  // This machine has handed the single paid-processing budget to AWS.
  // Never silently fall back to a second paid local ledger.
  applyCloudAuthority(env);
  return {
    configured: Boolean(env.OPENAI_API_KEY),
    authorisedDevice: Boolean(env.STARCAST_DEV_INTELLIGENCE_TOKEN),
  };
}

export function applyCloudAuthority(env, directory = join(projectRoot, ".starcast")) {
  const authority = join(directory, "cloud-authority.json");
  if (existsSync(authority)) {
    env.STARCAST_PAID_INTELLIGENCE = "disabled";
    env.STARCAST_AUDIO_TRANSCRIPTION = "disabled";
    delete env.STARCAST_CLOUD_API_URL;
    delete env.STARCAST_CLOUD_DEVICE_TOKEN;
    const connection = join(directory, "cloud-connection.json");
    if (existsSync(connection)) {
      const cloud = JSON.parse(readFileSync(connection, "utf8"));
      if (cloud.url && /^https:\/\/[a-z0-9]+\.cloudfront\.net$/.test(cloud.url) && typeof cloud.token === "string" && cloud.token.length >= 32) {
        env.STARCAST_CLOUD_API_URL = cloud.url;
        env.STARCAST_CLOUD_DEVICE_TOKEN = cloud.token;
      }
    }
  }
}
