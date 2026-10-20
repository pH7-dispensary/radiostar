# Real podcast intelligence activation — 20 October 2026

## Danny Jones #440: blocked on evidence, not an active processing delay

- Feed: `https://rss.pdrl.fm/0fcac1/feeds.megaphone.fm/QCD2752074976`.
- Episode: `d6f8e764-c8b9-11f1-85fc-5be776ed8739`; duration 8,297 seconds.
- Historical job `fa9d90a1-ee31-48ba-9d92-5ce4f267b944` started at
  16:38:21 UTC and ended with DURATION_LIMIT at 16:38:24. It recorded no
  transcript checks. This predates the 18:31 deployment containing the
  cache/publisher-before-audio-duration correction; deployed source was checked.
- Current source checks: no canonical cache; no exact audio-variant cache;
  no Podcasting 2.0 transcript reference or supported HTML transcript link.
  Unsupported external transcript sources were not represented as checked.
- RSS contained neither a recognised licence nor an explicit reservation.
  The inherited approval said only `i said yes`, with no licence or evidence.
  This does not establish an independent processing basis.
- Recorded an audited **episode-only** evidence correction:
  `566158f5bb91d6b80221c929e420dabf9d0d0e11761a27dc32efe8538aefe564`.
  Current blocker: **LEGAL_BASIS_NOT_ESTABLISHED**, not a claimed publisher
  prohibition. The prior publisher record and historical job remain intact.
- No new analysis or audio acquisition was started for #440. Even with a
  supported basis, its audio exceeds the unchanged 7,200-second transcription
  cap. An authorised usable transcript could avoid that audio route.

## Implemented and tested

- One bounded transcript-only reassessment for the historical duration-before-
  discovery defect; independent permission evidence, current rights, policy,
  enabled processing and budget availability are required.
- Concurrent requests share one admission operation. Existing worker/outbox
  deduplication and atomic paid-call reservations remain in force.
- Replacement jobs no longer inherit an old failure code or completion time.
  Previous diagnostics are persisted separately without duplicating transcript
  or derived content outside the existing content-deletion lifecycle.
- Admin distinguishes historical failure, current eligibility, transcript-source
  checks and next action. Terminal elapsed time stops advancing. Current failures
  always have a blocker; missing checks no longer imply audio is unnecessary.
- A startup follow check exposed another unsupported legacy approval. Its
  queued-only job `db3977cf-57ad-48f0-a46e-57b069897824` was cancelled through
  the audited admin API before processing. No additional paid usage occurred.
  Reassessment now requires supporting evidence; automatic checks respect
  cancellation rather than silently reopening it.

## Fresh real-world live verification

**Open Source Security — The Future of Open Source Security**, 4:28.
Episode `d04532a8-4020-449e-acd6-98fa8a1b6159` in
`https://opensourcesecuritypodcast.libsyn.com/rss`.

- Publisher RSS explicitly supplies CC-BY 4.0; the existing assessor recorded
  the evidence. Captions, audio transcription, translation and dubbing remain
  independently unavailable for this permission record.
- Publisher SRT: `https://static.libsyn.com/p/assets/4/b/6/2/4b62b3035461428916c3140a3186d450/The_Future_of_Open_Source_Security.srt`.
- New live job: **d742156f-4449-43f2-86d0-a5dde81afef3**, observed QUEUED →
  ACQUIRING_TRANSCRIPT → ANALYSING → **READY**.
- Grounded brief with eight real segment references; eight chronological
  chapters; five themes; five moment results; three matching conversation results.
- Re-fetched and parsed the authorised SRT: canonical hash and every returned
  chapter boundary/source reference match. Playback source accepted a one-byte
  range with HTTP 206; no full audio download was performed.
- Results survived the final deployment's stop/start, keeping the same job ID.
  Repeated requests before and after restart were cache hits with no extra usage.
- One text-model usage record: **$0.001681**. No audio transcription charge.
  Final recorded totals: **$0.012702/day, $0.425897/month**, 16 usage records,
  zero reservations. $5/day, $25/month, three audio hours/day and two-hour episode
  limits are unchanged. Translation retains its separate ledger and limits.
- Ad Skip dashboard has zero candidates/verified intervals. No automatic-skip
  accuracy or enabled production skipping is claimed.

## Validation and deployment

- Full `npm test` including release/privacy, rights, queue, budget, native UX
  and new stale-recovery regressions passed. Native `npm run typecheck` passed.
- Admin browser workflow passed at 1440px and 390px: real fixture API, no page
  errors or page-wide overflow, reassessment to READY, preserved history.
  Screenshots are ignored local artifacts in `.starcast/phase3-visual/`.
- Live anonymous admin request: 403; restricted admin prepare: 409; #440
  listener request remains UNAVAILABLE with its specific legal-basis reason.
- Account verified: **208096650030**, **eu-west-2**. Existing infrastructure only.
  HTTPS health and SQLite integrity passed; recent S3 backup verified.
- Implementation commits: `f208651`, `11622aa` on `work`.
- Final healthy release:
  `827f3a1ddfb0f667c06f6433f03df37fe507269b9acea861e7af749d9ab29f07`.
- Pre-task rollback release `5ebdc2e556824201bf44d8e081ad4c0ff133fa2ad5edfa789b7fd596799471e7`
  retained under `releases/rollback/` in the existing encrypted artifact bucket;
  previous source directories also retained. Terraform release-object replacement
  was reviewed separately; no compute/network/database resource changed.
  **Never roll back the spending database or erase the new rights review.**
- No TestFlight build, new key, public feature activation, budget increase,
  bulk processing or pH7 infrastructure modification.

Physical iPhone rendering was not retested. Coverage remains limited to
authorised processed episodes. General long-form resumability and the existing
180 KB analysis-input ceiling remain as documented in Recovery Phase 6.
