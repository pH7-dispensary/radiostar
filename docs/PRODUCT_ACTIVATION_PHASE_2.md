# Product activation phase 2 — Ad Skip evidence and release

26 October 2026 · `work` · `pH7-dispensary/radiostar`.

**PARTIALLY VERIFIED.** Backend changes are deployed; the existing protected
review workbench and shared playback adapter are improved and tested. The full
real-advert → independently reviewed complete boundaries → confirmed skip →
Undo acceptance is **BLOCKED by independent human labels and device evidence**.
Neither the historical real-audio fragment nor the owned fixture closes that
acceptance requirement. Public automatic skipping remains disabled.

## Production baseline and final readback — VERIFIED

| Separate denominator | Before | After |
|---|---:|---:|
| Episodes with persisted analysis | 12 | 12 |
| Episodes containing current candidate intervals | 2 | 2 |
| Current candidate intervals, including verified/matched states | 6 | 6 |
| Historical interval records | 7 | 7 |
| Verified intervals | 2 | 2 |
| Episodes with verified interval evidence | 2 | 2 |
| Independently reviewed complete real breaks | 0 | 0 |
| Recorded seek attempts | 2 | 2 |
| Confirmed seeks | 3 | 3 |
| Undo events | 3 | 3 |
| Incorrect-skip reports | 0 | 0 |
| Missed-advert reports | 1 | 1 |

Historical states: one CANDIDATE, four VARIANT_MATCHED, two VERIFIED. One
superseded historical composite is not counted in the six current intervals.
The two attempt events belong to real audio; the older owned client recorded a
confirmation without a separate attempt. **3 / 2 is not a success rate.**

- Real podcast: Linux Action News 164, **716186–720541 ms**, **4.355 seconds**.
  SHA-256 `d6faaeb5e1366f04a72507f140eb417e008389ad589e48001ca852454769bcd4`.
  Two historical confirmed skips and two Undos. This remains an interior
  fragment, not a complete verified advertising break.
- Owned fixture: **15200–34500 ms**, 19.3 seconds, one historical confirmation
  and Undo. This is authored test material, not independent real-world accuracy.

Two episodes with evidence does not mean unconditional usable skipping: current
pilot membership, preference, category, rights, exact delivered audio and a
live lease still apply. The existing QA installation is not an Ad Skip tester;
its live lease request was correctly refused. No production receipts, pilot
memberships, permissions or listening preferences were fabricated or changed.

## Corpus and preliminary annotations — VERIFIED

Reused all **12 episodes, 13.1121 hours, 748,368,148 bytes**. Every audio SHA-256
was rechecked. All original source hashes remain unchanged. No audio or
transcript was redownloaded. Existing ten publisher VTTs and the hash-matched
LAN 164 transcript were reused. LAN 299 still has no acquired transcript;
absence of candidates is not evidence of no adverts.

Detector v10 produces **20 provisional candidates**, unchanged in number from
v9. Evidence now retains detector score, reason, source references, proposed
placement/format and explicit uncertainty in the private manifest. Host-read,
pre/mid/post-roll hints are transcript/timing hypotheses. Music, dynamic
insertion and consecutive-sponsor classifications remain unknown unless
evidenced; editorial/no-advert status is not manufactured from non-detection.

The cohort remains one publisher (Jupiter Broadcasting), with the existing
CC BY-SA 4.0 source/licence record and attribution preserved. These evaluation
records do not create a production rights grant. Source breadth, ad formats,
music transitions, dynamic delivery and negative controls are not independently
validated. **Zero human labels and zero fully reviewed episodes** were present
at final readback. Accuracy denominators therefore remain unavailable.

## Detection and boundary handling — IMPLEMENTED, partially verified

The existing detector now proposes a wider review span when a sponsor opening,
a commercial offer and an explicit return to editorial discussion bound a
contiguous section. It preserves all segment references, excludes the return
sentence, stops at negations/unexplained gaps, and is bounded to four minutes
and 120 following segments. Contained proposals are deduplicated.

These proposals are explicitly **review-only**, below the automatic evidence
threshold and ineligible for automatic audio promotion. Intervening speech
does not inherit the verification of a short commercial sentence. Existing
strict grouping of independently qualifying adjacent commercial spans remains.
No interval is extended to inflate coverage. Controlled regressions prove the
new proposal/guard behaviour; the real corpus produced **no additional wider
proposals**. This is not a measured real-world recall improvement.

