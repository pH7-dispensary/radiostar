# Recovery Batch 6 — Ad Skip and playback reliability

**PARTIALLY VERIFIED. Backend deployed; native changes validated locally. Real-world accuracy and physical-iPhone acceptance remain blocked by missing independent labels and device evidence. This is not a public Ad Skip release.**

Repository `/Users/oska/Documents/star-cast`, branch `work`; starting commit `193a156`. Implementation commits `b1e4bf0` and `212292a`. Dedicated AWS account **208096650030**, region **eu-west-2**, profile `radiostar` verified through STS. No pH7 resources, credentials, rights grants, budgets or pilot membership changed. No TestFlight build.

## Current production baseline

Snapshot taken **2026-10-26 18:51 UTC**, before changes. These are separate denominators:

| Evidence | Baseline | Final |
|---|---:|---:|
| Episodes with persisted candidate analysis | 11 | 11 |
| Episodes with candidate intervals | 2 | 2 |
| Current candidate/interval records | 6 | 6 active; 7 historically stored |
| Verified intervals | 2 | 2 |
| Episodes with verified interval evidence | 2 | 2 |
| Recorded seek attempts | 2, both real-podcast | unchanged |
| Confirmed seeks | 2 real + 1 owned fixture | unchanged |
| Confirmed Undo events | 2 real + 1 owned fixture | unchanged |
| Incorrect-skip reports | 0 | 0 |
| Missed-ad reports | 1 | 1 |

One episode is the owned synthetic fixture; the real episode is Linux Action News 164. Its sole verified range remains **716186–720541 ms: 4.355 seconds**, hash `d6faaeb5e1366f04a72507f140eb417e008389ad589e48001ca852454769bcd4`. This is a fragment, not evidence of a complete advert break. The older owned client recorded confirmation without a separate attempt event; do not divide confirmations by attempt counts to infer success rates.

Two episodes with verified evidence does **not** mean two episodes skip for every listener. The existing private pilot, listener preference, rights, categories, audio identity and current lease still decide eligibility. The existing QA listener is outside the Ad Skip pilot; the live API correctly refused its lease. Public automatic skipping remains disabled.

## Implemented

- Candidate analysis remains independent of Brief/Chapter completion. Adjacent independently qualifying commercial transcript spans can form a larger **candidate** with all original segment references. Unexplained gaps, intervening editorial speech and explicit non-sponsorship/return-to-discussion cues prevent expansion. No new model or player.
- Contained overlapping evidence does not create another break or trigger another download. Live validation exposed one redundant composite from the initial deployment; the corrected release preserves that historical record but excludes it from the current analysis. The real API now returns five active intervals, plus one for the owned fixture.
- Grouped breaks still require the existing independent acoustic boundary verifier and exact variant. A disputed or rejected overlapping member vetoes execution of the larger break. No thresholds relaxed and no transcript-only promotion.
- **RT18 native fix:** Play no longer awaits `verifiedPlaybackCopy`. It selects a short-lived cached verified source synchronously when available, starts the existing audio engine, then launches optional proof independently. Opening the episode also prepares proof. Resume does not reload solely because proof is absent. Failed cached loads invalidate that cache entry.
- Proof cache is bounded, memory-only, privacy-revision scoped and expires after 60 seconds. Existing large-source bounded range proof, strong `If-Match`, hostile-response checks and the 32-MiB exact-file fallback remain. Failed matching never authorises timestamps for another variant.
- **Safety limit:** a proof completed after an unverified publisher stream starts is cached for a later deliberate load. It cannot authenticate bytes already loaded by that stream. No silent source swap or interruption is introduced. First-listen matching therefore depends on proof being ready before that load.
- Existing ten-second authorisations can be prefetched at most five audio seconds before a break. Runtime aims for two wall-clock seconds of lead at the selected speed; attempts are bounded. It rechecks actual engine position, source, preferences, manual-navigation generation and lease validity before seeking.
- A 100-ms check runs **only in the small Ad Skip runtime near a known break**, without increasing global player/UI updates. Delayed timers, expired leases and passed intervals fail closed; no rewind to chase a missed advert.
- Seek confirmation tolerates bounded native status propagation (up to 1.5 seconds), cancels on navigation and requires observed engine position within 350 ms. Success receipts include the actual pre-seek origin and observed skipped duration.
- Undo restores that origin, suppresses immediate re-skipping, coalesces simultaneous taps, preserves speed/pause state, and performs the local seek before network telemetry. Telemetry can fail during an outage; this does not delay the recovery seek.
- Admin → Ad Skip now exposes protected audio identity, grouped candidates, unioned verified duration, separately unavailable complete-break coverage, incorrect/missed reports, actual recorded skipped duration and new analysis/verification timings. Historical missing measurements remain unknown.
- Real-world evaluation now requires independent label provenance, reviewer/date/reference, exact audio SHA-256, both boundaries and unique label identity. The CLI streams and hashes the actual supplied files. Duplicate labels and changed audio are refused. It reports start/end error, recall and labelled-break coverage separately. These declarations still need genuine reviewer evidence; a schema cannot prove an annotator's independence.

## Verification and measurements

Existing owned file: `fixtures/ad-skip-owned-v1.mp3`, **400865 bytes**, SHA-256 `bda9d3b7c25e88ee8b4c010cf81826a779e888d2c67ddc7fc81c8ed77eff9d44`.

Its authored advert spans 15000–35000 ms. Actual FFmpeg boundary checks retained **15200–34500 ms**, a conservative **19.3 seconds**: start error 200 ms, end error 500 ms and 96.5% coverage of this synthetic label. These are authored-fixture measurements, **not independently labelled real-podcast accuracy**.

