import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { verifyAwsIdentity } from "../aws-account-guard.mjs";

verifyAwsIdentity();
const aws = (args) => JSON.parse(execFileSync("aws", [...args, "--profile", "radiostar", "--region", "eu-west-2", "--output", "json", "--no-cli-pager"], { encoding: "utf8", timeout: 30000 }));
const output = JSON.parse(execFileSync(".starcast/tools/terraform", ["-chdir=infra/aws", "output", "-json"], { encoding: "utf8" }));
const instance = output.instance_id.value;
const target = aws(["ec2", "describe-instances", "--instance-ids", instance]).Reservations[0].Instances[0];
if (!target.Tags.some(t => t.Key === "Project" && t.Value === "StarCast")) throw Error("Instance ownership check failed");
const action = process.argv[2];
const quote = s => "'" + s.replaceAll("'", "'\\''") + "'";
const idleCheck = "/usr/local/bin/node --input-type=module -e " + quote(`
  import { DatabaseSync } from 'node:sqlite';
  const db = new DatabaseSync('/var/lib/starcast/backend.sqlite', {readOnly:true});
  const active = new Set(['QUEUED','DISCOVERING','TRANSCRIBING','UNDERSTANDING','ORGANISING','PROCESSING','PARTIAL_READY']);
  const busy = db.prepare("SELECT payload FROM records WHERE kind='intelligence'").all().some(row => {const v=JSON.parse(row.payload); return active.has(v.state) && !v.completedAt});
  db.close();
  if(busy) { console.error('Active intelligence work: maintenance refused.'); process.exit(1); }
`);
let commands;
if (action === "status") commands = ["cloud-init status", "systemctl is-active starcast", "tail -n 12 /var/log/starcast/backend.log"];
else if (action === "verify-runtime") commands = ["set -eu", "cd /opt/starcast/app", "/usr/local/bin/node -e " + quote(`const {execFileSync}=require('node:child_process'); for(const path of [require('ffmpeg-static'),require('ffprobe-static').path]) {execFileSync(path,['-version'],{stdio:'pipe',timeout:10000});} console.log('FFmpeg and FFprobe executable checks passed.');`)];
else if (action === "check-idle") commands = ["set -eu", idleCheck, "echo 'No active intelligence jobs.'"];
else if (action === "restart") commands = ["set -eu", idleCheck, "systemctl restart starcast", "curl -fsS --retry 12 --retry-delay 2 --retry-connrefused http://127.0.0.1:4173/api/health"];
else if (action === "verify-store") commands = ["/usr/local/bin/node --input-type=module -e " + quote(`
  import { DatabaseSync } from 'node:sqlite';
  const db = new DatabaseSync('/var/lib/starcast/backend.sqlite', {readOnly:true});
  const ledger = JSON.parse(db.prepare("SELECT payload FROM records WHERE kind='budget' AND id='ledger'").get().payload);
  console.log(JSON.stringify({integrity:db.prepare('PRAGMA integrity_check').get(),records:db.prepare('SELECT kind,count(*) AS count FROM records GROUP BY kind').all(),usageCount:ledger.usage.length,reservations:ledger.reservations.length,recordedUsd:ledger.usage.reduce((n,x)=>n+x.usd,0)}));
  db.close();` )];
