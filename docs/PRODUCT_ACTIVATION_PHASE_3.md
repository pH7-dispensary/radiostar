# Product activation Phase 3 — native playback acceptance

2026-10-26–27. Repository `star-cast`, branch `work`, base `026fd9b`.

**PARTIALLY VERIFIED. Independent engineering checks are complete; physical iPhone acceptance remains BLOCKED by unavailable device access. No new TestFlight build, submission or OTA update was triggered.**

## Device, build and acceptance evidence

- Device model / iOS version: **unknown**. No accessible physical iPhone; USB inventory empty. This Mac has Command Line Tools, not full Xcode; `devicectl` and `xctrace` are unavailable. No frameworks were installed.
- Apple read-only verification: **Radio Star 1.0.0 (13)** is `VALID`, `IN_BETA_TESTING`, and in the internal **Team (Expo)** group. EAS build `bc729b2b-07c3-4d0c-b942-7fee5c1b7860` is finished. Source commit `7e9bfc65d4e071745be1c4da8b8423d5bdbefb`. Availability does not prove installation or device behaviour. Evidence: `evals/product-activation-phase3-apple.json`.
- Build 13 predates Phase 2's native malformed-lease guards (`d00844a`) and this phase's native changes. These changes require a Phase 4 native release. Existing signing/build configuration is unchanged.
- **One authoritative device matrix:** `evals/product-activation-phase3-device-matrix.json`. Its 25 cases contain all requested fields and reproduction steps. Every physical case is **NOT TESTED**; no automated or historical result is substituted for current device evidence.

## Functionality and verification level

| Area | Status and evidence |
| --- | --- |
| Icon, splash, light default, saved appearance, onboarding/auth, safe areas, Dynamic Type | DEVICE VERIFICATION OUTSTANDING. No iPhone screenshots available. Existing behaviour preserved. |
| Audible playback latency | NOT MEASURED. Added engine-position timing explicitly labelled as non-audible evidence. JS promise resolution is never reported as audible startup. |
| Normal playback / source switching | AUTOMATED TESTED by existing playback/safety regression suite. Optional proof work remains after ordinary `player.play()`; no second engine introduced. Physical network and route behaviour outstanding. |
| Background playback and lock screen | BLOCKED for device verification. Existing Expo shared player and native lock-screen metadata retained. JS diagnostics cannot guarantee delivery during suspension or distinguish the origin of a remote command; direct lock-screen command instrumentation is not implemented. |
| Automatic Ad Skip and Undo | AUTOMATED TESTED by existing lease, variant, race, confirmed-seek and Undo tests. Opt-in native diagnostic hooks added. No physical skip/Undo result. Phase 2's real-world corpus still needs independent human review; public automatic skipping stays disabled. |
| AI Sleep and manual timer | AUTOMATED TESTED: actual Swift deadline core, deterministic lifecycle tests and a real **muted macOS AVPlayer**. Latest two-second run: 2017.8 ms elapsed, 6.95 ms native deadline drift, 49 fade samples, volume restored and player paused. This is neither audible nor iPhone/background evidence. `evals/product-activation-phase3-native.json`. |
| Extensions / interruption / stale sessions | AUTOMATED TESTED: actual bridge with mocked native transport plus Swift core; rapid +5/+15/+30, clock jump, source change, cancellation, timer precedence, restart, duplicate pause, legacy record compatibility and privacy revocation. Actual calls/Bluetooth/locked phone outstanding. |
| Overnight AI Sleep | NOT TESTED. No overnight battery, pause, interruption or physiological measurements claimed. |
| Offline following | AUTOMATED TESTED by existing reconciliation, canonical identity, stale operation, persistence and follow preparation suites. Physical airplane-mode/restart check outstanding. |
| Intelligence delivery | Existing backend/HTTP/search/partial-ready regression suites passed with controlled providers. No new paid processing. Physical Brief, Chapters, Topics, Moment/Search playback and auto-refresh checks outstanding. |

## Defect repaired — restart position chronology

**IMPLEMENTED / AUTOMATED TESTED.** Explicit seek and fallback sleep-pause writes omitted `savedAt`. On restart, an older completed native sleep record then appeared newer and could replace a listener's more recent seek. Explicit position writes now carry a timestamp; the shared recovery selector only applies a newer, same-source completed native sleep position. Tests cover newer sleep recovery, later seek preservation, other sources, cancelled/interrupted sessions and invalid positions.

## Minimal diagnostics prepared for Phase 4

**IMPLEMENTED / AUTOMATED TESTED.** “Report a problem” now offers opt-in capture and explicit Share-sheet export. Capture is off by default, memory-only and bounded to 200 events. Stop, process restart and the profile-deletion UI clear capture. Allowlisted values exclude URLs, episode titles, transcript text, credentials, identifiers and raw error messages. There is no diagnostic upload service.

