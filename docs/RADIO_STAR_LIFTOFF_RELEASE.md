# Radio Star — Operation Liftoff

Release verification: 29 October 2026. Repository `pH7-dispensary/radiostar`, branch `work`.

The signed iOS release includes the four-hour and delivered-audio Ad Skip changes. Real automatic seeks and Undo have been verified against AWS using exact publisher audio. Physical-iPhone acceptance remains outstanding. Danny Jones and Joe Rogan have specific recorded evidence gaps; neither is represented as an established publisher prohibition.

## Release and source

- Native source: `5dee7ec7b9920375a9680f031702fb6940067c71`. EAS incremented the build number from 15 to **1.0.0 (16)**; recorded in `d470671`.
- Build: [`dcb5dbe1-429b-4aa1-827d-54ee4dcc8a77`](https://expo.dev/accounts/radiostar/projects/star-cast/builds/dcb5dbe1-429b-4aa1-827d-54ee4dcc8a77), **BUILD COMPLETE**. One new IPA, existing Apple credentials, no new certificate.
- IPA SHA-256: `3f0ae2a8495399e4d6fb6eec1b78f21649c4f8bc6d27204ce1b846560230e9a9`.
- Submission: [`b1c0e887-dc06-4249-a136-13354ee70376`](https://expo.dev/accounts/radiostar/projects/star-cast/submissions/b1c0e887-dc06-4249-a136-13354ee70376). Exact build ID, existing **Team (Expo)** internal group; no public submission.
- Apple/upload status: see the final status below. Build 15 was already `VALID / IN_BETA_TESTING`; that is not proof of build 16 availability.
- `codesign --verify --deep --strict` passed. Bundle `app.radiostar.ios`, team `69F2T3M9C4`, development entitlement disabled, background audio enabled. Local extraction added extended attributes; removing those from the extracted copy made verification possible without changing any signed file bytes or the original IPA.
- Archive hashes match the delivered-audio Swift loader, prefix witness, native playback/runtime integration and approved purple icon. The signed executable contains the native loader/proof/bridge symbols. AWS HTTPS endpoint and icon resources are present; known credential scan passed.
- Backend changes: `4eb516d` and `f856629`, activity-specific assessment observations and admin visibility. No new rights framework, permission grants, player, database or infrastructure.

## Verification by capability

| Capability | Status | Evidence and limit |
|---|---|---|
| Four-hour canonical processing | IMPLEMENTED / AUTOMATED TESTED / PRODUCTION CONFIG VERIFIED | 14,400-second maximum. Checkpoint tests pause after the unchanged three-hour daily transcription allowance and resume remaining chunks after allowance rollover. Not a four-hour paid live transcription. |
| Transcript-independent Ad Skip | PRODUCTION VERIFIED | Deployed runtime reuses the authorised cached opening transcript with no canonical intelligence record. Acquisition stopped at 8,388,608 bytes; usable prefix proof covers 180 seconds. No paid transcription call. |
| Exact playback identity | AUTOMATED TESTED / PRODUCTION VERIFIED | Actual publisher source hash, private delivery range proof and mismatch denial. Swift tests cover immutable delivered bytes, gaps, wrong hashes and the 8 MiB bound. Signed IPA compiles the loader on iOS. |
| Active playback attachment | IMPLEMENTED / AUTOMATED TESTED / PARTIALLY VERIFIED | Late attachment, passed intervals, source changes and lifecycle guards tested. Existing macOS AVPlayer evidence proves proof attachment to the same running item; physical-iPhone behaviour remains unverified. |
| Automatic seek and Undo | PRODUCTION VERIFIED / PARTIALLY VERIFIED | Actual Chromium audio using the shared native execution adapter and live AWS leases; measured below. Not an iPhone test. |
| Native regressions | AUTOMATED TESTED / PARTIALLY VERIFIED | TypeScript, Expo Doctor 21/21, actual EAS iOS compile, lifecycle/Sleep and Ad Skip regressions passed. Lock-screen playback and interruptions still require device acceptance. |
| Activity-specific rights visibility | IMPLEMENTED / AUTOMATED TESTED / PRODUCTION VERIFIED | Existing evaluator projects 12 activities, including bounded analysis, transcription, intelligence, captions, transcript distribution, translation, dubbing and voice replication. Rights-only eligibility never replaces pilot, budget or audio-safety gates. |

### Real advertisements

| Episode | Automatic seek destination | Result |
|---|---:|---|
| LINUX Unplugged 690 | **90,415 ms** | One confirmed automatic seek, continuing playback at 1.5×, one Undo restoring the measured origin, duplicate Undo suppressed; incorrect audio hash denied. |
| LINUX Unplugged 635 | **90,583 ms** | One confirmed automatic seek, continuing playback at 1.5×, one Undo restoring origin. Automatic audio verification; not independent human accuracy evidence. |

690's preserved human annotation is **0–90,415 ms**, bound to full source SHA-256 `693acd1c1ae733801013ca37bc937501e1e0e73d630daaf5620b36b7f1c4117c`. The independent opening detector produced **0–90,459 ms**: start error 0 ms, end overshoot 44 ms, complete labelled-break coverage 100%, 44 ms beyond the annotated advert. Production's human-reviewed interval stays unchanged at 90,415 ms.

Its 3,024,699-byte delivered prefix is `60447f5c50149154f17092afc073585fcda30324cc05e6bf2ea8558286012563`. The runtime verification used existing authorised cache and an isolated processing store; production intelligence records were not modified. Existing negative examples and broader corpus results remain in `AD_SKIP_FOUR_HOUR_RECOVERY.md`; these two execution checks are not a new corpus-wide precision claim.

## Danny Jones and Joe Rogan

Latest three episodes per publisher were fetched and reassessed through the authenticated deployed API. Every audio enclosure returned **HTTP 200 / audio-mpeg** to a HEAD request from eu-west-2. No audio body was downloaded by those availability checks; HEAD does not establish matching advert variants.

| Podcast | Episode | Current result |
|---|---|---|
| Danny Jones | #443 — Simon Dixon | LEGAL_BASIS_NOT_ESTABLISHED; preserved channel scope |
| Danny Jones | #442 — Ray McGovern | LEGAL_BASIS_NOT_ESTABLISHED; preserved channel scope |
| Danny Jones | #441 — Sharon Weinberger | LEGAL_BASIS_NOT_ESTABLISHED; preserved channel scope |
| Joe Rogan | #2572 — Colum Tyrrell | LEGAL_BASIS_NOT_ESTABLISHED; episode scope |
| Joe Rogan | #2571 — Jimmy Carr | LEGAL_BASIS_NOT_ESTABLISHED; episode scope |
| Joe Rogan | #2570 — Mystery Boys | LEGAL_BASIS_NOT_ESTABLISHED; episode scope |

All six RSS durations fit the four-hour ceiling (10,048–11,798 seconds). Danny Jones #443/#442 and JRE #2572 exceed the unchanged three-hour daily audio allowance, so full transcription would need checkpointed rollover if otherwise eligible; bounded opening analysis remains separate.

All six have no discovered publisher transcript, usable transcript cache or verified Ad Skip interval. Their effective rights records contain no explicit publisher reservation. JRE's ordinary copyright notice is retained as evidence, not converted into an AI-specific prohibition. The Danny Jones manual correction remains authoritative; current RSS observations are saved separately, without overwriting it. The pilot and available budget are not these episodes' current blocker. No paid processing was triggered.

The remaining dependency is evidence establishing the relevant processing basis and territory. A valid documented channel basis is reused automatically; duplicate episode approvals are unnecessary. This release records the UK execution region separately from the operator's unestablished jurisdiction and lists the statutory predicates that have not been established:

- UK CDPA 29A requires the relevant non-commercial research purpose; free consumer features do not establish it. [Government guidance](https://www.gov.uk/guidance/exceptions-to-copyright), [section 29A](https://www.legislation.gov.uk/ukpga/1988/48/section/29A).
- A temporary audio window does not itself establish all temporary-copy conditions, including lawful use and independent economic significance. Retained derived transcripts and provider-side copies need separate consideration. [Section 28A](https://www.legislation.gov.uk/ukpga/1988/48/section/28A).
- EU Articles 3/4 require the applicable activity, territorial/national-law basis, lawful access and relevant reservation checks. UK hosting does not establish EU coverage, and silence in RSS is not permission. [Directive 2019/790](https://eur-lex.europa.eu/eli/dir/2019/790/oj/eng).

These are recorded unresolved conditions, not a determination that all internal analysis is prohibited. Captions, distribution, translation, dubbing and voice replication remain independently evaluated.

## Production, costs and rollback

Account identity guarded as **208096650030**, region **eu-west-2**, dedicated StarCast instance. Existing HTTPS API, SQLite, SQS, backup and monitoring infrastructure reused. No pH7 resources modified.

Pre-deployment backup passed full SQLite integrity checking; rollback releases retained. Post-deployment full database integrity, API readiness, worker readiness and queue/DLQ checks passed. Final measurements and deployment digest are below and in the evidence files.

Standard limits remain **$5/day, $25/month, 10,800 transcription seconds/day, 14,400 seconds/episode**. Recorded OpenAI spending is **$0 today / $2.31619266 this month**, zero active reservations. This operation incurred **$0 new model usage**. These are backend ledger amounts, not provider invoice reconciliation. Independent Translate budgets remain unchanged. No new recurring AWS resources were introduced; existing deployment, transfer and build usage is not claimed to be free or separately invoiced here.

Private pilot: **two enrolled testers**, active, expiry **2026-10-31T17:59:01.994Z**, unchanged. Public automatic skipping stays disabled. Authentication, preference, kill switch, exact-variant verification, expiry and suspension controls remain enforced. No renewal was performed.

## Tests and evidence

`npm test` passed all **71 distinct test programs**, including posttest/cloud/release checks. New tests exercise authenticated assessment/detail APIs, channel reuse, feature separation, concurrent observation deduplication, immediate policy changes, explicit reservations, takedowns and persistence across restart. The admin disclosure was checked at 1440, 768 and 390 px, without page overflow or JavaScript errors. No paid providers were used by tests.

Native TypeScript, Expo Doctor 21/21, icon/privacy checks, Swift delivered-prefix tests and signed EAS iOS compilation passed. No configured lint command is present; JavaScript syntax checks are included in the suite. No schema migration was needed; observations use the existing additive record store. The task changes pass the staged whitespace check. A whole-working-tree `git diff --check` flags three pre-existing trailing-whitespace lines in the unrelated `docs/AI_ACTIVATION_FINAL_ACCEPTANCE.md`; that file was preserved.

Evidence is in `evals/radiostar-liftoff-*.json`: archive/IPA inspection, UI checks, two actual playback results, deployed bounded runtime, episode eligibility, audio availability, API intelligence retrieval, queues and database/worker health. Cached Brief, Chapters, Topics, Find a Moment and conversation retrieval passed; the owned fixture truthfully remains `PARTIAL_READY`, rather than being relabelled as complete.

## Physical-iPhone acceptance — BLOCKED on device access

No controllable iPhone surface was available. Browser and macOS playback evidence do not constitute **DEVICE VERIFIED** status.

When build 16 appears in TestFlight:

1. Install **1.0.0 (16)** and enable Ad Skip for the existing enrolled tester.
2. Play LINUX Unplugged 690 from the beginning. Confirm automatic seek to **1:30.415**, continuing playback, then Undo restores the original position. Repeat with the screen locked.
3. Repeat 635; check manual seeking, speed, episode switching, a network interruption and AI Sleep.
4. Export native diagnostics. Test Danny Jones/JRE automatic skipping only after their activity-specific basis is established; ordinary playback remains available.

The pilot expires at the recorded time; any renewal must use the existing explicit authenticated workflow.

## Final release status

As of **2026-10-29T19:03:36.104110+00:00**:

- **BUILD COMPLETE:** signed build 16, native Ad Skip source verified.
- **UPLOAD QUEUED:** EAS submission `b1c0e887-dc06-4249-a136-13354ee70376` reports `IN_QUEUE`. Upload success and Apple processing have **not** been confirmed. Latest Apple-confirmed internal build remains **15**, `VALID / IN_BETA_TESTING`. Build 16 is **not yet confirmed available**.
- **PRODUCTION VERIFIED:** deployment `5c0fb3c136152faf4e83a51663659ede7242f62ee3f2d8413d44486dcc650feb` at 2026-10-29T19:00:19.114Z; previous deployment `6948ea714e0f1ae7afbd0bdaf8f2c4524b78365b165927949e39527e3d49136b` retained for rollback. Full SQLite integrity `ok`; API/worker ready; SQS and DLQ empty; **24,521,523,200 free bytes** (~24.52 GB). Latest backup age at check: 63.2 seconds.
- **PUSHED:** implementation commits `d470671`, `4eb516d`, `f856629` are on `origin/work`; release evidence is committed alongside this report. Unrelated working-tree files are preserved.
- **BLOCKED:** build 16 availability awaits the external EAS upload queue and Apple processing; physical-iPhone acceptance awaits installation/device access; six named-show episodes still need an established activity/territory processing basis. No public release, pilot renewal, increased budget or new permission grant was performed.
