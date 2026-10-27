# Product activation — consolidated internal beta

27 October 2026 · `work` · AWS 208096650030 / eu-west-2.

**PARTIALLY VERIFIED. Suitable only for supervised internal beta, subject to the release readback below. Not public-launch ready. Physical iPhone acceptance and representative independently labelled Ad Skip accuracy remain unverified.**

## Phases 1–3

| Phase | Implemented | Tested | Deployed | Remaining |
|---|---|---|---|---|
| 1 — Intelligence | Per-episode failure isolation, canonical latest-three dispatch, partial cache reuse, automatic semantic completion | Unit/recovery/rights/budget tests; real authorised 31m53s transcription; live cached follow/search/reference checks | Consolidated AWS backend | Original 18 followed episodes need an established processing basis; partial brief/chapter quality and broad-query ranking |
| 2 — Ad Skip | Complete-break review proposals, evidence/variant guards, malformed-lease refusal, single-writer human review | Exact owned-audio seek/Undo; corpus hashing/security; race/expiry/negative cases | Backend live; native guards included in build 14 candidate | Independent complete-break labels, recall/precision, physical seeks |
| 3 — Native | Later seek survives older sleep recovery; bounded opt-in diagnostic export; native deadline timing | Full suite, Swift core + muted macOS AVPlayer, browser workflows, TS/export | Native build 14 candidate | Real iPhone playback/locked fade/background/overnight tests; matrix remains NOT TESTED |

No architectural rebuild or unrelated screen redesign. Ordinary playback still precedes optional audio-proof work. Core listener features remain free; Translate remains private with independent permissions and budget.

## Production coverage and real intelligence

**PRODUCTION VERIFIED** from protected live APIs and an integrity-checked production snapshot:

- Nine registered non-revoked installations; two profiles eligible for private preparation. These are not measured DAU or proof of active listening.
- Six unique followed podcasts, exactly **18 current latest-three episodes**: READY **0**, PARTIAL_READY **0**, queued **0**, processing **0**, failed **0**, requiring review **18**.
- All 18 report `LEGAL_BASIS_NOT_ESTABLISHED`, not an invented publisher prohibition. No permission, feature cohort or policy was changed to inflate coverage.
- Nine authorised cached episodes are discoverable outside that window. Global historical job states are separately 5 READY, 12 PARTIAL_READY, 2 FAILED, 2 BLOCKED, 1 CANCELLED; these are not followed-window coverage or nine fully-ready episodes.
- A controlled temporary follow on the existing QA installation selected precisely the current latest three Open Source Security episodes. All three reused cached transcripts/intelligence and returned PARTIAL_READY. Duplicate follow created no job or paid call; unfollow and stale-operation rejection passed. The QA follow was removed.
- Three real cached episodes, including Phase 1's fresh transcription, returned usable brief, chapters and topics; chapter/topic source IDs were checked against canonical transcript records. Exact/paraphrase/Portuguese/Chinese/absent-query cases passed; returned text and timestamps matched stored source segments. Find a Moment verified the 219,851 ms source. Partial outputs remain labelled partial and accessible.

Phase 1's real fresh transcription remains the paid acquisition evidence: **Open source verification with Sal Kimmich**, publisher CC-BY evidence, 1,913,235 ms audio, two bounded chunks, 603 timestamped segments, 11 chapters, 13 topics, 603/603 automatically completed semantic segments; overall PARTIAL_READY. Cost **$0.22964294**. This phase revalidated its persisted result instead of paying to transcribe it again. Its broad paraphrase-ranking limitation remains disclosed in `PRODUCT_ACTIVATION_PHASE_1.md`.

Cache-first/publisher reuse, checkpoints, long-form recovery, lease renewal, duplicate prevention, atomic reservations and independent advert analysis pass the existing automated recovery suites. No new four-hour real-provider quality result is claimed. No uncontrolled paid work was started.

## Ad Skip and native acceptance

**AUTOMATED TESTED / PARTIALLY PRODUCTION VERIFIED:** 12 production skip analyses; seven historical interval records, two independently audio-matched verified intervals. The live administrative counts report one candidate and four variant-matched records. Historical telemetry records three confirmed seeks and three Undo events (one controlled fixture, two real-episode telemetry events), zero incorrect-skip reports and one missed-advert report. Client telemetry is not independent accuracy ground truth.

