# Recovery Phase 6 — consolidated internal pilot

Release work on `work`, 24 October 2026. This is the current six-phase recovery sequence, not the older 20 October release documented in `RECOVERY-PHASE-6.md`.

## Consolidation matrix

| Phase | Implemented / deployed | Verification | Remaining |
| --- | --- | --- | --- |
| 1. Policy simplification | OPEN operational default, human-only pause/resume, independent rights, durable recovery | Regression tests; real AWS records | Documented bases for restricted/unassessed followed content |
| 2. Automatic transcription | Shared latest-three scheduler, cache-first acquisition, bounded durable chunks | Two real licensed episodes transcribed after QA follow on 23 October; saved chunks recovered after boundary-validation repair | No paid four-hour validation; physical-device follow acceptance |
| 3. Intelligence generation | Grounded brief, chapters, topics, persisted search and independent readiness | Real public CC-BY episode automatically reached READY on 23 October; paid cost $0.181175 | Human listening-quality assessment; legacy delivery repair verified in this release |
| 4. Ad Skip | Candidate handoff, independent audio boundaries, variant binding, private tester-only execution and Undo | Real publisher audio with shared native adapter in Chromium; one confirmed seek and Undo | Not physical Expo audio-engine evidence; no general accuracy claim or public rollout |
| 5. Admin Command Centre | Seven-section operations, human review, audited controls, costs and infrastructure | Live protected sessions and four viewport widths | Protected legacy rollback directory; some telemetry unavailable in dashboard |

## Release fixes

- Legacy completed jobs with identity nested under `episode` were skipped by the new delivery validator. Recover the same canonical identity, validate transcript/output citations and rebuild only derived indexes/topics; never buy analysis again. Conflicting stored identities fail closed. A regression protects interrupted jobs without transcripts from being relabelled by this repair.
- Correct the older release smoke test to check the public automatic-skip gate rather than the private pilot's UI flag.
- Update Expo within SDK 57 from 57.0.30 to 57.0.31; Expo Doctor now passes 21/21. Pin the previously successful Xcode 26.6 image for reproducibility, avoiding an unplanned SDK/toolchain migration. Existing signing credentials are reused.
- Allow the native credential scan to inspect the exact current production export instead of a stale fixed directory.

## Initial live baseline

Five active followed profiles, six follows/unique podcasts, 18 latest-window episodes, all requiring review. No eligible pending work, active jobs or queue backlog. Platform-wide: 21 jobs, 16 legacy READY labels, 18 canonical transcripts, eight audio-transcribed episodes, 17 with generated outputs. Final validated counts may differ after legacy repair; READY is not inferred from historical labels.

Estimated remaining backlog: $18.1917 known, two incomplete estimates; currently eligible backlog cost $0. The estimate is not authority to process restricted content. Actual recorded AI usage: $0 today / $1.562445 month, zero reservations. Temporary tester limits remain $25/day, $125/month, 15 transcription hours/day, four-hour source maximum, expiring 2026-10-27T21:53:27.023Z. Standard and private Translate ledgers/limits remain independent and unchanged.

Production API/worker/SQLite/SQS healthy; SQS and DLQ empty. Disk 20% used, approximately 23.9 GiB free. Pre-release SQLite backup `/var/lib/starcast/pre-command-centre-1792817718758.sqlite` passed integrity checking. Two recent rollbacks plus one protected legacy directory retained. No production data, credentials or diagnostic logs deleted. Bounded retention removed only obsolete source directory `/opt/starcast/previous-1792765220`; its archive remains recoverable from S3.

## Verification boundaries

Native TypeScript, Expo Doctor, production exports, mocked browser processing/recovery and sleep/discovery checks are not physical-iPhone proof. Four-hour checkpoint/restart/visibility and budget tests use mocked providers. Existing real provider records prove completed transcription, not merely queue acceptance; cache reuse avoids unnecessary new paid calls.

Full `npm test` passed after the legacy fix. Native TypeScript, Expo Doctor 21/21, all-platform production export, exact-export credential scan, fresh-install/light/dark/onboarding/navigation, processing-state/partial-output/recovery and sleep/discovery browser checks passed. The authenticated live admin passed at 390/768/1024/1440 px without page errors or overflow. No separate lint script exists; configured syntax, type and security checks ran. Four-hour SIGTERM/fresh-process checkpoint tests passed without duplicate paid mock calls.

## Final live acceptance evidence

