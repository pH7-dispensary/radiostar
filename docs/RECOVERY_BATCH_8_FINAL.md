# Recovery Batch 8 — consolidated internal release

2026-10-26 · repository `pH7-dispensary/radiostar` · branch `work`.

## Verdict and release identity

**Supervised internal beta only.** The verified recovery changes improve real operation, but do not establish public-launch readiness. No public review, billing, Translate rollout, rights grant or public automatic Ad Skip was enabled. Physical-device acceptance remains outstanding.

- Verified source: `7e9bfc6` (includes Batches 1–7 through `b9c5ef0`). The signed iOS build uses that source. Backend-only correction `98d2ade` fixes duplicate-follow status mapping; later changes are acceptance tooling, evidence, release number and this report.
- AWS account **208096650030**, region **eu-west-2**; STS and resource ownership checked. No pH7 changes.
- Final backend release **ad2dff0d3ef8292b57df1cdee275754187a14622de63bef8c23d8e2314f4a456**, deployed **2026-10-26T20:21:14.283Z**. SSM `b0898983-8f8b-40bf-bcb0-80c5aaf44afe` succeeded. The initial consolidated release `61fc2b499f8ef2b91886defa0ce35ab84e4d431f3694bed4d1ec7ab6d3ff21d7` was followed by the tested status correction.
- Immediate rollback source **61fc2b499f8ef2b91886defa0ce35ab84e4d431f3694bed4d1ec7ab6d3ff21d7** retained; the prior Batch 6 source is also within the preserved rollback history. Rollback must restore source/config compatibility, never rewind the spending database or audit history.
- iOS **1.0.0 (13)**, bundle `app.radiostar.ios`, EAS project `249fb010-2c52-4be5-a7cf-e08b25f89cbe`.
- EAS build **bc729b2b-07c3-4d0c-b942-7fee5c1b7860**. Signing uses the existing Apple team **69F2T3M9C4** and provisioning profile. No new credentials created.
- Existing internal group **Team (Expo)**, ID `d700defb-f451-4198-899e-11fc6ea0e0ad`, confirmed internal with access to all builds.
- Build, IPA and submission outcome: final readback below. Build 12 remains the previous known TestFlight release.

## Seven-batch matrix

| Batch | Implemented | Tested | Deployment / remaining |
|---|---|---|---|
| 1 Intelligence availability | Honest rights reasons, cached discovery, automatic eligible followed preparation | Full regression; live cached intelligence and follow | **PRODUCTION VERIFIED** cache path; current followed window still has no established processing basis |
| 2 Catalogue/following | Shared canonical RSS parsing, alias migration, durable native follow outbox and reconciliation | Parser/collision/recovery tests; fresh native web offline follow and unfollow across restart | Backend **PRODUCTION VERIFIED**; native included in 13; device acceptance pending |
| 3 Admin security | Individual identities, explicit RBAC, expiring sessions, trusted proxy quota and deterministic cohorts | Full security regressions; live emergency session, CSRF/anonymous rejection, logout revocation | **PRODUCTION VERIFIED** enforcement; **BLOCKED** owner migration: zero individual production administrators |
| 4 AWS reliability | Nonblocking backups, bounded retention/logging, telemetry and 12 alarms | Current integrity/backup/hash/queue checks; Batch 4 isolated service restoration | **PRODUCTION VERIFIED** service; email delivery unconfirmed; single host remains |
| 5 Semantic intelligence | Unicode retrieval, provider embeddings, cited evidence and claim qualification | Repeated cached English/Portuguese/Chinese live queries; owned benchmark and adversarial tests | **PRODUCTION VERIFIED** limited corpus; broader human quality evaluation remains |
| 6 Ad Skip | Nonblocking proof lookup, exact variant binding, prefetched short lease, verified seek/Undo and conservative break grouping | Full safety regressions; repeated actual Chromium playback; live receipt inspection | Backend **PRODUCTION VERIFIED**, new native in 13; complete real-world break accuracy **BLOCKED** on independent labels |
| 7 AI Sleep | Shared AVPlayer native deadlines, fade, persisted completion/recovery, extension failure fencing | JS bridge and Swift deterministic tests; actual muted macOS AVPlayer; EAS compiles native module | **TESTED**; locked-screen/overnight iPhone behaviour **DEVICE UNVERIFIED** |

Detailed historical evidence remains in `RECOVERY_BATCH_1.md` through `RECOVERY_BATCH_7.md`; this report supersedes their release-status statements, not their measurement limitations.

