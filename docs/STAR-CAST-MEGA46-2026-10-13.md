# Mega Prompt 46 — implementation and verification

## Recovered state

Worked in the existing `/Users/oska/Documents/star-cast` repository on `work`, based on `88bc773`. Remote: `pH7-dispensary/radiostar`. The worktree was clean before this request. No reset, replacement application, extra player, new database, credential creation, infrastructure provisioning or production deployment occurred. No repository `AGENTS.md` or GitHub Actions workflow was present.

The user reports that the previous intelligence work now runs on their physical iPhone. That is user-reported evidence, not a physical-device test performed during this change. No new screenshots were attached with Mega Prompt 46; the existing native design, code and earlier recovery evidence were used.

## Delivered

| Requirement group | Implementation and evidence | Remaining release gate |
| --- | --- | --- |
| Default-on intelligence | Versioned native preference migration enables former unactivated listeners; explicit new opt-out persists. Same shared coordinator, canonical transcript, SQLite cache, job deadlines and budget ledger. Existing automatic publisher-only and explicit audio-consent tests pass. | Public production authentication/worker deployment remains outside the trusted-LAN build. |
| Compact Brief | Smaller episode identity, THE BRIEF, readable compact overview, up to six existing key ideas, expandable cached detail. Internal segment-index prose removed from presentation, source references retained in stored data. Real Python Bytes #495 displayed without another analysis call. | Physical iPhone typography, expansion and VoiceOver acceptance. |
| Compact Explore | Whole-item tab sizing and selected-tab scrolling; a 320px clipping defect found and fixed. Compact chapter rows; topic queries retrieve real passages, related chapters only where canonical segment IDs overlap. | Larger Dynamic Type and touch-device gesture acceptance. |
| Transcript and moments | Server search over all transcript segments, 60-item pagination, native FlatList virtualization, speakers, valid timestamp actions, current-position highlighting, bounded request generations. Searching NPR for “scientific” found passages at 6:20, 8:31 and 9:46, beyond the initial page. Clicking 8:31 moved the existing player to 8:31. Python Bytes HTMX topic returned a real 10:05 passage. | Audio alignment must still be validated for dynamically inserted variants before automatic skipping. |
| Conservative Ad Skip | Five independently persisted category preferences; candidates reuse the canonical transcript, carry provenance/version and never become verified from text alone. Preview and return, correct/incorrect/missed reports, idempotent per-listener votes. Incorrect feedback disputes intervals; new overlapping transcript candidates inherit the dispute. | Automatic production skipping remains hard-off. No production-quality acoustic fingerprint corpus or real-world precision evidence exists. |
| Skip safety domain | Requires verified state, explicit boundary verification, finite duration and safe bounds, matching nonempty fingerprint, high-confidence independent supported evidence including fingerprint, enabled category and no dispute/manual seek conflict. Correlated transcript/cross-episode evidence does not count twice. Undo suppresses immediate re-skipping. | Independent annotated audio evaluation, not merely synthetic passing tests. |
| Motion and artwork | Shared lavender loading component across discovery, search, episodes, intelligence, transcript, referrals and skip settings. No invented percentages. Loops stop on unmount/background and obey reduced motion. Real artwork fades in; missing art uses a neutral icon instead of a stock photo. Existing follow/save haptics remain. | OS Reduce Motion, tactile feedback and on-device frame pacing are not physically measured here. |
| Referral storage and qualification | Existing SQLite adapter now persists hashed installation credentials, codes, attribution, onboarding, pending listening observations, verification receipts/audit, recurring ledger entries and feedback. Base 600 minutes; each qualified referral +300 minutes every month, without a referral cap. Threshold recovered from migration: 30 verified minutes. | Independent identity/fraud and listening-receipt verifier must be selected and connected. Client reports cannot activate a reward. |
| Allowance | Server calculates monthly/earned/consumed/remaining/reset data. Verified intervals are unioned to prevent overlap, clipped to UTC periods; pauses, stale gaps, seeks and offline reports cannot self-bill. Pending reports remain separate. No enforcement based on unverified client timers. | Genuine production consumption/enforcement awaits a trusted receipt source. |
| Referrals native experience | Server-backed Profile, qualified/pending counts, earned recurring time, linked listener progress, refresh/recovery, native Share, custom-scheme invites, optional onboarding code entry and HTTPS fallback route. Reward pulse/haptic only follows an increased server-confirmed earned balance. | Native Share and custom-scheme handling need a physical native build; public invite hosting/App Store distribution are not configured. Expo Go can use onboarding code entry. |
| Friend bonus | Undefined in the recovered contract, so defaults to zero. An explicit server configuration can grant an expiring current-period bonus, not an invented permanent entitlement. Profile explains this in invite details. | Product owner must approve amount/policy before configuring a nonzero bonus. |
| Navigation and accessibility | Existing player and mini-player preserved; visible navigation gap retained. Brief/Explore/player/back and Profile/Search journeys exercised. Transcript is not nested in a vertical ScrollView. Light tokens adjusted for contrast; primary labels now use an on-accent token. | Physical safe areas, system modals, VoiceOver focus, Dynamic Type and background audio matrix. |
| Development overlay | No app-owned blue gear control found in native source or rendered preview. No accessibility/settings feature was removed. | If it is still visible on the iPhone, inspect the actual screenshot; it may be Expo Go tooling, but that is not confirmed here. |
| AWS readiness | Existing dedicated-account foundation preserved. Added PostgreSQL verification/receipt/reward migration contract; no migration executed against a cloud database. | Separate approved Star Cast account, production receipt/auth design, secrets, rights/retention review and deployment authorization. No pH7 resources used. |

## Security and trust boundaries

