# Platform AI activation — 23 October 2026

Status: automation deployed and enabled; followed-podcast availability remains rights-blocked. A separate real, explicitly licensed episode completed the automatic audio-to-intelligence pipeline. Final UI/pause follow-ups are committed but not deployed. Following the authorised recovery reboot, the API is unavailable (HTTP 504); boot logs confirm filesystem space exhaustion. Further disk recovery requires additional authorisation.

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

AWS account 208096650030 / eu-west-2 verified before deployment. Running release at last check:
`0892793739f72fd0f5c797137b81231eb5f076d483a05424e8187e1707843ef1` (code through `145a3f7`).

Before the recovery reboot, API, SQLite integrity, SQS, empty DLQ and worker were verified healthy. Aggregate monitoring was DEGRADED because CloudWatch delivery and S3 backup freshness are UNKNOWN in the application dashboard. A protected pre-change SQLite backup exists on the instance; previous source releases and S3 rollback archives are retained. Post-reboot database integrity cannot yet be checked because management access is unavailable. AWS incremental billing is not yet established; no new recurring infrastructure was added.

Commits: `529a2c9` shared preparation; `0de7255` asynchronous discovery; `145a3f7` RSS scope/performance correction; `6a8b9c1` READY labels/window coverage; `06776d6` pause semantics and independent cached skips.

The last two follow-ups are **not yet verified deployed**. SSM command `b841fa1b-b306-4ca9-bc02-bbbbd0a5f982` reported an IPC worker timeout; subsequent deploy/read-only commands failed. Both Session Manager modes initially failed with missing `InteractiveCommands` / `Standard_Stream` plugins despite the agent reporting Online. Terraform release-object state is not proof of the running application version.

### Authorised reboot and confirmed recovery blocker

- User explicitly authorised a brief reboot, excluding data deletion or storage/spending-limit increases. Reverified account 208096650030, region eu-west-2, instance `i-08537aa0e84163cb9` and `Project=StarCast` ownership. At 09:57:19 UTC, API/database/worker were healthy, no active intelligence jobs existed and both queues were empty.
- Issued EC2 `RebootInstances` for that exact instance. Boot console output retrieved at 09:58:31 UTC showed repeated `OSError: [Errno 28] No space left on device` while creating `/var/lib/cloud/data/` temporary files, with cloud-init services failing. This confirms filesystem allocation failure; bytes versus inodes and the files responsible remain unmeasured.
- Root EBS volume `vol-06c0850a7ca6e69e0` is encrypted gp3, 30 GiB, attached, with delete-on-termination disabled. EC2 system/instance/EBS reachability checks pass, but public API returns HTTP 504. Session Manager now returns `TargetNotConnected`; diagnostic Run Command `a3b69250-7de5-4d47-b731-720f10bffea0` remains pending. Serial-console access is not enabled.
- No production files were deleted, volumes resized, instances replaced, security groups opened or budgets increased. Data retention is not a substitute for a post-recovery integrity check.
- Next recovery needs explicit approval: snapshot the volume, use a temporary same-account recovery instance if access cannot otherwise be restored, inspect actual disk/inode usage, and clean only verified obsolete deployment artifacts while retaining the database, credentials, current release and a known-good rollback. Temporary compute/snapshot charges apply. Do not infer authority to resize or remove application data. See [AWS filesystem exhaustion recovery guidance](https://www.repost.aws/knowledge-center/ec2-linux-resource-over-utilization).

## Remaining external decisions

1. Authorise controlled disk recovery to restore the API and host-management access, then deploy the final two fixes. No TestFlight build is required.
2. Establish and record valid processing bases for the 15 unresolved episodes and review the three recorded publisher restrictions. Automatic reassessment does not convert missing evidence into permission.
3. Real advertisement boundary/variant precision and physical-iPhone skip/Undo validation remain unproven beyond the existing controlled fixture. Do not describe this release as universal intelligence coverage or validated real-world Ad Skip.
