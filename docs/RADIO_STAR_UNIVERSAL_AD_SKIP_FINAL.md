# Universal Ad Skip — Phase 3 evidence, 18 November 2026

**Outcome: backend fixes deployed; private pilot renewed; full Phase 3 acceptance remains incomplete.** Two real opening advertisements passed live AWS-authorised automatic seek and Undo. This is desktop execution, not physical-iPhone verification. General complete-break accuracy, real mid/post-roll acceptance and the six named commercial episodes remain unproven or blocked. Public automatic skipping remains disabled.

## Revision and deployment

- Repository: `pH7-dispensary/radiostar`; branch `work`; starting revision `300499f`.
- Backend implementation: `c1b904f`. Native dependency alignment: `ace3428`.
- Production archive: `55b2150b92e0f3076d88ec1b1c57c731b1e5fb4042679b87a06bf520cbd3681e`.
- AWS account `208096650030`, region `eu-west-2`, instance `i-08537aa0e84163cb9`; HTTPS `https://d3ri12f40b85i3.cloudfront.net`.
- Deployment command `35d35a1b-3525-4577-8f8a-ca8dbf3c2e42`: **Success**. No pH7 resources changed; no infrastructure added.
- Before deployment: SQLite recovery backup `/var/lib/starcast/pre-command-centre-1795016536789.sqlite`, integrity `ok`, 23,193,632,768 bytes free. Prior release `951ebf792d024d39b81cd7be24c90caf8b58b419d0e4eb869f47d1cf0ac0d1bc` retained. Existing deployment failure rollback and two-release retention remain intact.
- After deployment: API/worker/database healthy; 23,062,540,288 bytes free; SQS visible/in-flight/delayed and DLQ counts all zero at the recorded observation. These snapshots are time-specific, not uptime guarantees.

## Defects corrected

1. **Overlapping ASR segment identifiers collided.** Each provider request restarted identifiers such as `0-0`; combining a previous window with new speech could reference an editorial segment as though it were the new advert. The new regression failed with two unique IDs for three distinct segments before the fix. IDs now derive from global start/end/text; exact duplicate rows are removed without changing timestamps. Existing window caches are repaired locally, without another paid request.
2. **A canonical transcript could trigger an entire-episode download just to check a boundary.** Fresh verification now waits for the independent bounded source preparation. Repeat window verification uses the same acquisition ledger. Existing verified private/static variants remain usable. A matching canonical transcript can be reused when its exact hash and coverage establish compatibility; a full-file hash is not assumed to identify a different downloaded prefix.
3. **Per-window limits lacked a persisted aggregate acquisition ceiling.** The existing 8 MiB window limit now has an atomic shared ceiling of 2 GiB and 512 requests per canonical episode/source in a rolling 24-hour period. Known transfers charge received bytes; interrupted/unknown transfers retain their reserved ceiling. Exhaustion has an explicit reset time and preserves paid checkpoints. This is a network limit, separate from the AI ledger.
4. **Expired enrolled devices could not be explicitly renewed through the protected administration workflow.** A Super Admin session plus CSRF, current expiry, confirmation and reason is now required. Revoked installations cannot be revived. The owner explicitly authorised three weeks; the two existing devices and independent Ad Skip pilot now expire **9 December 2026, 15:48:29 UTC**. Preferences were preserved. The paid-testing mode and its larger historical allowances were not activated.
5. **The quality report could confuse candidate metrics with release evidence.** A separate release-gate evaluator now requires independently reviewed, complete held-out episodes, exact source binding and accepted intervals. It rejects development/held-out source overlap and predictions derived from their human test labels. It reports missing evidence and confidence intervals without enabling any feature.

The existing player, rights decisions, lease checks, emergency suspension, feedback and Undo remain authoritative. No new rights framework or parallel Ad Skip pipeline was created.

## Progressive audio and safety

