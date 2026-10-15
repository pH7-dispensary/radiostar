import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const AWS_TARGET = Object.freeze({ account: "208096650030", region: "eu-west-2", profile: "radiostar" });
export function assertAwsIdentity(identity) {
  if (identity?.Account !== AWS_TARGET.account ||
      !identity?.Arn?.startsWith(`arn:aws:sts::${AWS_TARGET.account}:assumed-role/RadioStarDeploymentRole/`)) {
    throw new Error("Deployment refused: the dedicated Star Cast account and deployment role are required.");
  }
  return identity;
}
export function verifyAwsIdentity() {
  return assertAwsIdentity(JSON.parse(execFileSync("aws", [
    "sts", "get-caller-identity", "--profile", AWS_TARGET.profile,
    "--region", AWS_TARGET.region, "--output", "json", "--no-cli-pager",
  ], { encoding: "utf8", timeout: 30000 })));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const identity = verifyAwsIdentity();
  console.log(`Verified Star Cast account ${identity.Account} in ${AWS_TARGET.region}.`);
  const [command, ...args] = process.argv.slice(2);
  if (command) {
    const result = spawnSync(command, args, { stdio: "inherit", env: {
      ...process.env, AWS_PROFILE: AWS_TARGET.profile, AWS_REGION: AWS_TARGET.region,
      AWS_DEFAULT_REGION: AWS_TARGET.region,
    } });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  }
}
