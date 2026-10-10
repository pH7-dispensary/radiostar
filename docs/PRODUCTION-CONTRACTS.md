# Production contracts

## Feature controls

One server-owned `feature_controls` record governs each capability: `ad_skip`, `smart_content_skip`, `conversation_search`, `moment_search`, `episode_briefs`, `explore_episode`, `recommendations`, `ai_sleep`, `referrals`, and `listening_allowance`. Allowed states are `on`, `throttled`, and `off`. Clients receive an evaluated, read-only view; they never decide entitlement or cost controls.

## Analytics

First-party events are constrained to: `app_opened`, `podcast_searched`, `podcast_viewed`, `podcast_followed`, `podcast_unfollowed`, `episode_started`, `episode_progress`, `episode_completed`, `episode_abandoned`, `player_seek`, `playback_speed_changed`, `episode_saved`, `episode_downloaded`, `sleep_timer_opened`, `sleep_timer_started`, `sleep_timer_cancelled`, `referral_shared`, `referral_installed`, `referral_activated`, `referral_qualified`, `allowance_earned`, `monthly_allowance_exhausted`, `recommendation_impression`, and `recommendation_opened`.

Do not send raw search queries or full listening history to third parties. Associate server events with the pseudonymous listener profile only after session authentication.

## Playback position conflict rule

The device writes locally while offline. On reconnect it sends an idempotent position update with `updated_at` and a monotonic local sequence. The server accepts the newest update, except a completed event always wins over an earlier position. Clients refresh after a rejection; stale writes never overwrite a newer server position.

## Allowance and referral rules

The server creates a base 600-minute monthly ledger entry. Each qualified referral creates a durable +300-minute monthly entitlement ledger entry. Playback session reports are idempotent and reconciled server-side; native/offline sessions are untrusted until reconciled. Client UI must not calculate remaining allowance or qualification.

## Native playback lifecycle

Exactly one `PlaybackEngine` owns audio state. Mini-player and full player subscribe to it. `SleepTimerEngine` only requests `pause(reason: "sleep_timer")`; future `AISleepEngine` is a separate caller. Background, lock-screen, Bluetooth, and interruptions require a native device/simulator verification matrix before release.
