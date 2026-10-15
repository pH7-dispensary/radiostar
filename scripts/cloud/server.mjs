import { execFileSync } from "node:child_process";
import { backup } from "node:sqlite";
import { unlink } from "node:fs/promises";
import { createStarCastServer } from "../../server.mjs";
import { acquireServerLock } from "../../server-lock.mjs";

// Secrets never enter argv, Terraform state, source archives or log output.
try {
  const value = JSON.parse(execFileSync("aws", ["secretsmanager", "get-secret-value",
    "--secret-id", process.env.STARCAST_SECRET_ARN, "--region", "eu-west-2",
    "--query", "SecretString", "--output", "text", "--no-cli-pager"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000 }));
  if (!value.OPENAI_API_KEY || !value.STARCAST_DEV_INTELLIGENCE_TOKEN || !value.STARCAST_ADMIN_TOKEN) throw Error();
  process.env.OPENAI_API_KEY = value.OPENAI_API_KEY;
  process.env.STARCAST_DEV_INTELLIGENCE_TOKEN = value.STARCAST_DEV_INTELLIGENCE_TOKEN;
  process.env.STARCAST_ADMIN_TOKEN = value.STARCAST_ADMIN_TOKEN;
  process.env.STARCAST_PAID_INTELLIGENCE = value.paidEnabled === true ? "enabled" : "disabled";
  process.env.STARCAST_AUDIO_TRANSCRIPTION = value.paidEnabled === true ? "enabled" : "disabled";
  if (value.processingQueueUrl) process.env.STARCAST_PROCESSING_QUEUE_URL = value.processingQueueUrl;
  if (value.followMonitorEnabled === true) process.env.STARCAST_FOLLOW_MONITOR = "enabled";
  if (value.approvedTestCorpusEnabled === true && /^https:\/\/[a-z0-9]+\.cloudfront\.net$/.test(value.testCorpusOrigin || "")) {
    process.env.STARCAST_APPROVED_TEST_CORPUS = "enabled";
    process.env.STARCAST_TEST_CORPUS_ORIGIN = value.testCorpusOrigin;
  }
} catch {
  console.error("Cloud credentials unavailable; refusing to start.");
  process.exit(1);
}
process.env.NODE_ENV = "production";
process.env.STARCAST_PRIVATE_PILOT = "enabled";
acquireServerLock("/var/lib/starcast/backend.lock");
const { server, store } = createStarCastServer();
const check = store.db.prepare("PRAGMA quick_check").get();
if (Object.values(check)[0] !== "ok") throw Error("Database integrity check failed");
server.listen(4173, "0.0.0.0", () => console.log(JSON.stringify({ event: "cloud-ready", paid: process.env.STARCAST_PAID_INTELLIGENCE === "enabled" })));
let backingUp = false;
async function saveBackup() {
  if (backingUp) return;
  backingUp = true;
  const name = `backend-${new Date().toISOString().replaceAll(":", "-")}.sqlite`;
  const path = `/var/lib/starcast/${name}`;
  try {
    await backup(store.db, path);
    execFileSync("aws", ["s3", "cp", path, `s3://${process.env.STARCAST_BACKUP_BUCKET}/backups/${name}`,
      "--region", "eu-west-2", "--only-show-errors"], { stdio: ["ignore", "pipe", "pipe"], timeout: 60000 });
    console.log(JSON.stringify({ event: "backup-complete" }));
  } catch {
    console.error(JSON.stringify({ event: "backup-failed" }));
  } finally {
    await unlink(path).catch(() => {});
    backingUp = false;
  }
}
setInterval(saveBackup, 15 * 60 * 1000).unref();
void saveBackup();
process.on("SIGTERM", () => {
  server.close(() => { store.close(); process.exit(0); });
  setTimeout(() => process.exit(0), 25000).unref();
});