Existing progression is retained: fast opening analysis; up to three-minute windows advancing by one minute with overlap; packet-based global timing; byte-chain verification; global source-job deduplication; on-play/open/follow priorities; and active-session attachment. No timestamp is estimated proportionally from MP3 byte position.

Current deployed code was exercised against the preserved real LINUX Unplugged 690 variant using the AWS private object. The opening and three following windows were acquired, ending at 360 seconds. Their hashes and final byte chain matched the separately prepared local source. Each acquisition stayed within 8 MiB. The isolated test store had no canonical intelligence dependency, no paid calls and no production data mutation. This verifies progression and exact source continuity, **not a real mid-roll skip or four hours of advertisement accuracy**.

Automated tests also cover VBR timeline alignment against decoded PCM, mid/post-roll windows, rejected HTTP Range responses, changed overlapping bytes, unverified delivered identity, expired leases, source switching, manual seek, playback speed, failed seek, duplicate prevention, Undo, restart and budget/capacity guards. A complete break still needs enough commercial and boundary evidence within the analysed coverage. Longer or ambiguous breaks can remain unskipped; they are not declared complete from a fragment.

Evidence: `evals/universal-ad-skip-phase3-aws-windows.json`, `evals/universal-ad-skip-phase3-local-windows.json`.

## Automatic preparation after renewal

Production independently prepared the first three minutes of five authorised Open Source Security episodes: **Project Lightwell**, **Trusting your computing**, **Sovereignty, policy, and OpenUK**, **Open source verification**, and **The curl summer of Bliss**. Each has a persisted exact window hash, transcript segments and an affirmative current ad-detection decision. `READY` here describes the source window, not a verified advert or complete episode analysis.

Five further eligible openings report `BUDGET_LIMIT` with a persisted retry time; listener status says the allowance must reset and playback remains available. Their work was not declared complete. Source-job records retain the existing `FAILED` plus capacity-code convention; this is a capacity wait, not evidence of a technical crash. No spending ceiling was raised. See `evals/universal-ad-skip-phase3-automatic-preparation.json` for actual job states, identities, proofs and acquisition accounting.

## Real audio evaluation

Twelve exact MP3 sources were rehashed; existing human annotations were not changed. The evaluated audio comprises twelve opening windows plus three later windows: **44.7 minutes (0.745 hours)**, not twelve fully reviewed episodes. There are two shows from one publisher. Five opening proposals passed automated acoustic verification; only one has an independent human boundary annotation.

| Episode | Opening candidates | Complete opening result | Independent accuracy evidence |
| --- | --- | --- | --- |
| LINUX Unplugged 690 | 5 | Verified 0–90.459 s | Human 0–90.415 s; start error 0 ms, end error +44 ms, 100% break coverage; 44 ms outside annotation |
| LINUX Unplugged 684 | 5 | Not verified | None |
| LINUX Unplugged 675 | 5 | Verified 0–90.476 s | Machine/audio verification only |
| LINUX Unplugged 665 | 5 | Not verified | None |
| LINUX Unplugged 650 | 5 | Verified 0–90.459 s | Machine/audio verification only |
| LINUX Unplugged 635 | 5 | Verified 0–90.583 s | Machine/audio verification only |
| LINUX Unplugged 620 | 5 | Verified 0–60.137 s | Machine/audio verification only |
| LINUX Unplugged 610 | 4 | Not verified | None; voicemail must remain playable |
| LINUX Unplugged 600 | 5 | Not verified | None |
| LINUX Unplugged 598 | 5 | Not verified | None |
| Linux Action News 299 | 0 | Nothing to skip | Not independently reviewed as a complete negative episode |
| Linux Action News 164 | 0 | Nothing to skip | Not independently reviewed as a complete negative episode |

