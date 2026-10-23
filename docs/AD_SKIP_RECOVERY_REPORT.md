# Ad Skip recovery — Phase 4, 23 October 2026

## Current result: PARTIALLY VERIFIED

Backend/admin changes are deployed. **One real, licensed episode now has one short independently audio-verified span, one confirmed browser-media skip and one successful Undo using the shared native execution adapter and live AWS authorisation. This is not a full-ad skip and not physical-iPhone verification.** Three other strong candidates still lack adequate acoustic boundary evidence; public automatic skipping remains disabled.

Repository `/Users/oska/Documents/star-cast`, branch `work`, starting commit `f76179d`. Implementation commits: `b11900d`, `8da990c`, `c625290`, `f26ce7f`. Unrelated untracked files are preserved. No Phase 5, native build, TestFlight submission, budget increase or pH7 change.

### Implemented and verified repairs

- Shared preparation is independent of the listener who won the processing queue. The existing latest-three workflow and transcript-ready callback remain authoritative; briefs/chapters need not complete first. Cached candidate analysis is reused without repeated writes; no duplicate paid job was created.
- Candidate detection handles split sponsorship/offer language and spoken referral addresses with both an addressed sign-up action and an account offer. A URL, price or ordinary product discussion alone is insufficient. Explicit non-advertising context is rejected. Every candidate retains segment IDs and a decision reason. No vendor-specific or manually labelled timestamps are injected into detection.
- Audio verification keeps the exact transcript/audio content hash, the same −42 dB/120 ms silence criterion and PCM boundary fingerprints. Coarse transcript timing can now be trimmed **inward only**, at most three seconds and at most one-third of the candidate per side. It never extends a candidate. Uncertain spans remain unverified. Verifier upgrades get a bounded reevaluation; unchanged results do not repeatedly download audio.
- Verification has persisted retry counts/cooldowns, a two-attempt bound per input/version, restart recovery, and source/permission checks before and after asynchronous work. Disputed/rejected records are not reinstated. Overlapping verified evidence produces only non-overlapping playback leases.
- **Live security defect found and fixed:** the general `PRIVATE_BETA` flag previously bypassed explicit tester membership when an ordinary beta listener enabled Ad Skip. QA caught this before requesting a lease or performing a seek. Rollout metadata was temporarily contained, then restored after deployment. Every executable lease now requires an active, explicitly enrolled internal tester, independently of generic feature flags. Regression tests enable the ordinary listener's preferences and both PRIVATE_BETA/ENABLED flags; status and authorisation remain denied. Pilot expiry/kill switch remain effective.
- Existing native panels show checking, verification, unavailable, no-advert and ready states, refresh quietly, and discard stale-source results. Admin diagnostics show verification attempts, retry time, confirmed seeks and Undo/failure counts. The existing layout was preserved and checked for accessibility/status clarity rather than redesigned. These native source changes passed exports but are **not distributed in a new iOS build**.

### Real episode, rights and independent evidence

