# Ad Skip recovery — 22 October 2026

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
