# AI gate removal — Phase 1

28 October 2026 · branch `work` · AWS 208096650030 / eu-west-2.

## Result

**IMPLEMENTED / VERIFIED:** backend recovery fixes deployed, full `npm test` passed, protected live reassessment completed for all 18 followed-window episodes. Implementation commit `aa2e3eb`.

**BLOCKED — external evidence:** none of those 18 has an established processing basis in the current evidence. Newly eligible: **0**. New paid processing jobs: **0**. Still `REVIEW_REQUIRED / LEGAL_BASIS_NOT_ESTABLISHED`: **18**. This is an unresolved basis, not an invented publisher prohibition, an operational pause, or a promise that waiting will make intelligence ready.

## Exact blocking path and corrections

| File / function | Condition and evidence | Capability / type | Action |
|---|---|---|---|
| `server.mjs:assessEpisodeRights` | Request resolves current publisher RSS evidence, then calls `assessAutomatic` | Automatic assessment | Retained. Missing records initiate assessment; RSS access alone grants nothing. |
| `rights-assessment.mjs:assessPublisherRights` | Recognised publisher licence, scoped reservation, or no established basis | Activity eligibility | Retained. Generic copyright is evidence of a notice, not a prohibition. Distribution-only reservations do not prohibit internal analysis. |
| `rights-registry.mjs:resolve` | A factual technical-review episode row reporting no evidence previously masked a documented channel grant | Redundant episode-level administrative dependency | Fixed. Inherit covered channel permission over that narrow historical finding, while retaining the old row and history. Human feature holds, approval scope/expiry/revocation, disputes and takedowns remain effective. |
| `rights-registry.mjs:evaluate` | Mandatory holds, reserved features, territory/expiry, feature permissions and explicitly configured OFF/LITE/MEDIUM/STRONG requirements | Authoritative eligibility | Retained. Adds `basisEstablished` evidence projection, without granting permissions or changing policy. |
| `episode-pipeline.mjs:transcriptRecovery` | A separate hardcoded approval-form whitelist rejected documented exceptions already accepted by the rights evaluator | Duplicate recovery evidence gate | Removed local whitelist. Uses evaluator's evidence result, which recognises documented approved exception/creator/independent evidence as well as existing publisher/structured grants. Unsupported historical checkbox approvals remain insufficient. |
| `episode-pipeline.mjs:requestOnce`, `rightsRecovery` | Previous terminal rights failure, retry cap, duration refusal, active job or cache | Execution/recovery | Retained automatic reassessment before historical-status checks; bounded rights/duration recovery, history, concurrent dedup and cache reuse. Current duration refusal is not an unlimited retry token. |
| `followed-preparation.mjs:refresh`, `dispatch`, `summary` | Current episode evaluation fails, human pause, source failure, active jobs, budget | Eligibility / operational / technical / execution separately | Retained periodic reassessment, source-error isolation, explicit reasons and eligible audio handoff. `REVIEW_REQUIRED` does not mutate operational policy. |
| `server.mjs:scheduleFollowedFeed`, episode/preparation presentation | Operational pause, denied processing, unavailable transcript grant | Separate effective conditions | Retained; no generic success or fabricated progress. |
| `server.mjs` duplicate `/api/listener/follow` response | Stale demand row still QUEUED after persisted worker completion | Listener execution projection | Fixed during live verification: project the current rights-aware listener status; replay creates no new job. A subsequent takedown still returns UNAVAILABLE. |
| `intelligence-policy.mjs:global`, `allows`; `server.mjs:requireHumanPolicyActor`; `followed-preparation.mjs:action` | Explicit HIGH/PAUSED policy or preparation suspension | Human operational control | Default ZERO/OPEN preserved. Session-authenticated Super Admin, CSRF, reason, version checks and audit remain required for mutations. No automatic assessor writes these policies. |

No new assessment framework, dashboard, database, provider or native build. Captions, full-transcript distribution, translation, dubbing and voice permissions remain independent. Automatic Ad Skip retains its separate audio verification and pilot safety gates.

## Advisory and classification behaviour

The existing `RightsRegistry.assessment` projects evidence, affected activities, severity, recommendation, timestamp and non-blocking advisories into the existing administrative surfaces. Missing-basis advisories do not pause processing policy. The underlying activity still requires a valid basis.

The legacy storage classification `RESTRICTED` also represents unestablished bases; its authoritative projection is `processingEligibility: UNRESOLVED`, with the actual `LEGAL_BASIS_NOT_ESTABLISHED` reason. It must not be interpreted as evidence of an explicit restriction. This release changes no production classifications or grants. Existing generic-notice correction and scoped-output handling remain covered by regression tests.

## Verification

Complete `npm test` runs passed; the final run includes the final source. Targeted stale-duration, automatic assessment, intelligence-first policy, structured rights review and new gate regression tests passed. Syntax and `git diff --check` passed. Paid providers were mocked.

