# Ad Skip final internal release

28 October 2026 · `/Users/oska/Documents/star-cast` · branch `work`.

**PARTIALLY VERIFIED internal beta. Not public-launch ready.** Backend integration and controlled real-audio automatic seek/Undo are PRODUCTION VERIFIED. One signed iOS build is complete. Physical-iPhone Ad Skip, background/lock-screen and new-build launch acceptance remain DEVICE UNVERIFIED. Public automatic skipping stays disabled.

## Prompt 1–3 recovery matrix

| Stage | Implemented | Tested | Deployed | Remaining |
| --- | --- | --- | --- | --- |
| 1 — real advert detection | Source-hashed opening transcript, commercial closing/editorial boundary, beginning-of-file handling | Original miss reproduced; human-labelled LUP 690 now fully covered; real seek/Undo | Backend, exact preserved source and private pilot | Physical-iPhone execution |
| 2 — generalisation | Generic commercial evidence, acoustic qualification, editorial cold-open exclusion, automatic approval/complaint suspension | 12 exact sources; 10 complete proposals, 5 audio-verified openings; synthetic negatives | Backend; machine-only LUP 635 live seek/Undo | Representative full-episode independent accuracy |
| 3 — internal activation | Existing testers, explicit expiry/preferences, authenticated operations controls, automatic eligible preparation | Real fresh transcription, 13 grounded references, saved-chunk recovery, latest-three cache deduplication, live pilot | Backend/Admin live, standard budgets intact | 0/18 ordinary followed episodes eligible for displayed intelligence; partial output quality |

Prompt 1's current complete-ad implementation evidence is consolidated in `AD_SKIP_GENERALISATION_PHASE_2.md` under **Prompt 1 inheritance and root cause**, commit `8318944`, and `evals/ad-skip-p0-live-playback.json`. There is no separate current Prompt 1 report filename. The older `AD_SKIP_RECOVERY_REPORT.md` describes an October 23 interior fragment, not the completed 90-second advert. `AI_ACTIVATION_FINAL_ACCEPTANCE.md` records the earlier zero-candidate failure; its unrelated working-tree edit was preserved, not treated as current acceptance evidence.

## Final integration correction

Live browser inspection found a genuine Admin integration defect: the API projection dropped persisted proposed boundaries/source hashes and ignored metadata held in the independent opening-source cache. The UI therefore showed “Not recorded” and episode GUIDs despite existing evidence. Labelled complete-interval coverage was also hardcoded unavailable after real labels had been imported.

Commit **695a265** repairs only the read-only projection and existing Admin page. Stored titles, publisher, source hash, proposed/verified bounds and approval provenance now appear. LUP 690 shows **1/1 human-labelled intervals covered**; LUP 635 shows one automatically verified complete opening and **unknown independent coverage**, not invented human review. Partial, disputed and mismatched-source intervals cannot count as complete reviewed coverage. Older records genuinely missing proposed bounds remain unknown. No rights, detection thresholds, approval authority or seek safety was weakened.

The existing production Admin UI was exercised through actual HTTPS sign-in, Ad Skip, Costs and AI Processing. Source evidence, current pilot, real counters, expenditure and remaining processing restrictions rendered; no console errors. Sign-out returned to login. Separate API checks rejected invalid CSRF and revoked sessions with 403; pilot version stayed unchanged.

## Real advert and corpus acceptance

The independently reviewed original **LINUX Unplugged — 690: The S in PHP is for Security** remains bound to MP3 SHA-256:

`693acd1c1ae733801013ca37bc937501e1e0e73d630daaf5620b36b7f1c4117c`.

The 0–120 second WAV clip hash is `999e15bcfe8d07b73c6a12f91162d81a3922ade0869620568454064ca9e17287`; the supplied MP3 digest is not the WAV digest. Review audit file hash remains `d739a26bdc398d718a88630f7b27cd3d042d12f3635f3b29e98d2da9125ff7f9`. The review chain was verified and human records remained byte-identical.

