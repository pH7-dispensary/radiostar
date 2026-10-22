# Intelligence everywhere / internal Ad Skip release

Status: backend IMPLEMENTED and VERIFIED; native signed build VERIFIED; physical iPhone behaviour and broad real-world Ad Skip accuracy NOT VERIFIED. This is not a public automatic-skipping release.

## Delivered and verified

| Area | Result and evidence |
| --- | --- |
| Automatic intelligence | Existing authenticated encounter/follow/library workflow preserved. RSS/cache-first acquisition, authorised audio fallback, bounded queueing, deduplication and automatic READY polling remain covered by the full suite. No catalogue-wide crawl. |
| Real podcast | Open Source Security, “Forking Open Source Projects with Sheogorath”, episode `cd76cc10-ce37-4d65-9274-fd3052b1bcbd`: live READY, on-demand-audio provenance, 7 chapters, 5 topics, 5 moments, 2 search matches. Existing cached result reused; no new transcription charge. |
| Fresh complete pipeline | Original owned 50-second evaluation fixture automatically queued through the tester encounter path. Job `9f113004-8c2a-45f4-bca1-c18609f5251f` reached READY: brief, 3 chapters, 5 topics, 2 moments, 1 conversation-search match. Cache reuse retained the same job and usage-row count (20). |
| Long-form | Four-hour transcription/hierarchical-analysis checkpoints, visibility renewal, budget reservations, process termination and fresh-process recovery passed mocked-provider tests. No new four-hour paid/live run was performed. |
| Rights | Public-transcript/caption-specific reservations are independently represented; they do not automatically prohibit licensed internal processing. Global reservations, disputes and takedowns remain controlling. Captions, translation and voice replication are not granted by internal analysis. |
| Detection | Sponsor declarations and adjacent offers retain all source references. Ordinary product discussion in the owned fixture did not become an advert. One candidate advanced to independently audio-checked VERIFIED. |
| Exact audio | Transcription persists the acquired audio SHA-256. Audio verification requires that binding, checks actual bytes and stable delivery validators, and uses inward-only acoustic boundaries. URL hashes are not audio fingerprints. Legacy/publisher transcripts without exact alignment remain ineligible for automatic skipping. |
| Pilot | Server-authoritative tester-only switch, expiry, preference/category checks, matching audio bytes, fresh 10-second per-skip authorisation, current rights, disputes and safe destinations. Ordinary production automatic skipping remains disabled. |
| Native | Existing Expo audio engine retained. Bounded private exact-audio cache, source/race guards, actual post-seek position confirmation, actual duration notice, immediate Undo, preference change handling and 10-second status refresh. No second player. |
| Safety and privacy | Revoked display permission blocks cached intervals. Missing alignment does not restart verification on every poll. Listener/episode deletion removes authorisation leases; local profile deletion removes only the private verified-audio copies. |
| Admin | Existing Internal testing screen gains pilot control without extending active expiry. Existing Ad Skip operations distinguish synthetic evaluation receipts from real episode skip counts. Desktop/mobile interactions and screenshots verified. |
| Persistence | READY intelligence, verified interval and execution/Undo receipts survived the second deployment/restart. SQLite integrity check passed; no outstanding AI reservations. |

## Actual Ad Skip playback evidence

Live authenticated AWS APIs plus a real browser audio element exercised the same execution adapter used by native. Credentials stayed in the Node-side bridge, not browser JavaScript.

- Original synthetic fixture; fictional sponsor, two system voices, ordinary product discussion. Not a commercial podcast or real advertiser.
- Ground-truth advertising region: 15.000–35.000 seconds.
- Independently verified inward interval: 15.200–34.500 seconds.
- Actual playback: 15.205516 → 34.500 seconds; Undo: 15.205516 seconds.
- Audio SHA-256: `bda9d3b7c25e88ee8b4c010cf81826a779e888d2c67ddc7fc81c8ed77eff9d44`.
- Start boundary was 200 ms inside the authored advert; end boundary was 500 ms inside it. The measured interval did not cross either conversation boundary.
- One evaluation skip and one evaluation Undo recorded; zero real-podcast skips recorded. Wrong fingerprint denied by the live API.
- Kill switch, disputes, failed seeks, ordinary-user exclusion and revoked rights tested automatically with unpaid fixtures.
- A separate one-use QA invitation was issued, used and revoked. Original tester membership restored; no existing invitation was consumed by this test.

These observations do **not** establish general precision, recall, false-positive rate, dynamic-ad robustness or long-form advert accuracy. A diverse authorised, labelled evaluation corpus is still required. Server receipts are client-confirmed playback telemetry, not independently verified listening receipts.

## Five priority podcasts

Latest canonical RSS episodes inspected on 22 October 2026. Each blocked encounter has an actionable review record; missing evidence is not described as a publisher prohibition.

