# Recovery Phase 6 — internal pilot release

## Decision

READY WITH DOCUMENTED LIMITATIONS for internal TestFlight only.
No public App Store or external beta review is authorised. No unresolved P0
was found in the automated/API checks; physical-device behaviour is not proven
by browser rendering or a successful build.

## Consolidated implementation

- Phase 1: canonical/publisher transcript reuse precedes paid-audio duration
  limits (`test-duration-transcript-reuse.mjs`, including long episodes).
- Phase 2: **PARTIAL, not completed**. Whole-job persistence, outbox, provider
  result reuse, bounded transcription chunks and conservative cost recovery
  exist. SQS still has a fixed 900-second lease; interrupted jobs lack durable
  per-chunk resume; analysis input still has a 180 KB ceiling. Do not advertise
  general long-form resumability.
- Phase 3: deployed evidence-backed rights review, bounded approval-to-processing,
  policy inheritance, episode precedence, audit and independent output gates.
- Phase 4: shared listener processing state, automatic READY refresh, grounded
  ETA only when sufficient matching measurements exist, separate audio buffering.
  Queue-based and chunk-aware ETA remain unavailable.
- Phase 5 (`e94d856`): AI Sleep surface, manual timer/recovery safeguards,
  Discover/category/recent search/followed episode navigation and player spacing.
- Existing full-bleed approved icon, launch animation, light default, persisted
  appearance, onboarding, library/history and referral contracts are retained.

## Verification — 2026-10-20

- Full `npm test`, `npm run test:release`, native TypeScript, Expo dependency
  validation, Expo Doctor (21/21), iOS/web production export, `git diff --check`.
  No lint script is configured.
- Real exported UI at 320/375/390/430: processing motion/Reduce Motion,
  READY without manual refresh, playback continuing during preparation,
  restricted/failure states, Discover searches, sleep cancellation and restart
  recovery. Isolated APIs/audio fixtures; **not physical iOS verification**.
- Enrollment, onboarding completion/reload, profile/privacy, themes and four
  main tabs pass at 320/375/390/430/1440. Updated the old mock to return the
  actual private Translate 404 contract rather than an invalid allowance object.
- Real admin browser/session flow at 1440/390: structured approval, one bounded
  mocked-provider job reaches READY, saved episode setting and no browser errors.
- Backend production dependency audit: zero findings. Native audit: 23 advisories
  (15 high, 8 moderate), predominantly Expo/Metro/signing tooling dependencies
  (braces, node-forge, uuid). Automatic audit fix suggests incompatible Expo/RN
  downgrades and was not applied. No claim of a clean native dependency audit.
- EAS archive inspection exposed an unrelated local Google Cloud SDK despite
  native ignore rules. Root `.easignore` now excludes it and local IPA/export
  artifacts. Reinspection: 201 files / 3,053,739 bytes; no credential-file or SDK
  paths. Local user files remain untouched.

## Live backend evidence

- STS: account `208096650030`, region `eu-west-2`, dedicated deployment role.
  Existing EC2 instance running with both checks OK; HTTPS API, worker, SQS and
  DLQ healthy, queue depths zero; SQLite integrity `ok`.
- S3 backup observed at `2026-10-20T19:01:17Z`; CloudWatch stream has recent
  ingestion. Admin aggregate DEGRADED includes UNKNOWN CloudWatch/S3 adapters:
  those UNKNOWN values are not evidence of an infrastructure failure.
- Existing Open Source Security episode **Safety vs Security with Thomas
  Depierre**, ID `b866917c-0245-4bcf-a06a-83f55ea44ca6`, 21:23:
  publisher RSS CC-BY evidence is recorded; publisher SRT provenance retained.
  Persisted queue/start `16:19:49Z`, completion `16:20:05Z`; live API READY,
  genuine brief, seven chapters, five themes, four moment results and three
  conversation matches. Repeated reads retain generation time and usage count.
  This verifies an existing completed run, not a newly triggered paid job.
- Existing authorised private tester: Translate config 200 and cached MP3 byte
  range 206. Public/admin authentication separation and private rights gates
  verified by live checks and tests. No new testers/permissions/voices/billing.
