import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, utimesSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { releaseRetentionPlan, assertDeploymentCapacity } from "./scripts/cloud/release-maintenance.mjs";
import { execFileSync } from "node:child_process";
const root = mkdtempSync(join(realpathSync(tmpdir()), "starcast-retention-"));
try {
  const create = (name, old = true, project = "star-cast") => {
    const path = join(root, name); mkdirSync(path);
    writeFileSync(join(path,"package.json"), JSON.stringify({name:project})); writeFileSync(join(path,"server.mjs"), "// fixture");
    if (old) utimesSync(path, new Date(0), new Date(0));
    return path;
  };
  for (let i=1;i<=4;i++) create(`previous-170000000${i}`);
  create("app"); create("data"); create("previous-not-a-release"); create("previous-1700000000", true, "other-app");
  create("staged-"+"a".repeat(64)); create("staged-"+"b".repeat(64), false);
  symlinkSync(join(root,"app"),join(root,"previous-1700000005"));
  const unexpectedState = create("previous-1600000000");
  writeFileSync(join(unexpectedState,"backend.sqlite"),"preserve unexpected data");
  assert.deepEqual(releaseRetentionPlan(root).map(x=>x.name).sort(), ["previous-1700000001","previous-1700000002","staged-"+"a".repeat(64)].sort());
  assert.throws(()=>releaseRetentionPlan(root,{keep:1}),/two rollback/);
  assert.throws(()=>assertDeploymentCapacity(root,()=>({bavail:1,bsize:4096,ffree:1e6})),/Deployment refused/);
  assert.throws(()=>assertDeploymentCapacity(root,()=>({bavail:1e7,bsize:4096,ffree:100})),/Deployment refused/);
  assertDeploymentCapacity(root,()=>({bavail:1e7,bsize:4096,ffree:1e6}));
  const cache = join(root,".npm-cache","xdg");
  const resolvedCache = execFileSync(process.execPath,["-e","Object.defineProperty(process,'platform',{value:'linux'});process.stdout.write(require('env-paths')('ffmpeg-static').cache)"],{encoding:"utf8",env:{...process.env,XDG_CACHE_HOME:cache}});
  assert.ok(resolvedCache.startsWith(cache+"/"), "Linux binary download cache stays inside the disposable deployment cache");
  console.log("Release retention: active/data/symlinks/unknown projects/recent stages protected; two rollbacks retained; byte/inode capacity guards passed.");
} finally { rmSync(root,{recursive:true}); }