| Required case | Evidence |
|---|---|
| Missing internal approval / valid licence / applicable exception | New `test-ai-gate-removal.mjs`, expanded `test-stale-duration-recovery.mjs`: legacy documented basis without newer approval form recovers to persisted READY. |
| Generic copyright / distribution-only / explicit processing restriction / automatic assessment | `test-automatic-rights-assessment.mjs`, `test-intelligence-first-policy.mjs`; new distribution-reservation inheritance regression. |
| Channel grant / episode override / takedown | New inheritance regression; structured rights review scope, revocation, expiry and mandatory-hold tests. |
| Stale failure / duplicate prevention / budget exhaustion | Stale-duration tests: concurrent single job, canonical cache, retained historical failure, exhausted budget and current refusal do not loop. |
| Human pause | Intelligence-first policy, unified policy, structured review and stale-duration tests: automation cannot change human pause, policy still blocks recovery. |
| Eligible transcription handoff | Existing automatic-internal-intelligence, followed recovery and pipeline tests: authorised automatic audio handoff, provider mocks, bounded budgets. Production cached follow smoke verifies reuse; no new live paid handoff claimed. |

## Production deployment and rollback

STS account verified as `208096650030`; all commands targeted `eu-west-2`, existing StarCast-tagged instance `i-08537aa0e84163cb9`. No pH7 resources modified.

Preflight SSM `5d357069-bded-4ce6-bb0c-0311b12bc6b2` succeeded. Backup `/var/lib/starcast/pre-command-centre-1793189641426.sqlite` passed SQLite integrity; 25,426,243,584 bytes available; three rollback source copies present before retention.

Deployment SSM `da35f35f-7ef1-40ee-b436-7bf8d5eb3a4e` succeeded. Initial release `873b0179973c14462f61a2ac930823b55a1432fad647ef9065eddb06dbc92e6d`; previous release `14899f354b02b5ba0cbdcc585d6da683f8f3b2dd2cccca77682949c3eec946c0` retained. Existing deployment retention applied. Startup health retries briefly observed connection refusal during restart, then succeeded.

Postdeployment SQLite integrity `ok`; FFmpeg/ffprobe executable verification passed. SQS snapshot: zero visible and zero in-flight messages. Cost ledger: 163 usage entries, $1.81833374 recorded, zero outstanding reservations. Standard limits remain $5/day, $25/month, 10,800 transcription seconds/day, 7,200 seconds/episode. Temporary allowance expired and was not renewed. No migration, budget increase or TestFlight build.

## Followed-window outcomes

All 18 actual episodes were reassessed through authenticated, CSRF-protected live APIs. Existing findings were reused, and detailed feature eligibility and evidence were read back. One transient HTTP 400 interrupted the first pass; the complete second pass succeeded for all 18. No permission mutation was made. Historical jobs are not counted as new work.