Phase 2's corpus contains 12 exact hash-bound episodes, about 13.11 hours and 20 provisional candidates. Independently human-reviewed labels: **1** at the latest review check; full episodes reviewed: **0**. The audit chain and exact audio hash match a human-labelled host-read advert at 0–90.415 seconds in Linux Unplugged 690. The current preliminary detector has no candidate for that labelled span: a specific remaining detection gap, not a complete-episode recall measurement. Complete-break coverage, precision, recall, missed-advert ground truth and boundary percentiles are **unavailable**, not zero. The real verified Linux Action News interval is only a 4.355-second fragment; it does not establish complete-break accuracy. The five concrete review clips and secure workbench remain available from Phase 2.

This phase repeated actual Chromium playback against owned audio: verified 15.2–34.5-second interval; confirmed seek and immediate Undo restored origin; 1.5× speed and paused state preserved. Results are in `evals/recovery-batch6-playback.json`. Public automatic Ad Skip stays disabled. Ordinary/non-pilot listeners cannot obtain automatic-seek authorisation.

**DEVICE UNVERIFIED:** no accessible iPhone or full Xcode device tooling. Native sleep tests cover rapid extensions, monotonic deadline drift, interruption/source fencing, cancellation, restart, compatibility and recovery. The current muted macOS AVPlayer run paused at about 2,017.5 ms for a 2,000 ms deadline, with 15.04 ms native drift; volume fade samples and restoration were observed. This does not establish audible fade, iPhone lock-screen execution, battery behaviour or overnight results.

The authoritative 25-case owner matrix remains `evals/product-activation-phase3-device-matrix.json`. Install the new candidate once Apple confirms availability, record model/iOS/build, then verify: audible start; five minutes locked/backgrounded; remote controls; owned pilot skip/Undo at normal/1.5×/2× speeds; five-minute locked manual timer; AI extensions/interruption/restart; overnight session; offline follow/reconciliation; ready/partial intelligence and source playback. Also test the newer-seek/immediate-restart fix and opt-in diagnostic export. Do not mark these PASS based on this report.

## Administration, security and operations

**PRODUCTION VERIFIED:** protected emergency Super Admin session, Secure/HttpOnly cookie, 8-hour configured lifetime, CloudFront trusted viewer identification, CSRF rejection, anonymous admin rejection and logout revocation. Individual authentication/RBAC, expiry, rollout controls and human-only pauses pass isolated tests. Production still has **zero individual administrator accounts**: owner migration and actual individual login remain outstanding. Emergency recovery has not been retired.

AWS identity and StarCast instance ownership were checked before deployment. A pre-deployment SQLite recovery copy passed integrity; about 25.49 GB decimal headroom. The versioned AES256 S3 recovery object was downloaded, its recorded SHA-256 matched, and SQLite integrity passed. No destructive restoration or data migration was performed.

Deployment `c68ef18f-de50-4fe2-ad67-b246981ad336` succeeded. Consolidated backend release **14899f354b02b5ba0cbdcc585d6da683f8f3b2dd2cccca77682949c3eec946c0** is healthy; previous source **57f662c803671cc7e6d22ce06be357957c73ca2eca387dfe6b26799a7b6e9ebf** is retained. Rollback restores source, never historical spending/audit data. Post-deployment database integrity and FFmpeg/FFprobe execution passed; protected listener intelligence/search and admin authentication passed again; worker and SQS/DLQ are healthy and empty. Temporary connection refusals during the bounded restart cleared on retry; the deployment reached healthy state.

All 12 CloudWatch alarms are enabled and OK. CloudWatch telemetry heartbeat has current datapoints. The app's two remote-probe placeholders remain UNKNOWN; separate AWS readbacks verify log/metric ingestion and the backup object. Retention remains DEGRADED for one deliberately protected legacy directory in addition to two normal rollback copies. No speculative deletion, new monitoring service or pH7 modification.

SNS still reports the operations email subscription as **PendingConfirmation**; inbox delivery is unverified despite earlier owner reports. The connected mailbox lacks search scopes, so the confirmation email could not be inspected. This is a P1 monitoring limitation requiring the owner to establish a confirmed subscription to `starcast-operations`, not a claim that alerts are reaching an inbox.

## Costs and controls

