# Ad Skip four-hour recovery

29 October 2026 · `/Users/oska/Documents/star-cast` · branch `work`.

**Backend recovery deployed; new native delivery proof prepared. The requested Danny Jones / Joe Rogan skips remain BLOCKED by unresolved processing-basis evidence. No physical-iPhone success is claimed.**

## Implementation and evidence

| Area | Result | Evidence / limit |
| --- | --- | --- |
| Transcript independence | IMPLEMENTED / AUTOMATED TESTED / PRODUCTION RUNTIME VERIFIED | Metadata alone can start the bounded source job. General Brief/Chapters/Search permission or completion is not a prerequisite. The deployed engine verified licensed cached opening evidence in an isolated store with zero canonical intelligence records. |
| Four-hour sources | IMPLEMENTED / AUTOMATED TESTED / PRODUCTION CONFIG VERIFIED | Standard cap is 14,400 seconds. A mocked full pipeline paused after nine chunks at the unchanged three-hour daily allowance, resumed the remaining four chunks and reached READY. Separate SQLite reopen testing confirms durable reuse. No live four-hour paid transcription was run. |
| Bounded acquisition | IMPLEMENTED / AUTOMATED TESTED / PRODUCTION VERIFIED | At most 8 MiB from offset zero; validated HTTP 206, bounded 200 fallback, redirects, unknown length and cancellation. Decode only the acquired file. MP3 packet positions trim the proof to about 181.5 seconds, including VBR and complete low-bitrate files. No duration/byte-ratio approximation. |
| No universal ETag requirement | IMPLEMENTED / AUTOMATED TESTED / NATIVE-ENGINE VERIFIED | Native resource loader hashes bytes actually delivered to the existing AVPlayer item. A separate analysis download is insufficient. Exact prefix, item, source key and generation must match. Missing/weak ETags are tested. Existing strong-ETag and private-source delivery remains compatible. |
| Dynamic variants | IMPLEMENTED / AUTOMATED TESTED | Changed hashes, lengths, source switches, delivery gaps and mismatches fail closed. Prefix bytes already served remain immutable for Undo. Different total lengths alone are not labelled different adverts. |
| Complete advert detection | AUTOMATED TESTED / PRODUCTION VERIFIED | Existing detector and thresholds preserved. All 12 corpus parent hashes verified. 49 advert candidates, 10 complete-opening proposals, five acoustically verified openings. Two negative openings yield zero advert candidates. |
| Late proof attachment | IMPLEMENTED / AUTOMATED TESTED / NATIVE-ENGINE VERIFIED | Polling attaches matching proof to the same active item without replacement or restart. Already-passed breaks are not skipped. Ordinary playback precedes analysis. Unsupported loading falls back to ordinary playback. |
| Automatic seek and Undo | PRODUCTION VERIFIED through shared adapter | Authenticated AWS leases plus real Chromium audio: LUP 690 and LUP 635 each execute exactly one automatic seek and one Undo at 1.5×. Playback continues; paused Undo preserves pause. Wrong fingerprints are rejected. |
| Native execution | PARTIALLY VERIFIED | Real macOS AVPlayer plays the exact LUP 690 source, matches a prefix, seeks to 90.459 seconds and restores 0.200 seconds. This harness tests the native loader/seek mechanics; the separate live test exercises the shared JS automatic adapter and server leases. Neither is a physical iPhone test. |

Source preparation is serial per process, with at most two pending episodes and an atomic SQLite claim across API/worker processes. Source-bound transcripts and paid checkpoints are reused. Unknown provider outcomes cannot be automatically repaid. Technical retries are bounded; budget failures back off. New dynamic opening evidence expires after six hours and must be reacquired. This expiry is not transcript deletion. Rights removal purges the new derived cache. Mandatory restrictions, complaints, disputes, pilot expiry, user preference, execution leases and the kill switch remain enforced.

The full-transcription adapter remains separate: explicitly eligible canonical processing may download a full source, bounded by duration and file size, before producing durable chunks. **The new independent opening path never uses that downloader.** Independent bounded detection currently covers the opening 180 seconds. Existing transcript-backed mid-roll/post-roll detection is preserved; arbitrary remote mid-roll window acquisition is not newly implemented.

## Boundary and playback measurements

The original human annotation remains byte-identical: LUP 690 **0–90,415 ms**, full source SHA-256 `693acd1c1ae733801013ca37bc937501e1e0e73d630daaf5620b36b7f1c4117c`. Review-file digest remains `d739a26bdc398d718a88630f7b27cd3d042d12f3635f3b29e98d2da9125ff7f9`.

Without importing that human label into the detector, bounded audio verification returns **0–90,459 ms**: start error **0 ms**, end overshoot **44 ms**, annotated-break coverage **100%**, audio outside the annotated interval **44 ms**. This is one independently labelled interval, not a corpus-wide precision/recall estimate. A broad real-world false-positive rate remains unavailable.

The acquired 8,388,608 bytes are reduced to a **3,024,699-byte** prefix proof, SHA-256 `60447f5c50149154f17092afc073585fcda30324cc05e6bf2ea8558286012563`. This identifies the exact opening bytes, not the entire 63,683,114-byte episode.

| Live source | Authorisation | Automatic destination | Undo | Other observations |
| --- | --- | --- | --- | --- |
| LUP 690 | Existing human review + audio verification | 90,415 ms | Original observed position, within 350 ms | One automatic seek, one deduplicated Undo, 1.5×, continuing playback |
| LUP 635 | Automatic audio verification; no invented human review | 90,583 ms | Original observed position, within 350 ms | Same live execution checks; no independent boundary-accuracy claim |

