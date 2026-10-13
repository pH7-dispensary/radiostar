# Star Cast

An existing Expo / React Native podcast player with a Node.js catalogue and on-demand episode intelligence backend. The original browser prototype remains available; it is not the native product.

## Start local iPhone development

From this repository, run `npm run starcast`. Use Node 22.13+ (the built-in SQLite API is required), and install dependencies with `npm ci` and `npm ci --prefix native` first. The launcher loads the existing ignored `continue` credential file, starts the backend on port 4173, selects a LAN address, and starts Expo in `native/`. Scan its QR code with Expo Go on the same Wi-Fi. Set `STARCAST_LAN_HOST` if automatic interface selection chooses the wrong adapter. Keep the Mac awake and permit local network access on the iPhone.

The credential file requires `OPENAI_API_KEY` and `STARCAST_DEV_INTELLIGENCE_TOKEN`. Never put the OpenAI key in `native/.env`, `EXPO_PUBLIC_*`, screenshots, logs, or Git. Only the development device token and backend URL enter the local Expo bundle. This shared token is for a trusted LAN, not public deployment.

The launcher authorises text intelligence and audio transcription for this local session, but audio still requires an explicit in-app confirmation. Nothing is transcribed on opening an episode. It will not kill unrelated processes or silently duplicate an existing server. Ctrl-C stops its own children. `npm start` leaves paid processing off; `npm run start:local-intelligence` enables text only. For audio testing use the launcher, or explicitly set `STARCAST_AUDIO_TRANSCRIPTION=enabled` on the server as well.

## Verification and current limitations

Run `npm test`, then in `native/` run `npx tsc --noEmit`, `npx expo install --check`, and `npx expo export --platform ios --output-dir dist`. Automated tests mock the provider and do not spend money. `STARCAST_REAL_INTELLIGENCE_EVAL=1 npm run eval:real-intelligence` explicitly allows a bounded real publisher-transcript evaluation against the running authenticated backend (the known Python Bytes episode is reused if cached).

See [the recovery and release-readiness report](docs/STAR-CAST-RECOVERY-2026-10-13.md) for measured results, security findings and remaining blockers. Successful bundles and a native-code web preview are **not** physical iPhone or production verification.

## Local episode intelligence

Episode intelligence is on by default for authorised local listeners. Opening an episode checks the shared server cache and can automatically analyse publisher transcripts within the existing budgets. Profile includes a persistent opt-out. The former unactivated preference migrates once; a new explicit opt-out is preserved. Brief and Explore reveal results without a second tap. Audio fallback always needs a separate confirmation for that episode; intelligence never enables automatic Ad Skip.

The compact Brief uses existing cached prose; expanding it does not call a model. Explore has whole-item scrolling tabs, compact chapters, source-linked topic moments, and a virtualized transcript with full-transcript text search and current-position highlighting. Untimed transcripts remain non-seekable.

Explore includes chapters, topics, grounded moment search and a paged transcript. The authoritative lifecycle is NOT_REQUESTED → QUEUED → PROCESSING → PARTIAL_READY → READY, with FAILED/BLOCKED exits. Transcript navigation can work before text generation finishes. Jobs have a 15-minute deadline and bounded retries. “Stop waiting” pauses device polling, not the shared server job or its accounting. Reopening restores server state; server restart makes interrupted jobs explicitly retryable rather than silently repeating paid work.

See [Mega Prompt 45 verification](docs/STAR-CAST-SEAMLESS-INTELLIGENCE-2026-10-13.md) for the latest real-episode evidence and remaining device/production gates.

The backend discovers publisher-provided Podcasting 2.0 transcript references before any audio transcription. Paid processing is off by default, even when `OPENAI_API_KEY` is set. To authorise a trusted local development device, export `STARCAST_DEV_INTELLIGENCE_TOKEN` and require that value in the `X-Star-Cast-Dev-Token` request header. Set `STARCAST_PAID_INTELLIGENCE=enabled` only after reviewing the server-side budget controls (default $5/day, $25/month, three transcription hours/day, two hours/episode).

`/api/admin/intelligence` exposes the local development ledger only to that trusted token. It reports actual cache entries and provider usage; metrics without collected data remain `null` rather than invented.

For an explicitly authorised local intelligence session, run `npm run start:local-intelligence`. It enables paid processing only for that server process while retaining the budget ledger and trusted-device requirement. `npm start` continues to leave paid intelligence off by default.

The local SQLite adapter stores transcripts, jobs, derived results and atomic cost reservations under ignored `.starcast/development.sqlite`. Preserve this directory across restarts; deleting it also deletes budget history. Cache checks use transcript hashes, processing versions, audio enclosure identity, and a 24-hour publisher recheck on explicit requests. Dynamic ad insertion can change bytes behind an unchanged URL: exact audio alignment still needs validation before any automatic skipping. PostgreSQL migrations are deployment contracts and are not applied by this launcher.

Budgets are hard-capped at $5/day, $25/month, three new audio hours/day and two hours/episode. Overlap is charged conservatively. Unknown provider outcomes consume their reserved allowance; retries are never automatic. Whisper-1 is used for bounded, timestamped audio chunks; gpt-4.1-mini generates source-constrained briefs and chapter references. Search currently combines lexical/topic retrieval with extractive quotes over completed episodes, not a global transcript corpus or an embedding-backed research engine.

Public content is not automatically licensed for redistribution. Use this environment for authorised local testing only; public launch requires content-rights review, retention/removal tooling, production authentication and the remaining release gates in the report. No AWS deployment is performed. Star Cast must use a separately verified AWS account, never pH7 infrastructure.

## Referrals and conservative Ad Skip

Profile loads a server-owned 600-minute monthly base and +300 recurring minutes for each qualified referral from the existing SQLite store. Installation credentials stay in Keychain; only hashes are stored server-side. Local enrollment requires the trusted development token and is refused in production. Invite attribution precedes onboarding. The existing qualification threshold is 30 verified minutes plus independent identity/fraud approval. Client heartbeats and offline reports stay pending; they cannot mint rewards or deduct allowance. There is no public qualification endpoint. A production verifier must authenticate receipts before invoking the internal reconciliation boundary; **that external verifier is not connected**.

`STARCAST_FRIEND_BONUS_MINUTES` defaults to zero because no friend bonus was approved in the recovered contract. If explicitly configured, this bonus expires at the next UTC monthly reset; the referrer's +5 hours remains permanent. `STARCAST_INVITE_ORIGIN` accepts an approved HTTPS origin and enables `/invite/:code` web fallback links. No public domain or App Store distribution is configured. Custom `starcast://` links require an installed native build; Expo Go listeners can enter the invite code during onboarding. Native Share is wired but needs physical-device acceptance.

Ad Skip exposes independent persistent preferences, transcript-derived candidates, preview/return, missed-ad reports and correct/incorrect feedback. Positive reports never verify an interval; negative reports dispute it permanently, including overlapping candidates from later transcript versions. Production skipping is hard-off. A URL hash is not an audio fingerprint. Verification requires independently checked boundaries and matching audio fingerprint evidence.

Run `node scripts/evaluate-ad-skip.mjs` for clearly labelled synthetic safety evaluation, or pass a lawfully obtained, independently annotated cohort JSON path. Proposed release thresholds and null unmeasured metrics are emitted; the evaluator cannot change production settings. See [Mega Prompt 46 verification and release gates](docs/STAR-CAST-MEGA46-2026-10-13.md).
