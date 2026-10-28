# Ad Skip internal activation — phase 3

Verified 28 October 2026. Repository `star-cast`, branch `work`. Implementation commit: `dce8709`. Backend deployed to the existing dedicated AWS account **208096650030**, **eu-west-2**. No native build or TestFlight upload.

## Outcome

**IMPLEMENTED / DEPLOYED:** the existing Ad Skip operations page now exposes the standalone internal pilot, enrolled tester preferences, explicit expiry and immediate suspension. Protected Super Admin changes are validated, version checked, transactional and audited. They cannot enable the public feature, create an invitation, renew paid-testing allowances or change spending limits.

**LIVE VERIFIED:** both existing enrolled testers are selected and have advert skipping enabled. They were already enabled before this activation; the operation confirmed and audited that state. Pilot version advanced from 1 to 2. Its existing expiry is unchanged: **29 October 2026, 14:11:12.730 UTC**. No renewal was needed or performed. The expired accelerated paid-testing allowance stays expired.

**LIVE VERIFIED:** one independently reviewed real advert and one machine-approved real advert were automatically sought past using live AWS leases, exact publisher bytes and the shared native execution adapter. Both successful trials continued playback and restored the original position through Undo. This is Chromium playback evidence, **not physical-iPhone Ad Skip acceptance**.

**PARTIAL COVERAGE:** automatic intelligence works for eligible content, including a fresh real episode. The ordinary followed catalogue is still 0/18 ready because no valid processing basis is established for those episodes. OPEN operational policy is not itself a content licence. No prohibition or permission was invented.

## Changes

- `admin.ad-skip-pilot.js` / `admin.js`: existing-page pilot panel; active state, explicit expiry, selected enrolled testers, preferences and standard limits; protected save and suspend actions. No duplicate dashboard.
- `server.mjs`: existing pilot endpoint now supplies safe operational metadata and optionally enables selected enrolled testers' advert preferences. Requires a protected Super Admin session, CSRF, current version, reason and confirmation. Audit records capture previous/new preferences and policy. Credentials never enter the panel payload.
- `intelligence-test-mode.mjs`: reject malformed listener lists instead of interpreting strings or non-string members as membership.
- `test-ad-skip-internal-activation.mjs`: HTTP authentication, RBAC, CSRF, validation, expiry, stale writes, immediate suspension, persistence, preference isolation and unchanged paid allowances. Added to `npm test`.
- `scripts/verify-reviewed-ad-playback.mjs`: bounded observation of actual audio clock advancement after seeking, measured seek counts and retained failure evidence. A fixed 300 ms sample was insufficient for a reliable continuity check; this change does not issue an extra play command or relax seek/Undo assertions.

No changes to the audio player, rights framework, detection thresholds, human labels, public rollout, native build configuration or subscription controls.

## A — real advertisement execution

The original LINUX Unplugged 690 source remains bound to SHA-256 `693acd1c1ae733801013ca37bc937501e1e0e73d630daaf5620b36b7f1c4117c`. The review chain is checked before the trial. Its human annotation remains **0–90,415 ms**; the authorised interval matches both boundaries, with no interval beyond the annotation. The current dynamically inserted RSS variant is different and does not inherit these timestamps.

Existing private S3 delivery, conditional ETag and native range witnesses were checked. The played preserved bytes were independently hashed in the browser before playback. A mismatching hash was denied.

| Successful live trial | Approval evidence | Actual automatic destination | Original / Undo position | Automatic / Undo seeks | Continued |
| --- | --- | ---: | ---: | ---: | --- |
| LINUX Unplugged 690 | Existing human review + exact-audio verification | 90,415 ms | 439.400 / 439.400 ms | 1 / 1 | Yes, 1.5× |
| LINUX Unplugged 635 | Automated audio verification; no human annotation | 90,583 ms | 377.834 / 377.834 ms | 1 / 1 | Yes, 1.5× |

Concurrent duplicate Undo calls caused one actual seek. The paused state after Undo was preserved. The 690 and 635 seek confirmations took 4.4 and 4.5 ms respectively; these are individual desktop observations, not iPhone latency benchmarks.

An initial 690 trial recorded real seek and Undo receipts but failed the harness's combined continuation/paused assertion after its fixed 300 ms sample. It is **not** counted as a complete passing trial. After changing the harness to observe real clock advancement for at most three seconds, the successful 690/635 trials observed advancement after 52.3/54.6 ms. The initial failure does not establish a native playback defect or its exact cause.

Recorded platform counters advanced from 6 skips / 6 Undos at phase entry to **9 / 9**, including that initial incomplete acceptance trial. There are **11 persisted candidates, 4 currently verified/variant-matched intervals, 0 disputed, 0 rejected, 0 failed verifications**, 0 incorrect-skip reports and 1 missed-advert report. Historical receipts are not independent accuracy measurements.