- All local listener and skip API routes require the development device token; private listener routes additionally require the installation bearer credential. Identity is derived from its hash, never a supplied profile ID. The key remains in native SecureStore, with a web-only preview storage fallback.
- Anonymous registration is a trusted-LAN development facility, explicitly refused under `NODE_ENV=production`. This is not device attestation and must not be exposed publicly.
- No HTTP route can qualify a referral, reconcile verified listening or issue ledger credits. The internal `reconcile` boundary requires independently authenticated receipts, fraud approval and unique verified subject hashes for both participants. It is deliberately not connected to untrusted client assertions.
- Client onboarding is a lifecycle marker, not proof of genuine activity. Online observations are server-clock bounded and pause/seek/session constrained but remain **pending**, because elapsed time is not proof that a human listened. Offline reports remain pending and are not deducted.
- Self-referrals, attribution swaps, old/onboarded-listener attribution, duplicate qualification, duplicate identities and event replays are rejected or idempotent. Permanent rewards and verification records are transactionally persisted. There is no public listener directory or exposure of another listener’s history.
- Ad feedback is listener-attributed and deduplicated; positive feedback cannot verify a candidate, and negative reports cannot be automatically reversed. A publisher enclosure URL hash is explicitly not treated as a matching acoustic fingerprint.
- OpenAI credentials stayed server-side in the existing ignored mechanism. No key or development credential was printed or committed. No paid calls were added by this work.

## Verification

- `npm test`: full existing suite plus listener/referral/skip HTTP-domain tests and native preference migration tests pass. Providers are mocked; no model spending in tests.
- `npx tsc --noEmit`: pass.
- `npx expo install --check`: dependencies aligned with the existing Expo 57 project.
- iOS export: successful 706-module bundle; final export location `.starcast/ios-mega46-verified`.
- `git diff --check`: pass.
- Native-code web preview exercised at 320px, 390px and 1280px; real cached Brief, chapters, topics, moment retrieval, virtualized transcript search/seek, skip preference save, Profile and restart persistence. Captured browser error log was empty.
- Light-mode measured contrast: muted text on lavender 4.70:1; accent text on lavender 4.69:1; white on primary 5.74:1. Dark primary label on lavender 7.39:1. This is targeted token measurement, not a complete accessibility certification.
- Backend restart retained the same listener invite code, base allowance, preferences and completed intelligence. Tests separately verify recurring rewards across a UTC month boundary and a real SQLite close/reopen.
- The final restart loaded the latest backend; a read-only request for cached Python Bytes #495 returned `READY` with six chapters. Onboarding cannot finish while a manually submitted invite is still being linked.
- Paid development ledger remained **7 entries, $0.117941 total, zero outstanding reservations**. Existing $5/day, $25/month, 3 audio hours/day and 2 hours/episode controls were not raised or disabled.
- `xcrun simctl list devices available` is unavailable on this Mac (`simctl` not installed). No simulator or physical iPhone verification is claimed.

Screenshots are local ignored artifacts under `.starcast/evidence/`: `mega46-brief-night.png`, `mega46-brief-day.png`, `mega46-explore-night.png`, `mega46-moment-day.png`, `mega46-ad-skip.png`, `mega46-profile-day.png`, and `mega46-wide.png`. They are native-code web renders, not iPhone screenshots.

The frontend and motion skill checks informed whole-item responsive tabs, reduced-motion handling, contrast corrections and restrained loading/reward transitions. The existing native design and dependencies were retained.

## Ad Skip evaluation

`node scripts/evaluate-ad-skip.mjs` runs an isolated synthetic cohort. A JSON path may be supplied for explicitly selected, lawfully acquired and independently annotated real cases. The evaluator makes no network/model calls and cannot enable production skipping. Synthetic tests prove safety rules, not real-world accuracy.

Proposed release thresholds are explicit in `skip-evaluation.mjs`: at least 30 episodes and 1,000 verified adverts, precision at least 99.5%, zero conversation skips, zero variant-mismatch skips, p95 boundary error at most 500ms, and 100% Undo success. They require product/safety acceptance and real evidence. Complaint rate is `null` until genuine listener feedback exists. Neither synthetic success nor passing thresholds automatically flips a feature flag.

No bulk catalogue processing or long Joe Rogan transcription was triggered. The 168-minute example still exceeds the two-hour limit.

## Concise iPhone acceptance checklist

1. Reload Expo Go on the same Wi-Fi. Open cached Python Bytes #495 from Search: Brief should appear without activation. Expand/collapse detail; toggle appearance and repeat.
2. Explore all four tabs, including with larger text. Open a chapter, return to the player, and confirm the seek. Search the transcript beyond its first page; verify highlight and speaker labels.
3. Find the HTMX moment, tap Play from here and confirm the spoken content/timing on the actual delivered audio variant.
4. Ad Skip: independently toggle all five preferences, reopen/reload and confirm persistence. Candidates must never auto-skip. Preview/return should preserve listening position. Only submit correct/incorrect feedback after actually checking the audio.
5. Profile: verify the server-owned allowance and refresh, open Share, cancel without sending, and confirm no reward animation occurs merely from sharing. Test code attribution with a genuinely new development installation; it must remain pending without trusted verification.
6. Enable OS Reduce Motion and VoiceOver; repeat loading, expansion, tabs and Profile. Test keyboard, safe-area spacing, swipes/back, mini-player gap, interruptions, lock-screen audio and AI Sleep on the phone.

## Release status

The local implementation is delivered; production automatic Ad Skip and genuine referral rewards/allowance enforcement are **not activated**. Required external actions are trusted identity/listening verification, an approved public invite destination and friend-bonus policy, real annotated Ad Skip evaluation, and physical-device acceptance. AWS remains preparation-only as requested.