| Episode | Identity | Result / evidence |
|---|---|---|
| #441 - DARPA Insider: Steve Jobs CIA Deal, Stargate Argentina & Facebook Weapon / Sharon Weinberger | `9ed45572-cbd8-11f1-af09-e3a39c6e3b27` | Unresolved basis; prior unsupported approval correction; no new publisher grant. |
| #443 - Ex-Banker Exposes Who Trump, Elon & Netanyahu Actually Work For / Simon Dixon | `95765502-d155-11f1-b17a-bb47d8c507da` | Unresolved basis; prior unsupported approval correction; no new publisher grant. |
| #503 – AI Crisis in Math: Navier-Stokes, Riemann Hypothesis & Complexity Theory | `https://lexfridman.com/?p=7807` | Unresolved basis; RSS evidence contains no recognised grant or deployment-approved exception; any copyright notice is not a prohibition. |
| The Holy Grail, Dark Age PSYCHOPATHS & Knights Templar Mystery / Medieval Mindset | `ec566b6e-d169-11f1-9853-9b8f37aff08e` | Unresolved basis; RSS evidence contains no recognised grant or deployment-approved exception; any copyright notice is not a prohibition. |
| Murder, Drugs and Cover-Ups: Military Insider Exposes the Criminal Cartel Within the US Navy SEALs | `b7430e18-d174-11f1-99de-4f00a1971780` | Unresolved basis; RSS evidence contains no recognised grant or deployment-approved exception; any copyright notice is not a prohibition. |
| Show 74 - Mania for Subjugation IV | `http://traffic.libsyn.com/dancarlinhh/dchha74_Mania_for_Subjugation_IV.mp3` | Unresolved basis; RSS evidence contains no recognised grant or deployment-approved exception; any copyright notice is not a prohibition. |
| #2570 - Mystery Boys | `ec46995e-ce9a-11f1-9c7e-fbbdba278d52` | Unresolved basis; RSS evidence contains no recognised grant or deployment-approved exception; any copyright notice is not a prohibition. |
| #442 - "It Wasn't Russia" 27-Year CIA Agent Drops DNC Hack Bombshell / Ray McGovern | `db8f0462-ce08-11f1-8abf-af529c8252cb` | Unresolved basis; prior unsupported approval correction; no new publisher grant. |
| Show 73 - Mania for Subjugation III | `http://traffic.libsyn.com/dancarlinhh/dchha73_Mania_for_Subjugation_III.mp3` | Unresolved basis; RSS evidence contains no recognised grant or deployment-approved exception; any copyright notice is not a prohibition. |
| JRE MMA Show #187 with Robert Whittaker | `ed2504ac-cdc1-11f1-b263-83f2c9b36709` | Unresolved basis; RSS evidence contains no recognised grant or deployment-approved exception; any copyright notice is not a prohibition. |
| Exposing the True Evils of the Uniparty: Soros Money, Surveillance, and the Rise of a Third Party | `8aa0a500-cfcb-11f1-ac84-8bd81ff6ec00` | Unresolved basis; RSS evidence contains no recognised grant or deployment-approved exception; any copyright notice is not a prohibition. |
| EXPLOSIVE Jared Kushner Allegations, Shawn Ryan Drama & Lindsey Graham SHOCKER / Julian Dorey | `2d4d7a14-cfbb-11f1-aa9f-f3fabe5226fd` | Unresolved basis; RSS evidence contains no recognised grant or deployment-approved exception; any copyright notice is not a prohibition. |
| #502 – Psychiatry, Insane Asylums, Mental Illness, ECT, Lobotomies, Freud & Jung | `https://lexfridman.com/?p=6554` | Unresolved basis; RSS evidence contains no recognised grant or deployment-approved exception; any copyright notice is not a prohibition. |
| Expert Audits the True Cost of the Iran War and What the Pentagon Is Hiding From You | `59b62be4-cf0e-11f1-9839-0340ab207a22` | Unresolved basis; RSS evidence contains no recognised grant or deployment-approved exception; any copyright notice is not a prohibition. |
| Show 72 - Mania for Subjugation II | `http://traffic.libsyn.com/dancarlinhh/dchha72_Mania_for_Subjugation_II.mp3` | Unresolved basis; RSS evidence contains no recognised grant or deployment-approved exception; any copyright notice is not a prohibition. |
| #2569 - Bill Thompson | `23251e48-ccfa-11f1-8407-c76a5ec426f3` | Unresolved basis; RSS evidence contains no recognised grant or deployment-approved exception; any copyright notice is not a prohibition. |
| #501 – DHH: Future of Programming, AI, Agentic Engineering, Vibe Coding & Linux | `https://lexfridman.com/?p=6506` | Unresolved basis; RSS evidence contains no recognised grant or deployment-approved exception; any copyright notice is not a prohibition. |
| Exiled Professor WARNS: “They’re Funding a NEW Matrix and it’s Not What You Think!” / Neema Parvini | `0d3cd494-ce40-11f1-836c-2f95e1bc9d29` | Unresolved basis; RSS evidence contains no recognised grant or deployment-approved exception; any copyright notice is not a prohibition. |

Exact feed URLs, evidence and policy/eligibility readback: `evals/ai-gate-removal-phase1.json`.

## Final integration correction

The first controlled cached-follow smoke test caught a real stale-state defect: duplicate follow returned QUEUED from `followed-demand` even though persisted intelligence was PARTIAL_READY. Its temporary QA follow was removed by the test's cleanup. The endpoint now projects `listenerStatus` from the current worker record, retaining rights and feature checks, human row pause, and no-dispatch replay semantics. Added HTTP regressions cover completed-cache reconciliation and a subsequent takedown.

Final deployment SSM `1b3050a1-a1fa-4557-98be-fd6c6e386135` succeeded; final release **`5966029ea3b71007b3cc801da9144659373a03d8f8d5b2c2eee8d118d11b4024`**. The prior release remains available through the existing source rollback mechanism; database and spending ledgers were not rewound.

**VERIFIED final live smoke:** HTTPS ready; protected admin session, CSRF rejection, anonymous denial and logout revocation; three real cached episode briefs/chapters/topics with source references; five cached semantic search cases and Find a Moment at 219,851 ms. Controlled follow reused the latest three authorised cached episodes; duplicate follow returned PARTIAL_READY, with no new jobs or ledger entries. Temporary QA follow removed. API, database, processing worker, queue, DLQ and backup probe report HEALTHY. Existing deployment-retention DEGRADED and CloudWatch/S3 dashboard UNKNOWN placeholders remain; these are not presented as new healthy signals. No new paid transcription was needed or claimed.

## Delivery status and remaining blockers

Implementation commits: `aa2e3eb` (central evidence projection, exception recovery and channel inheritance), `a3271a5` (live-discovered duplicate-follow status repair). Final complete test suite passed after the latter change. No GitHub Actions workflow is configured in this repository.

**IMPLEMENTED / VERIFIED:** identified administrative recovery defects, state reconciliation, audit preservation, automatic assessment and bounded authorised dispatch tests, live cache delivery, authenticated reassessment, production deployment and rollback metadata.

**PARTIALLY VERIFIED:** fresh paid transcription handoff is regression-tested with mocked providers; this release verified existing authorised production results and cache reuse, not a new paid transcription.

**BLOCKED:** processing the 18 current followed episodes still requires an evidenced applicable basis. All 18 are operationally OPEN and eligibility UNRESOLVED. None is paused by an automatic advisory. Additional permission or applicable-exception evidence can now be inherited/assessed without the repaired stale approval-form blockers. No restriction, approval or historical audit was deleted to improve coverage figures.