- AI ledger: $0.011021 day / $0.424216 month, 15 usage records, no reservations.
  Limits unchanged: $5/day, $25/month, three audio hours/day, two-hour episode.
  Private Translate: $2/day, $10/month, ten-minute source cap; separate ledger.
  AWS Budgets reported $3.905 actual spend / $25 budget (delayed billing data,
  monitoring alert rather than a hard ceiling). No new paid model calls.
- Backend unchanged: release
  `5ebdc2e556824201bf44d8e081ad4c0ff133fa2ad5edfa789b7fd596799471e7`.
  Previous release retained:
  `d96ca579ed6b4926c8ae927a09ccd9121c5652c77a8724e7f1bc71ef4f10bcb4`.
  Follow Phase 3 rollback restrictions; never roll back the spending database.

## Internal pilot limitations / owner checks

- Automatic Ad Skip production flag stays off without independently verified
  real-world precision. Candidate detection is not proof of safe automatic skips.
- AI Sleep is an on-device inactivity estimate, not physiological detection.
  Background inference stops; JS timer timing under iOS suspension is not
  guaranteed. Test timer/fade, lock-screen audio and recovery on a real iPhone.
- Check installed icon, launch transition, enrollment, following, interruption,
  background audio, lock-screen controls and restored preferences on device.
- Intelligence coverage is rights/corpus limited. Internal analysis does not
  grant captions, translation, dubbing or voice replication.
- Admin cost summary has a stale audio-enabled indicator; pipeline controls are
  authoritative. No budget or policy was changed to conceal this reporting gap.

## Release tracking

Previous TestFlight 1.0.0 (7):
`4761dbaf-be7f-40a0-8d02-2a775b08548f`, Apple VALID / IN_BETA_TESTING.
Existing internal group **Team (Expo)**,
`d700defb-f451-4198-899e-11fc6ea0e0ad`, has access to all builds.
New build/submission/IPA verification is recorded below once confirmed.

- Source release commit: `22518009287ec5b27741ec9504ecae7652557e0f`, pushed to
  `origin/work`. EAS auto-incremented local build number 7 → 8. Subsequent
  release-record/test-only commits do not change the application source.
- EAS build: `c9426572-2fa2-4c30-a706-c820f0f53d07`, **FINISHED**, 1.0.0 (8).
  Existing signing identity: TETRODAXOL, UNIPESSOAL LDA, team `69F2T3M9C4`.
- Downloaded exact IPA SHA-256:
  `62342e989286d65c46a03b905f1526f890ae6431994d4a0ee6f2bd0ca57e6a7c`.
  Inspected bundle/version/build, provisioning entitlement, non-debuggable
  distribution, background audio and compiled Expo project/API configuration.
  `codesign --verify --deep --strict` passed after extracting outside iCloud
  Documents (that directory adds Finder metadata; the original IPA was unchanged).
  Scanned 58 bundle files: no known server tokens or OpenAI/AWS key-shaped values.
  Compiled 120px icon inspected, opaque and full-bleed; `assetutil` confirms
  the opaque 1024×1024 phone AppIcon and splash assets in Assets.car.
  Installed Home Screen appearance still requires the owner's iPhone.
- Fresh light mode under a dark OS and saved dark preference after reload pass
  at all four iPhone widths and desktop. Final onboarding screenshots wait for
  the launch overlay to finish.
- Real search-result original MPEG responds 206 to a bounded byte request.
  No new AI processing was triggered for this verification.
- EAS CLI 25.2.0 was used. During monitoring, npm's `latest` moved to 25.3.0
  while its matching `@expo/eas-json` dependency was unavailable; monitoring
  reused installed 25.2.0. No second build or signing credentials were created.
- Submission `f918180c-a2c8-48ab-8b12-8c01563b7bf3` targets exact build 8 and
  ASC app `6822706958`, existing **Team (Expo)** only. The first scheduling
  attempt with `--what-to-test` was rejected before creation (EAS Enterprise-only
  changelog field); the single scheduled upload omits that field.
