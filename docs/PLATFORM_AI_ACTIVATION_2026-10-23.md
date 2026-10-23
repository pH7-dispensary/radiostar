# Platform AI activation — 23 October 2026

Status: **production restored and verified** after snapshot-first disk recovery. Automation, final UI/pause fixes and deployment-retention safeguards are deployed. Followed-podcast availability still has the separately documented rights blockers; no permissions or spending limits were changed by recovery.

## Recorded results

| Measure | Live evidence |
| --- | --- |
| Profiles evaluated | 5 eligible profiles: non-revoked, intelligence enabled; profiles with only revoked/expired enrolled devices excluded. This is an eligibility count, not DAU. |
| Follows / unique followed podcasts | 6 / 6 |
| Latest-window episodes | 18, three per podcast; all six feeds resolved successfully |
| Already READY in that window | 0 |
| Backfill | 18 durable preparation records; 0 admitted to paid processing because rights remain unresolved/restricted |
| Additional verification job | 1 queued, 1 successfully transcribed, 1 READY; outside the followed window |
| New verified ad intervals / automatic skips | 0 / 0. Historical totals contain one controlled-fixture interval, skip and Undo; these are not real-podcast precision evidence. |
| Rights blockers | 15 LEGAL_BASIS_NOT_ESTABLISHED; 3 recorded PUBLISHER_RESTRICTION decisions for Joe Rogan episodes |
| Backlog estimate | $15.522978 known estimate, two incomplete duration estimates; currently eligible backlog $0. Publisher transcript references assumed usable. Not a guaranteed price or reservation. |
| Completion ETA | Unavailable: rights review duration is unknown. No fabricated percentage or ETA. |
| New recorded AI expenditure | $0.201777: $0.192400 transcription + $0.009377 text |
| Shared ledger after verification | $0.765653 month-to-date; 1,924 transcription seconds today; zero reservations; Translate ledger unchanged |

The five other followed channels are Lex Fridman, Dan Carlin, Julian Dorey, Danny Jones and Research Culture Uncovered. Missing legal-basis evidence is not labelled as a discovered publisher prohibition. No licence, TDM exception or permission was invented for these episodes. Existing disputes, takedowns and human assessments remain authoritative.

## Delivered

