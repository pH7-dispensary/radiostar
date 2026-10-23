# Recovery Phase 5 — operational command centre

23 October 2026 · repository `/Users/oska/Documents/star-cast` · branch `work`.

The existing Node/SQLite admin was extended, not replaced. No native changes, TestFlight build, Phase 6 work, public Translate activation, publisher permission changes or AI allowance increases.

## Delivery and verification

| Requirement | Status and evidence |
| --- | --- |
| 1. Overview | IMPLEMENTED / VERIFIED: six indicators, dated evidence, core health separated from unknown auxiliary telemetry; canonical episode drill-down reconciles legacy and current record shapes. |
| 2. Podcast management | IMPLEMENTED / VERIFIED: existing searchable RSS catalogue enriched with policy, followers, known episodes, latest episode, latest-three coverage, verified intervals and attention counts. Bounded Prepare Latest Episodes uses the existing pipeline. |
| 3. Episode management | IMPLEMENTED / VERIFIED: existing status, source, feature readiness, costs and timeline retained; relevant policy/diagnostic actions, advisories, clearer repeated restrictions. Missing historical measurements remain unavailable. |
| 4. Human-only pause | VERIFIED: existing protected Super Admin policy preview, reason, confirmation, resume and inheritance reset retained. Audit now records actual previous policy and persisted affected scope. Automated advisories do not change policy. |
| 5. Needs Attention | IMPLEMENTED / VERIFIED: prioritised evidence-backed inbox, filtering, review navigation, acknowledgement/resolution/dismissal, optimistic version checks and chained audit. Dismissal changes only the review record, never rights or eligibility. |
| 6. Processing | IMPLEMENTED / VERIFIED: status filters, actual work counters, recorded priority, per-job actual/reserved cost, measured ETA or unavailable. Prioritisation does not interrupt active work. Cached policy outcomes no longer claim new jobs started. |
| 7. Latest-three coverage | IMPLEMENTED / VERIFIED: existing shared followed-window discovery and counts retained; Prepare Missing Episodes reuses scheduler, cache, rights and budget checks. Dispatch acceptance is not reported as completion. |
| 8. Ad Skip | IMPLEMENTED / VERIFIED: analysed/candidate/verified/attempted/confirmed/Undo/report metrics separated. Super Admin may reject/suspend or request bounded canonical re-verification; no operation promotes an interval without acoustic evidence. Source/proposed-boundary and last-observed preference/pilot fields are shown when recorded. |
| 9. Costs | IMPLEMENTED / VERIFIED: actual spend separated from reservations; current allowance and temporary expiry, remaining capacity, category totals and explicitly defined episode average. Fixed an existing reserved-cost formatting crash. Ad verification is not separately metered; provider invoices and AWS billing are not invented. |
| 10. Infrastructure | IMPLEMENTED / PARTIALLY VERIFIED: real API/database/worker/SQS/DLQ and cached disk/retention/release observations. Existing backup process now integrity-checks each SQLite copy and records successful S3 upload. Remote restore and CloudWatch delivery are not certified by that marker. |
| 11. Responsive UI | VERIFIED: rendered local and authenticated live checks at 390, 768, 1024 and 1440 px; no page-wide overflow or JavaScript errors. Mobile controls remain accessible and sign-out visible. Browser navigation/deep links retained in the existing shell. |
| 12. Security | VERIFIED: short-lived protected sessions, server-side Super Admin checks, CSRF, stale-update rejection, unauthorised endpoint denial, audit, unchanged independent rights and spending controls. No secrets or full transcripts added to responses. |
| 13. Tests | VERIFIED: full `npm test`; targeted command-centre, policy cache reuse, latest-episode cache/rights, Ad Skip safety/recovery, cloud/privacy and browser checks. Paid providers mocked. `git diff --check` clean. |
| 14. AWS | Account/role and region guarded: `208096650030`, `eu-west-2`; existing EC2/SQS/S3/CloudFront only. Release verification below. |
| 15. Git | Implementation commits `73c8c7d`, `80f446b`, `aa1b01d`, `422e4d1`; authorised branch `work`. Unrelated untracked files preserved. |
| 16. Limitations | Content eligibility, unavailable historical measurements, remote backup restore and broad real-world Ad Skip accuracy remain explicitly bounded below. |

