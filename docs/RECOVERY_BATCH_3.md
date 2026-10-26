# Recovery Batch 3 — administrator identity and rollout integrity

Repository: `pH7-dispensary/radiostar`, branch `work`. Baseline: `1a9ebc7` (Batch 2). Scope: RT11–RT14, RT19 triage. No TestFlight build, public release, new infrastructure, budget increase or pH7 change.

## Implemented

- Individual credentials extend the existing `administrator` records. Immutable random identity, unique normalised login, salted scrypt password verifier, active status, role and version. No competing identity database; no plaintext credentials in responses, audit records or application browser storage.
- Existing six-role permission matrix retained. Real sessions bind to current membership/version. Revocation, role changes and password replacement invalidate previous sessions immediately. Membership provisioning requires a protected Super Admin session, reason, confirmation and compare-and-swap version for updates. Navigation and write controls reflect permissions; overview projections omit inaccessible support/processing details.
- Staged migration: existing shared credential remains an explicitly labelled emergency recovery option. Ordinary shared login retires only after an active individual Super Admin successfully logs in. Automation credentials remain separate and cannot operate human-only policy pause controls. No production identity/password was invented.
- `security.adminSessionHours` governs issuance, cookie lifetime and validation. Shortening persists earlier expiries for existing sessions; increases never restore or extend them. Session reads synchronise browser cookie expiry with remaining server lifetime. Policy is 1–24 hours, validated and versioned.
- Stable SHA-256 listener/feature cohorts enforce percentages and explicit authenticated/private-beta/internal-test audiences at listener delivery, search, captions, Translate and automatic preparation. No client identifier controls membership. Existing names `DISABLED`, `INTERNAL_TESTING`, `PRIVATE_BETA`, `ENABLED` retained. ENABLED remains 100%; partial cohorts use PRIVATE_BETA/INTERNAL_TESTING.
- AI Sleep, referrals and subscriptions are informational rows governed by their existing dedicated controls, rather than misleading editable rollout knobs. Unknown legacy rule text fails closed and visibly requests correction. One exact existing production Ad Skip description is migrated idempotently to its existing audience, with before/after audit. State, percentage and independent skip safety are preserved.
- Configuration and flag updates require reason, confirmation and version. Audit chain writes are transactional, attributable and include request IDs; denied role checks are recorded. Session/credential secrets are omitted.
- Bounded per-listener/API and per-viewer login/enrolment limits plus independent global ceilings. Login/enrolment: 8 attempts/viewer/15 minutes, global 80/category/15 minutes. API: 120/listener or anonymous viewer/minute, global 6,000/minute. Buckets have bounded memory and fail closed at capacity. These are process-local limits on the existing single API instance, not distributed counters.

## Verified proxy contract

Account `208096650030`, region `eu-west-2`, dedicated instance `i-08537aa0e84163cb9`, Project=StarCast. Private CloudFront VPC origin `vo_GqVlFrCeOTwFnQ80Dn2585`; no intermediate ALB. Backend security group `sg-0a7c30031f4f0c76e` accepts TCP 4173 only from CloudFront service group `sg-01b96027a7984db14`, with no public CIDR ingress. Dedicated origin subnet: `10.46.1.0/24`. HTTPS-only viewer policy; caching disabled; AllViewer origin request policy.

Live socket inspection identified an origin-facing public CloudFront edge (`130.176.165.21`), rather than the ENI address. AWS publishes that address inside its CLOUDFRONT_ORIGIN_FACING ranges. The cloud launcher refreshes those ranges from AWS at startup, with a verified seven-day snapshot fallback for brief metadata outages, and also allows the dedicated subnet path. A matching socket peer and CloudFront request header are required; the **rightmost** X-Forwarded-For address is used, matching CloudFront's append contract. Local/direct access ignores forwarding headers. Client-supplied prefixes cannot buy another quota. If the origin topology or security group changes, reverify this contract before retaining proxy trust.

The initial live verification caught the narrower subnet-only assumption and failed closed to socket limiting. A corrective release includes the actual preserved-edge path and regression tests.

Reference: [AWS CloudFront request behaviour](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/RequestAndResponseBehaviorCustomOrigin.html).

## Verification evidence

- `npm test`: complete existing suite plus `test-recovery-batch3.mjs`; paid providers mocked.
- New isolated real HTTP tests cover all six roles, individual Super Admin login, shared migration/recovery, CSRF, denied escalation, revocation/rotation, persistence, one/eight-hour cookies and expiry, audit chaining/attribution, stale versions and unsupported controls.
- 10,000 deterministic identities at each 0/1/10/100% setting; actual HTTP listener feature/search decisions and automatic-preparation membership; internal and non-beta exclusion.
- Independent trusted-proxy HTTP login buckets, spoofed forwarding prefixes, untrusted direct peers, IPv6 normalisation, per-listener limits and global ceiling.
- Browser: recovery → create local fixture owner → individual login → provision read-only member → change cohort/session policy → verify read-only interface. 390/1440px screenshots, no page errors or horizontal viewport overflow, no application browser credential storage. Evidence: ignored `.starcast/batch3-admin/`.
- Native TypeScript, iOS export with source map and web export succeeded. No native build or signing change. `git diff --check` clean. No configured root lint/build script; syntax validation is part of `npm test`.

## RT19 — triaged, upstream fixes blocked

