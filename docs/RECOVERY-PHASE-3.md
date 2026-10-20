# Recovery Phase 3 — evidence-backed rights and intelligence

Release: backend/admin commits `bcf6730`, `765b2ba`, `a817826` on `work`.
AWS archive SHA-256:
`5ebdc2e556824201bf44d8e081ad4c0ff133fa2ad5edfa789b7fd596799471e7`.
Public admin: https://d3ri12f40b85i3.cloudfront.net/admin.
Previous guarded release:
`d96ca579ed6b4926c8ae927a09ccd9121c5652c77a8724e7f1bc71ef4f10bcb4`.

## Implemented

- Existing podcast/episode workspace now shows rights source, issuer, evidence,
  scope, reviewer, dates, independent capabilities and structured review history.
  The old blocked-content approval form routes to this shared workspace.
- Super Admin reviews a structured basis, exact existing episodes (up to 200),
  optional future coverage, selected core capabilities and evidence attestation.
  A short-lived preview shows real evaluated impacts, acquisition route, bounded
  job count and budget headroom. Confirmation is bound to actor and reviewed
  rights/policy revisions. Replay returns the same outcome.
- Approval records rights and operational policy atomically using the existing
  SQLite store and evaluators; no new rights engine or database. Nested savepoints
  support existing audit operations. No schema migration or records replacement.
- Existing ZERO/LOW/MEDIUM/HIGH identifiers and OPEN/STANDARD/MANAGED/PAUSED
  labels remain. Explicit episode overrides and mandatory holds take precedence.
  Scoped rollback requires confirmation/current version; it does not queue jobs,
  reverse rights decisions or silently resume automatic preparation.
- At most three new episodes per approval use the existing deduplicated,
  RSS/cache-first pipeline. Returned job IDs are real. Explicitly opted-in
  channels join the existing six-hour latest-episode monitor. Automatic requests
  do not enable paid audio fallback or bulk back-catalogue processing.
- Expiry, revocation, mandatory prohibitions, reservations and disputes remain
  enforced on cached listener outputs, search and moments. Output permissions
  are independent; internal analysis is retained for authorised cache reuse.
  Captions, dubbing, translation and voice rights are not granted by core approval.
- Legacy technical rights edits cannot create new core grants, erase structured
  approvals/mandatory holds, or re-enable excluded outputs through old defaults.
  Existing independently granted advanced rights are preserved at the same scope.
- Automatic assessment still uses the existing publisher-evidence evaluator.
  Missing documentation is not relabelled as a publisher-issued prohibition.

## Verified

- Full `npm test`, syntax checks and `git diff --check`.
- New structured-review tests: evidence validation, RBAC/CSRF, stale preview,
  mandatory episode precedence, bounded approval-to-READY, replay, selected/future
  scope, expiry, territorial hold, revocation, cache/search withholding, audit
  persistence after reopening SQLite, and nested transaction rollback.
- Existing tests cover automatic assessment, all operational tiers, independent
  caption permissions, cost reservations, checkpoint recovery and queue deduplication.
- `scripts/verify-admin-rights.mjs`: real browser/session workflow at 1440px and
  390px, no page-wide overflow or JavaScript errors; one mocked-provider job
  reaches READY. Screenshots retained locally in `.starcast/phase3-visual/`.
- Live AWS verification: exact account 208096650030 / eu-west-2; dedicated
  existing instance only. Owned synthetic corpus approval persists and replays;
  existing cache delivers Brief, six Chapters, Topics and Find a Moment.
  Public/admin authentication separation and missing-basis refusal pass.
  Live browser displays the recorded evidence; verification session signed out.
- `scripts/cloud/verify-rights-review.mjs` defaults to preview/cache checks.
  `--approve-owned-fixture` explicitly updates only the existing owned synthetic
  episode, retaining previously granted core permissions. No third-party licence
  or publisher denial was invented.
- Database integrity `ok`; SQS visible/in-flight and DLQ depths zero.
  AI ledger unchanged: 15 usage records, $0.424216 recorded, zero reservations.
  AI $5/day, $25/month, 3 audio hours/day and 2-hour episode caps unchanged.
  Translate limits, private access and automatic Ad Skip safety unchanged.

## Limits and follow-up

- Fresh paid processing in AWS was **not** repeated merely for verification:
  live checks reused canonical cache. Fresh approval-to-job-to-READY was verified
  with mocked providers locally, not claimed as a new live paid run.
- No additional authorised third-party podcast was established by this phase.
  Territory-limited approvals are recorded but held until territorial delivery
  can be enforced. The review screen states this explicitly.
- Monitor inheritance is implemented; observing a newly published real episode
  over the six-hour production polling interval remains a longitudinal check.
- No native changes or TestFlight build. Existing Phase 4 work was preserved.
- No new infrastructure; only release artifacts replaced. Previous source and
  encrypted rollback archives retained. Do not roll back the spending database.
  Restoring pre-Phase-3 code requires a processing/display hold because that code
  does not understand the new approval expiry/revocation metadata.