Local mutating tests exercise the review, pause/reset, cache reuse, restricted-source and retry safeguards. Live checks inspect real data, authenticated browser flows and denied unauthorised/CSRF requests; they do not deliberately pause production podcasts or start new paid jobs.

## Recorded operational evidence

Final release `d28ed4ac4aac5182f4c0fd6b523ef05d3180bb13b2c1d4492d0e3678f098ea44`, built from source commit `422e4d1`, deployed at 2026-10-23T14:23:15.998Z. HTTPS health, authenticated live browser flows, worker and empty SQS/DLQ were verified. Final SQLite `integrity_check` returned `ok`; Terraform reported no infrastructure drift. Previous release `c93ed1e5b6d064cdc9644431c4cbb78efd13db3666e7817fc0aef0910cc8ea1c` remains available for rollback.

The final verified release preserved 21 intelligence jobs, 16 READY, 18 canonical transcript records, six advert intervals and two verified intervals. The funnel contains 36 unique persisted episodes: 18 with transcripts, eight transcribed, 17 with generated intelligence and 16 READY. Detected, verified and confirmed Ad Skip coverage each contain two episodes, including the owned fixture. Coverage is not the global podcast catalogue. Stages overlap; publisher transcripts need no audio transcription and generated partial outputs need not be READY.

Disk usage was 20%, with approximately 23.9 GiB available. The latest verified SQLite backup and S3 upload completed at 2026-10-23T14:23:18.365Z. This does not establish a successful remote restore or CloudWatch delivery.

Real-episode telemetry contains one attempted and confirmed seek plus one Undo. A separate owned fixture is included only in explicitly all-record coverage. This phase does not establish whole-break detection, production precision or physical-iPhone behaviour; the Phase 4 safety gates remain intact.

Recorded AI expenditure remains $0.998569 today / $1.562445 month, with zero outstanding reservations. No additional paid AI usage was required. Standard limits and the previously authorised temporary allowance/expiry remain unchanged. No new recurring AWS resources; incremental request/storage charges are not separately available from the application ledger, so no zero-cost claim is made.

## Recovery and remaining limitations

- Pre-deployment recovery copy `/var/lib/starcast/pre-command-centre-1792763902284.sqlite` passed SQLite integrity checking. No schema replacement or destructive migration; advisory review uses additive records in the existing store.
- Two recent rollback releases remain retained. A third legacy directory, `/opt/starcast/previous-1792052925`, contains macOS `._` metadata outside the safe cleanup allowlist. It is deliberately preserved and reported as an actionable retention warning; safeguards were not relaxed to silence it.
- Bounded deployment retention removed obsolete source directories `previous-1792762376`, `previous-1792762622`, `previous-1792764189` and `previous-1792764831`; source archives remain recoverable from S3. Production data, credentials, diagnostic logs and the protected legacy directory were not removed.
- The followed latest-three window contains 18 episodes requiring rights review; an admin interface is not a licence. No restrictions were bypassed to turn these counts green.
- Original proposed timestamps and tester preferences were not recorded for every historical event. New observations preserve these fields; old evidence is not reconstructed or fabricated.
- ETA requires comparable measured work. Ad verification infrastructure cost is not separately metered. Dashboard AWS/provider-invoice totals remain unavailable rather than estimated without evidence.
- UI verification used actual browser rendering and screenshots under ignored `.starcast/phase5-local-admin` and `.starcast/phase5-live-admin`; this is not physical-device validation or a new native release.

Reproduce browser checks with `RADIOSTAR_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/verify-admin-phase5.mjs` (local fixtures), adding `--live` for the configured AWS backend. Live credentials stay in existing ignored server-connection files; sessions are signed out afterwards.
