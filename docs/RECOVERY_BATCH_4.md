# Recovery Batch 4 — AWS reliability, monitoring and recovery

Verified 26 October 2026. Repository `pH7-dispensary/radiostar`, branch `work`; baseline `02c484d`. Dedicated account **208096650030**, **eu-west-2**, STS-verified RadioStarDeploymentRole. Scope RT15–RT17. No pH7 changes, TestFlight build, paid AI calls, budget increase or new permanent compute/database/queue.

## Status

| Finding | Outcome |
|---|---|
| RT15: blocking backups | **IMPLEMENTED / VERIFIED** — isolated backup process; real 60-second failed-upload regression; live encrypted, checksum-verified uploads |
| RT16: missing monitoring | **IMPLEMENTED / VERIFIED** — 10 measured metrics, 12 enabled healthy alarms, controlled alarm→SNS action and automatic return to OK |
| Email delivery | **PARTIALLY VERIFIED** — SNS accepted test and alarm messages. Owner reports successful confirmation, but AWS still returns `PendingConfirmation=true`; recipient delivery cannot be claimed |
| RT17: recovery/capacity | **VERIFIED** isolated real-backup restore and bounded EC2 benchmark; **PARTIALLY VERIFIED** full production failover and sustained capacity remain outside this drill |

## Backup and disk safeguards

`backup-worker.mjs` runs under a separate systemd service, every 15 minutes. The serving process no longer snapshots SQLite or synchronously uploads backups. SQLite online backup produces a consistent snapshot; the worker converts the copy to a standalone journal, runs integrity_check, computes SHA-256 and checks S3's returned checksum. AES256 encryption and versioning remain enabled.

One active promise plus cross-process flock prevents overlapping uploads. Three attempts have a shared 60-second upload deadline per attempt and 1/2-second backoff. Systemd caps the whole job at 240 seconds and 384 MiB; logs and atomic state files distinguish snapshotting, uploading, verified and failed. A forcibly killed process is visible through systemd failure and backup freshness rather than falsely recording success. An unsuccessful attempt preserves the previous verification record. The API/worker remains a separate process.

Historical `backups/` objects retain their existing 30-day current/7-day noncurrent lifecycle. The new versioned `recovery/latest.sqlite` has **no current-version expiry**, so an extended outage cannot expire the last verified recovery point; noncurrent versions expire after seven days. Local worker snapshots are removed after execution; only its recognisable stale staging files older than one hour are eligible for cleanup. Diagnostic/preflight snapshots, credentials, active database and logs are preserved.

Live backups succeeded at 16:49:27Z and on the next timer at approximately 17:04:33Z. Both were 13,664,256 bytes; S3 head-object confirmed AES256, version ID and SHA-256. The later pinned version was `c0DPRkRrA0top4b6ABVP5FYGwQPPU5wt`.

Existing protections remain: 3 GiB/20,000-inode deployment admission checks; two eligible rollback releases; older unrecognised legacy release deliberately retained; staging cleanup only after identity checks. Logs rotate daily/at 10 MiB, keep seven compressed generations, CloudWatch retention 14 days. Journald caps persistent use at 128 MiB, reserves 1 GiB free and caps runtime use at 32 MiB. Live disk: **25,774,092,288 bytes free**, 15,627,319 free inodes, about 20% used.

## Monitoring and notifications

A bounded separate one-minute service emits fixed-dimension `RadioStar/Operations` metrics through the existing CloudWatch log agent. No listener identifiers or credentials are metric dimensions. API HTTPS health, worker heartbeat, database quick-check, disk, inodes, backup freshness, processing failures, event-loop delay and monitoring heartbeat are real measurements. Existing SQS metrics cover queue depth/age and dead-letter depth; protected Admin still reads actual queue attributes.

| Alarm | Threshold / evaluation | Missing data |
|---|---|---|
| API, worker, database | health <1, 2 of 3 one-minute samples | Breaching |
| Disk critical / warning | ≥90% / ≥80%, 2 of 3 minutes | Breaching / missing |
| Free inodes | <100,000, 2 of 3 minutes | Breaching |
| Backup overdue | verified upload older than 60 minutes, 2 of 3 minutes | Breaching |
| Processing failures | ≥3 failures in the trailing five-minute count, 2 of 3 samples | Missing |
| Event-loop delay | p99 >500 ms, 2 of 3 samples | Missing |
| Monitoring heartbeat | <1, 2 of 3 minutes | Breaching |
| Queue age | >30 minutes, 2 of 3 five-minute samples | Not breaching for idle SQS |
| Dead-letter messages | >0, 2 of 3 minutes | Not breaching for idle SQS |

All alarms route to `arn:aws:sns:eu-west-2:208096650030:starcast-operations`; topic policy permits only this account's `starcast-*` CloudWatch alarms. Destination is the previously authorised **oska@ph7.health**. Actions were initially disabled while telemetry was commissioned, then enabled after all metrics appeared healthy. No extra canary or always-on monitoring host.