The existing acoustic verifier, inward silence checks, exact hashes, delivery
preconditions, byte witnesses, variant-change rejection, overlapping-dispute
veto and public release thresholds remain unchanged. No uncertain boundary was
promoted. Real start/end error and full-break coverage remain **UNMEASURED**.

## Human review workflow — IMPLEMENTED and browser-verified

The existing localhost-only workbench now provides:

- Five priority clips at the top, with pinned source identity and timestamps.
- Decoded audio-amplitude waveform and bounded relevant transcript context.
- Explicit transcript-alignment warnings and provisional detector scores.
- Approve/save, correct existing labels, reject an advert candidate or save
  uncertainty; corrections preserve append-only audit history.
- Current-position and 250-ms controls, previous/next clip, keyboard Space,
  arrows, I/O and N. Shortcuts do not intercept typing or native media controls.
- Boundary edits clear the listening attestation; full-episode metrics still
  require a full listen, complete labels and no unresolved/overlapping ranges.

Context requests are authenticated, capped at five audio minutes and 100 text
segments, source/hash checked, cached with a bounded entry count, and decoded
one at a time with a timeout and output cap. FFmpeg uses local file/pipe
protocols only. Existing session/Host/Origin/CSRF, concurrency and audit-chain
checks remain. Exclusive writer ownership prevents two workbenches overwriting
the review ledger; automated browser verification is read-only. The ledger is
reloaded after acquiring ownership. A stale lock fails closed and identifies
the exact lock to inspect; never delete the reviews to recover access. No
listener-facing transcript browsing was introduced.

Existing lossless PCM clips are reused after source and clip hash checks rather
than regenerated on every export. Desktop 1280×900 and mobile 390×844 browser
tests verified real pinned audio seek, waveform/context, shortcuts, controls,
no horizontal overflow and no page errors. Tests created **no human labels**.

The review workbench was opened in the in-app browser at
`http://127.0.0.1:4319/`, with its eight-hour protected session. The older 4318
writer was retired after checking its process identity; the current session
and all corpus files were preserved. To start a new session later, run `npm run corpus:review`
(use `CORPUS_REVIEW_PORT=4319` if the original port is occupied) and open the
one-time access link locally. Tokens are not committed.

| Priority review | Exact window | Human decision needed |
|---|---|---|
| Linux Action News 164 | 08:40–12:30 | Complete Linode sponsorship and both boundaries, beyond the 4.355-second fragment |
| LINUX Unplugged 610 | 32:19–34:40 | ConfigCat sponsor start/end; whether consecutive spans form one break |
| LINUX Unplugged 675 | 44:49–47:20 | Promotional code vs editorial product discussion; full boundaries |
| LINUX Unplugged 690 | 00:00–02:00 | Possible inserted audio and publisher-transcript alignment |
| Linux Action News 299 | 00:00–02:00, then full 13:13.469 | Negative-control assessment; a sample cannot establish an ad-free episode |

Audio and review events remain in
`~/Library/Application Support/RadioStar/AdSkipEvaluation`. After review, run
`node scripts/export-ad-skip-corpus.mjs`; only fully reviewed episodes contribute
to recall and complete-break metrics. All 12 episodes require full review for
the whole-corpus denominator. Saved labels remain evaluation evidence, not
automatic production authorisation.

## Confirmed execution, Undo and short-ad timing — VERIFIED on owned browser audio

The existing shared native execution adapter now rejects missing/non-finite
lease expiry, invalid positions and malformed interval boundaries before
seeking. Regression cases prove zero seeks for malformed authorisations.

An isolated real backend and Chromium media element exercised the existing
detector → acoustic verification → exact pinned bytes → preference/pilot →
prefetched server lease → automatic seek → observed destination → Undo flow.
No production events were inserted.

| Measurement, one owned-fixture run | Observed |
|---|---:|
| Recorded attempts / confirmed skips / Undo restorations | 1 / 1 / 1 |
| Actual pre-seek origin | 15207.691 ms |
| Confirmed destination | 34500 ms |
| Observed skipped duration | 19292.309 ms |
| Undo restored position | 15207.691 ms |
| Recovery seeks for two simultaneous Undo taps | 1 |
| Prefetch round trip, isolated localhost backend | 27.6 ms |
| Seek confirmation | 4.4 ms |
| Undo confirmation | 0.9 ms |
| Position-entry observation delay, source time | 6.421 ms |
| Browser test polling interval | 10 ms |
| Play promise resolution after media preparation | 0.9 ms |

