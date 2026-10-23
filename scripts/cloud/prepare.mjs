import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { LocalStore } from "../../persistence.mjs";
import { projectRoot } from "../../config.mjs";
import { join } from "node:path";

process.chdir(projectRoot);
mkdirSync(".starcast", { recursive: true, mode: 0o700 });
// One-way spending authority marker is written BEFORE exporting the ledger.
// Existing local paid processes must be stopped before this command.
if (!process.argv.includes("--archive-only")) {
try {
  execFileSync("lsof", ["-nP", "-iTCP:4173", "-sTCP:LISTEN"], { stdio: "pipe" });
  throw Error("Stop the local backend before transferring paid authority.");
} catch (error) {
  if (error.status !== 1) throw error;
}
writeFileSync(".starcast/cloud-authority.json", JSON.stringify({ account: "208096650030", region: "eu-west-2", paidAuthority: "aws" }), { mode: 0o600 });
if (!existsSync(".starcast/aws-seed.sqlite")) {
  const source = new LocalStore(".starcast/development.sqlite");
  const budget = source.all("budget")[0]?.[1];
  if (budget?.reservations?.length) throw Error("Outstanding cost reservations require reconciliation before migration.");
  const staged = `.starcast/aws-seed-${process.pid}.sqlite`;
  const target = new LocalStore(staged);
  const counts = {};
  try {
  target.transaction(() => {
    for (const kind of ["intelligence", "transcript", "audio-transcript", "provider-result", "budget"]) {
      const rows = source.all(kind);
      if (kind === "intelligence" && rows.some(([,v]) => ["QUEUED", "PROCESSING"].includes(v.state) && !v.completedAt))
        throw Error("An active intelligence job prevents migration.");
      for (const [id, value] of rows) target.set(kind, id, value);
      counts[kind] = rows.length;
    }
  });
  target.close(); source.close();
  renameSync(staged, ".starcast/aws-seed.sqlite");
  console.log({ cacheExported: counts, listenerHistoryCopied: false });
  } catch (error) {
    try { target.close(); } catch {}
    try { source.close(); } catch {}
    for (const path of [staged, staged + "-wal", staged + "-shm"])
      if (existsSync(path)) unlinkSync(path);
    throw error;
  }
}
}
const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0");
const selected = tracked.filter(p => (/^[^/]+\.(mjs|js|html|css)$/.test(p) && !p.startsWith("test-")) || ["package.json", "package-lock.json"].includes(p));
selected.push("scripts/cloud/server.mjs", "scripts/cloud/logrotate.conf");
selected.push("scripts/cloud/release-maintenance.mjs", "scripts/cloud/starcast-logrotate.service", "scripts/cloud/starcast-logrotate.timer", "scripts/cloud/journald-limits.conf");
selected.push("fixtures/ad-skip-owned-v1.mp3", "fixtures/ad-skip-owned-v1.json");
execFileSync("tar", ["--no-xattrs", "-czf", join(projectRoot, ".starcast/aws-release.tar.gz"), "--null", "-T", "-"], { input: selected.join("\0") + "\0", stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, COPYFILE_DISABLE: "1" } });
console.log("Backend archive prepared from an explicit source allowlist; credentials and native files excluded.");
