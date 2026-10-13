# Star Cast recovery and release-readiness report

## Repository and architecture

Recovered `/Users/oska/Documents/star-cast`, remote `pH7-dispensary/radiostar`, existing branch `work`, clean starting tree at `10536c3435fdc34e80bd43707c0dbe1f65207eed`. No reset, replacement repository, pH7 infrastructure mutation, AWS provisioning or PostgreSQL deployment was performed.

Preserved the single Expo Audio player, Expo SDK 57 native application, Node HTTP backend, catalogue integrations, transcript/intelligence modules, deterministic sleep and conservative Ad Skip domains. Recovered Search direction from the existing `star_cast_world_class.html` prototype in the owner's Downloads folder. No attached screenshots were available for pixel comparison.

## Root causes and changes

The old request handler reported audio transcription as disabled without wiring the existing adapter. Text enablement did not enable audio. The adapter's model/response-format combination did not provide supported timestamp output, chunk preparation was absent, and jobs/costs/caches were volatile. A 168-minute episode also correctly exceeds the two-hour cap. UI launch and API health therefore did not establish usable intelligence.

The authenticated request path now resolves the real publisher episode, checks limits, discovers publisher transcripts first, optionally prepares bounded audio chunks after consent, reserves budget transactionally, invokes the existing server-side provider, validates source references, persists results and exposes actual job states. Native polling and results render the same durable job. Concurrent identical requests share work; matching audio acquisition is deduplicated. A maximum of two concurrent jobs and two attempts per failed episode is enforced; a restart never automatically retries a paid call.

SQLite is the single local adapter for transcripts, jobs, intelligence, provider diagnostics and budgets. Feature switches remain explicit server configuration, not fabricated persisted admin controls. PostgreSQL 005 prepares nullable timestamps/provenance and micro-dollar usage records; production migration/import and distributed worker locking remain unimplemented.

Security: the previous static handler could serve arbitrary repository files, including the ignored credential file, over the LAN. It now uses an exact public-file allowlist; regression tests assert those paths return 404. No evidence of previous access was observed. **Rotate the existing OpenAI key and local device token before broader use**, because previous exposure cannot be ruled out. This work did not print, commit or rotate credentials. URL fetches now validate HTTPS, redirects and DNS, pin public IPv4 addresses, deny private networks, and enforce time/size bounds. Authentication, rate limits and budget controls are not a substitute for production TLS and per-installation credentials.

## Measured live evidence

All calls below were explicitly requested local text analysis from publisher transcripts. No audio provider charges were incurred. Prices are estimates from recorded provider token usage, not a billing invoice.

| Episode/request | Result | Input / output tokens | Estimated USD | Observed elapsed |
| --- | --- | --- | --- | --- |
| Python Bytes #497, Faster than light profiling (26:48), publisher VTT | READY: real brief, 2 accepted chapters, grounded moments | 12,147 / 1,968 | 0.008008 | 15.090 s |
| Bloomberg Tech, AI Chip Race Heats Up From Microsoft to Musk, publisher SRT | FAILED: response truncated; nothing published | 22,660 / 4,000 | 0.015464 | Not retained |
| Same Bloomberg episode, one allowed retry | FAILED: source validation; retry ceiling retained | 22,785 / 729 | 0.010280 | 8.057 s |
| Python Bytes #495, Banned (27:46), publisher VTT, bounded source-index schema | READY: real brief and 6 accepted chapters | 15,339 / 643 | 0.007164 | 14.081 s |

Total recorded local text usage: **$0.040916**, four provider calls, zero transcription hours. Daily/monthly caps remain $5/$25; audio cap remains three hours/day and two hours/episode. Failed generated output is charged but is never treated as ready. Source selection now uses bounded integer indexes mapped server-side to canonical IDs; provider output is retained privately for offline diagnosis of future failures. The historical Bloomberg failure remains visible rather than erasing evidence or resetting retries.

For #497 the genuine VTT URI is `https://pythonbytes.fm/episodes/show/497/faster-than-light-profiling.vtt`; transcript SHA-256 is `b523db2badfa893eb146056a369df5a6f5b752193d91d2ec6aa8d19a9484ac31`. Find a Moment returned source segment 74 at 245010–248320 ms. The native React Native web preview opened the shared player at 4:05 and displayed the stored brief and chapters. Repeated requests reused cache with zero new provider calls, including after backend restart. Numeric timestamp bounds and cited segment boundaries were checked; this does not establish acoustic alignment for every dynamically inserted-ad audio variant.

The real Podnews episode “A podcast app just for audio fiction” was safely downloaded and probed at 289385 ms; a ten-second mono chunk of 60946 bytes was generated. This verifies real transport/chunk preparation only. Provider audio transcription, multi-hour acoustic alignment and physical iPhone playback of transcribed moments remain **unverified**.

## Native product improvements

Search now uses the approved hero, animated scope/mode selection, ASK/DISCOVER/JUMP explanations, topic questions, real artwork-led catalogue cards, following, source coverage, actual extractive results, playable references, saved moments and follow-up questions. Conversations are the default. My Podcasts restricts feeds; All Podcasts explicitly means all processed episodes for conversation queries. No global popularity, transcript coverage or answer is invented. Embedding retrieval and generative cross-podcast synthesis are not implemented.