Captured events cover play requests, first observed engine advancement, playing/buffering/error state, app transitions, source changes, pause, speed, manual/confirmed automatic seeks, Ad Skip attempts/failures and Undo. Origin of lock-screen commands is not inferred from generic player changes.

The existing persisted native sleep record gains optional arm/fade/pause-confirmation times and monotonic deadline drift. Export includes only its safe timing/state subset, plus actual bundle version/build where supported. Older builds and web return `UNAVAILABLE` for unavailable native metadata. Existing sleep recovery storage still persists as before; stopping transient capture does not delete sleep recovery. Native pause confirmation observes engine state, not audible output.

The report sheet scrolls within a bounded height, uses the existing safe-area approach and keeps 44-point diagnostic actions. No dependency or player replacement was added.

## Validation

- **PASS:** full `npm test`, including cloud/security/privacy, playback, Ad Skip, sleep, offline follow, indexing/search and new Phase 3 regressions. Paid providers mocked.
- **PASS:** native `tsc --noEmit`; Expo dependency compatibility check; Expo Doctor **21/21**.
- **PASS:** compiled Swift core + deterministic tests + real muted macOS AVPlayer integration. Swift Expo module syntax parse passed. A full iOS module link/device run is **not available** on this Mac; production native compilation belongs to Phase 4.
- **PASS:** production iOS Hermes and web exports using `EXPO_NO_DOTENV=1`, dedicated HTTPS origin and empty development/legacy/insecure overrides. Release environment guard passed. Export is not a signed native build.
- **PASS:** new diagnostic browser workflow at 320, 375, 390 and 430 px in light/dark modes: opt-in state, explicit export, privacy, clear and no runtime errors. Browser evidence is not device evidence.
- **KNOWN HARNESS LIMITATION:** the older full Discover/Sleep browser workflow times out on removed copy, “Episodes from followed shows.” It did not reach sleep checks. The diagnostic-only branch separately verifies the changed UI; this report does not call the old full browser scenario a pass.
- **PASS:** `git diff --check`; no configured standalone lint command.

During development TypeScript/export caught an attempted import of an uninstalled safe-area package; it was removed in favour of the existing native component. Browser testing caught missing explicit web switch state; it was corrected and rerun.

## Production and costs

Read-only STS confirmed **208096650030**, with `eu-west-2` explicitly selected. HTTPS `/api/health` returned **200**, `star-cast`, backend `ready`, SQLite, configured/enabled provider and historical provider verification. Anonymous feature flags were false, consistent with audience-specific gating; this health probe does not prove listener entitlement or feature completion.

No backend deployment, database migration, AWS resource change, pH7 action, new model request or spending-limit change was necessary. Phase 2's deployed backend and rollback remain untouched. No incremental paid AI/build resources were requested; existing infrastructure continues its ordinary costs, not newly measured billing in this phase.

## Owner checklist / remaining device work

Install/open **build 13**, record the iPhone model and iOS version, then fill the authoritative matrix with timestamps and screenshots/recordings:

1. Check icon/launch/light default and saved appearance; play a real episode and measure audible startup. Exercise mini/full player, seek/speed/source changes and network recovery.
2. Run five minutes locked and five minutes backgrounded; test lock-screen/headset controls and position continuity.
3. On private verified owned audio, exercise skip and immediate Undo, then 1.5x/2x, locked/backgrounded and interruption cases. Record actual origin/destination. Do not grant public eligibility from this fixture.
4. Run five-minute manual sleep locked; independently time fade/pause and check position after unlocking/restart. Repeat shortest supported AI window, +5/+15/+30, cancellation, source changes and interruptions.
5. Run one overnight AI Sleep session with predicted/actual pause, saved position, battery and interruptions. Do not infer physiological sleep onset.
6. Follow offline, restart, reconnect, inspect eligible latest-three preparation, unfollow and confirm stale operations cannot restore it. Open an authorised ready/partial-ready episode and test every intelligence surface and playable reference.
7. In the future Phase 4 candidate, specifically repeat later-seek/immediate-restart and diagnostic export cases. Those fixes are not installed in build 13.

The initial model/iOS/five-minute locked timer evidence request remains unanswered. No physical case may be marked PASS until the evidence arrives. The separate Phase 2 advert-review work remains open.

## Git and release handoff

Implementation commit **078ba51** contains the restart fix, diagnostic UI/bridge, Swift timing evidence and regression coverage. The following report/evidence commit records acceptance. Both are pushed on `work` to `origin/work`. Unrelated pre-existing untracked files are preserved. No TestFlight build, submission or public release was made. Phase 4 must compile the changed native module, install the candidate on a real iPhone and close device acceptance before claiming native readiness.