| Measurement | Actual result |
| --- | --- |
| Original publisher-transcript result | Zero advert candidates; transcript omitted the dynamic opening |
| Independent annotation | 0–90,415 ms |
| Current automatic-only acoustic result | 0–90,459 ms |
| Start / end error | 0 / +44 ms |
| Coverage of this labelled interval | 100%; denominator **one interval** |
| Extra included audio | 44 ms within measured silence, no measured editorial speech |
| Measured end silence | 89,893–91,024 ms |
| Preserved human-plus-acoustic production interval | 0–90,415 ms |

No episode ID, brand, human timestamp or hash was hardcoded into production detection.

The final rerun rehashed **all 12 source files**, reused existing local machine transcripts, and left prior Phase 2 evidence intact using the new evaluator `--output` option. Results: **49 overlapping cue/proposal candidates**, **10 complete-opening proposals**, **5 automatically audio-verified openings**. These are not 49 distinct confirmed advertisements. Three additional interior windows were also evaluated. The corpus contains two shows from one publisher and repeated sponsor creatives; it is not representative of the whole catalogue.

Independent human labels: **1**. Entire episodes independently reviewed: **0**. Therefore corpus precision, false-positive rate, missed-advert count, whole-episode recall and complete-break accuracy remain **unavailable**. The known labelled advert is detected; this does not establish corpus recall. Editorial negatives and the voicemail cold-open guard pass regressions. P95 detector time was 8.317 ms over 12 desktop opening analyses, not an iPhone benchmark. No paid provider was called for this evaluation.

Evidence: `evals/ad-skip-final-corpus.json`.

## Full automatic skip chain

Detection, commercial boundaries, acoustic evidence, source identity, active tester membership, preference, short-lived lease, actual seek, destination confirmation and Undo were all exercised. Existing private S3 delivery was checked using conditional ETag and native range witnesses; the actual played preserved bytes were SHA-256 checked. A mismatching source fingerprint was denied. A changing RSS URL is never treated as proof that its bytes match the old annotation.

After the final backend deployment, real LUP 690 playback:

- Actual origin **561.384 ms** → confirmed destination **90,415 ms**.
- Playback continued at **1.5×**, without another play command.
- Undo restored **561.384 ms exactly**, retained playback speed and the paused state.
- **One automatic seek and one Undo seek**, including duplicate concurrent Undo calls.
- Observed seek confirmation **4.4 ms**, Undo **2.0 ms**; individual desktop measurements only.

The pre-deployment trial also passed and is retained separately. Phase 3 additionally proved machine-only LUP 635 auto-approval → live lease → actual seek to 90,583 ms → Undo without owner review. These are real audio and shared-native-adapter tests in Chromium, **not physical-iPhone tests**. No native device result is inferred from browser receipts.

Evidence: `evals/ad-skip-final-live-playback.json`, `evals/ad-skip-final-predeploy-playback.json`, `evals/ad-skip-phase3-machine-live-playback.json`.

The pilot remains active for the same **two enrolled testers**, both preferences enabled, version **2**, expiry **29 October 2026, 14:11:12.730 UTC**. No renewal or new invitation was needed. The server kill switch, source/lease expiry, disputes, mandatory restrictions and verified boundaries remain enforced. Qualified adverts approve automatically; optional retrospective review and complaint-triggered suspension remain available. No routine owner annotation is required.

## Automatic intelligence and actual coverage

The latest-three scheduler remains enabled. The current ordinary population is **six unique followed feeds / 18 latest episodes / zero READY or PARTIAL_READY**. All 18 operational policies are OPEN; actual blocker is LEGAL_BASIS_NOT_ESTABLISHED. Fourteen also exceed the unchanged two-hour audio policy. Missing processing evidence is not described as a discovered publisher prohibition. No licence or permission was fabricated to improve the denominator.