- AI ledger unchanged across this phase: **163 entries, $1.81833374**, zero outstanding reservations, **$0 additional model usage**.
- Standard caps unchanged: $5/day, $25/month, 3 transcription hours/day, 2 hours/episode.
- Pre-existing temporary pilot allowance remains $25/day, $125/month, 15 hours/day, 4 hours/episode until **2026-10-27 21:53:27.023 UTC**. It was not renewed. Effective limits must revert through the existing expiry logic; standard limits and temporary effective limits are not conflated.
- Translate stays independently limited to $2/day, $10/month and 10-minute source duration. Its separate ledger has one historical generation: **$0.06596 estimated**, actual billed amount unavailable, zero reservations. No public Translate or billing activation.
- Followed backlog planning estimate **$22.5871**, approximately 42.28 audio hours; currently eligible estimated cost **$0**. Fifteen need audio; three publisher references remain unverified. No defensible completion ETA.
- AWS Cost Explorer, 1–27 October inclusive: **$7.729996862 unblended, Estimated=true**. This is delayed month-to-date billing, not a final invoice or phase-only cost. EAS build billing and later API/query charges are not represented as zero.

## Tests and integration corrections

**PASS:** full `npm test` (including security, database persistence/migration contracts, budget/concurrency, follow/recovery, semantic retrieval, all prior recovery batches and Phase 1–3 regressions); native TypeScript; Expo Doctor 21/21; production iOS/web export with dotenv disabled and development credentials absent; icon validation; release privacy; Swift core and muted AVPlayer; owned-audio seek/Undo; `git diff --check`.

The local 24-query authored-fixture search benchmark measured recall@5/MRR **0.7727**, absent-answer abstention **1.0**, and multilingual recall@5 **1.0**, with no provider cost. These are synthetic engineering fixtures, not representative human-rated quality. Separately, five cached live semantic cases passed; observed API times were 1.14–1.40 seconds for search and 278 ms for the moment lookup.

The full native-web journey now passes at 320/375/390/430 px with light/dark/reduced-motion cases: discovery/catalogue/conversation/moment playback, AI Sleep activation/extensions, manual timer cancellation, completed-session recovery, background navigation, follow toggling, history clearing and explicit appearance persistence. Phase 3's diagnostic capture/export/clear workflow also passed independently. Neither is physical iPhone evidence.

Corrected three verification assumptions without weakening the app: submit search explicitly before awaiting results; match the recovery greeting including its episode title; check the migrated v2 preferences key after reload. Phase 3's description that the search label was removed was incorrect and is corrected in its report. The live acceptance harness now accepts a specified verified snapshot/output path and includes the Phase 1 episode, so it no longer depends on an old snapshot.

Release archive: 360 source files scanned, no actual local server/admin/QA credentials detected; ignored secrets, databases, downloaded SDKs and unrelated untracked files excluded. Approved icon hash matches the EAS archive. Signing configuration preserved; no new certificate requested.

Dependency audit: backend **0 vulnerabilities**; native toolchain **4 high / 0 critical** (Expo CLI/Zod chain and node-forge). These are existing tooling advisories, not demonstrated affected player-runtime paths. npm now reports a node-forge fix available; it was not incorporated into this already-started consolidated build. Expo/Zod automatic remediation proposes an incompatible Expo downgrade and was not applied. Keep trusted build/signing inputs and address compatible tooling patches in the next maintenance validation. Final signed-artifact results are recorded below. No separate lint command is configured. Full native iOS linking is provided by the EAS build, not local Swift syntax checks.

## Evidence-based rescore

Original weights retained: function /30, real-world /25, recovery /20, UX /15, operations /10. These are evidence-qualified engineering judgements, not measured accuracy percentages. No points are awarded for uploading a build.

| Vertical | Previous | Function | Real-world | Recovery | UX | Operations | Current |
|---|---:|---:|---:|---:|---:|---:|---:|
| Discovery/RSS | 75 | 25 | 15 | 17 | 11 | 7 | 75 |
| Transcription | 65 | 23 | 15 | 17 | 8 | 7 | 70 |
| AI Intelligence | 79 | 25 | 19 | 17 | 11 | 8 | 80 |
| Ad Skip | 50 | 21 | 6 | 14 | 6 | 5 | 52 |
| Native iOS | 65 | 23 | 9 | 16 | 11 | 8 | 67 |
| AI Sleep | 59 | 22 | 3 | 16 | 11 | 8 | 60 |
| AWS Reliability | 80 | 26 | 20 | 18 | 8 | 8 | 80 |
| Security/Privacy | 79 | 26 | 17 | 17 | 10 | 9 | 79 |
| Administration | 79 | 25 | 17 | 16 | 12 | 9 | 79 |
| Product Economics | 45 | 18 | 5 | 11 | 5 | 6 | 45 |
| **Total** | **676** | | | | | | **687 / 1,000** |

