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
  return {
    configured: Boolean(env.OPENAI_API_KEY),
    authorisedDevice: Boolean(env.STARCAST_DEV_INTELLIGENCE_TOKEN),
  };
}