## Actual coverage and processing

| Measure | Original audit | Batch 8 before controlled QA follow |
|---|---:|---:|
| Active eligible profiles | 5 | 2 |
| Unique followed podcasts | 7 | 6 |
| Latest-three episodes | 21 | 18 |
| READY in that window | 0 | **0** |
| Requires rights review | 21 | **18** |
| Transcribing / analysing / queued / waiting capacity / failed | — | **0 / 0 / 0 / 0 / 0** |

The cohort narrowed in Batch 3; this is not a listening-retention measurement. All 18 current rows report `LEGAL_BASIS_NOT_ESTABLISHED`. No publisher prohibition is invented, and missing permission is not converted into a licence. Historical jobs or out-of-window cached episodes are not counted as followed coverage.

Discovery currently exposes **8 real cached episodes**. A reversible follow on the existing QA installation selected exactly the latest three Open Source Security episodes; all returned **PARTIAL_READY**, eligible, with transcript cache hits. Repeating the same follow caused no jobs or ledger entries; an older follow after unfollow was rejected. The QA follow was removed. No invitation was consumed. This verifies the real cached handoff, not fresh paid transcription or four-hour quality.

Backlog estimate: **$22.7823** known potential processing cost; **$0 currently eligible**; 43.1386 estimated audio hours, 15 rows requiring audio, 3 unverified publisher references. This is an estimate, not a reservation or permission. No supported completion ETA exists. Automatic processing remains rights-, budget- and human-pause-controlled.

## Intelligence and search evidence

Two authorised cached Open Source Security episodes returned grounded briefs, **7 chapters / 8 topics** and **8 chapters / 13 topics**. Every chapter/topic reference resolved to its stored transcript; chapter time ranges were ordered and positive. Outputs remain explicitly partial where earlier generated claims could not be validated. This is not a human assessment of every sentence or acoustic chapter boundary.

Live exact, paraphrase, Portuguese and Chinese queries found their expected source passages. An unsupported lunar-chess query abstained. Returned snippets and timestamps matched canonical stored segments; claims matched their citations. Find a Moment returned segment 35 at **219,851 ms**. No full transcript was returned in listener status.

Batch 5's separately authorised evaluation is retained: expanded 30-query owned corpus, 27 supported and 3 absent; selected semantic retrieval recall@5 **96.3%**, MRR **0.923**, absent-query abstention **100%**. These authored labels are not an independent real-world benchmark. Batch 8 repeated the zero-cost 24-query Unicode lexical benchmark: recall@5/MRR **77.27% / 0.7727**, multilingual recall and absent abstention **100%**. Cached real-provider queries were repeated without new charges. Wider speaker attribution, unconstrained comparison, multilingual completeness and four-hour provider quality remain partially verified.

## Ad Skip: actual evidence and limits

Production has 11 completed analyses and six candidate spans across the two advertisement-bearing records. The administration summary separately counts one currently candidate-state interval; these are different measures. There are **2 verified intervals**, **3 confirmed skip events**, **3 Undo events**, **0 false-positive reports**, and **1 missed-advert report**. Zero reports does not prove zero false positives.

- Owned fixture: **15.200–34.500 s**, 19.3 s verified duration; one production skip/Undo receipt pair.
- Linux Action News 164: **716.186–720.541 s**, only **4.355 s**; two production skip/Undo pairs. This is an interior fragment, not a verified complete advert break.
- Repeated isolated actual Chromium playback used the exact owned audio hash and shared native execution adapter: 19,284.731 ms skipped, destination confirmed at 34,500 ms, Undo restored 15,215.269 ms, two simultaneous Undo calls performed one seek, pause and 1.5× speed preserved. Play promise resolved in 1.1 ms after audio preparation; this is **not audible startup latency**.
- Exact audio mismatch, stale/expired lease, pause/source switch, changed delivery, failed seek confirmation, editorial exclusion and duplicate Undo regressions pass. Optional verification does not block normal playback.

The prepared real-audio corpus contains **12 hash-bound episodes**, 13.1121 audio hours and 20 preliminary detector candidates, with **zero independent human labels** at preparation. Recall, precision, independent boundary accuracy and complete-break coverage are **unavailable**, not 0% or 100%. Five specific clips and the protected local review workflow are documented in `AD_SKIP_CORPUS_REVIEW.md`. Detector v9 rejects negated directions and ordinary personal visits. Public automatic skipping remains disabled; existing private-pilot scope and evidence thresholds are preserved.