Controlled notification verification: direct SNS message `29d6a345-1755-51c1-ad63-c01c9fdefabd` accepted. Temporarily set only the telemetry alarm state to ALARM with an explicit controlled-test reason; no metrics, services or data were falsified/disabled. CloudWatch recorded successful SNS actions at **17:01:50Z** and **17:02:51Z**, then actual healthy telemetry restored OK. This proves alarm routing, not inbox delivery. AWS subscription `51f80f6d-e884-4264-9e35-74fc5374c588` still reports pending despite the owner's confirmation. Resolve that AWS confirmation discrepancy and repeat the notification test before relying on unattended email alerting.

## Real isolated restoration

Source: encrypted S3 `backups/backend-2026-10-26T16-23-38.970Z.sqlite`, version `OPRHim2E6NBA9BRlKBWTvhgX19ZhP1bi`. Disposable t3.small matched production compute size, with encrypted disposable 8 GiB gp3, standard CPU credits, no IAM role and **zero ingress**. An ephemeral public IP allowed outbound HTTPS bootstrap; the test application bound only loopback. No production queue, paid provider credentials or notifications were configured; the application test rejected external fetches. Short-lived signed URLs downloaded only the source archive and selected backup.

| Measurement | Actual |
|---|---:|
| S3 backup retrieval | 284 ms |
| Copy/open/index/integrity restoration | 418.58 ms |
| Application startup | 28.03 ms |
| Initial health check | 28.70 ms |
| Application restore total | 475.41 ms |
| Retrieval plus application restore | **759.41 ms** |
| Provisioning through result collection, including benchmark and polling | **237.50 seconds** |

Integrity, canonical records, listener state, cached intelligence and emergency administrator session compatibility passed. Restored counts include 9 installations, 21 intelligence records, 18 transcripts and 36 rights records. All pre-existing READY jobs and the paid ledger were preserved. No external application fetch or paid call occurred. Production has no individual owner account yet, so this validates the existing emergency session contract, not an invented individual administrator login.

Initial attempts exposed disabled-IMDS bootstrap and a connection reset during load. The drill now requires IMDSv2 without an instance role, reports bounded failure diagnostics and records network failures in capacity results. The completed run had zero request errors; the earlier reset remains a warning against extrapolating a brief run to availability guarantees. All failed-attempt resources were also removed.

**Recovery objectives:** operational target RPO ≤20 minutes while backups are healthy (15-minute schedule plus bounded execution); no guarantee during an upload outage. The selected drill backup was deliberately older than the newest production snapshot. The pinned copy remains available indefinitely, but data-loss exposure grows with its age. The 60-minute freshness alarm is a degradation alert, not an RPO guarantee. Proposed full-service RTO is 30 minutes; **not yet proven**. This drill excludes production credential rebinding, queue reconciliation with real in-flight work and CloudFront origin cutover. The 759 ms figure assumes provisioned dependencies and must not be presented as full production recovery time.

## Capacity and database evidence

400 authenticated mixed requests on the restored EC2 instance: cached intelligence, catalogue with mocked RSS, conversation search, admin podcast lists and processing status. Each concurrency round also processed eight mock SQS jobs with fixture database writes. No production stress or model processing. CPU is process CPU time; RSS is end-of-round memory, not a measured peak.

| Concurrency | Requests/s | p50 ms | p95 ms | Errors | CPU ms / elapsed ms | RSS MiB | Queue p95 delay ms | Event-loop p99 ms |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 9.76 | 95 | 213 | 0/100 | 10,572 / 10,250 | 237 | 732 | 277 |
| 4 | 11.12 | 391 | 469 | 0/100 | 9,306 / 8,989 | 246 | 1,012 | 387 |
| 8 | 4.91 | 1,670 | 2,460 | 0/100 | 10,305 / 20,349 | 251 | 2,245 | 1,434 |
| 16 | 3.99 | 2,408 | 11,283 | 0/100 | 10,673 / 25,046 | 259 | 7,136 | 2,088 |

All 32 mock messages were acknowledged once. Queue times are fixture backlog-to-start measurements, not real transcription throughput. T3 credit balance was 0.7868 at the 17:05 sample; this is a short, credit-sensitive benchmark, not steady-state capacity. Treat **1–4 concurrent requests in this mixed workload** as the tested conservative envelope. Eight and sixteen show substantial degradation. No claim about 1,000/10,000 listeners is supported. Scenario-level measurements are retained in [the evidence record](RECOVERY_BATCH_4_EVIDENCE.json).

Before the change, admin episode views repeatedly deserialised whole intelligence/history kinds. Added a non-destructive partial expression index on kind/feed URL and a compatible episode lookup (including legacy nested episode IDs), instead of rescanning those kinds per row. Same local 400-request benchmark improved from 14.26 to 22.10 requests/s at concurrency one; admin-list p95 fell from 255.43 ms to 99.92 ms in that round. EC2 figures above are reported separately. Search and other whole-kind paths still need bounded indexing/pagination if demand grows.