The authorised Phase 3 follow test remains the distinct comparison: latest three Open Source Security episodes reused PARTIAL_READY intelligence/transcripts with **zero extra jobs, usage records or cost**; duplicate follow requests did not repeat processing. The temporary QA follow was removed and the owner's follows preserved.

The fresh authorised **CRA vulnerability reporting with Daniel Thompson** result remains persisted after deployment: job `b562d0e6-2052-4d0d-8236-75b851aa1f86`, three saved audio chunks, 611 timed segments, brief, 15 chapters, 15 topics, moment and search availability. It is honestly **PARTIAL_READY**, with conservative source-excerpt output, not a complete abstractive brief. Thirteen retrieved source references were rechecked against the database. Saved-chunk process-interruption/resume evidence remains in Phase 3; provider calls during recovery were zero.

Current output availability, rights, queues and budget state were fetched from live AWS. No duplicate paid job or new transcription was triggered for this release.

## Native and release validation

**AUTOMATED TESTED:** full backend suite twice, including final projection regressions; detection/acoustic/variant tests; exact seek/Undo, failed seek, manual seek suppression, speed/source changes and duplicate prevention; processing recovery; authentication, CSRF, expiry, permissions, budget/concurrency and database contracts. Native TypeScript passed. Expo Doctor **21/21**. Production iOS export with dotenv/development overrides disabled passed, including a final build-15-config export and credential scan. No separate lint command is configured.

Swift deadline tests and a muted real macOS AVPlayer trial passed: pause at ~2.022 seconds, fade/volume restoration, interruption/restart/source ownership cases. They do not establish audible quality or iPhone background/lock-screen behaviour. Host `devicectl` is unavailable; no physical-iPhone session was obtained.

Immediate normal playback and the shared player remain unchanged. Optional proof warms asynchronously. A cold, unverified dynamic source is not swapped mid-playback and is not promised an opening skip; a cached verified source can be used on a later deliberate load. Existing foreground/status refresh, manual-seek handling, pause state and Undo remain intact.

**SIGNED ARTIFACT VERIFIED:** one EAS build **4626a285-4cde-4ab1-9fe2-0180a1d8fc88**, version **1.0.0 (15)**, FINISHED `2026-10-28T15:59:29.639Z`, source commit `54e0918`. EAS incremented 14→15; commit `3f7c167` records it. Later Admin-only code is served by the compatible backend and requires no second native build.

- Bundle `app.radiostar.ios`; existing TETRODAXOL organisation/team `69F2T3M9C4`.
- Existing certificate/profile reused; no new certificate. Strict/deep signature passed; `get-task-allow=false`; background audio enabled; `RadioStarSleep` linked; AWS HTTPS endpoint present.
- IPA **12,252,503 bytes**, SHA-256 `e668a857ba4f86d0b1742d10456d95fa9a4fc0da19e705bc24bed74c2280af4f`.
- Known credentials absent from 392 archive files and 58 signed-app files. Native player/adapter/range-proof sources matched the archive.
- Approved opaque 1024×1024 purple source hash `a4f00926754d36a335619fd5a299d7c5d0fdf062632a2b3c8e85d434efa2562d` is present byte-identically in the signed app. Generated 120px icon rendered and visually checked without white border. Installed Home Screen appearance remains DEVICE UNVERIFIED.

## AWS and costs

STS and target ownership verified account **208096650030**, **eu-west-2**. No pH7 changes. Preflight created integrity-checked backup `/var/lib/starcast/pre-command-centre-1793203478608.sqlite`, confirmed disk headroom and preserved rollback.

Final deployment SSM **60d4fa9d-fd70-4c26-af67-c4cbc0bd8ea6** succeeded. Release **bf5210e498e0f704c45299d70df079e5de9b7657a736bedce7b1d0744c3d742f**; previous **7a9d8ad4e82a6e38f4cd89baaa3ae44fb9f7de60d9393390eaef8aee76762a0d** retained. No schema migration or production-data deletion.

