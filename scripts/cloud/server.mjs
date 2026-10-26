import { cloudFrontProxyRanges } from "../../cloudfront-proxy.mjs";
import { execFileSync } from "node:child_process";
import { atomicJson } from "../../backup-worker.mjs";
import { monitorEventLoopDelay } from "node:perf_hooks";
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
  if (value.translationBeta === "INTERNAL_TESTING" && value.translationProvider === "aws") {
    process.env.RADIOSTAR_TRANSLATE_BETA = "INTERNAL_TESTING";
    process.env.RADIOSTAR_TRANSLATE_PROVIDER = "aws";
    process.env.STARCAST_TRANSLATION_BUCKET = process.env.STARCAST_BACKUP_BUCKET;
    process.env.AWS_REGION = "eu-west-2";
  }
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
// Verified dedicated VPC origin: backend SG accepts port 4173 only from the
// CloudFront VPCOrigins service SG. The VPC path preserves public edge source
// addresses; observed peers were verified against AWS origin-facing ranges.
process.env.STARCAST_TRUST_CLOUDFRONT_VPC = "enabled";
process.env.STARCAST_TRUSTED_PROXY_CIDRS = ["10.46.1.0/24", ...await cloudFrontProxyRanges()].join(",");
process.env.NODE_ENV = "production";
process.env.STARCAST_PRIVATE_PILOT = "enabled";
acquireServerLock("/var/lib/starcast/backend.lock");
const { server, store, queue } = createStarCastServer();
const check = store.db.prepare("PRAGMA quick_check").get();
if (Object.values(check)[0] !== "ok") throw Error("Database integrity check failed");
server.listen(4173, "0.0.0.0", () => console.log(JSON.stringify({ event: "cloud-ready", paid: process.env.STARCAST_PAID_INTELLIGENCE === "enabled" })));
// The backup and observer run in separate bounded systemd jobs. This heartbeat
// records only process health, never listener or episode identifiers.
const loop=monitorEventLoopDelay({resolution:20});loop.enable();
let writingHeartbeat=false;
async function heartbeat(){if(writingHeartbeat)return;writingHeartbeat=true;try{await atomicJson('/var/lib/starcast/runtime-health.json',{at:Date.now(),workerRunning:queue?.running===true,eventLoopP99Ms:Number(loop.percentile(99)/1e6)});loop.reset();}finally{writingHeartbeat=false;}}
setInterval(()=>void heartbeat().catch(()=>{}),30000).unref();void heartbeat().catch(()=>{});
process.on("SIGTERM", () => {
  server.close(() => { store.close(); process.exit(0); });
  setTimeout(() => process.exit(0), 25000).unref();
});