The preserved production intervals were not replaced by the new bounded analysis results. Existing installed builds retain their verified private-source path. Native delivered-prefix support requires a new native build; an OTA update or Expo Go refresh cannot add it.

## Priority shows: precise remaining dependency

Fresh AWS catalogue/rights inspection includes Danny Jones **443, 442, 441** and Joe Rogan **2572, 2571, 2570**. All are under four hours, but their scoped `ad-detection` decision is **LEGAL_BASIS_NOT_ESTABLISHED**.

- Danny Jones inherits the 22 October correction of a legacy approval supported only by “i said yes”. There is no documented licence or applicable exception assessment authorising the required processing. The record explicitly does not infer a publisher prohibition.
- Joe Rogan's current RSS evidence contains lawful feed access and a copyright notice, with no qualifying permission or deployment-approved jurisdiction-specific processing basis. A generic copyright notice is not treated as a newly discovered takedown or reservation.

Operational policy is OPEN. Neither channel was newly paused. No publisher permission, independent review, advertisement candidate or successful seek was fabricated. No fresh named-show audio/ASR was acquired. The remaining dependency is documented evidence covering internal audio transcription/retention, advert detection and the relevant listener output—not another UI approval. A matching delivered audio variant would still be required afterward. Geographic mismatches currently fail closed rather than obtaining a licence or inventing matching timestamps.

## Validation and deployment

- `npm test` including the full posttest, cloud, release, rights, queue, budget, playback and native-contract suites: PASS.
- Targeted bounded acquisition, VBR, source-independent processing, real rights separation, cache removal, uncertain-provider retry, opening detection and acoustic verification: PASS.
- Native TypeScript and production iOS JavaScript export: PASS.
- Swift loader and immutable-prefix tests compile and run with macOS AVPlayer; real owned and licensed audio trials: PASS.
- Current enrolled-listener live API verification: authenticated catalogue, cached brief/chapter/topic access, grounded moments/search, unauthorised request denial and unchanged usage: PASS. The fixture remains honestly **PARTIAL_READY**: its summary is a source excerpt because full generated-summary grounding did not pass. This task does not relabel it READY.
- No iOS SDK is installed locally. The Expo module bridge has not been compiled for iPhone in this task. Native changes are prepared for the next TestFlight build; no EAS/TestFlight build or public submission was started.
- Owned changes pass `git diff --check`. Unrelated modified/untracked files remain untouched, including `docs/AI_ACTIVATION_FINAL_ACCEPTANCE.md`.

AWS STS/account guard verified **208096650030**, **eu-west-2**. Existing EC2/SQLite/S3/SQS infrastructure reused; no pH7 resources modified, database migration or production-data deletion. Integrity-checked backups and rollback source are retained. Final release is `96bee5b924b5a78a1e22b937371998825ddbb80d1632e58f332e179243cf830c` (deployment SSM `c3c23b7d-a7b3-4ea8-a5cb-01a0cd73b05d`). HTTPS/API, worker heartbeat and full SQLite integrity pass; 24,663,293,952 bytes are free, with zero queued/inflight/dead-letter messages and zero recorded processing failures in the measured five-minute window. The prior release is retained for rollback. Final SSM identifiers and post-release health are recorded in `evals/ad-skip-four-hour-production.json` and `evals/ad-skip-four-hour-aws-window.json`.

The separate internal Ad Skip pilot was explicitly reactivated for the same **two** enrolled testers until **31 October 2026, 17:59:01 UTC**. Public automatic skipping remains disabled. The expired paid-testing allowance was not renewed.

## Costs and Git

Additional paid AI evaluation cost: **$0**. Live ledger at verification: **$0 today / $2.31619266 this month**, zero reserved requests and zero transcription seconds today. Standard limits remain **$5/day, $25/month and 10,800 transcription seconds/day**; only the source-duration ceiling was deliberately raised to 14,400 seconds. Translation limits and ledger are unchanged.

No additional always-on infrastructure was provisioned. Incremental AWS request/storage/transfer costs are not yet attributed by billing; they are not claimed to be zero.

Implementation commits: `a00e3aa`, `641d779`, `9021824`. Final evidence and this report are committed separately and pushed with them to `origin/work`.

## Evidence index

- `evals/ad-skip-four-hour-corpus.json`: unchanged human-label provenance, all 12 hashes, candidates and measured bounds.
- `evals/ad-skip-four-hour-aws-window.json`: deployed bounded acquisition and canonical-transcript-independent analysis, isolated from production records.
- `evals/ad-skip-four-hour-live-reviewed.json`, `evals/ad-skip-four-hour-live-automatic.json`: live leases, actual seeks, mismatch denial and Undo.
- `evals/ad-skip-delivered-prefix-avplayer.json`, `evals/ad-skip-real-delivered-prefix-avplayer.json`: actual native delivered-byte proof and seek/Undo, explicitly not iPhone evidence.
- `evals/ad-skip-four-hour-live-api.json`, `evals/ad-skip-four-hour-production.json`, `evals/ad-skip-four-hour-queues.json`: authenticated API, honest intelligence quality, AWS/DB/worker/disk/queue health.
- `evals/ad-skip-four-hour-priority-shows.json`, `evals/ad-skip-four-hour-pilot.json`: current named-show blockers and bounded private activation.

**Outstanding:** establish the named-show processing basis; produce and install the next native build; verify actual iPhone late attachment, background playback and Undo. Broad independent Ad Skip accuracy remains unmeasured. These limits prevent declaring the full requested Danny Jones/Joe Rogan activation or public readiness complete.
