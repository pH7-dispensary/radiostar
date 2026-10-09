# Star Cast MVP build plan

## Complete in this review build

- Premium responsive Listen, Following, Search and Library shell with day/night themes.
- Anonymous local installation identifier, playback/resume state, follows, saved episodes and history.
- Apple Podcasts search integration through a local catalogue service, RSS/Atom-shaped publisher feed ingestion boundary, metadata cache and rate limiting.
- Feature-control boundary for post-MVP intelligence.

## Partial

- Audio controls model real player state but use preview media only; native background, lock-screen, Bluetooth and download integration require the selected mobile runtime.
- The Listen/Following fixture remains deterministic; Search progressively uses Apple Podcasts results and publisher feeds when the network/provider is available.

## Missing / blocked

- Backend, database, authentication, Podcast Index credentials, signed media URLs, native playback and server-authoritative allowance/referral ledger: no backend repository or credentials are present. Podcast Index must be called from a trusted server using `PODCAST_INDEX_KEY` and `PODCAST_INDEX_SECRET`; neither belongs in this browser project.

## Post-MVP

- Transcript-derived episode briefs, conversation/moment search, Explore Episode, Ad Skip, AI Sleep and remote feature control.

## Contracts

`catalogue` exposes canonical Podcast, Feed, Episode and AudioSource-shaped records. `listenerStore` owns local anonymous listener state; server APIs may replace it without changing UI. `featureControls` declares intelligence features but defaults them off so no unsupported capability is presented as real.