- Shared latest-three discovery and durable demand, canonical episode deduplication, bounded dispatch through the existing SQLite outbox/SQS worker, priority for playback/new follows/recent episodes, and retained historical intelligence.
- Follow, app summary/open/play/search and hourly publication refresh hooks. Discovery runs asynchronously, yields to HTTP requests, and commits its estimate before initial activation. Unfollowed/opted-out/revoked profiles stop contributing new demand.
- Existing publisher/cache-first acquisition, automatic authorised Whisper fallback, private transcripts, durable chunk checkpoints, shared atomic budget ledger and capped recovery. Temporary 5× limits still expire on 27 October at 21:53:27 UTC; standard limits apply afterwards. No budget extension.
- Recognised publisher CC-BY/CC0 grants support internal transcription at their documented scope. Episode terms no longer leak into channel-wide evidence. Captions, dubbing and voice replication remain separate gates. Reference: [CC-BY 4.0 grant and conditions](https://creativecommons.org/licenses/by/4.0/legalcode.en).
- Ad detection runs when transcripts become available, without waiting for briefs. Authenticated listeners with Ad Skip enabled can receive only independently verified, matching-variant intervals. Undo, dispute and confirmed-seek controls remain enforced. Feature is PRIVATE_BETA, not an independently validated public precision release.
- Existing Admin → AI Processing extended with Followed Podcasts, actual states, estimates versus expenditure/reservations, measured counts, rights inspection, Super Admin prioritise/pause/retry controls, confirmation, audit and version checks.
- No new compute, queue, database, NAT gateway, GPU, provider account or native build. Local development and unrelated untracked files preserved.

## Real processing verification

Open Source Security, **Dependency attacks in 2026 with James Matchett**:

- RSS: `https://opensourcesecuritypodcast.libsyn.com/rss`; episode `e6859d5a-90a9-41f4-a35a-844d80dd1aee`.
- Publisher RSS explicitly declares CC-BY 4.0. No cached or publisher transcript was available. Preflight audio estimate: $0.1923 for 32:03.
- Automatic job `03e4838a-8d10-4e1c-96b3-185ca0f23704`; observed TRANSCRIBING → READY, 139,584 ms recorded processing time.
- Two paid audio chunks, 718 timestamped segments, grounded brief, five themes, ten chapters, three Find a Moment results and live conversation-search matches. Example returned source positions: 10.540 s and 813.460 s, tied to transcript segment IDs.
- Live API reports all four core capabilities available. Full transcript is absent from listener status. Cache and ledger survived subsequent backend restarts with no repeated paid calls.
- No ad candidates were detected in this episode. No new real-podcast automatic seek or physical-iPhone behaviour is claimed.

## Verification and deployment

Full `npm test` passed, including new multiple-listener/multiple-feed dedup, automatic Whisper, new publication, cache reuse, opt-out, forged-authority rejection, scope isolation, asynchronous discovery and pause tests. Existing four-hour SIGTERM/chunk recovery, budget, rights, authentication, Ad Skip and native contract suites passed. Native TypeScript and `git diff --check` passed. No repository CI workflow is configured.

Local and production admin login/rendering were exercised with real browser sessions. Desktop/mobile screenshots, no page overflow and no console errors verified. Live discovery returned HTTP 202 in one observed 274 ms request and completed all six feeds in the background. This is an observation, not a performance guarantee.

AWS account 208096650030 / eu-west-2 verified before deployment. Current running release:
`b3cf539e412611eda07b9b1240072d04702d6ea7ce35bc4dfbe8a2aaa801fbab`, deployed at 10:43:05 UTC, includes `6a8b9c1`, `06776d6` and `f226201`. Previous known-good release `0892793739f72fd0f5c797137b81231eb5f076d483a05424e8187e1707843ef1` remains available for rollback.

API, SQLite integrity, SQS, empty DLQ and worker are verified healthy after recovery and deployment. The application dashboard still labels CloudWatch delivery and S3 backup freshness UNKNOWN because it does not query them; both were independently verified through AWS. The protected pre-change SQLite backup, two recent rollback releases, S3 release archives and encrypted recovery snapshot are retained.

Commits: `529a2c9` shared preparation; `0de7255` asynchronous discovery; `145a3f7` RSS scope/performance correction; `6a8b9c1` READY labels/window coverage; `06776d6` pause semantics and independent cached skips.

Before recovery, SSM command `b841fa1b-b306-4ca9-bc02-bbbbd0a5f982` reported an IPC worker timeout; subsequent deploy/read-only commands failed. Both Session Manager modes initially failed with missing `InteractiveCommands` / `Standard_Stream` plugins despite the agent reporting Online. These management failures are resolved. Deployment command `4b3b1487-170d-466d-89b0-fb54cc102baa` succeeded and the live API confirms the new release hash; Terraform object state alone was not used as deployment evidence.

### Authorised reboot and confirmed recovery blocker

- User explicitly authorised a brief reboot, excluding data deletion or storage/spending-limit increases. Reverified account 208096650030, region eu-west-2, instance `i-08537aa0e84163cb9` and `Project=StarCast` ownership. At 09:57:19 UTC, API/database/worker were healthy, no active intelligence jobs existed and both queues were empty.
- Issued EC2 `RebootInstances` for that exact instance. Boot console output retrieved at 09:58:31 UTC showed repeated `OSError: [Errno 28] No space left on device` while creating `/var/lib/cloud/data/` temporary files, with cloud-init services failing. This confirms filesystem allocation failure; bytes versus inodes and the files responsible remain unmeasured.
- Root EBS volume `vol-06c0850a7ca6e69e0` is encrypted gp3, 30 GiB, attached, with delete-on-termination disabled. EC2 system/instance/EBS reachability checks pass, but public API returns HTTP 504. Session Manager now returns `TargetNotConnected`; diagnostic Run Command `a3b69250-7de5-4d47-b731-720f10bffea0` remains pending. Serial-console access is not enabled.
- At that point no production files had been deleted, volumes resized, instances replaced, security groups opened or budgets increased. The user subsequently explicitly authorised controlled snapshot-first disk recovery and temporary recovery charges. See [AWS filesystem exhaustion recovery guidance](https://www.repost.aws/knowledge-center/ec2-linux-resource-over-utilization).

### Completed disk recovery

- Production was stopped before encrypted, private snapshot `snap-0f4093c442eea6b91` was created at 10:04:41 UTC. Verified COMPLETED/100%, account ownership, source volume and encryption before detaching the disk. Full snapshot size: 31,948,013,568 bytes. Snapshot remains retained for recovery, not automatically deleted.
- Temporary `t3a.micro` recovery instance `i-0ac1f19678792417f` used the same AZ/subnet, encrypted 8 GiB root, standard CPU credits and SSM-only role/profile `starcast-recovery-20261023`. No application-secrets permission or inbound SSH was added.
- Read-only inspection proved byte exhaustion, not inode exhaustion: root reported 100% usage, 257,859,584 bytes available and 55% inode usage. `/opt/starcast` used 27,950,567,424 bytes; dozens of retained dependency trees were approximately 500 MB each. `/var/log` was only 79,237,120 bytes. Root cause: each deployment retained a full previous installation indefinitely, with no retention or capacity guard.
- Validated each cleanup target by exact generated name, directory type, application package identity and source-only contents. Removed **50 obsolete previous releases and one stale staging directory**, reclaiming **25,728,483,328 bytes (23.96 GiB)** measured around cleanup. Database SHA-256 remained `30e3c3d8fb9fe232552abfb6a383c81e02b328acee584816192274ed42ec0f49`. No production records, credentials, active source, diagnostic logs or runtime were removed. Removed artifacts remain recoverable from the snapshot.
- Kept the two newest known rollback releases. One additional legacy directory failed the strict source-only allowlist and was deliberately preserved. A recent failed stage was also retained. The subsequent successful deployment exercised bounded retention and removed one newly superseded rollback copy.
- Full SQLite integrity checks passed offline, after startup and after deployment. Retained 17 intelligence records, 14 transcripts, 19 demand records, all 25 usage records, zero reservations and recorded shared usage $0.765653. No new paid model calls or budget changes.
- AWS refused three startup attempts with `InsufficientInstanceCapacity` for `t3a.small`, including after releasing the rescue host's capacity. To restore service, changed the **same instance** to temporary `t3.small`: same two vCPUs, 2 GiB RAM, x86 architecture, 30 GiB disk and standard credits. HTTPS recovered at approximately 10:41:33 UTC. The original lower-cost type remains the Terraform default; the ignored production tfvars explicitly sets `recovery_instance_type = "t3.small"` so routine applies will not accidentally stop the restored service. Clear this only during a planned maintenance window when original-type capacity is available.
- API HTTPS 200; EC2 instance/system/EBS checks pass; SSM Run Command and an actual Session Manager shell pass. Backend, worker and SQS/DLQ are healthy and empty. Sent one duplicate of an existing READY job (message `8ce1c78e-610d-4ee7-b393-a571140681d0`); worker logged `STALE_OR_SUPERSEDED`, acknowledged it, and the ledger stayed unchanged.
- Live cached brief, ten chapters, five topics, three timestamped moments and three conversation matches pass. Admin login, READY-without-UNAVAILABLE label, desktop/mobile rendering, console checks, logout and unauthenticated-access denial pass. No new iPhone/TestFlight build was created or claimed verified.
- Retention now keeps two recent validated rollback copies, rejects unknown/local-state directories and symlinks, and removes only aged abandoned stages. Deployments take an exclusive lock and require 3 GiB plus 20,000 free inodes before staging. npm and binary-download caches are scoped to disposable staging cache. Application log size is checked every five minutes with seven rotations and compression; journal limits are 128 MiB persistent/32 MiB runtime with 1 GiB kept free. Live logrotate execution returned success.
- Final disk observation: **25,705,672,704 bytes free (about 23.94 GiB), 21% used**, without enlargement. Snapshot, database and current/rollback sources are preserved. CloudWatch contains post-recovery `cloud-ready`, `backup-complete` and queue replay events. Fresh S3 backup `backups/backend-2026-10-23T10-43-06.744Z.sqlite` is 9,695,232 bytes.
- Rescue host terminated at 10:43:28 UTC; its root volume `vol-07773d7c4f54997da` is deleted. Temporary IAM role/profile removed. No pH7 resources changed. Final full tests, native typecheck, Terraform validation, focused retention/cache tests and diff checks pass. Full Terraform plan reports no infrastructure drift with the explicit temporary fallback setting.

### Recovery cost evidence

AWS Price List API for London returned t3a.micro $0.0106/hour, t3a.small $0.0212/hour, t3.small $0.0236/hour, gp3 $0.0928/GiB-month and snapshots $0.053/GiB-month. [EC2 pricing](https://aws.amazon.com/ec2/pricing/on-demand/), [EBS pricing](https://aws.amazon.com/ebs/pricing/), [public IPv4 pricing](https://aws.amazon.com/vpc/pricing/).

Calculated conservatively using launch through termination (38m45s, although compute stopped earlier): temporary compute + IPv4 + 8 GiB root estimate **$0.010732**, plus the **$0.01** Cost Explorer query. Snapshot storage is approximately **$1.576957 per full month retained**, prorated; temporary production fallback adds **$0.0024/hour** versus the original type ($1.752 for 730 hours if left in place). Request, logging and tax adjustments are not included. These are calculated estimates, not an invoice. Cost Explorer returned current-day zero with `Estimated=true`, so actual recovery charges have not yet posted and must not be reported as zero.

## Remaining operational follow-up and external decisions

1. Review the retained recovery snapshot after the incident window; restore the lower-cost original instance type only in a planned maintenance window when AWS capacity is available. No further outage is required for this recovery's completion.
2. Establish and record valid processing bases for the 15 unresolved episodes and review the three recorded publisher restrictions. Automatic reassessment does not convert missing evidence into permission.
3. Real advertisement boundary/variant precision and physical-iPhone skip/Undo validation remain unproven beyond the existing controlled fixture. Do not describe this release as universal intelligence coverage or validated real-world Ad Skip.