Installed Expo **57.0.31** and its CLI **57.0.32** are the current available SDK 57 patch versions checked during this batch.

| Dependency | Installed path/exposure | Compatible resolution |
|---|---|---|
| node-forge 1.4.0 | Expo CLI iOS code signing and `@expo/code-signing-certificates` 0.0.6. Certificate/RSA verification is reachable in tooling. | Advisory affects through 1.4.0; no patched version published at verification. |
| zod 3.25.76 | Expo CLI dev-tools/plugin schema validation, including collections. | Fixed in 4.6.6 (latest checked 4.6.7); CLI declares `^3.25.76`, so an unsupported major override is not applied. |

References: [node-forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv), [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). npm's proposed Expo 44 downgrade was rejected. No supported compatible dependency fix was available. Restrict development tooling to trusted plugins/signing material; this is not a claim that the shipped app is exploitable.

The exported iOS source map contains 707 sources and no node-forge or Zod sources. One Expo CLI Metro loader runtime is bundled; it is not the vulnerable signing/schema path. Root backend `npm audit`: zero findings. iOS export succeeds; no signed build was requested, so signing is not newly device-verified.

## Deployment and live status

**VERIFIED — deployed** release `47fa6fedfe931642431981c9940816bf3bdba11cafde56f72c91410865887e77` at **2026-10-26 16:23:37 UTC**. HTTPS API, protected recovery login, SUPER_ADMIN role, eight-hour effective cookie/server lifetime, live CloudFront viewer identification, CSRF rejection, anonymous admin rejection, logout revocation and existing listener authentication passed. Live flags retain prior states/percentages with enforced audiences. No production member was created. Evidence: ignored `.starcast/batch3-live.json`.

Live cached regression verified all **8 listener-visible ready episodes**. Internal operational counts remain 16 READY; those counts are not a claim that all 16 are listener-display eligible. Existing policy and READY records compare unchanged before/after; AI ledger remains **41 records, $1.562445, zero reservations**, so no new paid processing was incurred. The enforced private-beta cohort reduces active preparation eligibility from 5 installation records to 2 with current beta access, and the followed window from 21 to 18 episodes. Existing follows and cached intelligence are retained; all 18 current window episodes still require a legal basis assessment. Missing beta membership no longer silently qualifies for private-beta automatic preparation.

API, SQLite integrity, processing worker, SQS and DLQ healthy; both queues empty. FFmpeg/FFprobe executable checks pass. After deployment: **25,788,096,512 free bytes** (about 24.0 GiB). Browser checks passed at 390/768/1024/1440px with no page errors or horizontal viewport overflow, using actual production data without operational mutations.

Preflight verified and backed up `/var/lib/starcast/pre-command-centre-1793031034413.sqlite`. Immediate previous release `7705735a69f395d873e49fa2f483a7055a33be01fea4a36eede3b4ad27a406f6` is retained. The pre-batch `15cb0449eae682a031a26cac4915aade5c57ffcab5af0899690200842db554f5.tar.gz` remains in the dedicated S3 releases bucket (HEAD verified, 451,596 bytes), alongside the pre-change database backup. Existing protected historical rollback artefact is preserved. Its known retention warning remains; CloudWatch delivery is not directly checked by this batch.

No new AWS resources or recurring services were created. Deployment/logging bandwidth charges were not separately measured; AWS billing is not claimed to be zero. AI spending limits and independent Translate ledger were not changed.

No destructive schema migration: additive fields in existing SQLite records and one audited feature-description migration. Existing listeners, credentials, rights, policies, transcripts, intelligence and spending ledgers remain in place. Rollback binary retains emergency access; new individual login requires this release and is not claimed compatible with the old binary.

## Owner action / remaining limits

**BLOCKED — production individual owner verification requires your chosen credentials.** Open [Radio Star Admin](https://d3ri12f40b85i3.cloudfront.net/admin), choose **Emergency recovery**, use your existing administrator credential, then **Technical controls → Administrators → Set up your individual Super Admin**. Choose your own login and password (16–256 characters), record a reason and type `CONFIRM`; sign out and sign in with that individual login. This verifies the replacement and retires ordinary shared login while preserving emergency recovery. Do not send your password in chat.

**PARTIALLY VERIFIED:** two physical network sources and an individual human production login cannot be exercised by this agent without inventing accounts. Their server behaviour is covered by isolated HTTP tests; live checks verify the actual CloudFront trust path and existing recovery/listener access.

**BLOCKED upstream:** RT19 compatible dependency patches. Follow supported Expo/node-forge updates; retain SDK 57 and avoid unsupported major overrides.

## Git and next milestone

- `805ac59` — individual authentication, role-bound sessions, audited configuration, effective cohorts and regression/browser tests.
- `c984eab` — verified public CloudFront edge trust, AWS range refresh and regression coverage; live verifier allows elapsed issuance time without exposing session values.
- Report committed separately after live verification. Branch `work`; normal push to `origin/work`, no force push. Unrelated working-tree files preserved.

Next milestone: owner completes individual Super Admin setup, followed by a role-bound production login check. RT11 is implemented and fixture/browser verified but production human migration remains **PARTIALLY VERIFIED** until that step. RT12–RT14 are **IMPLEMENTED / VERIFIED** within the evidence above; two-physical-network quota testing remains **PARTIALLY VERIFIED**. RT19 is **TRIAGED / BLOCKED upstream**. No new TestFlight build.
