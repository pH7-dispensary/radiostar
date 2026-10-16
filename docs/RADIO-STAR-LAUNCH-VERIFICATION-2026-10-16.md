# Radio Star launch verification — 16 October 2026

## Release decision

**Internal development: READY for continued testing. Private TestFlight: BLOCKED on signing and device acceptance. Public App Store: BLOCKED.** No build was submitted to Apple. No duplicate infrastructure, App Store application or product was created. Only Radio Star AWS account 208096650030 / eu-west-2 was operated on.

The UI/UX and React checks kept the existing app/design, added recoverable privacy actions and explicit unavailable states, checked small-screen rendering, and removed unnecessary icon-font imports. AWS skills guided scoped identity checks, reversible deployment and read-only storage/cost verification. Browser QA is not native iPhone evidence.

## Requirement matrix and evidence

| # | Area | Status | Verified result / remaining gate |
| --- | --- | --- | --- |
| 1 | Repository | READY | Existing /Users/oska/Documents/star-cast, branch work, origin pH7-dispensary/radiostar; initial HEAD f2e122a. Final commit/push SHA is in the execution handoff. No unrelated changes found at start. |
| 2 | AWS backend | READY for private pilot | EC2 i-08537aa0e84163cb9 healthy; SSM service active; SQLite integrity OK before/after deploy. Source staged with npm ci, checksum, idle gate, rollback copy and health retry. No database replacement or listener deletion performed. |
| 3 | Native AWS connectivity | IMPLEMENTED BUT UNVERIFIED on signed iPhone | Pinned HTTPS CloudFront API; SecureStore per-install beta/listener credentials; no Mac requirement. Expiry/revocation returns to enrollment. One pilot credential cannot register arbitrary listener profiles. Local HTTP/shared-token overrides fail release validation. |
| 4 | TestFlight signing | BLOCKED | EAS authenticated and existing project verified; iOS build list empty. Noninteractive testflight build failed: credentials not set up. Removed invalid company-name appleTeamId; added approved icon/splash, Radio Star display name, existing bundle/slug preserved. No IPA produced. |
| 5 | App Store Connect | BLOCKED | Metadata/review notes/owner inputs prepared in RADIO-STAR-APP-STORE-PACKET.md. Existing Apple team/app record not accessible/verified without owner login. No duplicate app or submission. |
| 6 | Legal pages | READY for accessibility; BLOCKED for final legal/operational sign-off | www.getradiostar.com/privacy and /terms passed HTTPS HTTP 200, 14 widths/pages plus links/print/no-JS/metadata tests. Entity TETRODAXOL, UNIPESSOAL LDA; privacy email Privacy@getradiostar.com; legal/support info@getradiostar.com. OpenAI/AWS, publisher rights, retention gaps, deletion, subscription and Portuguese/EU jurisdiction disclosures present. Native links added pre/post enrollment. Live deletion wording is now behind implementation; retention/transfers/ADR/age decisions remain. No clauses invented. |
| 7 | StoreKit | IMPLEMENTED BUT UNVERIFIED; activation BLOCKED | Native purchase/restore/manage adapter + Profile surface, official Apple server verification/current status, signed notification handler, ownership binding, expiry/refund/revocation/billing retry/grace handling with mocked tests. Disabled until real products, benefits, Apple credentials, durable restore/account model and sandbox acceptance exist. No prices invented. No paid entitlement applied to free/referral allowance. |
| 8 | Background audio | IMPLEMENTED BUT UNVERIFIED | Existing single expo-audio engine/background entitlement/lock-screen/persistence preserved. Lock screen, Bluetooth, calls, interruptions and resume need physical signed build. |
| 9 | Captions | IMPLEMENTED BUT UNVERIFIED on device | Existing rights-gated 24-second server window and playback checks pass. Fixed stale prior-episode text and incorrect first-segment fallback; paused seek triggers evidence refresh and bounded retry. Dismissed player unmounts caption view. Real timing/long-paused seek requires device acceptance. |
| 10 | Conversation Search | READY for limited approved cache; public coverage BLOCKED | Live approved synthetic internal corpus returned grounded moments and one matched/processed episode. Unapproved feed returns RIGHTS_RESTRICTED. No new paid request or fabricated evidence. Discovery returned genuine catalogue results. No general publisher approval inferred. |
| 11 | Ad Skip | BLOCKED for automatic production use | Production adSkip=false. Existing category/feedback/fingerprint/variant/boundary/undo tests preserved. No real-world accuracy corpus supplied, no automatic skip enabled, no claim of readiness. |
| 12 | AI Sleep | IMPLEMENTED BUT UNVERIFIED on signed device | Local learning/+5/+15/+30/fade/recovery implementation and model tests preserved; no cloud AI added. Background JS timing/fade must be measured physically; no physiological claims. |
| 13 | Referrals | IMPLEMENTED BUT UNVERIFIED end-to-end | 600 base minutes +300 recurring minutes per qualified referral remain server-side. Mocked anti-fraud/rollover/union/session tests pass; unverified client reports remain pending. Trusted real identity/listening verifier is NOT IMPLEMENTED/connected. No real rewards minted. |
| 14 | Privacy/security | IMPLEMENTED BUT UNVERIFIED on signed device; operational gates BLOCKED | Confirmed deletion removes active owned profile/evidence/follows/reports/feedback/subscription records, revokes bound pilot tokens, anonymizes rights-audit actor, preserves others' earned allowances. Native clears exact local keys and blocks late writes. Minimal revocation hashes/backups remain. Added server-synced intelligence opt-out, local history switch/clear and sleep reset. Restore/deletion retention policy and catastrophic-loss deletion reconciliation remain gates. |
| 15 | UX | READY for tested web-rendered surfaces; native acceptance pending | Enrollment, Profile/legal links, Listen/Following/Search/Library empty surfaces, night/day, 320/390/1440 widths tested using actual React Native web export with mocked API. Enrollment scrolls on short screens. No full native visual approval claimed. |
| 16 | Performance | PARTIALLY MEASURED | iOS bundle ~2.3 MB → ~1.9 MB; 19 fonts → one 390 KB Ionicons asset. Post-deploy single observations: cache status 38 ms, moment 199 ms, scoped conversation search 50 ms, catalogue 82 ms. Not percentiles or SLA. Startup/playback/memory/artwork/caption latency on device unmeasured. |
| 17 | Tests | READY for executed automated scope | npm test (existing suite + new release/privacy/subscription posttest), native tsc, Expo dependency check, iOS/web exports, diff check, native local-erasure/token scan and web regression checks passed. Paid providers mocked; production verification reads existing cache only. |
| 18 | Costs | VERIFIED observations, not final invoices | AWS Cost Explorer estimated UnblendedCost 2026-10-01 through 2026-10-15 = $0.1489231011 (billing delay applies). Existing budgets $25 starcast-phase1-monthly and $100 RadioStarDevelopment. OpenAI app ledger month $0.413195; day $0, 0 reserved jobs. Not independently reconciled to provider invoice. No paid AI verification calls. |
| 19 | Physical iPhone | BLOCKED | No physical device evidence provided; no usable Xcode Simulator on host. Packet has a 15-step acceptance workflow. No Expo Go/browser pass represented as TestFlight acceptance. |
| 20 | Remaining launch gates | BLOCKED | Signing; actual device/audio/sleep/caption/accessibility tests; genuine screenshots; approved public content rights; public enrollment/identity and referral verifier; StoreKit products/benefits/recovery/sandbox setup; final legal/privacy/age/retention/processor decisions; native toolchain advisories. |
| 21 | Git | READY for verified commit/push | Changes confined to existing repository/branch. No force push or reset. See final handoff for exact remote-verified commit. No existing CI workflow found; local gates executed. |
| 22 | Owner actions | BLOCKED pending owner | Complete Apple signing login; confirm existing app record, products and benefits; provide rights-approved content; approve legal/retention/age and public identity/recovery decisions; execute physical acceptance and capture real screenshots; authorize any Apple submission separately. |

