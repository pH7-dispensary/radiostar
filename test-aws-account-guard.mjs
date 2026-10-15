import assert from "node:assert/strict";
import { assertAwsIdentity, AWS_TARGET } from "./scripts/aws-account-guard.mjs";
const good = { Account: AWS_TARGET.account, Arn: `arn:aws:sts::${AWS_TARGET.account}:assumed-role/RadioStarDeploymentRole/test` };
assert.equal(assertAwsIdentity(good), good);
for (const bad of [null, {}, { ...good, Account: "000000000000" }, { ...good, Arn: "arn:aws:iam::208096650030:root" }, { ...good, Arn: "arn:aws:sts::208096650030:assumed-role/OtherRole/test" }]) {
  assert.throws(() => assertAwsIdentity(bad), /Deployment refused/);
}
console.log("AWS account and role deployment guards passed");
