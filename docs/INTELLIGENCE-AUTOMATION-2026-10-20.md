# Internal intelligence automation — 20 October 2026

This release supersedes the earlier same-day activation report's unchanged
testing limits and non-resumable long-form limitations. Historical rights
findings in that report remain valid; no missing permission was invented.

## Implemented and verified

- Authenticated, selected internal testers automatically enter the shared
  cache → publisher transcript → authorised audio → analysis pipeline.
  Server encounters cover playing/opening, following, podcast detail and
  conversation search. Native build 9 adds bounded saved/Library/Listen
  encounter prewarming: three episodes per pass, two concurrent requests,
  cooldown and opt-out support. It does not crawl the global catalogue.
- Rights remain independently evaluated. Unknown legal basis creates an
  evidenced Needs Attention entry with the existing Super Admin review flow.
  Internal approval does not grant captions, dubbing or voice replication.
- Super Admin can enable/disable a versioned, audited, expiring testing mode.
  One existing enrolled tester is selected; no invitation was consumed and
  no device token is embedded in code. Expiry: **27 October 2026 21:53:27 UTC**.
- Active tester limits: **$25/day, $125/month, 15 audio hours/day, four-hour
  source episode**. Standard limits remain $5/$25/three hours/two hours.
  Reservations share the existing atomic AI ledger and recheck eligibility
  and expiry. Private Translate retains its separate unchanged ledger.
- Long-form transcription uses overlapping bounded chunks, global timestamps,
  exact-audio-hash checkpoints and per-chunk reservations. Hierarchical analysis
  checkpoints validated map/reduce stages with original segment references.
  Completed paid work survives restart. Uncertain provider outcomes are held
  for review instead of blindly billed again. Recoverable retries are bounded.
- SQS visibility renewal protects active work. Server-side priority favours
  playback/opened episodes without interrupting active paid work. Measured
  chunk/batch counts are delivered to native/admin; no timer-based percentages.
- Rights removal purges checkpoint content. Late provider responses cannot
  restore it, but their actual financial usage remains accounted for.
- Admin episode lookup now resolves the bounded older-episode history rather
  than mistaking discovery pagination for removal. Publisher outages have a
  distinct temporary-unavailability response; cached listener results survive.

## Real live evidence

Open Source Security, “Forking Open Source Projects with Sheogorath”, 22:14.
Feed: `https://opensourcesecuritypodcast.libsyn.com/rss`.
Episode: `cd76cc10-ce37-4d65-9274-fd3052b1bcbd`.
Job: `127d0d0a-6f3b-447b-8e69-6c6f566f572d`.

- Publisher RSS explicitly declares CC BY 4.0. Recorded an episode-scoped
  licence assessment for transcription and short derived intelligence; no
  captions, dubbing or voice permission was granted by that assessment.
- No publisher transcript/cache existed. The automatic encounter path queued
  transcription and reached READY in **72.369 seconds**: genuine brief,
  seven chapters, five themes, five moment results, two matching search passages.
- Two audio chunks billed 1,335 seconds including overlap: **$0.133500**.
  Analysis: **$0.003909**. Total **$0.137409**, no outstanding reservations.
- Previously processed publisher-SRT episode “The Future of Open Source
  Security” remains READY with eight chapters. Both retained their original
  job IDs across deployment/restart. Repeated reads added no usage records.
- Recorded AI totals after verification: **$0.150111/day, $0.563306/month**,
  19 usage records, zero reservations. These are application ledger values,
  not an independently reconciled provider invoice.
- Production automatic Ad Skip remains **off**. Candidate/evidence processing
  is integrated, but this verification establishes no real-world ad precision
  or safe automatic-skip coverage. No advertisement was fabricated for testing.

## Verification, deployment and recovery

- Full `npm test` and native TypeScript checks passed. Native iOS export passed.
  New regressions cover expiry, ordinary-user separation, forged contexts,
  atomic budgets, unknown calls, deletion races, old-episode lookup and outages.
- Actual child-process SIGTERM/restart tests passed for a four-hour mocked
  transcription and hierarchical analysis, with no duplicate paid mock calls.
  Four-hour real-provider accuracy has **not** been tested or charged.
- Admin browser workflows passed at 1440px and 390px: login, enable/disable,
  expiry, read-only restrictions, no overflow or browser errors.
- Existing AWS account **208096650030**, region **eu-west-2**, was checked
  before infrastructure actions. No pH7 resources or new compute were used.
  SQLite integrity passed; paid ledgers and rights records were preserved.
- Backend release: `c567afbb8403070e8e4dbe20684c8b6c0694a97a02097b935cd7ef897e654eb1`.
  Previous releases remain in encrypted `releases/rollback/` objects and
  retained EC2 source directories. Roll back source, **never the spending
  database or rights history**. No destructive database migration was required.
- Latest retrieved AWS month-to-date spend: **$3.905**, subject to billing lag.
  Existing $25 AWS budget/early alerts retained; added a $125 actual-spend
  notification to `oska@ph7.health`. Alerts are not hard limits and do not
  control OpenAI spending. No new recurring infrastructure was introduced.
- Commits: `3efa568`, `7b04cca`, `c774519`, `083210b`, `08e7941`, branch `work`.
  No repository CI workflow exists; local and deployed checks are the evidence.

## Native delivery and remaining verification

- Signed iOS **1.0.0 build 9** finished on EAS at 22:02 UTC using existing
  credentials: https://expo.dev/accounts/radiostar/projects/star-cast/builds/b6fd1d5f-c786-427b-9a0e-c4706c77f3b1
- Build prepared at the user's request; **not submitted to TestFlight or
  publicly released**. Installation and physical-iPhone Library prewarming,
  progress rendering, playback and accessibility still require device QA.
- Human transcription/listening quality remains unverified. The real brief
  contains a possible proper-name transcription error (“Hatchdog”); structural
  grounding checks are not proof of perfect speech recognition.
- Publisher timeouts can prevent fresh metadata/preflight lookups. Cached
  intelligence remains available independently. Unlicensed content still
  needs an established basis; this is not global catalogue authorisation.
- Application monitoring labels CloudWatch delivery and S3 backup freshness
  UNKNOWN where it does not query them. Queue/worker/database health must not
  be represented as proof that every infrastructure metric is available.
