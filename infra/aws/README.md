# Star Cast AWS Phase 1

Dedicated account **208096650030**, region **eu-west-2**, CLI profile **radiostar**.
API: **https://d3ri12f40b85i3.cloudfront.net**. This is an authenticated private pilot, not a public multi-user launch.

## Deployed architecture

- Existing Node backend on one `t3a.small`, Amazon Linux 2023, Node 24.22.0. x86 is necessary for the pinned `ffprobe-static` binary. CPU credits are standard, not unlimited.
- One durable SQLite writer on a 30 GiB encrypted gp3 volume. Transactional budget reservations and the existing persisted job/cache implementation are retained. **Do not scale replicas against this database.** PostgreSQL migrations remain the future multi-worker contract; an unused RDS instance is not provisioned.
- CloudFront HTTPS with a private EC2 VPC origin. Port 4173 accepts only CloudFront's VPC service security group. No public origin access, SSH, NAT gateway, load balancer, GPU or Kubernetes. One public IPv4 enables outbound HTTPS to publishers/OpenAI/SSM without a NAT gateway. Origin HTTP travels over the private VPC path.
- Secrets Manager holds the existing server-only OpenAI key, a private-pilot device token and a separate administrator token. Secret values are provisioned outside Terraform and never appear in its state/user-data. The local administrator connection is owner-only and ignored by Git. EC2's workload role can read only its secret and release/seed objects, use its dedicated processing queue, write backups/logs, and use Systems Manager.
- Private, encrypted, versioned S3 storage. Online SQLite backups every 15 minutes, 30-day backup retention. Retained encrypted root volume, instance termination protection, Terraform destruction guards.
- CloudWatch backend logs retained 14 days; local log rotation. Project/Environment/CostCenter/ManagedBy attribution tags. A $25 AWS monitoring budget with actual 80% and forecast 100% email thresholds; it is **not a hard spending cap**. Recipient is in ignored `phase1.auto.tfvars`.
- An encrypted SQS queue and DLQ provide durable dispatch to the single EC2 consumer. SQLite remains the only writer: the consumer uses a persisted outbox, idempotent job IDs and bounded retries. This is not a distributed worker fleet or high availability.
- Terraform state is encrypted/versioned in `s3://starcast-phase1-208096650030-eu-west-2/infra/terraform.tfstate` with S3 lockfile locking. The workload role cannot read state.

No pH7 infrastructure is used. CloudFront/IAM/billing are global AWS control planes; regional compute, storage, secrets, queues and logs are in London. Apple signing details were supplied for later use and were not changed.

## Single paid-processing authority

AWS owns all new paid work. The migration copied canonical transcripts, processed intelligence, provider-result cache, matching audio transcripts, and the complete spending ledger—not listener history.

The ignored `.starcast/cloud-authority.json` marker forces local paid text/audio processing off, including `npm run start:local-intelligence`. Never remove it casually: two independent ledgers would violate the shared limits. Local catalogue/cache and credential files remain intact. Local authenticated intelligence, conversation search, listener and skip routes proxy to AWS using the ignored cloud connection file. Network failure does not enable paid local fallback.

Limits remain **$5/day, $25/month, three new audio hours/day, two hours/episode**, enforced by the existing atomic reservations. Unknown provider outcomes remain charged conservatively. RSS/publisher transcripts and caches precede audio; only explicit audio consent permits paid transcription. Ad Skip automatic skipping remains disabled.

`npm run starcast` starts the local development server and Expo with the AWS URL/token. The OpenAI key is removed from Expo's environment. The pilot device token is necessarily client-visible: **do not distribute this pilot bundle publicly**. Public enrollment, per-user production authentication, abuse controls and HA are later launch gates.

## Operations

Run from the repository root. Use a current Node with `node:sqlite`, AWS CLI and the checksum-verified Terraform executable at `.starcast/tools/terraform` (or install a supported Terraform and adjust the command).

```sh
node scripts/aws-account-guard.mjs
npm test
cd native && npx tsc --noEmit
```

Every deployment wrapper checks STS for the exact account and `RadioStarDeploymentRole`; the Terraform provider/backend also refuse a different account. The existing deployment role is owner-managed; it was not modified.

```sh
node scripts/cloud/ops.mjs status
node scripts/cloud/ops.mjs verify-store
node scripts/cloud/ops.mjs poll COMMAND_ID
node scripts/cloud/verify.mjs
```

