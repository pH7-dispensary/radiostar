import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { verifyAwsIdentity } from "../aws-account-guard.mjs";
import { loadCredentials } from "../../config.mjs";

verifyAwsIdentity();
loadCredentials();
if (!process.env.OPENAI_API_KEY) throw Error("Existing server-side OpenAI key is unavailable.");
const file = ".starcast/cloud-connection.json";
const connection = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { token: randomBytes(32).toString("hex") };
const enable = process.argv.includes("--enable-paid");
if (enable && !existsSync(".starcast/cloud-authority.json")) throw Error("Local paid authority has not been transferred.");
// macOS AWS CLI cannot reopen Node's socket-backed stdin as a paramfile.
// The short-lived input stays in the ignored directory, owner-only, and is removed.
const temporary = mkdtempSync(resolve(".starcast/secret-transfer-"));
const inputFile = join(temporary, "input.json");
try {
  writeFileSync(inputFile, JSON.stringify({ SecretId: "starcast/phase1/backend", SecretString: JSON.stringify({
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      STARCAST_DEV_INTELLIGENCE_TOKEN: connection.token,
      paidEnabled: enable,
    }) }), { mode: 0o600 });
  execFileSync("aws", ["secretsmanager", "put-secret-value", "--profile", "radiostar", "--region", "eu-west-2", "--cli-input-json", "file://" + inputFile, "--no-cli-pager"], {
    stdio: ["ignore", "pipe", "pipe"], timeout: 30000,
  });
  writeFileSync(file, JSON.stringify(connection), { mode: 0o600 });
  console.log({ storedInSecretsManager: true, paidEnabled: enable, credentialPrinted: false });
} catch (error) {
  const diagnostic = String(error.stderr || "");
  const code = diagnostic.match(/An error occurred \(([A-Za-z0-9]+)\)/)?.[1] ||
    (/Unable to load paramfile/.test(diagnostic) ? "InputFileUnavailable" :
      /Invalid JSON/.test(diagnostic) ? "InvalidInputJSON" : error.code || "CLI_ERROR");
  throw Error(`Secret provisioning failed (${code}, exit ${error.status ?? "unknown"}); credential output suppressed.`);
} finally { rmSync(temporary, { recursive: true }); }