An isolated authenticated backend plus Chromium's actual media element exercised detection → audio verification → variant match → preference → prefetched lease → confirmed seek → Undo using the shared native execution adapter. It skipped **19295.861 ms**, restored **15204.139 ms**, preserved paused state and 1.5× speed, and performed one recovery seek for two simultaneous Undo calls. No production playback receipts were inserted.

| Measurement | Result and limits |
|---|---|
| Local candidate analysis | 13.39 ms, one small fixture run |
| Local audio boundary verification | 171.92 ms, one cached owned-file run |
| Peak Node test-process RSS | 77,725,696 bytes; excludes FFmpeg child and native app |
| Large-source range regression | 250-MB simulated source verified with 65,536 response bytes; no full buffering |
| Browser play-promise resolution | 0.5 ms after metadata/audio preparation; **not first audible playback latency** |
| Optional proof on startup, before | Awaited lookup/proof; two-second lookup timeout, twelve-second overall abort budget; no measured iPhone baseline |
| Optional proof on startup, after | No awaited proof before `player.play()`; audible iPhone improvement remains unmeasured |
| Paid processing | **$0 added**; no new provider or transcription calls |
| Cache reuse | Repeated unchanged analysis and prepared source reuse tested; no population-wide cache hit rate inferred |

The production ledger remained **121 usage entries, $1.58869080, zero reservations**. All 18 canonical transcripts remain. Normal and private testing limits were preserved, including the existing higher private testing allowance; none was renewed or increased. Pilot expiry remains **2026-10-27T21:53:27.023Z**. No new AWS infrastructure was created. Marginal EC2 CPU, S3 and HTTPS request costs were not separately metered; $0 AI usage is not a claim of zero AWS billing.

Tests passed: full `npm test` and posttest suite; final targeted Ad Skip verification/recovery/pilot/phase-4/Batch-6 tests; native player UX checks; native TypeScript; iOS Expo export; `git diff --check`. Desktop and 390-pixel admin browser checks cover authentication, diagnostics, long hashes, horizontal table access, overflow and console errors. The existing smoke test was updated for current recovery login and navigation.

Coverage includes adjacent commercial spans, editorial exclusions, mismatched bytes/changed delivery, redirects, unsupported preconditions/ranges, >32-MiB sources, oversized responses, overlapping disputes, a 200-ms interval, expired leases, navigation/pause/source cancellation, playback speeds, failed seek confirmation, repeated Undo, kill switch, cache reuse and existing rights/budget tests with mocked paid providers. **Physical background/lock-screen scheduling, interruptions, battery, memory and audible startup are not verified.**

Evidence: [fixture measurements](../evals/recovery-batch6-results.json), [browser playback](../evals/recovery-batch6-playback.json), [production comparison](../evals/recovery-batch6-production.json). Reproduce with `node test-recovery-batch6.mjs`, `node scripts/verify-recovery-batch6-playback.mjs` (existing Playwright module required), and `node scripts/verify-recovery-batch6-live.mjs` (ignored local verification credentials required).

## Deployment and rollback

Final backend release **`3bb3d055225ebf4998cf30700760fd10721f62b6cd145518aff952b067215379`**, deployed **2026-10-26T19:09:23.037Z**. [Public HTTPS health](https://d3ri12f40b85i3.cloudfront.net/api/health) returned ready. STS, SSM, FFmpeg/FFprobe, database integrity, worker heartbeat and SQS/DLQ checks passed; both queues had zero visible/in-flight messages. About **25.686 GB** decimal disk space remains.

Pre-deployment backup: `/var/lib/starcast/pre-command-centre-1793041098255.sqlite`, integrity `ok`. Previous releases are retained under existing two-release retention; the pre-batch release **`b9eb8af6b36968cb30da5b5d4909a4275105e55a955f35e15da89f3eaf290913`** is retained for rollback. No destructive migrations. Current intervals are an additive projection; historical restrictions, disputes and records remain.

Live authentication and pilot isolation passed. The owned audio hash and verified interval match the existing cache. Existing intelligence returns **PARTIAL_READY** under Batch 5's grounding checks; it was not relabelled fully ready. Native changes are committed and locally exportable, **not installed through a new TestFlight release**.

## Remaining acceptance work

- **BLOCKED — independently labelled real audio:** no hash-bound independently reviewed multi-category corpus was available in the repository or supplied during this batch. Historical Linux Action News labels remain unsuitable for current-variant accuracy. Public-source research did not produce a usable replacement; for example, [Adetector's authors explicitly exclude their proprietary positive advert audio](https://github.com/ohadmich/Adetector). No labels, permission grants or precision statistics were invented.
- **PARTIALLY VERIFIED — complete breaks:** conservative grouping and acoustic checks work on owned fixtures. The real production range remains a fragment. Host reads with intervening weak commercial language, multiple real speakers, music transitions, dynamic insertions and geographic variants need independently reviewed audio before broader detection changes or release claims.
- **BLOCKED — iPhone acceptance:** an operator/device run is still needed for actual startup audio, conditional streaming, background/locked playback, speed/manual-seek races, interrupted network and Undo. The new native code has not been installed on a phone. Chromium does not close RT04.
- **NOT ENABLED — public automatic skipping:** existing release thresholds remain: at least 30 labelled episodes, 1000 verified adverts, 99.5% precision, zero conversation/mismatched-variant skips, required boundary performance and complete Undo restoration. This batch does not meet that evidence bar.

RT18's blocking proof await is removed and locally verified. RT02 and the device portion of RT04 remain open. The next acceptance milestone is independent hash-bound annotation followed by a recorded iPhone matrix; no further paid processing, pilot extension or TestFlight build was initiated to manufacture that evidence.