- The legacy approved fixture now returns its real cached brief and timestamped moments through the live API; no replacement analysis or fabricated output.
- Four real Open Source Security episodes passed authorised-listener checks: 47 chapters, 65 source-referenced topics and five moments per episode, plus source-matching conversation search. Recorded past transcription usage totals 7,770 seconds across these four jobs, with persisted work and source provenance. Their previously recorded processing cost totals $0.811666. This phase reused them for $0 new AI spend.
- A dedicated existing QA listener followed the licensed feed, discovered its latest three and received all three READY results automatically. Repeating the follow retained 21 canonical jobs and 41 usage rows. The temporary QA follow was removed; no owner's invitation or follow was consumed or changed.
- Across persisted records: 18 transcripts, eight audio-transcribed episodes, 17 briefs, 17 episodes with chapters, 11 derived topic sets/search-index summaries, 16 historical READY labels. Rights-restricted historical outputs are not delivered merely because stored results exist. Current followed backlog: 18 REVIEW_REQUIRED (15 unestablished bases, three publisher restrictions), zero processing/queued/capacity-wait jobs. This is not universal catalogue coverage.
- Six advert interval records, two independently verified intervals across two episodes (one owned fixture). Real-episode client telemetry now has two confirmed seeks and two Undos, both controlled browser runs on the same real episode, not two independent podcast evaluations. No accuracy percentage is established.
- Repeated real test: Linux Action News 164, episode `615c6587-31a8-41a4-9a7c-e3b88b1df894`, SHA-256 `d6faaeb5e1366f04a72507f140eb417e008389ad589e48001ca852454769bcd4`. Historical independent labels are 09:00–12:05 and 20:35–22:35; only the independently checked inward interval **11:56.186–12:00.541** is eligible. Actual playback 716195.17 ms → 720541 ms; Undo restored 716195.17 ms and playback continued at 1.5×. Current publisher range preconditions were unsupported, so the existing bounded exact-file SHA-256 fallback was used. Ordinary-listener and mismatched-variant execution were denied. Original pilot membership and expiry were restored and the separate QA installation revoked.
- Fresh isolated S3 restore check: `backups/backend-2026-10-24T04-57-53.409Z.sqlite`, 13,271,040 bytes, integrity `ok`, 21 jobs, 18 transcripts and 12 transcription checkpoint records. Downloaded into a private temporary directory and opened read-only, then removed with its SQLite sidecars. Production database was never replaced. This verifies a readable restored backup, not full disaster-recovery RTO.
- EBS snapshot `snap-0f4093c442eea6b91` remains completed. CloudWatch stream `i-08537aa0e84163cb9` in `/starcast/phase1/backend` has recent event ingestion. Application dashboard UNKNOWN adapters are not asserted as measured health. Terraform final plan has no drift.
- No new recurring AWS resources, provider credentials, AI budget, public Translate/billing or public automatic Ad Skip activation. Incremental AWS request/storage/build charges are not separately available; no zero-AWS-cost claim.

Reproduce cached live acceptance with `node scripts/verify-phase6-release.mjs`; it requires existing ignored QA credentials and refuses uncached episodes. The normal smoke check is `node scripts/cloud/verify-release.mjs`. Both verify unchanged paid usage.

Backend production dependency audit: zero findings. Native audit: five high-severity dependency findings in Expo CLI/code-signing tooling (`node-forge`, `zod` and parent packages). The suggested Expo 44 downgrade is incompatible and was not applied; no clean native dependency-audit claim. These are a disclosed internal-pilot limitation, not a demonstrated exploitable listener runtime defect.

## Owner iPhone acceptance

Install the new build when Apple makes it available. Check icon/launch and light default; Discover, follow, latest episodes, Library and normal playback; observe eligible intelligence until READY; Brief, Chapters and Find a Moment; enable Ad Skip, cross a verified interval and immediately Undo; background audio and lock-screen controls; playback speed/seeking; AI Sleep/manual timer; restart and confirm preferences/position persist.

Use the existing authorised Open Source Security examples for intelligence and the recorded Linux Action News 164 interval for real-audio Ad Skip evaluation. Play from about 11:50, then check the verified 11:56.186–12:00.541 interval and Undo. Do not expect unassessed followed shows to become eligible simply by waiting. Test only the verified inward interval, not a claim that the entire historical advert will be removed. No physical-device results are claimed until the owner provides evidence. Local `simctl` is unavailable because only Command Line Tools are installed; browser playback is not the Expo iOS audio engine.

## Release tracking

Backend release `6adbb0eb838b733c1f1fba174b317d27fec71f34edc8d66c1c66e8202d1baf8c`, based on `0e28a48`, is deployed and healthy. Prior release `d28ed4ac4aac5182f4c0fd6b523ef05d3180bb13b2c1d4492d0e3678f098ea44` remains available; never roll back the spending database. Deployment lock, capacity check, scoped disposable caches and log rotation were preserved.

Signed **1.0.0 (12)** finished at 2026-10-24T05:01:58.516Z. EAS build `1d7db325-b013-44ef-9809-7f414883f3c3`, source revision `15562642b24e3e70a96dc6da156bba7cbae0b299`; EAS auto-incremented 11 → 12 and that change is recorded in `94c9809`. Existing project `@radiostar/star-cast`, bundle `app.radiostar.ios`, team `69F2T3M9C4`.

Exact IPA SHA-256 `8dbf56facedaf125502a2e5579dadaacc7e0a543662cef2d4758007ee281b86b`: `codesign --verify --deep --strict` passed; distribution profile is not debuggable, background audio is present, compiled production API and project ID match. Scanned 58 files without finding known server tokens or provider credential patterns. Asset catalogue contains opaque 1024×1024 AppIcon; extracted 120px icon visually inspected, full-bleed purple without white edge. Installed Home Screen appearance still requires iPhone evidence.

Exact build submitted to ASC app `6822706958`, existing **Team (Expo)** only, submission `36567647-4b5f-4608-87c6-96ec9bd523d6`. Apple confirms build 12 **VALID / IN_BETA_TESTING**, uploaded 2026-10-24T05:05:09Z, not expired, linked to the exact EAS build/submission above. It is available for internal testing. External state `READY_FOR_BETA_SUBMISSION` is not an external submission: no public App Store review or external beta distribution requested.

Implementation/build commits `0e28a48`, `1556264`, `94c9809` are pushed to `origin/work`; the final evidence update follows in the report commit. No repository CI workflow is configured. Unrelated untracked root files and local Google Cloud SDK remain untouched. Post-release cache checks reconfirmed healthy production, five active profiles/six followed podcasts/18 review-required latest episodes, zero active/queued work, unchanged $1.562445 monthly AI usage and no reservations. Local verification server stopped.

Release classification: no P0 found in available automated/live/binary checks. **P1 / PARTIALLY VERIFIED:** physical-device behaviour; limited real-world advert coverage; four-hour provider validation; restricted/unassessed content; disclosed native tooling advisories. **BLOCKED on owner/device evidence:** native background/lock-screen/skip/Undo acceptance and installed icon. No unrelated P2 redesign is included.
