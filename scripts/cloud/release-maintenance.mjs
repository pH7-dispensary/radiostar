import { lstatSync, readFileSync, readdirSync, realpathSync, rmSync, statfsSync } from "node:fs";
import { join } from "node:path";

// Only generated, direct-child release directories are eligible. Never touch
// application data, credentials, logs, runtimes, or arbitrary temporary files.
export function releaseRetentionPlan(root, { now = Date.now(), keep = 2 } = {}) {
  if (!Number.isInteger(keep) || keep < 2) throw Error("At least two rollback releases must be retained");
  if (lstatSync(root).isSymbolicLink() || realpathSync(root) !== root) throw Error("Release root must be canonical");
  const candidates = [];
  for (const name of readdirSync(root)) {
    if (!/^previous-\d{10,13}$/.test(name) && !/^staged-[a-f0-9]{64}$/.test(name)) continue;
    const path = join(root, name), stat = lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
    try {
      // Source archives have an explicit allowlist. Preserve any release that
      // unexpectedly contains local state, secrets, databases or diagnostic logs.
      if (readdirSync(path).some(entry => !["node_modules", "scripts", "fixtures", ".npm-cache", "package.json", "package-lock.json"].includes(entry) && !/^[^.][^/]*\.(mjs|js|html|css)$/.test(entry))) continue;
      if (lstatSync(join(path, "package.json")).isSymbolicLink() || lstatSync(join(path, "server.mjs")).isSymbolicLink()) continue;
      if (JSON.parse(readFileSync(join(path, "package.json"), "utf8")).name !== "star-cast") continue;
      if (!lstatSync(join(path, "server.mjs")).isFile()) continue;
    } catch { continue; }
    candidates.push({ name, path, mtimeMs: stat.mtimeMs, previous: name.startsWith("previous-") });
  }
  const previous = candidates.filter(x => x.previous).sort((a,b) => Number(b.name.slice(9)) - Number(a.name.slice(9)));
  const retained = new Set(previous.slice(0, keep).map(x => x.path));
  return candidates.filter(x => !retained.has(x.path) && (x.previous || now - x.mtimeMs > 24 * 60 * 60 * 1000));
}

export function maintainReleases({ apply = false } = {}) {
  const root = "/opt/starcast";
  // Fail closed unless the active source is the expected application.
  if (lstatSync(join(root, "app")).isSymbolicLink() || JSON.parse(readFileSync(join(root, "app/package.json"), "utf8")).name !== "star-cast") throw Error("Active release identity mismatch");
  const plan = releaseRetentionPlan(root);
  console.log(JSON.stringify({ operation: "release-retention", apply, paths: plan.map(x => x.path), keepRollbackReleases: 2 }));
  if (apply) for (const item of plan) {
    // Revalidate the plan immediately before each deletion; never follow symlinks.
    if (!releaseRetentionPlan(root).some(x => x.path === item.path)) throw Error("Retention target changed");
    rmSync(item.path, { recursive: true });
  }
  return plan;
}

export function assertDeploymentCapacity(root = "/opt/starcast", readStats = statfsSync) {
  const stats = readStats(root), freeBytes = Number(stats.bavail) * Number(stats.bsize);
  if (freeBytes < 3 * 1024 ** 3 || Number(stats.ffree) < 20000) throw Error("Deployment refused: need 3 GiB free and 20,000 free inodes before staging; active service unchanged");
  console.log(JSON.stringify({ operation: "deployment-capacity", freeBytes, freeInodes: Number(stats.ffree) }));
}