Automatic qualification from phase 2 is preserved: exact audio, commercial evidence, complete boundaries and independent acoustic checks; uncertain intervals remain playable. No routine owner review is required. Complaint handling can suspend affected intervals. Only one human label exists and no entire corpus episode is independently exhaustively labelled, so population precision/recall is not claimed.

Evidence: `evals/ad-skip-phase3-live-playback.json`, `evals/ad-skip-phase3-machine-live-playback.json`; previous detection/corpus evidence remains in `docs/AD_SKIP_GENERALISATION_PHASE_2.md`.

## B — cached intelligence

Authenticated retrieval of **Open Source Security — Red Hat's Project Lightwell with Mo Duffy** returned its existing PARTIAL_READY brief/chapters and available topics/moments/search. Existing user-reported physical-iPhone acceptance for this episode remains valid only for the brief, chapter navigation, direct playback and ordinary listening previously tested. It is not Ad Skip acceptance.

Repeated cached status requests created no new job. Cached intelligence and the newly generated episode survived deployment with the same canonical job identifiers. No Analyse button or new invitation was required.

## C — fresh automatic intelligence

Selected **Open Source Security — CRA vulnerability reporting with Daniel Thompson**, episode `3fcb8ef9-5e79-4671-93b2-f1f7fded941d`.

- Initial cache empty; publisher transcript absent. Publisher RSS carries an explicit CC-BY 4.0 notice. Existing per-feature assessment permits bounded processing/display; captions, dubbing and voice permissions are not inferred from internal analysis.
- An ordinary authenticated status GET with `source=opened` automatically started job `b562d0e6-2052-4d0d-8236-75b851aa1f86`, initially ACQUIRING_TRANSCRIPT. No manual processing endpoint was invoked.
- Actual source duration **2,439,158 ms**; audio SHA-256 `ba96f18992ad87eb33e8110af74ee9d04362ca29894fa88b373d4b74fda713b0`.
- **3/3 durable transcription chunks**, **611 timed segments**, **2/2 analysis batches**, persisted brief, **15 chapters**, **15 topics**, moment and conversation-search indexing. Completed at `2026-10-28T15:23:35.498Z`, processing observation **167.063 seconds**.
- Overall state is **PARTIAL_READY**, with conservative source-excerpt output. Feature availability is not proof of a complete high-quality abstractive brief. Delivery validation correctly remains incomplete; no READY state was fabricated.
- Live query “CRA vulnerability reporting” returned moments and conversation matches. **13 returned references** were checked against stored segment IDs, exact text and start/end timestamps. Top matching fresh-episode segment: `0-169`, **1,037,440–1,041,840 ms**. No seek position was invented.
- SQLite integrity and post-deployment retrieval verified the persisted job, transcript, chapters and topics.

A read-only recovery replay of the actual saved chunks was deliberately terminated after chunk one. A fresh process resumed all three and reconstructed the exact 611-segment text/timestamps: **zero provider calls**. The production worker was not interrupted during paid processing.

## D — following, latest-three and coverage

Ordinary snapshot: **2 active installations, 6 unique followed feeds, 18 latest episodes**. All 18 have operational policy **OPEN** and actual blocker **LEGAL_BASIS_NOT_ESTABLISHED**. Zero discovery failures; zero canonical intelligence/transcript hits; three publisher transcript references have not been verified. Fourteen episodes also exceed the two-hour audio policy. Missing evidence is not described as a discovered publisher prohibition.

The existing enrolled QA installation temporarily followed the authorised Open Source Security feed. Its latest three episodes were selected in publication order and immediately reused existing PARTIAL_READY intelligence/transcripts. Repeating the same follow produced **0 new jobs, 0 provider usage records and $0 additional AI cost**. The test-created follow was then removed; a stale follow request was rejected. The owner's six follows were preserved. This authorised comparison is excluded from the ordinary 0/18 denominator.

The existing scheduler still checks canonical cache → suitable publisher transcript → authorised bounded transcription, respects rights and budget, deduplicates across listeners and only retries recoverable failures. Risk advice alone does not change OPEN into paused. Evidence: `evals/ad-skip-phase3-follow.json` and `evals/ad-skip-phase3-production.json`.

## Long-form and native behaviour

The **7,200-second maximum source duration is an application cost/safety policy**, not a claim that the provider cannot process longer audio. It remains unchanged, together with the three-hour daily transcription cap. Existing resumable chunks, overlap handling, global timestamps, atomic reservations and bounded retry/uncertain-outcome protections remain in place. The real recovery trial is 40m39s; longer-run restart and budget boundaries are covered by mocked-provider tests, not an unapproved live multi-hour charge.