Across these openings: 49 candidates and 10 proposed complete openings. Candidate-analysis P95 was 8.87 ms on this Mac; this excludes acquisition, transcription and acoustic verification. Three later windows produced four candidates, **zero VERIFIED complete mid-roll breaks**. Two were only `VARIANT_MATCHED`; that status did not authorise skipping. These examples cannot establish precision, recall or missed-ad counts for whole episodes.

LUP 690 source SHA-256: `693acd1c1ae733801013ca37bc937501e1e0e73d630daaf5620b36b7f1c4117c`. Human review audit file remains byte-identical, SHA-256 `d739a26bdc398d718a88630f7b27cd3d042d12f3635f3b29e98d2da9125ff7f9`. The live human-reviewed interval remains 0–90.415 s; the independent detector result does not overwrite it.

### External diagnostic, separate from release acceptance

The published [BLAB dataset](https://huggingface.co/datasets/oreva/blab_long_audio) and [authors' paper](https://arxiv.org/abs/2505.03054) provide human-reviewed advertisement text with WhisperX-aligned timestamps. Its evaluation-only data was used for evaluation, not model training. The original JSON was pinned by SHA-256 `6329627fa291e052838f4f3d62a4f10e0b70b6853e4d02a1a8b7e3bb8ceffcf1`.

All 200 transcripts, representing 232.094 transcript hours and 579 annotated advert spans, were run through the unchanged detector. Leading `#` annotation markers were stripped from every word before deterministic speech grouping; neither labels nor marker boundaries were supplied to detection. An initial run with those markers was invalid and was replaced. No detector tuning used this evaluation set.

- 589 candidates; 261/579 labels had any overlapping candidate (**45.08%**).
- Only 42/579 labels had a candidate covering their complete bounds within the diagnostic tolerance (**7.25%**).
- 116 candidates did not overlap any labelled advertisement.
- Zero automatic skip intervals were authorised in this transcript-only test. That is a fail-closed result, **not evidence of safe automatic skipping or zero editorial errors**.
- No original audio hashes, complete source files or independently listened-to 1.5-second boundaries were supplied by this dataset. It cannot satisfy the requested real-audio release gate. No underlying YouTube audio was downloaded or relabelled as independently verified.

This broader diagnostic exposes a substantial generalisation/complete-break limitation. The new reliability fixes do not resolve it. Full release precision, recall, false positives, false negatives and population uncertainty remain **unavailable** without the required exact-audio held-out set.

Current qualifying held-out complete episodes: **0/20**; publishers **0/6**; independent advert/negative labels **0/50 and 0/50**. The twelve historical development examples remain separate. The one existing human opening label remains useful but is not a fully reviewed episode. See `evals/universal-ad-skip-phase3-release-gates.json` and `evals/universal-ad-skip-phase3-external-benchmark.json`.

## Live automatic execution

The actual preserved publisher bytes were hashed, checked through live private delivery range verification, played in Chromium and driven by the shared native seek/Undo adapter with authenticated AWS leases. Both variants rejected a deliberately incorrect hash.

| Live case | Seek destination | Actual origin and Undo destination | Automatic / Undo seeks | Other evidence |
| --- | --- | --- | --- | --- |
| LUP 690, independent human-reviewed break | 90,415 ms | 239.158 ms → 239.158 ms | 1 / 1 | Playback advanced afterwards; 1.5× preserved; paused state preserved on Undo; seek confirmation 4.3 ms |
| LUP 635, automated acoustic approval | 90,583 ms | 28.223 ms → 28.223 ms | 1 / 1 | Playback advanced afterwards; 1.5× preserved; seek confirmation 4.4 ms; no human accuracy claim |

The second case proves routine machine/audio approval can execute without an owner reviewing each break. It does not establish independent correctness. Temporary one-hour QA enrolment was revoked immediately after tests; original two-tester membership and three-week expiry were restored. No existing invitation was consumed.

Evidence: `evals/universal-ad-skip-phase3-live-reviewed.json`, `evals/universal-ad-skip-phase3-live-automatic.json`, `evals/universal-ad-skip-phase3-qa-cleanup.json`.

## Named acceptance catalogue

Current canonical episode IDs remain pinned to Phase 1. The live API still reports `LEGAL_BASIS_NOT_ESTABLISHED` for each. This is an unresolved affirmative processing basis, **not an invented publisher prohibition**. No new assessment framework or permission was manufactured.

| Podcast / episode | Canonical episode ID | Current result | Detection / skip / Undo |
| --- | --- | --- | --- |
| Danny Jones #443 | `95765502-d155-11f1-b17a-bb47d8c507da` | UNAVAILABLE — legal basis not established | BLOCKED; no success claimed |
| Danny Jones #442 | `db8f0462-ce08-11f1-8abf-af529c8252cb` | Same | BLOCKED |
| Danny Jones #441 | `9ed45572-cbd8-11f1-af09-e3a39c6e3b27` | Same | BLOCKED |
| Joe Rogan #2572 | `a7f8279c-d37a-11f1-a462-fb1f7204087b` | Same | BLOCKED |
| Joe Rogan #2571 | `2261e0d2-d2fd-11f1-88f9-877628146802` | Same | BLOCKED |
| Joe Rogan #2570 | `ec46995e-ce9a-11f1-9c7e-fbbdba278d52` | Same | BLOCKED |

No Linux result is substituted for these six outcomes. Detailed current decisions are in `evals/universal-ad-skip-phase3-live.json`.

## Validation and native release

- **AUTOMATED TESTED:** full `npm test` passed, including existing recovery, budget, rights, player, progressive proof and skip/Undo suites. Subsequent acquisition retry wiring passed targeted verification/progressive/bounded/universal tests. New three-week expiry, revocation, protected session, CSRF and stale-version tests pass.
- **AUTOMATED TESTED:** native TypeScript; Expo Doctor 21/21; Swift delivered-prefix/chain tests; native sleep deterministic cases.
- **DESKTOP NATIVE VERIFIED:** muted macOS AVPlayer sleep test paused after 2,032.48 ms for a 2,000 ms deadline, 20.64 ms recorded scheduling drift, 49 fade samples, original volume restored. This is not an iPhone background test.
- **PRODUCTION VERIFIED:** authenticated intelligence retrieval, chapters/topics, search/moments, catalogue, anonymous/admin separation, source mismatch denial, standard budgets, two actual seeks/Undos and deployed bounded window verification.
- The first live API assertion encountered a previously uncached two-token search embedding ($0.00000004); it was not reported as a zero-cost pass. The subsequent cached run passed with no new paid calls.
- A later optional status refresh hit the existing administrator-login rate limit (HTTP 429); it was not bypassed. Earlier successful authenticated checks remain the recorded evidence. The final public HTTPS health check still returned `backend: ready`.
- Scoped/staged `git diff --check` passed. Pre-existing whitespace in the user's uncommitted acceptance document was preserved.
- **NATIVE BUILD VERIFIED:** one EAS iOS build, **1.0.0 (18)**, ID `23bc24eb-8628-4620-a60d-b5fab554b242`, source `ace3428`, completed. Expo dependencies were aligned to required SDK patch versions. It includes native delivered-audio and late-attachment/Undo guards absent from build 17.
- Downloaded IPA: SHA-256 `73f32ae0f624a8641168f13ea163dd68f39f2bbee94ae995059e01e29b75af84`; bundle `app.radiostar.ios`; signing team `69F2T3M9C4`; minimum iOS 16.4; background audio mode enabled. Signature verification passed after removing local extraction metadata from the inspection copy; the submitted IPA was untouched.
- Artifact checks also confirmed the production HTTPS URL, delivered-chain protocol and compiled Swift prefix/chain components; the shared gateway, administrator and temporary tester credentials were absent from both executable and JS bundle.
- Build used November's free quota (0/15 iOS builds used before submission); **$0 build cost**, no subscription upgrade.
- **DEVICE VERIFICATION BLOCKED:** no physical iPhone attached; command-line Xcode device tooling is unavailable. Lock-screen/background seek, headphones, interruptions and lifecycle acceptance have not been newly verified. Existing prior user intelligence checks do not establish these Ad Skip behaviours.
- **APPLE ACCESS BLOCKED:** App Store Connect returned HTTP 403 `FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED`. The owner has been asked to accept the pending agreement. Internal submission ID `3f37a1be-ba01-4671-a01a-ec0a2aaaf222` was `IN_QUEUE` at 16:06 UTC; it is not yet an Apple-confirmed upload. Actual status is recorded in the submission evidence. No TestFlight availability or public release is claimed without Apple evidence.

## Spending and limits

Standard AI controls remain $5/day, $25/month, 10,800 new audio seconds/day and 14,400 seconds per episode. No private Translate allowance, billing or public automatic-skip gate was changed.

After the expressly authorised pilot renewal, background preparation processed five three-minute eligible audio openings: **900 seconds, $0.09 actual provider cost**. The cold search embedding added **$0.00000004**. At the recorded snapshot the day/month total was **$1.29075580**, 10,747 new audio seconds, and zero reservations. Only 53 daily audio seconds remained; further work must wait for capacity. This is not an increased allowance. Actual new transcription rate was $0.36/audio hour. Local cached corpus detection/acoustic evaluation and AWS cache-based playback/window checks made no paid provider requests.

Acoustic analysis/fingerprinting use existing CPU capacity; no separate per-episode AWS CPU billing is available. The recorded automatic-preparation batch acquired 83,886,080 bytes (ten bounded requests, including five subsequent capacity refusals); further preparation retained its retry state. Network acquisition is measured in the persisted acquisition ledger; live range identity checks used 196,608 witness bytes per source. No claimed global cache-hit rate is inferred from two reuse tests.

AWS Cost Explorer reported **$12.1615608664** for this dedicated account for November 1–18, excluding credits/refunds, with estimated/delayed records. This is account-wide spending, not the incremental deployment charge. No new recurring AWS resource was created. Detailed service totals are in `evals/universal-ad-skip-phase3-aws-costs.json`.

## Exact Phase 4 acceptance still required

1. Accept Apple's pending account agreement, confirm upload/processing and existing internal-group availability, then install build 18 on a physical iPhone. Do not create a duplicate build merely to retry submission.
2. On the enrolled iPhone, enable Ad Skip, play the preserved reviewed LUP 690 variant from its opening, observe the single seek to 1:30.415, playback continuation and Undo. Repeat with the automated LUP 635 variant (1:30.583). Record device/OS/build, delivered variant, actual seek/Undo timestamps and telemetry.
3. Exercise locked screen/background playback, headphone controls, 1.5× speed, manual seek, episode switch, network loss/recovery, late interval attachment, app restoration and AI Sleep. A missed deadline must leave playback running rather than skip backwards. Capture actual outcomes, not checkbox assumptions.
4. Build/obtain the missing exact-audio independently reviewed held-out set: at least 20 complete episodes, six publishers, 50 advert and 50 challenging editorial segments, including real mid/post-roll, consecutive, dynamic and long-form breaks. Routine private processing does not require owner review; independent **release evaluation** cannot be invented or replaced by candidate approvals.
5. Improve complete-break generalisation against development examples, then meet the held-out thresholds: zero observed editorial skips, ≥90% complete recall and ≥95% accepted boundaries within 1.5 s. The current external diagnostic is substantially below those targets.
6. Obtain a valid authoritative processing decision for each named Danny Jones/JRE episode, then run its real detection → exact playback identity → seek → Undo path. Preserve precise unresolved dependencies until then.
7. Retain the emergency kill switch, expiry, mismatch rejection, logs, rollback and current budgets. Public rollout still needs Phase 4 approval and successful acceptance evidence.