Incremental credit is limited to real authorised fresh transcription/automatic completion, partial-cache/index recovery, malformed-lease safeguards, newer-position recovery and privacy-preserving native diagnostics. Confidence is high for automated and production API evidence, limited for representative content quality, and absent for current physical-device acceptance. No credit for universal intelligence, representative complete-break accuracy or locked-iPhone sleep.

## Release readback and verdict

**PRODUCTION VERIFIED / AVAILABLE FOR INTERNAL TESTING.** One consolidated build and one submission were created; no public review or public release.

- EAS build **ff0549c3-a517-432c-8792-83b724420eb5**: FINISHED, 27 October 2026 08:29:23 UTC, source **d53cb8462ff57cfbd35f7db731ca8d051e4197cd**.
- IPA: **1.0.0 (14)**, `app.radiostar.ios`, existing TETRODAXOL organisation/team **69F2T3M9C4**. Strict/deep signature verified, `get-task-allow=false`, background audio enabled, `RadioStarSleep` linked, dedicated AWS HTTPS endpoint and splash bundled. Actual local credential scan passed across 58 signed files.
- IPA SHA-256 **914c10dc0ee3a9ab42827e45927e592de4e6835c5b25ce87167b63b5b0ca5563**, **12,252,494 bytes**. Approved full-resolution purple asset hash matches the archive and IPA; generated 120px icon visually inspected without white border. Installed Home Screen appearance still requires the iPhone check.
- Submission **6025f3c9-050f-451d-b49a-08427e952fd1**: **FINISHED**, bound to that exact EAS build. Existing **Team (Expo)** internal group; no duplicate group or signing certificate.
- Apple build **551dfed5-72a5-4d31-ab23-822db062b522**: build **14**, processing **VALID**, internal state **IN_BETA_TESTING**, confirmed present in the internal group. External state `READY_FOR_BETA_SUBMISSION` is not a public submission.
- Release stages observed: build finished → submission scheduled/in progress → submission finished → Apple VALID and available for internal testing. Intermediate Apple processing was not directly sampled; its successful completion is confirmed by the final state.
- Final HTTPS readback remains **200 / ready**. Post-deployment cached intelligence, semantic search, budgets, database, queues and disk checks are recorded above.

P0 gates: no known API/database/authentication/security/unsafe-seek/signing regression observed in the completed gates. Physical app launch/playback remains DEVICE UNVERIFIED, not a claimed successful device test. P1 limitations: original followed coverage, partial output quality, independent advert labels/detection gaps, physical iPhone/overnight/four-hour quality, individual-admin adoption, pending SNS email delivery, protected legacy retention, single-host scale/failure domain and toolchain advisories.

**Verdict: the consolidated supervised internal beta is delivered; public launch is not ready.** Install build 14 from TestFlight and complete the authoritative device matrix. Establish and verify an individual Super Admin before retiring emergency access; finish the concrete advert-review clips; resolve SNS confirmation/delivery. None of these limitations was hidden by changing rights, budgets or public rollout gates.

Commits pushed to `origin/work`: **078ba51 / 978acf6** (Phase 3 implementation/evidence), **d53cb84** (integration acceptance corrections), **587ca82** (build 14 number), followed by this final report/evidence commit. Unrelated pre-existing untracked files were preserved. No GitHub Actions workflow is configured; local, EAS and live verification supplied the release gates.

[Build 14](https://expo.dev/accounts/radiostar/projects/star-cast/builds/ff0549c3-a517-432c-8792-83b724420eb5) · [Internal submission](https://expo.dev/accounts/radiostar/projects/star-cast/submissions/6025f3c9-050f-451d-b49a-08427e952fd1). Sanitised evidence: `evals/product-activation-final.json`. Owner device checklist: `evals/product-activation-phase3-device-matrix.json` (now targeting build 14).