**Linux Action News 164**, Chris Fisher and Wes Payne, Jupiter Broadcasting, 22 November 2020. The [publisher episode page](https://www.jupiterbroadcasting.com/show/linux-action-news/164/) declares its shows [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The audited assessment is episode-only: internal transcription/analysis and advertisement capability. No channel/future grant, public transcript, captions, dubbing, voice cloning or broader display permission was invented. Attribution and ShareAlike obligations are recorded; publisher audio is unchanged and is not redistributed by this evaluation.

[Kev Quirk's independently published 23 November 2020 labels](https://kevquirk.com/has-jupiter-broadcasting-gone-down-the-pan/) identify Linode at 09:00–12:05 and Ting at 20:35–22:35. [Publisher chapter metadata](https://feeds.fireside.fm/linuxactionnews/json/episodes/615c6587-31a8-41a4-9a7c-e3b88b1df894/chapters) corroborates the 725 s and 1355 s returns to editorial topics. **These historical labels are not hash-bound current-variant ground truth.** The current transcript corroborates the commercial content; no production precision/recall is inferred from this single episode.

Identity: feed `https://linuxactionnews.com/rss`, episode `615c6587-31a8-41a4-9a7c-e3b88b1df894`; job `3a17ddf8-f61b-42a5-a86e-c911b3f33c54`. Measured audio length 1,806,969 ms, 22,046,309 bytes. Current source SHA-256 `d6faaeb5e1366f04a72507f140eb417e008389ad589e48001ca852454769bcd4` matches the transcription source and the bytes actually played.

At **13:37:58 UTC**, verified interval `f6ae5c5e5e76acbddec74caf6f9edbe060896d4c90e7bdca2b9cbd433165dba9` covered **716,186–720,541 ms (11:56.186–12:00.541)**: only 4.355 seconds within the Linode offer, not the whole 185-second break. Playback entered at 716,191.366 ms; after authorisation, the confirmed seek reached 720,541 ms, skipping **4,016.837 ms** from the then-current position. Playback continued at 1.5×. Undo restored exactly 716,191.366 ms and playback continued at 1.5×. Requested, attempted, confirmed, Undo-requested and Undo-confirmed events are persisted. These remain client-confirmed telemetry, not independent safety certification.

Reproduction: `RADIOSTAR_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/verify-real-ad-skip.mjs --play fixtures/linux-action-news-164-evaluation.json`. Requires the existing ignored cloud/admin connection files and already-authorised, verified content. It does not start AI processing or approve rights. It creates/revokes its own temporary QA installation, restores tester membership and leaves the user's invitation untouched. Each invocation intentionally records another real test seek; do not treat repeats as distinct accuracy samples.

### Phase 4 measurements

| Requested measure | Evidence |
|---|---|
| Episodes analysed | 1 new real episode; 10 persisted episode analyses total (including the existing owned fixture). |
| Candidates generated | 5 new records: 4 strong commercial spans across the two labelled breaks, plus 1 low-confidence self-promotion cue. |
| Verified advert intervals | 1 new real interval; 2 total including the previous owned fixture. Three strong real candidates remain VARIANT_MATCHED, not VERIFIED. |
| Episodes with usable Ad Skip | 1 real episode with a **partial** span; previous controlled fixture remains available. |
| Automatic seeks attempted | 1 real test seek, confirmed by media events and persisted stage telemetry. |
| Automatic seeks confirmed | 1 new real seek; 2 cumulative including the old fixture. No failed real seek in this run. |
| Undo | 1/1 real test restored the exact requested position and retained speed/playback; 2 cumulative including the fixture. |
| Accuracy | Not production-measured. Candidate spans overlap both historical ad regions, but only 4.355 s is verified; most ad duration is not skipped. No validated precision, recall, boundary-error distribution or general false-positive rate. |
| Audio variants | Current full-file SHA matched. Deliberately wrong hash denied. The real CDN ignored the deliberately wrong If-Match precondition: one range-proof rejection, safely falling back to an exact 22 MB local copy. No mismatched-source skip. |
| Technical blockers | Three uncertain boundaries; no whole-break detection/verification proof; CDN conditional streaming unsupported; large sources on such CDNs cannot use the 32 MiB fallback. Physical iPhone/AVPlayer/background/interruption verification outstanding. |
| Recorded processing cost | **$0.186903**: $0.180800 Whisper (1,808 billed seconds including overlap/rounding) + $0.006103 text. Exactly one job, two audio chunks, one text request; no retranscription for detection/verifier iterations. |
| AWS deployment | Account 208096650030, eu-west-2; existing EC2/SQS/S3 reused. Final release `3974c28544fd565d5c4c9f8e749022388ccda51f705586d713a1de19546d36ed`, deployed 13:37:02 UTC. |
| Git | Four implementation commits listed above; reproducible QA and this report committed separately on `work`. |
| Physical device | **NOT VERIFIED.** Real Chromium media playback + shared native adapter is not native AVPlayer/iPhone testing. No new native build or TestFlight upload. |

### Final validation and operational state

Full `npm test` passes after the security repair; targeted detection/audio/pilot/recovery/latest-three tests, native TypeScript, Expo web and iOS Hermes exports, JavaScript syntax checks and `git diff --check` pass. Mock-paid-provider tests cover hostile/oversized range responses, synthetic 250 MB range proof, source changes, stale leases, disputes, bounded retries, speed/Undo and cache reuse. Browser native checks cover 320/375/390/430 px, light/dark, reduced motion, network states and automatic status refresh. Authenticated live admin checks pass at 1440/768/375 px with no page errors or page-wide overflow, and show the actual real-episode seek/Undo. Unauthenticated admin access returns 403.

SQLite backup `/var/lib/starcast/pre-adskip-phase4-20261023.sqlite` and the final production database both pass integrity checks. About 24 GiB free; no schema migration. HTTPS, worker, SQS and DLQ are healthy; queue counts zero. Idle-guarded restart preserves jobs, verified intervals and expenditure without duplicate processing. The existing operations dashboard still marks unqueried CloudWatch/S3 freshness UNKNOWN; this is not described as fully measured green infrastructure.

Ledger: **$0.998569 today / $1.562445 month-to-date**, 9,578 transcription seconds today, 41 usage records, zero reservations. Standard $5/day, $25/month, three audio hours/day and two-hour source limits unchanged. Existing temporary caps and **2026-10-27T21:53:27.023Z** expiry unchanged; primary tester only after QA cleanup. Translate's independent ledger/access untouched. No new recurring infrastructure; incremental AWS requests/storage/delivery charges are not separately billed yet, so no zero-cost claim.

Terraform final plan has no drift; only release objects and their attribution tags changed. Two local rollback source releases and S3 rollback archives remain available. Bounded retention removed only superseded source directories `previous-1792759412`, `previous-1792760182`, `previous-1792761507`, and `previous-1792762014`, recoverable from their S3 archives. Database, credentials and diagnostic logs were preserved. **Rollback to an older release must retain the temporary zero-percent general Ad Skip flag until the strict tester gate is reapplied**, because earlier code contains the membership bypass.

Phase 4 remains **PARTIALLY VERIFIED**, not complete: next acceptance evidence must establish broader independently labelled current-audio boundaries and confirm actual iPhone/background seek/Undo. Do not lift public safety gates on the strength of this narrow result.

---

## Historical baseline — 22 October 2026

## Executive result

**PARTIALLY VERIFIED.** Backend repairs deployed; native build 11 is signed. The internal tester remains enabled and public automatic skipping remains disabled. **No real-podcast advertisement skip has been demonstrated.** Rights and exact-audio alignment, not an activation button, remain the principal blockers. Do not interpret the owned fixture as real-podcast accuracy.

Repository `/Users/oska/Documents/star-cast`, branch `work`; starting HEAD `fd04628`. Implementation commits: `831cda0` and `357d2ac`. Unrelated untracked files were preserved.

## Production evidence and decision path

The read-only baseline at 20:36 UTC contained 16 intelligence jobs, 13 transcripts (11 real, two fixtures), 12 encounters and 24 distinct episode identities across jobs/encounters. There was one persisted candidate/verified interval, one confirmed skip and one Undo, **all belonging to the owned fixture**. There was one missed-ad listener report, not independent proof of an advertisement. No failure-stage telemetry existed.

Actual path: encounter/explicit inspection → independent processing and ad-detection rights → canonical transcript → candidate inspection → authorised audio verification → exact transcript/audio binding → acoustic boundary evidence → current display permission → enrolled tester + preferences → matching played variant → category/safety/dispute checks → position inside interval → fresh server lease → seek → observed destination → receipt. Undo restores the pre-skip position. Missing evidence at any gate fails closed.

The deployed diagnostics enumerate all 24 identities. After two authorised cache inspections: 14 `LEGAL_BASIS_NOT_ESTABLISHED`, three `PUBLISHER_RESTRICTION`, one `DURATION_LIMIT`, three `NOT_ANALYSED`, two `NO_ADVERTS_DETECTED` and one fixture `SUCCESSFULLY_SKIPPED`. These are primary blockers, not mutually exclusive root causes. Old missing telemetry is explicitly unknown.

## Five largest evidenced bottlenecks

Ranked by observed coverage and practical recovery; no invented numeric recoverability score:

| Rank | Evidence / affected scope | Repair or exact remaining dependency |
|---|---|---|
| 1 | 17 of 24 identities fail the current rights decision: 14 lack an established basis, three JRE identities have recorded restrictions. Danny, Lex and Julian remain unapproved. | Preserve restrictions and show the actual decision. A valid scoped basis is needed; no permissions fabricated or expanded. |
| 2 | All 11 real cached transcripts lack `audioContentHash`. Four Python Bytes transcripts contain sponsor cues. | New audio transcription retains the binding and passes its existing downloaded source to verification before cleanup. Legacy publisher timestamps still require independent alignment; do not stamp a URL hash onto them. |
| 3 | None of the 11 real transcript-bearing jobs had persisted Ad Skip evidence. Inspection was attached to completed intelligence; two jobs had failed. Legacy jobs lacked tester context. | Inspect when the transcript is ready and on eligible cached encounters. Pass only server-validated tester context. Failed summaries no longer imply perpetual analysis or prevent authorised transcript detection. Persist actual zero-candidate inspections. |
| 4 | Python Bytes #497 contains a sponsor read spanning many transcript segments; the previous three-segment window and limited CTA expression miss its combined evidence. | Bounded 120-second/32-segment assembly and commercial sign-up language, preserving source IDs. Still only candidates; no promotion from model confidence. Real verification remains blocked by rights/alignment. |
| 5 | Every native pilot playback used a complete-file download, 32 MiB cap and whole-buffer hash. Seek failures were swallowed and consumed the interval permanently; initial/background position jumps caused false manual-seek suppression. Actual affected playback count is unrecorded. | Bounded range witnesses with strong `If-Match`, one bounded retry, stale-position rejection, explicit manual-seek revision, foreground refresh and staged telemetry. The device must install build 11. |

## Implemented safeguards and limitations

- Verification reuses the transcription source where available; no second download or paid model call. A missing ETag no longer blocks an otherwise exact-file SHA-256 match.
- Conditional streaming checks a deliberately incorrect precondition returns 412, then verifies exact 206 ranges, ETag, length, byte hashes and unchanged destination. Each witness is at most 64 KiB, at most 17 witnesses. The existing Expo player receives the same `If-Match` header. No new audio engine, proxy or infrastructure.
- **The 32 MiB restriction remains only on the legacy whole-file fallback.** Large sources work through conditional ranges when supported. Sources ignoring preconditions, missing bindings, unsupported witnesses or changed variants remain unavailable for automatic skipping. Server-side initial acquisition may still require the full source.
- New native reports distinguish requested, attempted, failed, confirmed and Undo stages. A seek command alone never increments success. Receipts remain client-reported, not independent accuracy evidence. Reports are authenticated, bounded and deduplicated; arbitrary failure text is not stored.
- Admin → Ad Skip → Diagnostics uses actual persisted records and timelines, null candidate counts before analysis, exact blocker codes and next actions. Cached episode titles and the active internal-pilot status are recovered correctly. Public release remains off.

## Verification

**VERIFIED:** `npm test` (including recovery tests), TypeScript, iOS Hermes export, targeted admin/pilot/range tests, `git diff --check`, desktop/mobile browser login/rendering/overflow/console checks. A pre-existing fixed-delay processing test was made deterministic with an explicit provider gate.

**VERIFIED:** synthetic 250 MB source proof transfers only 64 KiB; ignored preconditions, oversized responses, wrong hashes and stale authorisations are rejected. Adapter seek/Undo tested at 1×, 1.5× and 2×. Prepared-audio reuse avoids re-download and preserves caller cleanup. Kill switch, ordinary-listener isolation, disputes and mismatched audio remain covered.

**VERIFIED live:** HTTPS conditional proof against the owned fixture: four requests, three witnesses, 196,608 bytes. Two real authorised episodes—Open Source Security “Forking…” and Research Culture Uncovered episode 172—reuse cache and persist completed detection with zero candidates and no new AI usage. This is transcript detection, not independently labelled ad-free audio.

**BLOCKED:** real-ad precision, recall, boundary error and conversation-clipping measurements. No independently labelled, authorised real-ad evaluation set was established. [Python Bytes #497](https://pythonbytes.fm/episodes/show/497/faster-than-light-profiling) supplies genuine sponsor evidence; its [AI integration page](https://pythonbytes.fm/ai-integration) supports AI transcript access but does not establish exact delivered-audio alignment or blanket audio-verification rights. No new paid processing was initiated to bypass this gap.

**BLOCKED on device verification:** background scheduling, pause/resume inside advertisements, network interruption and AVPlayer conditional-header behaviour on a physical iPhone. Browser/adapter tests are not substitutes. Build 11 must be installed and tested before claiming these work on-device.

## Pilot, cost and deployment

Existing primary tester only; Ad Skip and advert/intro/title/preview preferences enabled, outro disabled. Configuration remains version 4, expiry **27 October 2026 21:53:27 UTC**. Temporary caps remain **$25/day, $125/month, 15 audio hours/day, four-hour sources**; normal and Translate ledgers unchanged.

AI ledger before/after: **20 usage records, $0.563876 total, zero reservations; $0 new AI expenditure**. No new recurring infrastructure. Latest earlier same-day AWS measurement was estimated $5.453964 for October 1–22, excluding credits/refunds; this task did not retrieve a newer Cost Explorer figure.

STS verified account **208096650030**, region **eu-west-2**. Final backend artifact: `6a0d234eb765c4a4c4ef08bf68170a24c683b3d6e8cd46150caec607ad537e80`. API/worker/database/SQS/DLQ checked; SQLite integrity is `ok`. Admin/listener requests without credentials are rejected. The aggregate operations status retains UNKNOWN for monitoring sources it does not query, rather than pretending every component is measured.

Previous release objects were replaced only after copying them under `releases/rollback/`; S3 versioning and the previous EC2 source remain available. No listener data, rights records or audit history was deleted. pH7 infrastructure was untouched.

Build **11**: `4e7f019c-26ff-4e92-9d8e-8b4da2edc9e7`, EAS FINISHED, IPA signature verified with `codesign --verify --deep --strict`, bundle version 11. It includes the native changes from `831cda0`; the later commit is backend/admin only. No public App Store review requested.

TestFlight submission `a303b90d-61b3-4f7f-b901-da8332215d51` was scheduled successfully. Upload/Apple processing and installation are not yet verified; scheduling is not TestFlight availability.

## Remaining actions

1. Establish scoped permission for an ad-bearing evaluation episode and independently label its actual delivered audio. Retain explicit reservations and third-party rights. A public URL alone is insufficient.
2. Verify transcript/audio alignment and real boundaries, then exercise automatic seek and Undo on that exact variant.
3. Install build 11 when available in TestFlight; test normal/background playback, speeds, manual seeking, resume and interruption. Do not describe build 10 as containing these fixes.

Until these are evidenced, real-world Ad Skip activation is **PARTIALLY VERIFIED**, not complete.
