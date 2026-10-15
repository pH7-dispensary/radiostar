# Phase 1 verification — 2026-10-15

## Deployment

- STS: account `208096650030`, assumed `RadioStarDeploymentRole`, profile `radiostar`. Wrong account, role and root identities rejected by regression tests.
- Region `eu-west-2`; isolated Star Cast VPC `vpc-0b3e047cb631254bc`.
- Instance `i-08537aa0e84163cb9`; EC2 system/instance checks `ok`.
- CloudFront `E1RND8GO01AA5I`, private origin `vo_GqVlFrCeOTwFnQ80Dn2585`, both deployed.
- API `https://d3ri12f40b85i3.cloudfront.net`; HTTPS health ready, anonymous catalogue/admin calls rejected with 403.
- Origin ingress restricted to service security group `sg-01b96027a7984db14`, port 4173; no public CIDRs, CloudFront public prefix list, or SSH ingress.
- Secret securely provisioned; paid processing initially disabled for cache verification, then enabled after ledger/auth/limit checks. No credential values committed, logged, placed in Terraform or passed to Expo.
- Final Terraform plan: **no changes**, using encrypted S3 state and lockfile locking.
- Budget notifications applied to the user-approved email at 80% actual / 100% forecast of $25/month. This AWS budget is monitoring, not a hard cap.

## Real intelligence

Existing cache: Python Bytes **#497 Faster than light profiling**, 1,608 seconds, READY, two chapters, 496 transcript segments. Migrated cache retrieval, transcript navigation, moment search and conversation search made zero new provider calls.

New AWS processing: Python Bytes **#487 Minimum requirements**, episode `ae8f4cd7-0cb3-421d-9e13-2798b7c2a1f6`, 1,656 seconds. Publisher VTT from `https://pythonbytes.fm/episodes/show/487/minimum-requirements.vtt`; no paid audio consent or transcription.

- READY at `2026-10-15T08:33:25Z`; seven grounded chapters, 376 transcript segments.
- One text request: 13,157 input tokens, 648 output tokens; ledger charge **$0.0063**. No retries, failed charges, uncertain charges or outstanding reservations in this verification.
- Repeated analysis reused the completed cache with no extra provider call.
- “Dust disk usage” returned the actual discussion at 199,920 ms, along with publisher, episode, speaker and source references. Native search clearly showed coverage of six processed episodes, not the whole catalogue.
- Native web preview rendered the actual AWS brief/themes, conversation results and playable timestamp. “Play from 3:19” opened the matching episode and playback advanced; playback was paused after testing. No browser console errors.
- **User confirmed that “Play from 3:19” works on their physical iPhone in Expo Go.** This is user-confirmed device evidence, not an agent-operated device test. Physical-device brief rendering was not separately attested.
- `npm run starcast` remains running with Metro at `exp://192.168.1.133:8081`; native API points to AWS. LAN addresses can change.

## Persistence, isolation and tests

- Seed copied seven intelligence, six transcript, two audio-transcript, four provider-result and one budget records; no listener history. Nine historical usage entries totaling $0.405935 were preserved.
- Cloud service restarted after live analysis; cache and ledger remained available. Local health reports paid processing **disabled**; authenticated local proxy reports the AWS authority enabled and the same ledger.
- First S3 backup downloaded into a separate local verification database: `PRAGMA integrity_check = ok`, all migrated record counts retained. CloudWatch contains `cloud-ready` and `backup-complete` events. Subsequent service starts also trigger fresh backups.
- FFmpeg and FFprobe execute on the actual Linux instance; logrotate configuration validated and timer active.
- `npm test`, cloud authority/auth/proxy tests, AWS identity guard tests, native `tsc --noEmit`, Terraform validation and iOS export all passed. The iOS export bundled 706 modules.
- Existing Ad Skip safety-off, RSS-first provenance, bounded jobs, uncertain-usage accounting, duration/audio/dollar caps and local caches were preserved.
- Old bootstrap release object was replaced after retaining a separate S3 rollback copy; prior application source is retained on EC2. No user files or database state were deleted.

## Costs observed

AWS Cost Explorer queried at approximately `2026-10-15T08:36Z`, October 1–16 exclusive-end window, UnblendedCost excluding credits/refunds: **$0.000065, estimated** (S3 $0.00005; Secrets Manager $0.000015). EC2 and other new usage had not yet appeared. **This is delayed reported billing, not the deployment's final actual bill or a claim of free hosting.** Billing-query charges may also appear later.

Verified fixed-rate baseline: **$22.31/month** at 730 hours, before metered traffic/logs/storage requests/tax; breakdown and primary pricing links are in README. No credits assumed.

OpenAI application ledger after verification: **$0.0063 today, $0.412235 this month**, zero new audio seconds. This is usage-priced application accounting, not an independently reconciled OpenAI invoice. Caps remain $5/day, $25/month, 10,800 audio seconds/day, 7,200 seconds/episode.

## Deliberate Phase 1 boundaries

Private single-writer pilot, not HA or public enrollment. SQS/DLQ are provisioned but not wired to consumers. PostgreSQL remains a future multi-worker migration; no unused RDS was deployed. A backup restore requires post-backup usage reconciliation before paid work resumes. No pH7 infrastructure, Apple signing configuration, public distribution, or AI model/account creation was changed.