else if (action === "connect") {
  const file = ".starcast/cloud-connection.json";
  const connection = JSON.parse(readFileSync(file, "utf8"));
  const url = output.api_url.value;
  if (!/^https:\/\/[a-z0-9]+\.cloudfront\.net$/.test(url)) throw Error("Unexpected API URL");
  writeFileSync(file, JSON.stringify({ ...connection, url }), { mode: 0o600 });
  console.log({ nativeApi: url, localEnvironmentPreserved: true });
} else if (action === "poll") {
  const id = process.argv[3];
  if (!/^[a-f0-9-]{36}$/.test(id || "")) throw Error("A valid SSM command id is required");
  const result = aws(["ssm", "get-command-invocation", "--command-id", id, "--instance-id", instance]);
  console.log({ status: result.Status, output: result.StandardOutputContent, error: result.StandardErrorContent });
  if (["Failed", "Cancelled", "TimedOut"].includes(result.Status)) process.exitCode = 1;
} else if (action === "deploy") {
  const file = ".starcast/aws-release.tar.gz";
  const sha = createHash("sha256").update(readFileSync(file)).digest("hex");
  const uri = `s3://${output.artifact_bucket.value}/releases/${sha}.tar.gz`;
  execFileSync("aws", ["s3", "cp", file, uri, "--profile", "radiostar", "--region", "eu-west-2", "--only-show-errors"], { stdio: "pipe" });
  const staged = "/opt/starcast/staged-" + sha;
  const maintenanceSource = readFileSync("scripts/cloud/release-maintenance.mjs", "utf8");
  commands = [`set -eu
export PATH=/usr/local/bin:/usr/bin:/bin
umask 022
exec 9>/run/starcast-deploy.lock
flock -n 9 || { echo 'Another deployment is active'; exit 1; }
${idleCheck}
node --input-type=module -e ${quote(maintenanceSource + "\nmaintainReleases({apply:true}); assertDeploymentCapacity();")}
test ! -e ${staged}
mkdir ${staged}
aws s3 cp ${uri} /opt/starcast/update.tar.gz --region eu-west-2 --only-show-errors
echo '${sha}  /opt/starcast/update.tar.gz' | sha256sum -c -
tar -xzf /opt/starcast/update.tar.gz -C ${staged}
cd ${staged}
npm ci --omit=dev --no-audit --no-fund --cache ${staged}/.npm-cache
rm -rf -- ${staged}/.npm-cache
node -e "const {execFileSync}=require('node:child_process'); for(const path of [require('ffmpeg-static'),require('ffprobe-static').path]) execFileSync(path,['-version'],{stdio:'pipe',timeout:10000});"
dnf install -y logrotate
cp scripts/cloud/logrotate.conf /etc/logrotate.d/starcast
chmod 644 /etc/logrotate.d/starcast
install -m 644 scripts/cloud/starcast-logrotate.service scripts/cloud/starcast-logrotate.timer /etc/systemd/system/
mkdir -p /etc/systemd/journald.conf.d
install -m 644 scripts/cloud/journald-limits.conf /etc/systemd/journald.conf.d/starcast.conf
systemctl daemon-reload
systemctl enable --now starcast-logrotate.timer
systemctl restart systemd-journald
chmod -R a+rX ${staged}
previous=/opt/starcast/previous-$(date +%s)
metadata_backup=/var/lib/starcast/release-before-update.json
if test -f /var/lib/starcast/release.json; then cp /var/lib/starcast/release.json "$metadata_backup"; else rm -f "$metadata_backup"; fi
${idleCheck}
systemctl stop starcast
mv /opt/starcast/app "$previous"
mv ${staged} /opt/starcast/app
previous_sha=$(node -e "try{const value=JSON.parse(require('node:fs').readFileSync('$metadata_backup','utf8'));process.stdout.write(/^[a-f0-9]{64}$/i.test(value.releaseSha||'')?value.releaseSha:'')}catch{}")
STARCAST_RELEASE_SHA='${sha}' STARCAST_PREVIOUS_RELEASE_SHA="$previous_sha" node --input-type=module -e "import {writeFileSync} from 'node:fs'; writeFileSync('/var/lib/starcast/release.json', JSON.stringify({releaseSha:process.env.STARCAST_RELEASE_SHA,previousReleaseSha:process.env.STARCAST_PREVIOUS_RELEASE_SHA||null,deployedAt:new Date().toISOString(),rollbackAvailable:true})+'\\n',{mode:0o600});"
chown starcast:starcast /var/lib/starcast/release.json
systemctl start starcast
if ! curl -fsS --retry 12 --retry-delay 2 --retry-connrefused http://127.0.0.1:4173/api/health; then
  systemctl stop starcast
  mv /opt/starcast/app ${staged}
  mv "$previous" /opt/starcast/app
  if test -f "$metadata_backup"; then mv "$metadata_backup" /var/lib/starcast/release.json; else rm -f /var/lib/starcast/release.json; fi
  systemctl start starcast
  exit 1
fi
rm -f "$metadata_backup"
node --input-type=module -e ${quote(maintenanceSource + "\nmaintainReleases({apply:true});")}
echo 'Release ${sha} healthy; previous source retained for rollback.'`];
} else throw Error("Use status, check-idle, verify-store, verify-runtime, restart, connect, deploy or poll <command-id>");
if (commands) {
  const command = aws(["ssm", "send-command", "--instance-ids", instance, "--document-name", "AWS-RunShellScript", "--parameters", JSON.stringify({ commands, executionTimeout: ["600"] })]);
  console.log({ commandId: command.Command.CommandId, action, instance, followUp: "Run this script with poll and the command id to verify completion." });
}
