# Star Cast — seamless intelligence verification

Mega Prompt 45, implemented on the existing `work` branch after `288a21a`. No replacement application, new integration, credential change, deployment or retry-limit reset.

## Delivery

| Requested area | Implementation and evidence |
| --- | --- |
| 1. One-time activation | “Enable Star Cast Intelligence” is shared by Brief/Explore and saved in the existing local listener document. Defaults off. Browser app reload retained activation. Physical-device persistence still needs verification. |
| 2. Quiet player | Removed analysis/status badges, repeated Analyse controls and the large processing/results cards from the player. Its five primary controls remain. Failures appear inside the relevant dedicated view. |
| 3. Automatic intelligence | Opening an episode after activation reads cache, then requests publisher-only processing if not requested. Server forcibly disables audio consent on automatic requests and never automatically retries failed/blocked jobs. |
| 4. Brief | Opens immediately; cached overview, themes and expandable detail render in place. Pending results reveal automatically. Unsupported generated calendar years cause an explicitly labelled source-excerpt fallback, not invented prose. |
| 5. Explore | Dedicated Chapters, Topics, Find a Moment and paged Transcript views. Transcript/moment access is available while text generation is pending. Timestamp actions use the existing player. |
| 6. Shared work | One device session per episode; one server job/cache for all capabilities. Concurrent requests deduplicate. Existing SQLite transcript, audio-variant, model-result and usage records are reused. Search retrieves from the same stored transcript corpus; no separate model call. |
| 7. Ad Skip | Independent safety remains off. Explanation is shown only inside Ad Skip. Existing verified-interval, fingerprint, confidence, Undo and feedback domain/tests are unchanged. No new automatic skip path. |
| 8. Persistence/lifecycle | Authoritative NOT_REQUESTED, QUEUED, PROCESSING, PARTIAL_READY, READY, FAILED, BLOCKED states. PARTIAL_READY can mean transcript available during work or a completed, labelled partial result; `processing` distinguishes them. Completed results survive backend restart. Interrupted work becomes an explicit failure, never an automatic paid retry. |
| 9. Real verification | Cached Python Bytes #495/#497, fresh automatic #494, and explicitly confirmed NPR audio fallback were exercised through the actual RN web UI and authenticated backend. See below for precise limitations. |
| 10. Usage/cost | Three new provider calls: two text calls and one audio call; estimated total **$0.077025**. Whole development ledger: **$0.117941**, 682 charged audio seconds. No hidden repair calls. |
| 11. Remaining gates | Physical iPhone/Expo Go, native background/lock-screen lifecycle, on-device accessibility/reduced-motion/performance, long-form acoustic alignment, comprehensive semantic-faithfulness evaluation and production security/content rights remain unverified. |
| 12. Tests | `npm test`, native `npx tsc --noEmit`, Expo iOS export and `git diff --check`. New tests cover activation, concurrent calls, navigation/relaunch recovery, consent, partial results, timeouts, budget exhaustion, source-year fallback and RSS/audio duration mismatch. |
| 13. Git | Changes are committed and pushed to the existing `origin/work`; the final delivery message records the verified commit. |

## Real episode evidence

### Publisher transcript: Python Bytes #494, “Python Wrapture”

Episode ID `b81cbfb7-06eb-4ef9-837c-2715d672e538`, feed `https://pythonbytes.fm/episodes/rss`, RSS duration 1,717 seconds. Opening the episode after activation automatically requested its publisher transcript. Brief was opened, then Explore while the same job ran. Six chapters appeared without closing/reopening Explore. Processing took 7,759 ms. One gpt-4.1-mini call: 12,792 input / 759 output tokens, **$0.006331** estimated.

Cached #495 opened without another activation after app reload. Its HTMX topic returned a real passage at 10:05; playback moved to 10:05. The transcript tab displayed real publisher segments and speaker labels. #497's authenticated evaluation after backend restart returned cache hits for Brief and Chapters, grounded moments/search and **zero new provider calls**. Search coverage was four processed episodes, including one explicitly partial result—not the global catalogue.

### Audio fallback: The Indicator from Planet Money

“How did we get a Nobel Prize in economics?”, episode ID `18116394-f4c1-4f3e-a052-3549abc54fd7`, feed `https://feeds.npr.org/510325/podcast.xml`.

Opening alone returned AUDIO_CONSENT_REQUIRED: no audio reservation or charge. The explicit confirmation displayed an RSS-based estimate of $0.06 plus text analysis. Only after confirmation did Whisper-1 run. Delivered audio was longer than the RSS 568-second duration; 682 measured/rounded seconds were charged at **$0.068200**.

This exposed a bug: a valid audio transcript was being revalidated against the shorter RSS duration. The adapter now preserves measured duration and its quality assessment. Matching stored audio transcripts are reused, including pre-fix cached entries. The regression test uses a 40-second RSS duration with a measured 60-second audio variant. The live retry reused the completed transcript; there was **no second transcription** and no cost-history/attempt reset.

The text call used 3,794 input / 610 output tokens, **$0.002494** estimated. Review found the model had invented “2023” where the speech only said “this year.” A deterministic source-year guard now replaces such summaries with labelled verbatim excerpts, excludes unsupported chapters, and marks the result completed PARTIAL_READY. It also checks existing cached output, without paid regeneration. Three remaining source-backed chapters and the transcript remain usable; chapter playback moved to 3:29. **This is not a verified full generated brief for the NPR episode.** The date guard is intentionally narrow, not a claim of universal factual verification.

The older Bloomberg source-validation failure remains in the ledger with its original retry limit. No failed record was erased to improve reported results.

## Reliability and UX boundaries

Jobs have a 15-minute deadline. Provider requests receive cancellation signals; late results cannot overwrite a terminal timeout, but known/uncertain costs remain accounted. A still-unwinding request retains its deduplication lock. The device stops polling after three consecutive failures or the job deadline and offers an explicit check-again action.

“Stop waiting” stops local observation only. It does not cancel a shared paid server job, refund it or restart it. Closing/navigating preserves server work; reopening reads its current result. This is deliberately not an unsafe global cancellation control.

Native UI uses existing themes, lavender accents, short opacity transitions, haptics and a reduced-motion-aware loading animation. The UI/motion skill guidance drove progressive disclosure and bounded animation; missing supplementary skill files were not assumed available. Verified actual RN components at 390×844 in both themes and 1280×900; this is **RN web preview**, not a physical iPhone test. Screenshots are ignored local evidence under `.starcast/evidence/seamless-*.png`.

Caps remain $5/day, $25/month, three transcription hours/day and two hours per measured audio episode. Costs here are estimates from recorded provider token usage/audio seconds, not a billing invoice. Atomic reservations, two concurrent jobs, bounded attempts, no automatic paid-audio processing and conservative unknown-outcome accounting remain in force.

For local phone verification, use the existing launcher (`npm run starcast`) and connect Expo Go on the same LAN. Test #494 for a full brief/chapters and the NPR episode for an honest partial result plus timestamped transcript. Do not enable automatic Ad Skip or deploy publicly: the development token, content-rights review, credential-rotation recommendation and production/distributed-worker gates in the recovery report still apply.