Undo preserved paused state and **1.5×** speed. These are single-run local
measurements, not p95s, WAN latency, audible startup latency or native callback
measurements. The unchanged native runtime uses 100-ms checks only near known
breaks, speed-aware prefetch up to five source seconds ahead, ten-second leases,
bounded retries and navigation/preference/source fencing. A 200-ms interval is
covered by the deterministic short-ad test; locked-iPhone scheduling is not.

Optional audio proof remains independent of ordinary Play. A late proof cannot
authenticate an already loaded, different publisher stream, so it is retained
for a later deliberate load; the player never silently substitutes a source.
Changed same-URL audio and failed matching continue ordinary playback.

The adapter change is committed and locally checked, **not installed on an
iPhone**. No TestFlight build or OTA deployment was requested or triggered.

## Metrics, integration and diagnostics

**BLOCKED:** independent real-world precision, recall, boundary error,
complete-break coverage, editorial false-positive rate and real complete-break
seek/Undo acceptance. No complaints is not an accuracy measurement. Existing
stricter public thresholds remain: 30 labelled episodes, 1,000 verified adverts,
99.5% precision, no conversation/variant errors and required timing/Undo gates.

**VERIFIED in code/tests:** the existing `onTranscriptReady` hook runs candidate
inspection and authorised verification before Brief completion, including
cached/partial intelligence and the followed latest-three workflow. Existing
global deduplication, preparation budgets and source cache remain. Phase 1's
18 original followed episodes are still rights-blocked; this phase did not
transcribe them to manufacture ad coverage.

**IMPLEMENTED / deployed:** Admin → Ad Skip distinguishes review-only complete
break proposals, verified advert intervals and independently verified complete
breaks (Not measured), alongside audio identity, current blockers, attempts,
confirmed skips, Undo/failures and incorrect/missed reports. Existing dashboard
and routes are reused. Desktop/mobile protected-admin rendering passed.

## Costs, tests, deployment and Git — VERIFIED

- **$0 additional AI spending**; ledger unchanged at **$1.81833374**, 163 usage
  entries, zero reservations. No new transcription/model calls. Standard and
  pre-existing temporary pilot limits/expiry unchanged; Translate ledger separate.
- No new AWS resources. Incremental CPU/request charges are not separately
  attributed and are not asserted to be zero AWS cost.
- Full `npm test` passed. Final targeted corpus/security, Phase 2 and Batch 6
  regressions passed; native TypeScript, syntax and `git diff --check` passed.
- Tests cover adjacent sponsors, editorial/negation exclusions, provisional
  wider spans, variant/changed-byte rejection, expired/malformed leases, short
  intervals, manual seeking, source/preference/pause races, failed confirmation,
  repeated Undo, cache reuse, budgets and kill switches. Background state tests
  are deterministic; physical background audio remains unverified.
- STS/ownership guard: **208096650030 / eu-west-2**. No pH7 resources changed.
- Pre-deployment backup `/var/lib/starcast/pre-command-centre-1793049734494.sqlite`
  passed integrity; 25.539 GB decimal headroom. No destructive migration.
- Release **57f662c803671cc7e6d22ce06be357957c73ca2eca387dfe6b26799a7b6e9ebf**,
  deployed 21:24:11 UTC. SSM `42147b74-9ce9-465a-91da-96f93296efe3`: Success.
- HTTPS API ready, authenticated admin works, non-pilot skip lease refused,
  worker healthy, SQS and DLQ each 0 visible / 0 in flight / 0 delayed.
- Post-deployment SQLite integrity `ok`; FFmpeg/FFprobe executable checks pass.
  Approximately 25.503 GB available; previous source release
  `118492d5fd135f0658e890ebd0454769f8c557d03be036c4518cda791c12f917` retained.
- The existing retention warning remains: two normal rollback copies plus one
  protected legacy directory. Remote CloudWatch/S3 probes are UNKNOWN in the
  app; no blanket all-infrastructure-green claim.
- Backend/native implementation commit **d00844a**, pushed to `origin/work`.
  The subsequent local-only exclusive review-writer fix needs no AWS deployment.
  This report and
  sanitised `evals/product-activation-phase2.json` are committed separately.
  No configured GitHub Actions workflow exists; local and live gates above ran.

## Remaining acceptance

Human review of the five concrete clips is the next dependency. Review the
full corpus to measure missed adverts, correct alignment/boundaries, then
evaluate complete-break detection and acoustic verification against those
independent labels. Any approved production use still needs the existing
rights, audio-variant, pilot and lease gates. A physical iPhone run is required
for audible startup, short adverts while locked, actual seek and Undo. The
requested complete real-world Ad Skip outcome is **not yet proven**.