SSM commands are asynchronous: **poll the returned command ID** and check `Success`, not merely command submission. Cache verification makes no paid request. `verify.mjs --paid` explicitly selects one new 10–30 minute publisher-transcript episode, checks limits/auth/ledger, requests no paid audio, and verifies grounding, moment search and cache reuse. Do not repeatedly run it to poll an existing job: inspect that job instead. Reports are written under ignored `.starcast/` without credentials.

For a reviewed code update, after tests pass:

```sh
node scripts/cloud/prepare.mjs --archive-only
node scripts/cloud/ops.mjs deploy
node scripts/cloud/ops.mjs poll COMMAND_ID
```

Deploy builds dependencies before stopping the service, retains the previous source directory, and restores it if the health check fails. The database is never replaced. Schedule restart/deploy while no jobs are processing; interrupted jobs require bounded manual recovery and uncertain provider costs are not refunded.

Then review/apply Terraform so its versioned release object matches the archive:

```sh
node scripts/aws-account-guard.mjs .starcast/tools/terraform -chdir=infra/aws plan -out=reviewed.tfplan
node scripts/aws-account-guard.mjs .starcast/tools/terraform -chdir=infra/aws apply reviewed.tfplan
```

Changing user-data/AMI does not replace the running instance. Bootstrap changes require an explicit maintenance action through SSM; patch the OS during maintenance, with a verified database backup first. The latest bootstrap file is not proof it has executed on an existing instance.

Secrets: `node scripts/cloud/provision-secret.mjs` copies the existing ignored credential with paid work disabled; `--enable-paid` enables the already-authorized AWS authority. It also creates/preserves a separate owner-only administrator credential in ignored `.starcast/cloud-admin.json`, activates the single queue consumer and enables publisher-transcript-only followed-podcast checks. Both require the dedicated STS identity. Restart through `ops.mjs restart`, then poll. Rotation uses the same secret, not a second API integration. The short-lived owner-only CLI transfer file is removed after the operation.

Rights administration is an authenticated local CLI, not a public web page. It requires both private-pilot and administrator credentials, and accepts explicit owner-controlled JSON files for mutations:

```sh
node scripts/cloud/admin.mjs rights list
node scripts/cloud/admin.mjs rights apply assessment.json
node scripts/cloud/admin.mjs transcripts suspend removal.json
node scripts/cloud/admin.mjs reports list
```

An assessment must identify a concrete feed (and optional episode), rights basis, classification, permitted operations, restrictions and review date. No public RSS feed is implicitly approved.

On a new checkout, recover the existing S3 Terraform backend with `init`, not a new state; obtain the existing seed/release artifacts privately before planning. Do not regenerate or overwrite the cloud ledger from local data. Initial account bootstrap used local Terraform state and `private_origin_ready=false`; after CloudFront created its service security group, the default `true` restricted ingress. Do not set it false for routine updates.

## Recovery and limitations

Restore the latest S3 SQLite backup to a separate temporary file and run `PRAGMA integrity_check` before maintenance. The initial deployment tested this successfully. Before replacing live state: disable cloud paid processing, stop the service, retain the current database/WAL/SHM safely, restore as `starcast` with mode 0600, and reconcile any provider usage after the backup timestamp. **Never restore the initial seed as a current spending ledger.** Resume paid processing only after reconciliation. Backup RPO is approximately 15 minutes; this is not HA.

For application rollback, stop the service and swap `/opt/starcast/app` with the preserved `/opt/starcast/previous-*` release selected after inspection. Do not roll back the spending ledger. Never use `terraform destroy` as a rollback.

Physical iPhone confirmation is separate from cloud API and native-web verification: scan the Expo QR code, open the verified episode, and confirm the brief/moments render and playback seeks on-device. No physiological sleep detection, global transcript coverage, automatic verified Ad Skip, App Store release, or public production readiness is claimed.

## Cost basis

October 15, 2026 AWS Price List API: London Linux `t3a.small` **$0.0212/hour**; gp3 **$0.0928/GiB-month**. At 730 hours/month: EC2 $15.476, one [public IPv4](https://aws.amazon.com/vpc/pricing/) $3.65, 30 GiB gp3 $2.784, one [Secrets Manager secret](https://aws.amazon.com/secrets-manager/pricing/) $0.40 = **$22.31/month fixed baseline**.

S3 requests/storage, CloudFront traffic, CloudWatch ingestion, Secrets Manager API calls, billing queries, taxes and any other usage are additional. No free-tier credits or promotional allocation are assumed. OpenAI's separate capped usage is not included. AWS billing is delayed: a same-day Cost Explorer result is not the final deployment bill. See the deployment verification record for observed usage.
