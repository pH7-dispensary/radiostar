# Recovery Batch 7 — AI Sleep and native lifecycle

2026-10-26 · branch `work` · baseline `640360a` / existing TestFlight Build 12.

## Implemented

- Local Expo module `RadioStarSleep` controls the **existing Expo Audio AVPlayer**. It creates no second player, background service or cloud inference path.
- One persisted, episode-bound native deadline serves manual and AI Sleep. Monotonic elapsed time governs execution; wall time is presentation only. Starting either timer supersedes the other. Restart converts unfinished sessions to interrupted, never silently rearms or plays.
- Adaptive learning, extensions, minimum listening window, confirmation/grace and feedback remain in the existing on-device engine. While backgrounded, a deterministic native deadline uses that session's protected listening window. No background inactivity is fabricated into an observation. Foreground polling stops when inactive.
- The native controller schedules one wake-up before fading, then changes actual player volume every 50 ms during fade. It saves the actual pause position before pausing and restores the original volume. Session/item identity and callback revisions fence stale work. Fixed deadlines survive automatic Ad Skip seeks; end-of-episode deadlines recalculate for seeks/rate changes.
- Manual choices and +5/+15/+30 extensions use the same controller. Rapid extensions update the native remaining duration serially. A failed extension cancels the old deadline instead of displaying an extension that was never armed. Explicit pause, interrupted audio and disconnected output cancel the session. Cancelled sessions cannot later pause a new episode.
- Native completion persists source metadata, actual position and the AI five-minute rewind. Restart loads that completion over older JS position data. Recovery resumes the correct episode only after an explicit action and dismisses the completed session.
- Local-data deletion clears native storage and fences pending arms. Foreground fallback fades restore original volume and cannot alter another source. Existing builds without the module explicitly describe their foreground-only capability.
- Existing light preference, Reduce Motion, shared lock-screen metadata/controls and audio background configuration remain. State labels, 44-point extension targets and screen-reader notices were added.

## Verification

**VERIFIED locally:** full `npm test` (including Batches 1–7 and corpus security tests), native TypeScript, Expo Doctor 21/21, Expo dependency compatibility, production iOS JS export, Swift deadline-core compilation/tests, module autolinking discovery, Swift module syntax parse, and `git diff --check`. The admin re-verification test now constructs genuine current canonical candidates; historical orphan intervals are excluded, preserving the Batch 6 retry/active-set safety invariant.

`evals/recovery-batch7-native.json` records a real, muted **macOS AVPlayer** run: 2,029.925 ms elapsed for a 2,000 ms deadline, 48 fade observations, minimum player volume 0.02655, original 0.7 restored, one pause at media position 1,880.355 ms. Loading means media position and elapsed deadline time differ. This verifies player properties and timing, **not audible quality, iPhone timing, battery or background execution**.

Deterministic Swift and actual JS bridge tests cover supersession, rapid extensions, original-volume restoration, stale source/session cancellation, interruption, clock jump, restart, actual-position recovery, duplicate completion and privacy revocation. Existing sleep model/preference/player regression tests pass.

**PARTIALLY VERIFIED:** iOS integration. The module is discovered and its Swift syntax parses; full Expo/iOS linking has not been compiled. The iOS export compiles JavaScript and assets, not the native module.

**BLOCKED on device/tooling:** this Mac has Command Line Tools, no full Xcode/devicectl or accessible physical iPhone. No locked-screen, overnight, route, interruption, audible fade, energy or memory success is claimed. Build 12 and Expo Go cannot gain this new native module through reload/OTA. No native/TestFlight build or upload was requested or performed.

Apple supports background playback with the playback audio session and background-audio entitlement, not arbitrary continuous background computation: [AVAudioSession](https://developer.apple.com/documentation/AVFAudio/AVAudioSession). The fallback relies on ongoing audio keeping this process executable; it does not promise execution after force-quit or arbitrary OS suspension.

## Exact physical-device acceptance procedure (Batch 8)

1. Record iPhone model, iOS version, native build/commit and audio route. Keep Build 12 observations separate from the new native build. Compile/link the local Expo module with Xcode before device acceptance.
2. Use the owned 50-second audio fixture for ordinary playback/seek/Undo and a longer local authorised episode for timers. Verify lock-screen title, artwork, progress, play/pause and forward/back commands use the same player. Record actual playback position and wall time.
3. Start the five-minute manual timer while playing. Lock immediately. Record fade beginning approximately ten seconds before the deadline, actual volume change, final pause time and saved position. Repeat backgrounded with the screen unlocked. Repeat cancellation during fade.
4. Start AI Sleep; record its displayed pause-by deadline. Lock the phone through that deadline. Observe the 45-second fade and actual pause. Return and explicitly resume the saved episode from rewind and pause position in separate runs. No automatic restart is allowed.
5. Add +5/+15/+30 rapidly, including during fade. Confirm restored volume, the combined later deadline, one final pause, and persisted learning. Start manual then AI, and AI then manual: only the latest session may act.
6. Switch episodes during fade; the old deadline must never affect the new item. Test automatic Ad Skip during a fixed timer; it must not cancel the sleep deadline. Test end-of-episode timer at 0.75x/1x/2x and after seeking.
7. Test incoming call, system interruption, AirPods/Bluetooth disconnect/reconnect, speaker changes and temporary network buffering. Confirm cancellation where documented and no surprise auto-resume. Test remote pause/resume explicitly.
8. Change the wall clock forward/back during a session. The elapsed deadline must remain stable. Force-quit/relaunch while armed: show interrupted, no rearming. Relaunch after native completion: restore the native pause position, not an older JS checkpoint.
9. Run a full overnight session, collecting Instruments energy/CPU/memory where available and battery before/after. Record interruptions and timer drift; do not infer savings from architecture alone.
10. Check VoiceOver labels/state announcements, large Dynamic Type, Reduce Motion and both saved appearance modes. Delete local listener data and verify native sleep records and pending arms are cleared.

## Release and rollback

Bundle `app.radiostar.ios`, existing icon, background audio, AWS HTTPS endpoint and signing configuration are preserved. No build number change, TestFlight build, public release, AWS infrastructure change or budget change. Native changes need the later consolidated native build. Existing deployed release remains the rollback baseline. Commits are recorded in Git; corpus work is a separate logical commit and report.