No native source changed. Existing audio starts without waiting for intelligence or audio matching. Status polls and foreground refresh expose centrally persisted results. Existing preferences, playback speed, manual-seek suppression, short leases, source checks, consumed intervals and Undo remain intact.

A **cold first play of an unverified dynamic publisher URL is not promised an opening skip**. Exact-source proof warms asynchronously; an active unverified stream is not silently swapped. A cached verified source can be used on a later deliberate episode load. No new iPhone, background/lock-screen or cold-start acceptance was performed in this phase. No TestFlight build was created.

## Validation and deployment

- Full `npm test` including release/cloud/security/native-domain checks: passed.
- Native TypeScript `tsc --noEmit`: passed.
- Additional activation, followed-preparation/recovery, intelligence-policy and Ad Skip regression tests: passed. These cover editorial negatives, source mismatch/expiry, manual seeks, speed, failed seek, duplicate prevention and Undo.
- Local protected admin UI: saved fixture tester preference, expiry retained, paid allowance unchanged, no browser console errors. API tests cover read-only controls and suspension.
- Deployed browser module matches local SHA-256. Unauthenticated production pilot endpoint returns **403**. Live configuration and preference audit records verified.
- Owned staged changes pass `git diff --cached --check`. Repository-wide diff check finds pre-existing trailing whitespace in the unrelated modified `docs/AI_ACTIVATION_FINAL_ACCEPTANCE.md`; that file and unrelated untracked files were preserved and excluded.
- AWS identity and StarCast instance ownership verified before deployment. Preflight made an integrity-checked SQLite backup at `/var/lib/starcast/pre-command-centre-1793201654004.sqlite` and confirmed rollback/disk headroom.
- Deployment SSM command: `9e8e4179-4c37-4347-bdd9-84757b5a341a` — Success.
- Release archive SHA: `7a9d8ad4e82a6e38f4cd89baaa3ae44fb9f7de60d9393390eaef8aee76762a0d`. Previous rollback release: `953d0554cbeb27110c6f18f15d1981035b941321157a2c1cfdeb3973343e0d6f`.
- Public HTTPS health **200**, backend/worker active, database integrity **ok**, queue **0 visible / 0 in-flight / 0 delayed**, DLQ **0**, zero outstanding AI reservations. Post-deployment disk **24,890,920,960 bytes free**, 23% used.
- Backup service verified integrity and S3 upload. No new compute/database/NAT infrastructure, no pH7 changes, no new secrets or credentials committed.

Overall monitoring remains **DEGRADED** solely for the existing protected legacy deployment directory containing metadata outside the cleanup allowlist (three retained copies vs target two). It was preserved. Application CloudWatch delivery/S3 freshness probes remain UNKNOWN, although the recorded backup action succeeded. These are not claimed fixed by this phase.

## Actual recorded costs

| Component | Recorded USD |
| --- | ---: |
| Fresh transcription | 0.24420000 |
| Fresh text analysis | 0.00927640 |
| Fresh grounding checks | 0.01452200 |
| Fresh embedding/indexing | 0.00017020 |
| Additional search-query embedding | 0.00000008 |
| **Phase increment** | **0.26816868** |

Fresh job usage is 2,442 billable transcription seconds including chunk overlap; actual audio duration is recorded separately. Final ledger totals: **$0.49785892 today / $2.31619266 this month / 4,575 transcription seconds today**. Standard ceilings remain **$5/day, $25/month, 10,800 seconds/day, 7,200 seconds/episode**. Translate's independent limits and ledger are unchanged.

No new recurring infrastructure was introduced. Existing AWS storage, requests and deployment incurred metered usage; **an exact incremental AWS bill is not isolated and is not reported as zero**.

## Remaining limits

- Physical-iPhone automatic skip/Undo, cold-start and background acceptance remain unverified. Desktop real-audio proof is not substituted for them.
- The authorised new episode has usable but partial/extractive intelligence, not a complete abstractive brief.
- Ordinary followed content remains 0/18 available until a valid processing basis is established; 14 also exceed the unchanged source cap. No policy loophole or fabricated permission was introduced.
- The pilot ends at its explicit expiry unless a Super Admin intentionally renews it. No automatic renewal.
- Public Ad Skip remains disabled. Independent accuracy coverage is still sparse; automatic approval does not turn machine output into human-labelled ground truth.
- Existing legacy-retention and monitoring-probe gaps remain as recorded above.

No routine advertisement review is requested from the owner. Automated qualification, complaint-triggered suspension and optional retrospective review remain the operating model.
