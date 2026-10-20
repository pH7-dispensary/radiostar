# Recovery Phase 5 — Sleep and Discover

2026-10-20 · `work` · started at `cf97645`.

## Implemented

- AI Sleep reuses the approved purple brand asset, native opacity/scale animation and the existing shared sleep engine. READY, SETTLING, PAUSED (“Audio paused”), STOPPED and ERROR reflect actual session state. Animation quietens over the protected window and stops when inactive, hidden, backgrounded or Reduce Motion is enabled. A local midnight treatment does not change the saved appearance preference.
- The protection deadline is labelled as a minimum listening window, not a predicted sleep-onset time. Supported extensions remain +5/+15/+30 minutes. No physiological detection, invented confidence or non-functional sensitivity setting.
- Manual timers retain separate controls: 5/10/15/20/30/45/60/90 minutes and end of episode, remaining time and cancellation. Starting one sleep mode replaces the other. Episode/source changes cancel pending sleep ownership. The deadline check catches up after returning to the foreground.
- Completed AI Sleep recovery and feedback context persist locally. An interrupted active session is not silently restarted. Cancelling a fade cannot report a successful pause or resurrect an old session. Re-entering the app resets idle observation rather than interpreting suspension as sleep.
- Discover replaces the visible Search tab, preserving internal navigation keys and existing catalogue/conversation/moment APIs. It includes local recent queries, real catalogue categories/artwork, neutral “Explore podcasts”, dated releases from followed shows and conversation prompts. Podcast queries debounce; semantic requests still require submission. Results and history are bounded. Recent searches respect the existing history preference and profile deletion.
- Header controls have visible glyph fallbacks, explicit accessible names and 44-point targets. The player's empty bordered spacer is removed. Sleep/timer layouts scroll, preserve safe-area separation and support enlarged text; modal motion respects Reduce Motion.

## Verification

- `npm test`, including new `test-native-sleep-discover.mjs`: shared-engine learning, minimum protection, all timer presets, cancellation/idempotence, restart recovery, feedback, stale fade completion and real-metadata filtering.
- Native TypeScript, Expo dependency validation and Expo Doctor (21/21).
- Production Expo export including iOS Hermes bundle and approved brand/font assets. This is **not** a signed native build.
- `scripts/verify-native-sleep-discover.mjs`: actual Expo web UI/audio against isolated, intercepted fixtures; 320/375/390/430 widths, light/dark, reduced/active motion, explicit conversation/moment searches, playable references, timer controls, mode replacement, restart recovery, follow/navigation and appearance persistence.
- Existing `scripts/verify-native-processing.mjs` regression harness against the Phase 5 export: status polling through READY without refresh, continued audio, rights/budget/failure states and audio retry.
- Read-only live AWS catalogue request returned HTTP 200, four results, including Hard Fork with Technology category, artwork and RSS source. The unauthenticated request remained HTTP 403. No paid model requests.
- `git diff --check`.

Browser evidence is under ignored `.starcast/phase5-visual/` and `.starcast/phase5-player-regression/`. The fixture-backed timing report is `.starcast/phase5-visual/results.json`; it is not a physical-device benchmark. Run visual harnesses with `RADIOSTAR_PLAYWRIGHT_MODULE` pointing to an installed Playwright module and `RADIOSTAR_EXPORT_DIR=.starcast/phase5-final-export`.

## Partially verified / blocked

- Browser screenshots are not native iPhone screenshots. `xcrun simctl` is unavailable on this Mac. Real iPhone VoiceOver, Dynamic Type, audio interruptions, lock-screen controls and suspended/background timing still require device testing.
- Existing inference remains foreground-only and deliberately conservative. JavaScript timers are not an OS-level alarm and cannot guarantee punctual execution during suspension. Both sleep information and manual timer copy disclose this limitation. Manual timer restart persistence is not claimed.
- Recovery preserves an estimated rewind position, not a measured last-conscious position. Native background audio configuration and the existing player are preserved, not newly certified.
- Discover uses the existing bounded catalogue collection, not popularity rankings or a new recommendation provider. Episode-title matches are from recent cached followed episodes; conversation/moment coverage remains limited to authorised processed transcripts.
- No production frame-rate, memory or device battery benchmark is claimed.

## Release boundary

No backend/intelligence-processing changes, AWS deployment, rights/budget changes, new dependencies, paid AI calls, EAS build, EAS submit or App Store submission. Existing unrelated untracked files were preserved. Phase 6 must install the consolidated native build on an iPhone and verify device-only behaviours before release. The previous native release remains unchanged; this phase is a source commit and export only.