## Native and sleep acceptance

Full native TypeScript, Expo Doctor **21/21**, dependency compatibility, production iOS export and current web export passed. Fresh browser verification refreshed 35 followed feeds, preserved publisher-outage cache and two colliding saved episode IDs, survived offline follow and unfollow through restart, confirmed exactly two writes, and found no page errors or horizontal overflow. It is browser evidence, not iPhone evidence.

The current owned-audio native core run paused actual muted macOS AVPlayer after **2,015.307 ms** for a 2,000 ms deadline, recorded 47 fade observations, minimum volume **0.02122**, restored **0.7**, and saved actual position **1,790.592 ms**. Deterministic tests cover extensions, cancellation, source/session fencing, clock changes, interruption, restart and privacy deletion. EAS native compilation closes the previous local tooling compile gap; it does not close device scheduling or audible-fade evidence.

**DEVICE UNVERIFIED checklist for build 13:**

1. Fresh launch/onboarding: light default, saved light/dark preference, full-bleed centred icon, readable titles and safe areas.
2. Discover/follow/library, brief/chapter/topic partial labels, search citation playback; offline follow then restart/reconnect.
3. Immediate ordinary audio, mini/full player, speed/manual seek, temporary network loss, background audio and lock-screen controls.
4. Existing private-pilot owned fixture: verified automatic skip and Undo, including paused state, speed and source-switch races. Do not widen the pilot for this test.
5. Five-minute manual timer and AI pause-by deadline while locked: audible fade, actual pause and persisted position; +5/+15/+30, cancellation, interruptions, Bluetooth disconnect and source switching.
6. Restart while armed must show interrupted without auto-resume; restart after completion must restore the native pause position. Run an overnight session and record drift/battery. No physiological sleep-detection claim.

Detailed steps remain in Batch 7. Previous owner confirmation of search-result playback does not verify these new capabilities.

## Security, AWS and costs

Live protected emergency Super Admin login succeeds with Secure/HttpOnly cookies; missing CSRF and anonymous administrative access are rejected; logout revokes the session. Trusted viewer mode is `cloudfront-vpc`; session limit 8 hours. Individual login/RBAC, account lifecycle, deterministic feature cohorts and human-only pause controls pass isolated tests. **Production contains zero individual administrators**: the owner must establish and verify their own individual login before emergency access can be retired. No secret is printed or committed.

Post-deployment DB `integrity_check=ok`, FFmpeg/FFprobe execute, worker runs, SQS and DLQ have zero visible/in-flight/delayed messages. Standard caps remain **$5/day, $25/month, 3 transcription hours/day, 2 hours/episode**. Existing separately authorised temporary pilot caps **$25/day, $125/month, 15 hours/day, 4 hours/episode** still expire **2026-10-27 21:53:27 UTC**; not renewed. Translate retains its separate **$2/day / $10/month / 10-minute** limits and private access. Atomic reservations, deduplication and recovery tests pass.

AI ledger **121 entries, $1.5886908, zero outstanding reservations** before/after acceptance. **$0 additional AI calls** for Batch 8. AWS Cost Explorer for 1–26 October inclusive reports **$7.367155014 unblended**, `Estimated=true`; not a final invoice or steady-state monthly estimate. Includes compute $4.4848, VPC $1.3536, EC2 Other $1.1386, Secrets Manager $0.1472, Cost Explorer $0.16 and smaller storage/provider charges. New read-query/build charges can post later; EAS build billing not reported as $0.

Preflight created an integrity-verified recovery copy; 25.67 GB free. Versioned AES256 S3 `recovery/latest.sqlite` was downloaded and SHA-256 verified (25,206,784 bytes, snapshot 19:54:42 UTC). Existing Batch 4 isolated restore verified actual recovered service, with retrieval/DB/start/health 759.41 ms and total provisioning-through-check 237.50 s; this is not a universal RTO. No destructive restore was repeated.

All 12 CloudWatch alarms are enabled and OK. **SNS still reports PendingConfirmation** for the operations recipient despite prior owner confirmation; inbox delivery is **BLOCKED**, not verified. The application reports degraded retention because one protected legacy directory with macOS metadata remains outside its deletion allowlist, in addition to two normal rollback copies. Disk is healthy (~20% used); no speculative deletion. Logs and backups remain bounded/nonblocking. Single-host failure/scale risk remains P1.

## Tests, failures and evidence