| Podcast / inspected episode | RSS source / transcript | Actual blocker and next action |
| --- | --- | --- |
| Danny Jones #441, Sharon Weinberger | `https://rss.pdrl.fm/0fcac1/feeds.megaphone.fm/QCD2752074976`; no publisher transcript/cache | Legacy channel approval contained only “i said yes”, no supporting evidence. Corrected through audited Super Admin endpoint to `LEGAL_BASIS_NOT_ESTABLISHED`, preserving history. Supply a documented publisher licence or applicable basis. |
| Lex Fridman #502, Psychiatry | `https://lexfridman.com/feed/podcast/`; publisher transcript reference present, no cached transcript | `LEGAL_BASIS_NOT_ESTABLISHED`. Transcript availability is not processing/display permission. Provide a documented compatible basis. |
| Joe Rogan, MMA #187 with Robert Whittaker | `https://feeds.megaphone.fm/GLT1412515089`; no publisher transcript/cache | Existing policy blocks the observed RSS reservation “© All rights reserved” (`PUBLISHER_RESTRICTION`). This records the notice/policy decision, not a new legal finding that every exception is unavailable. Rights review must establish a compatible basis without silently erasing the reservation. |
| Dan Carlin, Show 74 — Mania for Subjugation IV | `https://feeds.feedburner.com/dancarlin/history?format=xml`; no publisher transcript/cache | `LEGAL_BASIS_NOT_ESTABLISHED`; RSS duration 04:01:20 also exceeds the unchanged four-hour audio limit. Establish rights and select a shorter eligible episode or authorised transcript route. |
| Julian Dorey, Dave Collum | `https://rss.pdrl.fm/59fdc5/feeds.megaphone.fm/QCD7565826865`; no publisher transcript/cache | `LEGAL_BASIS_NOT_ESTABLISHED`; documented compatible rights basis required. |

No paid work was initiated for these five blocked episodes. A jurisdiction-specific TDM basis was not invented.

## Limits and recorded costs

- Original tester only; pilot active. Expiry unchanged: **2026-10-27 21:53:27.023 UTC**.
- Temporary caps unchanged: $25/day, $125/month, 54,000 transcription seconds/day, 14,400 seconds/source episode.
- Ordinary caps verified unchanged: $5/day, $25/month, 10,800 transcription seconds/day, 7,200 seconds/source episode. Translate remains a separate private ledger.
- New paid processing this task: **$0.000570** text analysis; no new paid transcription. Application-ledger month total **$0.563876**, zero outstanding reservations.
- AWS Cost Explorer, queried 22 October: **$5.453964** provisional unblended month-to-date cost, excluding credits/refunds, period 1–22 October inclusive. AWS marks this estimated; billing can lag. No additional always-on resources, GPUs or NAT gateways were created.

## Release and verification

- Repository `pH7-dispensary/radiostar`, branch `work`; unrelated untracked files preserved.
- AWS identity checked: account `208096650030`, `eu-west-2`, existing `RadioStarDeploymentRole`.
- Final backend release SHA-256: `28d578381ef3da65fab2ed19d8a8cd0adb718a65a9e9bdcc0bf3958143b1a9eb`.
- Existing HTTPS API: `https://d3ri12f40b85i3.cloudfront.net`.
- API, single worker, SQLite, FFmpeg/FFprobe healthy; SQS and DLQ empty. Protected endpoints reject unauthenticated access; administrator separation verified.
- Application operations screen still marks CloudWatch delivery/S3 backup freshness UNKNOWN because it does not query them; do not interpret that dashboard as comprehensive infrastructure verification.
- Previous source retained on EC2; both prior release archives copied to rollback objects before Terraform release replacement. No data migrations or pH7 resource changes.
- Full `npm test`, native `npm run typecheck`, iOS production export, admin desktop/mobile browser verification, live release smoke, live fixture pipeline/cache and real-audio seek/Undo passed. `git diff --check` passed. No separate lint script is configured.
- Signed **1.0.0 (10)**, EAS build `df07c633-15be-4fdc-a11a-a8e609ae5cde`, existing project/bundle/team. IPA signature verified with `codesign --verify --deep --strict`; embedded production configuration and skip adapter strings inspected. Background audio retained.
- TestFlight submission `26e8dfb3-7752-41c2-a7e8-25aef814c6db`: accepted by EAS and queued for upload at report preparation (`IN_QUEUE`), not yet confirmed received by Apple. No public App Store review requested.
- Implementation commits: `70fc55c`, `70e97af`, native build number `c6d0307`.

Reproducible live checks: `node scripts/cloud/verify-release.mjs`, `node scripts/verify-live-internal-intelligence.mjs`, `node scripts/verify-live-ad-skip.mjs`. Explicit `--start` may invoke bounded paid fixture analysis if not cached; `--play` creates and revokes a separate evaluation enrolment. It requires `RADIOSTAR_PLAYWRIGHT_MODULE` to point to an installed Playwright module.

## Remaining verification / scope limits

1. Install build 10 on the physical iPhone after Apple processing; verify real native seek, Undo, playback speed, background operation and status transitions. Browser execution and a signed IPA do not substitute for this.
2. Native exact-audio pilot copies are capped at **32 MiB**, with a 12-second optional preparation deadline. Larger/unstable/unmatched files retain ordinary publisher playback with no automatic skip. This does not reduce the four-hour intelligence-processing ceiling.
3. If verification completes while the publisher stream is already playing, availability refreshes automatically, but exact-copy skipping starts on a subsequent episode load. The current stream is not interrupted. Old cached transcripts lacking byte alignment are not retroactively declared verified.
4. Broad real-world advert evaluation remains blocked on suitable authorised, labelled audio; no accuracy percentage is claimed. Five priority-show processing bases remain unresolved as above.
5. To exercise the owned example on iPhone: in **All Podcasts → Conversations** search **“accurate evidence playback”**, open the “Owned fixture: sponsorship break and product discussion” result and enable Ad Skip. Play another episode, then return to the fixture so the exact-audio copy is loaded; play from the beginning. Pause/resume alone does not replace an already loaded publisher stream. Expect the controlled break around 15–35 seconds and use Undo. This is explicitly synthetic evaluation content.