The player keeps one native audio engine, explicit analysis/consent states, polling, expandable real briefs, chapter playback, moment search, artwork ambience, persistent positions, seek controls and a fixed dismiss control. Mini-player and navigation have a visible 14-point gap and shared alignment. Tab content stays mounted for local state preservation; Profile returns to its previous context. Large local documents moved from SecureStore to app-private serialized file writes; the anonymous identity remains in SecureStore. App restart/crash persistence still needs physical-device validation.

AI Sleep now uses the existing domain engine rather than a second timer-only inference path. Extensions teach a preferred minimum listening window separately from predicted onset. Absence of an extension is not a sleep label. Timers are no longer recreated on every playback update; fade cancellation respects extensions and interactions. The visualization is an irregular field of points/traces, respects reduced motion and stops when hidden. No cloud inference or physiological detection was introduced. Foreground observations are conservative; background automatic pause remains unverified.

## Validation and readiness

Verified: `npm test` (mocked provider), native TypeScript, Expo dependency alignment, and iOS Metro/Hermes export. Local browser verification used the actual RN components at 390×844 in light/dark modes, Search → real source → player, chapter/brief rendering, and Profile → previous Search context. Tests cover unauthorized requests, blocked secret paths, timestamp correctness, duration limits, ten-way request deduplication, atomic budget reservations, restart recovery, uncertain costs, audio consent, untimed transcripts and separate sleep learning.

**Physical iPhone: NOT VERIFIED.** No current device evidence was received and Xcode simulator tooling is unavailable. An iOS JavaScript export is not a signed native build. Performance, memory, battery, Dynamic Type, VoiceOver, interruptions, lock-screen controls and sleep/background reliability have not been measured on-device.

| Component | Classification | Remaining release gate |
| --- | --- | --- |
| Native shell, themes, Search | IMPLEMENTED BUT UNVERIFIED | Physical iPhone, accessibility and complete navigation matrix |
| Audio, seeking, persistent positions | IMPLEMENTED BUT UNVERIFIED | Restart, route change, interruptions, long playback and failure recovery on iOS |
| Background playback / lock screen | IMPLEMENTED BUT UNVERIFIED | Expo Go limitations and dedicated development-build tests |
| Catalogue / RSS | PARTIALLY IMPLEMENTED | Broader XML compatibility, pagination, backoff; currently bounded latest episodes |
| Publisher transcript acquisition | PARTIALLY IMPLEMENTED | Real VTT/SRT verified; other formats tested with fixtures, broader publisher QA |
| Paid audio fallback | IMPLEMENTED BUT UNVERIFIED | Real paid audio call, long-form quality and overlap alignment |
| OpenAI / briefs / chapters / moments | PARTIALLY IMPLEMENTED | Successful real episodes; source/semantic quality and failure corpus need expansion |
| Conversation Search | PARTIALLY IMPLEMENTED | Lexical/topic/extractive only; embeddings and grounded multi-source synthesis pending |
| Ad Skip | PARTIALLY IMPLEMENTED | Candidate/verified architecture preserved; production automatic skip stays OFF |
| AI Sleep / manual timer | PARTIALLY IMPLEMENTED | On-device observation/background execution and recovery UX validation |
| Following / saved episodes / moments / history | IMPLEMENTED BUT UNVERIFIED | Native restart/crash recovery and sync integration |
| Offline downloads | NOT IMPLEMENTED | UI explicitly says unavailable; no fake download state |
| Referrals / listening allowance | PARTIALLY IMPLEMENTED | Contracts and honest pending UI; no server qualification/accounting integration |
| Anonymous authentication | DEVELOPMENT ONLY | Secure per-installation issuance/rotation/revocation and sync |
| Privacy / rights / security | PARTIALLY IMPLEMENTED | Key rotation, TLS, tenant isolation, content licences and deletion/retention tooling |
| Persistence / cost controls | DEVELOPMENT ONLY | Durable local tests pass; PostgreSQL import, worker leases and distributed budgets pending |
| Performance / accessibility | PARTIALLY IMPLEMENTED | Device profiling, large libraries, VoiceOver and Dynamic Type audit |
| Deployment infrastructure | BLOCKED | Dedicated Star Cast AWS account and explicit deployment approval; credits unverified |

No component is labelled production-ready based on compilation alone. A native dependency audit also reports 22 advisories (7 moderate, 15 high), concentrated in Expo tooling/transitive packages; the suggested forced downgrade is not a safe fix. Expo was updated within SDK 57 and dependency alignment passes, but the advisory review remains a release gate.

Final checks also verified the honest zero-result search state, saving #495 at 6:00 into Library, displaying its real brief and six chapters, and seeking to the HTMX chapter at 9:35 in the RN web preview. The final iOS export contains no literal OpenAI credential; tracked/candidate source files contain neither local credential. Root dependency audit reports zero advisories. Terraform validation was not run (CLI unavailable); the isolated-account guard and migration are preparation, not an applied or validated cloud stack.

## Next milestone

Run `npm run starcast`, scan the QR code on the physical iPhone, find Python Bytes #497 or #495, and verify cached brief, chapter seek, moment search, playback continuity and restart. Then run one explicitly authorised short no-transcript episode through paid audio fallback within the unchanged budgets. Record device evidence for background/lock-screen/sleep and validate transcript-to-audio offsets before widening the corpus. Do not enable automatic Ad Skip or deploy publicly during this milestone.