- Full `npm test` including release, migration, authentication/RBAC, budgets, processing recovery, all seven batch suites and corpus security: **PASS twice**, including after the final follow-status correction.
- Native TS, Expo Doctor, Expo compatibility, iOS/web export, icon validation, privacy/development-token scan, `git diff --check`: **PASS**. No standalone lint script is configured; existing syntax checks run in `npm test`.
- Native privacy release harness updated for the real native sleep-clear import and verifies that deletion clears it. Live harness initially expected only HTTP 200 and omitted CSRF on its administrative refresh; corrected to accept documented 202 and send the session CSRF. A stale follow-window precondition was corrected to await current discovery. These were verification-tool failures, not weakened application controls; successful rerun removed the temporary follow. Final handoff review also found a real backend defect: duplicate follow confirmation projected `PARTIAL_READY` rows as unavailable. Commit `98d2ade` preserves partial availability and recognises active processing stages. Its HTTP regression covers partial/all-ready/mixed-restricted/transcribing/review-only states without new dispatch. The small compatible correction required a second backend deployment; only one native build was created.
- Backend dependency audit: **0 vulnerabilities**. Native toolchain: **5 high / 0 critical** entries involving Expo CLI/node-forge/Zod dependency chains. No compatible patched Forge release and Zod fix requires an incompatible major; no unsafe downgrade/override applied. Runtime source maps contain neither node-forge nor Zod. Trusted signing inputs only; tooling advisories remain P1, not dismissed.
- The first EAS submission attempt was rejected before scheduling because optional changelog submission requires Enterprise. Retrying without that optional field scheduled exactly one submission for the existing build; no plan upgrade or second build occurred.
- Source/archive scan excludes local credentials, Terraform state, SDK downloads and generated exports. Export scan found none of the actual local server/admin/QA credentials.
- Machine-readable evidence: `evals/recovery-batch8-results.json`, refreshed `evals/recovery-batch6-playback.json`, `evals/recovery-batch7-native.json`. Private raw responses/backups remain ignored under `.starcast` or `/tmp/starcast-batch8`; no full transcripts or credentials are published.

## RT01–RT20 disposition

| Finding | Current disposition |
|---|---|
| RT01 followed coverage | **OPEN / accepted internal-beta P1**: 0/18 real current window; 8 cached discoverable; controlled eligible latest-three succeeds. Original product P0 not declared solved. |
| RT02 complete real-world Ad Skip | **OPEN P1**: hash-bound corpus/review prepared; no independently labelled complete-break accuracy. |
| RT03 locked/background AI Sleep | **PARTIALLY VERIFIED** native core and cloud compile; DEVICE UNVERIFIED. |
| RT04 device evidence gap | **OPEN P1** acceptance checklist above. |
| RT05 offline following | **TESTED + live cached handoff verified**; native device acceptance pending. |
| RT06 canonical identities | **TESTED / deployed**; aliases/collisions preserved, no unsafe historical merge. |
| RT07 RSS parser | **TESTED / deployed** complete-document parsing/newest selection/error handling. |
| RT08 Unicode | **PRODUCTION VERIFIED** Portuguese/Chinese cases, broader languages unmeasured. |
| RT09 semantic retrieval | **PRODUCTION VERIFIED limited corpus**; broad comparison quality remains P1. |
| RT10 grounding | **TESTED / deployed + live references checked**; independent human quality review remains. |
| RT11 trusted proxy quota | **TESTED / PRODUCTION VERIFIED configuration**; no untrusted XFF identity override. |
| RT12 individual admin | **IMPLEMENTED / TESTED**, owner migration **BLOCKED**. Emergency recovery preserved. |
| RT13 session lifetime | **TESTED / PRODUCTION VERIFIED** secure session/expiry setting/revocation. |
| RT14 deterministic rollouts | **TESTED / deployed**, rights/auth/spending gates remain independent. |
| RT15 blocking backups | **TESTED / PRODUCTION VERIFIED** separate bounded backup worker, fresh verified object. |
| RT16 monitoring | **PARTIALLY VERIFIED** 12 alarms OK; SNS email confirmation/delivery open. |
| RT17 disaster recovery/scale | **PARTIALLY VERIFIED** isolated restored service; single host, no scale promise. |
| RT18 blocking proof lookup | **TESTED**, current native release includes nonblocking implementation; iPhone latency unmeasured. |
| RT19 dependency advisories | **OPEN P1 toolchain**, no critical/backend findings or affected runtime source modules. |
| RT20 overstated copyright notice | **TESTED / deployed** evidence-specific reasons; no automatic permission inferred. |

