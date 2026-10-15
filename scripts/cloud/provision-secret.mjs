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
const adminFile = ".starcast/cloud-admin.json";
const connection = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { token: randomBytes(32).toString("hex") };
const admin = existsSync(adminFile) ? JSON.parse(readFileSync(adminFile, "utf8")) : { token: randomBytes(32).toString("hex") };
if (typeof connection.token !== "string" || connection.token.length < 32) throw Error("The private pilot token is invalid.");
if (typeof admin.token !== "string" || admin.token.length < 32) throw Error("The administrator token is invalid.");
const enable = process.argv.includes("--enable-paid");
if (enable && !existsSync(".starcast/cloud-authority.json")) throw Error("Local paid authority has not been transferred.");
const terraform = JSON.parse(execFileSync(".starcast/tools/terraform", ["-chdir=infra/aws", "output", "-json"], { encoding: "utf8" }));
const queueUrl = terraform.processing_queue_url?.value;
if (!/^https:\/\/sqs\.eu-west-2\.amazonaws\.com\/208096650030\/starcast-phase1-processing$/.test(queueUrl || ""))
  throw Error("The dedicated Star Cast processing queue is unavailable.");
// macOS AWS CLI cannot reopen Node's socket-backed stdin as a paramfile.
// The short-lived input stays in the ignored directory, owner-only, and is removed.
const temporary = mkdtempSync(resolve(".starcast/secret-transfer-"));
const inputFile = join(temporary, "input.json");
try {
  writeFileSync(inputFile, JSON.stringify({ SecretId: "starcast/phase1/backend", SecretString: JSON.stringify({
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      STARCAST_DEV_INTELLIGENCE_TOKEN: connection.token,
      STARCAST_ADMIN_TOKEN: admin.token,
      paidEnabled: enable,
      followMonitorEnabled: true,
      processingQueueUrl: queueUrl,
      approvedTestCorpusEnabled: true,
      testCorpusOrigin: terraform.api_url?.value,
    }) }), { mode: 0o600 });
  execFileSync("aws", ["secretsmanager", "put-secret-value", "--profile", "radiostar", "--region", "eu-west-2", "--cli-input-json", "file://" + inputFile, "--no-cli-pager"], {
    stdio: ["ignore", "pipe", "pipe"], timeout: 30000,
  });
  writeFileSync(file, JSON.stringify(connection), { mode: 0o600 });
  writeFileSync(adminFile, JSON.stringify({ url: terraform.api_url?.value, token: admin.token }), { mode: 0o600 });
  console.log({ storedInSecretsManager: true, paidEnabled: enable, queueEnabled: true, followMonitorEnabled: true, credentialPrinted: false });
} catch (error) {
  const diagnostic = String(error.stderr || "");
  const code = diagnostic.match(/An error occurred \(([A-Za-z0-9]+)\)/)?.[1] ||
    (/Unable to load paramfile/.test(diagnostic) ? "InputFileUnavailable" :
      /Invalid JSON/.test(diagnostic) ? "InvalidInputJSON" : error.code || "CLI_ERROR");
  throw Error(`Secret provisioning failed (${code}, exit ${error.status ?? "unknown"}); credential output suppressed.`);
} finally { rmSync(temporary, { recursive: true }); }
