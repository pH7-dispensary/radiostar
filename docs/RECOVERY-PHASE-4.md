# Recovery Phase 4 — native intelligence feedback

Scope: existing native player, shared status delivery, evidence-based preparation
estimates and separate audio waiting/recovery. No Phase 5, TestFlight build, rights
changes, budget increases or new infrastructure.

## Implemented

- One reusable `EpisodeIntelligenceStatus` above the existing accordion and in
  detail views. Actual backend stage labels, expandable safe explanations,
  meaningful actions, and a locally persisted, dismissible introduction.
- Brief opens automatically at READY. Explore retains grounded chapters, topics,
  and playable moments. Unavailable rows stay compact without repeated errors.
- Native-driven lavender/star/ring/waveform motion follows processing state,
  stops in the background, and respects Reduce Motion. Meaningful state changes
  have accessible announcements; polls do not repeatedly announce the same state.
- Shared, reference-counted polling survives closing a detail view, stops when
  hidden/terminal, resumes on foreground, and bounds network retries/waiting.
- Existing Expo audio engine supplies separate CONNECTING, BUFFERING, PLAYING,
  PAUSED and FAILED feedback. Load deadlines expose retry instead of silently
  losing the source; retry preserves position and speed. No buffering countdown.
- ETA uses successful, recent, same-version/same-route lifecycle measurements.
  Audio samples additionally require comparable episode durations. At least
  three samples and a bounded spread are required; obsolete/elapsed samples
  cannot promise immediate completion. API returns a range, confidence and update
  time. First estimate per stage and actual durations are stored in existing job
  records, not a new analytics store or listener-visible transcript endpoint.

## Evidence and limitations

- Reused Phase 1 transcript-first duration handling and existing durable queue /
  Super Admin controls. Their regression suites pass; this does not certify
  separate Phase 2/3 briefs as fully complete.
- `npm test` (including release, rights, queue, recovery, processing-progress,
  native UX and new presentation/session tests): passed with mocked providers.
- Native TypeScript, Expo dependency checks, Expo Doctor and production iOS,
  Android and web exports: passed. Export used HTTPS AWS configuration with dotenv
  and legacy public tokens disabled. No signed native build was requested.
- Real exported React Native Web player tested at 320/375/390/430px, light/dark:
  automatic ANALYSING → READY, uninterrupted playback, intermediate states,
  rights/budget/failure explanations, network recovery, actual audio load failure
  and retry, restart and introduction persistence. All network data is intercepted;
  the fixture WAV runs through the existing Expo player. No paid model requests.
- Screenshots and rerunnable harness: `.starcast/phase4-visual/` and
  `scripts/verify-native-processing.mjs`. Local export:
  `.starcast/phase4-final-export/`. Screenshots are ignored local evidence.
- Queue ETA is intentionally withheld: queue depth alone does not prove worker
  availability. Existing jobs do not supply reliable chunk/analysis-section
  counters. No prediction is shown without sufficient comparable timing data.
  Confidence is sample-based, not a statistically calibrated completion guarantee.
- Native buffering projection is unit-tested. Expo's web adapter does not expose
  native media errors/buffering; browser testing exercises actual load timeout and
  retry instead. Physical iPhone buffering, VoiceOver, Dynamic Type, Bluetooth,
  lock-screen/background audio and sleep interaction require device verification.
  These are not claimed as physically verified.

## Deployment

Pending final release verification. Existing deployment script guards account
208096650030 / eu-west-2, checks for active work before replacement and retains
the previous application directory with health-check rollback. The changes are
additive JSON job fields and compatible API estimates; no database migration.