## Evidence-based rescore

Same original weights: function /30, real-world /25, recovery /20, UX /15, operations /10. These are explicit engineering judgements, not measured percentages or certifications. Implementation alone receives no real-world credit. Device-only unknown outcomes remain uncredited.

| Vertical | Previous | Function | Real-world | Recovery | UX | Operations | Current |
|---|---:|---:|---:|---:|---:|---:|---:|
| Discovery/RSS | 58 | 25 | 15 | 17 | 11 | 7 | **75** |
| Transcription | 57 | 23 | 11 | 16 | 8 | 7 | **65** |
| AI intelligence | 56 | 25 | 19 | 16 | 11 | 8 | **79** |
| Ad Skip | 40 | 20 | 6 | 13 | 6 | 5 | **50** |
| Native iOS | 53 | 23 | 9 | 15 | 11 | 7 | **65** |
| AI Sleep | 40 | 22 | 3 | 16 | 11 | 7 | **59** |
| AWS reliability | 64 | 26 | 20 | 18 | 8 | 8 | **80** |
| Security/privacy | 65 | 26 | 17 | 17 | 10 | 9 | **79** |
| Administration | 64 | 25 | 17 | 16 | 12 | 9 | **79** |
| Product economics | 37 | 18 | 5 | 11 | 5 | 6 | **45** |
| **Total** | **534** | | | | | | **676 / 1,000** |

RSS/follow recovery, grounded semantic evidence, verified restore/alarms and server controls justify improvements. No points claim comprehensive followed intelligence, independent ad accuracy, locked-iPhone sleep, individual production operator adoption or proven unit economics. Zero current followed coverage and incomplete representative/device tests keep scores restrained.

## Final release readback

- **BUILT / SIGNED / VERIFIED:** EAS build `bc729b2b-07c3-4d0c-b942-7fee5c1b7860`, completed 20:13:16 UTC. Exact source `7e9bfc65d4e071745be1c4da8b8a8423d5bdbefb`; 1.0.0(13).
- IPA SHA-256 **93eff0e428e0f463ff3a5759c5ff732ab342e75eaeac3f811b82657ff4b565f4**, 12,243,253 bytes. Strict/deep signature passes; correct bundle/team/version, `get-task-allow=false`, background audio, linked `RadioStarSleep`, AWS HTTPS endpoint. Actual local credentials absent from all 58 signed files scanned.
- Approved 1024px icon source hash **a4f00926754d36a335619fd5a299d7c5d0fdf062632a2b3c8e85d434efa2562d** matches the EAS archive and bundled asset. Generated 120px iOS icon is opaque, visually inspected and has no white border. Splash storyboard is bundled. Installed Home Screen appearance remains DEVICE UNVERIFIED.
- **SUBMISSION SCHEDULED / EXTERNAL QUEUE:** `433473b2-10cb-43db-9f55-f4951601d07d`, exact verified build, existing internal group Team (Expo), no public review. EAS currently reports `IN_QUEUE`; upload and Apple processing are not yet confirmed. Apple still lists build 12 as its newest VALID / IN_BETA_TESTING build. Do not describe 13 as available until a later Apple readback confirms it.
- Final fixed-backend acceptance passed: repeated cached intelligence/multilingual references and exact moment timestamp, latest-three cached follow, duplicate response now PARTIAL_READY, stale follow rejection and cleanup; ledger unchanged, no new jobs. Post-deployment SSM integrity and FFmpeg/FFprobe checks both succeeded. Native build 13 needs no change for the compatible backend fix.
- No known P0 service/security/signing regression was observed. Accepted P1 limitations are explicitly listed above; individual-admin migration, alert delivery, representative audio annotations and physical iPhone acceptance remain external human tasks. EAS queue/Apple processing is the remaining release-service dependency.
- Commits: `7e9bfc6` acceptance/release checks; `98d2ade` backend follow-status integration fix; this report and the evidence/build-number record are committed separately on `origin/work`. Unrelated untracked user files and downloaded SDKs were preserved.

Release URLs: [build 13](https://expo.dev/accounts/radiostar/projects/star-cast/builds/bc729b2b-07c3-4d0c-b942-7fee5c1b7860), [internal submission](https://expo.dev/accounts/radiostar/projects/star-cast/submissions/433473b2-10cb-43db-9f55-f4951601d07d).