## Infrastructure observations

- SQS main and DLQ each had zero visible/in-flight messages. Main redrive maxReceiveCount=3. Both SQS-managed encryption enabled.
- S3 starcast-phase1-208096650030-eu-west-2: all four public-access blocks true; AES256 server-side encryption; backup expiration 30 days, noncurrent versions 7 days, incomplete multipart abort 1 day. Observed recent backup 2026-10-16T00:54:28Z, 1,568,768 bytes. These rules are not a guarantee of instantaneous deletion.
- Secrets Manager starcast/phase1/backend exists, not scheduled for deletion; no value printed. CloudWatch /starcast/phase1/backend retains logs 14 days.
- Preserve encryption/least privilege. Review S3 access logging, CloudTrail data events and CloudWatch storage alarms with owner-approved cost scope before enabling extra telemetry. No new resources added for this report.
- Two active listener records, three pilot devices, four pilot invites, nine intelligence records, eight transcripts and 11 cost ledger entries preserved across first deployment. No live deletion test was run against real users.
- New deployment preflight executes FFmpeg/FFprobe -version before stopping service; ffmpeg-static installer approval is pinned to reviewed 5.3.0. Both binaries executed successfully in the deployed runtime. npm warns Apple's server library transitively includes deprecated jsrsasign; track upstream.

## Security limits and dependency audit

Root/backend npm audit reported zero vulnerabilities after Apple library install. Native npm audit reported 22 affected package entries (15 high, 7 moderate), driven by three advisory roots: braces <=3.0.3, node-forge <=1.4.0, uuid <11.1.1. Registry latest versions for braces/node-forge were still 3.0.3/1.4.0 at inspection. The suggested automatic remediation included downgrading Expo to 44 / React Native to 0.72; this was not applied. These are predominantly build-tool dependency chains, not proof of exploitable application code, but must receive explicit security disposition/upstream patching before public release. Do not expose Metro publicly or feed untrusted signing artifacts to the build toolchain.

Shared development credentials remain only for existing controlled admin/local tooling; the release app uses per-device credentials and contains no shared development token. Production administration still needs the separate administrator secret. No public production self-service enrollment has been enabled. Rate limiting, input validation, default-restricted rights and unrestricted-transcript prohibition remain covered by existing tests.

## Repeatable checks

```sh
cd /Users/oska/Documents/star-cast
npm test
node scripts/cloud/verify-release.mjs
node scripts/cloud/ops.mjs verify-store
node scripts/cloud/ops.mjs verify-runtime
git diff --check
cd native
npm run typecheck
EXPO_NO_DOTENV=1 npx expo install --check
EXPO_NO_DOTENV=1 npx expo export --platform ios --output-dir dist
cd ..
node test-native-release.mjs
```

Cloud ops return an SSM command ID; poll that exact ID and check Success. The cache verifier uses existing protected local credentials without printing them, asserts account identity, makes no paid intelligence request and checks unchanged usage. Never run legacy --paid verification without specific lawful content and spending authorization.

Web evidence lives under ignored .starcast/qa/. Legal evidence is under /Users/oska/Documents/New project/radio-star-website-qa/legal/. These screenshots are QA artifacts only, not App Store captures. The canonical engineering source is the committed work branch, not generated exports.