HTTPS 200; backend and worker healthy; SQS and DLQ empty; SQLite integrity **ok**; post-deployment free disk **24,765,530,112 bytes**, 23% used. Backup integrity/S3 upload succeeded. Aggregate monitoring still discloses the protected legacy retention directory (three copies vs target two) and UNKNOWN application probes for CloudWatch delivery/S3 freshness. No new infrastructure was provisioned.

**Phase 4 additional AI expenditure: $0.** Ledger: **$0.49785892 today / $2.31619266 month / 4,575 transcription seconds today**, zero reservations. Standard limits unchanged: **$5/day, $25/month, 10,800 seconds/day, 7,200 seconds/source**. Translate's independent ledger/limits are unchanged. Phase 3's fresh job cost remains $0.26816860, plus $0.00000008 query embedding; it was reused. No incremental AWS/EAS invoice amount is inferred or claimed as zero.

## Submission and Apple state

Submission **af090c28-0f42-477b-98a6-d78dca407ff1** references the exact verified EAS build, with existing internal group **Team (Expo)** requested. No public submission. The initial attempt was rejected before scheduling because EAS restricts optional changelog submission to Enterprise; the same build was then successfully scheduled without that field, without a plan upgrade or second build.

At **2026-10-28 16:24 UTC**, the recorded state is **BUILD COMPLETE → UPLOAD QUEUED** (`IN_QUEUE`). Apple readback lists build 14 as the latest available; build 15 is not yet listed. Upload success, Apple processing and availability are not yet confirmed.

[Verified EAS build](https://expo.dev/accounts/radiostar/projects/star-cast/builds/4626a285-4cde-4ab1-9fe2-0180a1d8fc88) · [Single submission](https://expo.dev/accounts/radiostar/projects/star-cast/submissions/af090c28-0f42-477b-98a6-d78dca407ff1).

## Physical-iPhone acceptance still required

After build 15 becomes available, install it through the existing internal TestFlight group while the explicit pilot is active:

1. Confirm launch, existing enrolment and immediate ordinary episode playback; test lock-screen play/pause and background playback.
2. Open **LINUX Unplugged → 690: The S in PHP is for Security**. Allow the existing audio-matching status to complete. If playback began before proof was cached, deliberately load another episode and return; do not apply old timestamps to an unmatched stream.
3. With Ad Skip on, start the verified source near its beginning. Confirm the complete opening skips to **1:30.415**, playback continues and Undo returns to the actual pre-skip position. Repeat at 1.5× and pause before Undo; confirm state preservation.
4. Switch sources during matching; ordinary playback must remain correct and no old interval may seek the new source. Check Home Screen icon, cached Open Source Security brief/chapters and “Play from here”.

This is a device acceptance checklist, not a request to annotate or approve advertisements.

## Remaining limits and verdict

**P0:** no broken API, database, authentication, signing or unsafe-seek regression was observed in the completed automated/live gates. Actual new-build iPhone launch/core playback has not been observed, so it is not marked DEVICE VERIFIED.

**P1 / PARTIALLY VERIFIED:** physical-iPhone acceptance; narrow independent Ad Skip corpus; cold first-play matching limitation; 0/18 ordinary followed coverage; partial brief quality; limited real long-form provider quality. Existing legacy-retention/monitoring gaps remain disclosed. The pilot expires explicitly; no silent extension. Broad public rollout remains off.

Git implementation commits: **54e0918**, **3f7c167**, **695a265**, pushed to `origin/work`. This report and its final evidence are recorded in the subsequent documentation commit. No GitHub Actions workflow is configured. Owned changes pass diff checks; pre-existing trailing whitespace in the unrelated modified `AI_ACTIVATION_FINAL_ACCEPTANCE.md` remains excluded. Unrelated untracked files were preserved.

**Verdict: production integration and the signed internal-beta artifact are verified; TestFlight availability and physical-device acceptance must retain their actual separate states. Not public-launch ready.**