Separate local cross-process WAL test: a writer held a transaction for 200 ms; a concurrent read returned the committed snapshot in 0.028 ms, while another writer waited 209.5 ms, then succeeded with integrity intact. This confirms serialized writer contention remains; synchronous application SQL can still delay its event loop even though backup upload no longer does.

## Queue reliability, tests and live release

`npm test` passed the complete suite, including new snapshot/checksum/retry/overlap/retention/missing-metric tests and existing durable checkpoints, process restart, job deduplication, atomic budget reservations, recovery and DLQ/retry tests with mocked providers. The **real 60-second failed upload** test completed 101 HTTP requests (worst 37.49 ms), while 240 mock SQS lease renewals continued and the completed job was acknowledged once. Full paid-stage restart tests cover uncertain/recorded provider results without duplicate paid execution; the restored production backup itself contained no live paid reservation to replay.

Terraform validation, source syntax checks, isolated restore reruns and `git diff --check` passed. Additive index creation and legacy lookup compatibility were tested. No native changes required TypeScript/EAS/TestFlight work.

Deployed release **ebb927672f7551581d3223e271bba121a2b2255350c221977113b40ff3009dc8** at **16:49:24Z**, SSM `7e8640b4-a576-4a96-9e5e-a62d2afe71de` succeeded. HTTPS health, secure admin cookie session/revocation, CSRF rejection, listener authentication and real cached READY intelligence passed. Service/worker and backup/monitor timers were healthy. SQLite integrity was OK. SQS and DLQ each had zero visible/in-flight messages. AI ledger remained **41 usage records, $1.562445, zero reservations**; existing limits and temporary internal test configuration were preserved.

Production EC2 `i-08537aa0e84163cb9`, encrypted 30 GiB root `vol-06c0850a7ca6e69e0`, has DeleteOnTermination=false. Stopping the host stops API and worker; data persists on EBS, but this is still a single failure domain. SQS retains unacknowledged work for four days, visibility is 900 seconds, redrive after three receives, DLQ retention 14 days. Recovery must reconcile durable reservations/checkpoints before enabling the worker. A stale database restore alone cannot establish whether an external paid call completed; uncertain results require inspection and must not be blindly retried.

## Costs, cleanup and rollback

AWS Cost Explorer returned **$7.142201339** month-to-date unblended charges for 1–26 October, explicitly marked **Estimated** by AWS; this is not a final invoice and today's charges can lag. Incremental monitoring estimate: 10 London custom metrics × $0.30 + 12 standard alarms × $0.10 = **$4.20/month**, plus low-volume logs/SNS. Pinned-copy version retention adds roughly 9 GB at the observed snapshot size/cadence (about $0.20–$0.30/month storage estimate), plus S3 requests. Existing backup history remains unchanged. No new permanent host, NAT gateway, GPU or database.

Four short disposable t3.small attempts total about 18 minutes. AWS Pricing API quoted London Linux t3.small **$0.0236/hour**; compute is approximately $0.0071. Combined temporary compute, EBS, public IPv4, request traffic and the one Cost Explorer query are estimated **under $0.10**, not a measured final invoice. CPU credit mode was standard, preventing unlimited-credit charges. Pricing references: [CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/), [regional price list](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudWatch/current/eu-west-2/index.json).

All four temporary instances are confirmed terminated; all associated recovery security groups, temporary EBS volumes and exact disposable archive object versions/delete markers are absent. No temporary IAM role/profile was created. Local restored databases and disposable archives were removed after retaining non-secret measurement evidence. Production backups, credentials, active source and protected rollback copies were preserved.

Previous production release **47fa6fedfe931642431981c9940816bf3bdba11cafde56f72c91410865887e77** remains available. Before rollback, stop new backup/monitor timers, pause the worker only after verifying no active paid job, restore the verified previous source and release metadata, restart and verify HTTPS/database/queue/authentication. The older source includes its old synchronous backup behaviour; rollback is emergency recovery, not the preferred steady state. The additive index is backward-compatible and needs no data rollback. Retain live alarm configuration; missing telemetry must remain visible after rollback. Do not apply an unrelated full Terraform plan: this deployment used reviewed targets for monitoring, narrowly scoped backup IAM and S3 lifecycle only.

## Remaining actions

- **BLOCKED — email delivery verification:** reconcile AWS's pending subscription state despite the owner's reported confirmation, then repeat the controlled notification test and confirm receipt.
- **PARTIALLY VERIFIED — full production disaster recovery:** exercise operator-led EBS/source/secret/CloudFront/queue restoration before claiming a 30-minute full-service RTO.
- **PARTIALLY VERIFIED — sustained capacity:** short burst results constrain internal-beta use; optimise remaining admin/search scans before higher concurrency. No infrastructure expansion was assumed.
- Existing Batch 3 owner-account provisioning remains outstanding; no credentials were invented or rotated.

Implementation commit: `f7c42ea`. Follow-up verification commit contains the completed drill tooling and this report; both are pushed to `origin/work` after final verification.
