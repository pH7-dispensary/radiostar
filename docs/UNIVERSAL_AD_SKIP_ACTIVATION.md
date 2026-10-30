# Universal Ad Skip activation — 30 October 2026

Backend deployment and real-advert desktop acceptance are verified. Universal catalogue availability and physical-iPhone acceptance are **not** complete: the named shows still lack an established processing basis, and the corrected native build is blocked by Expo's free-build quota.

## Delivered

- Independent advert preparation on enrolled listeners' open/play/status encounters; canonical Brief, Chapters and Search are not prerequisites. Stale encounter assessments refresh through the existing rights system.
- A bounded priority queue replaces the two-inflight drop condition. Currently playing work overtakes pending prewarming. The latest three followed episodes retain their priorities, even when canonical intelligence is backing off.
- Existing SQLite claims deduplicate canonical work across service instances. A worker rechecks ownership before starting and publishing. Existing retry caps, uncertain-provider-outcome protection, shared transcript reuse and atomic budget reservations remain enforced.
- Progressive MP3 acquisition uses measured packet anchors, overlapping bytes and decoded frame timestamps. Each acquisition is capped at 8 MiB; each analysis window is at most 180 seconds. Windows overlap by 120 seconds; already transcribed speech is reused. The next paid chunk starts at a real segment boundary, avoiding truncated overlap citations.
- Later-window proofs bind every preceding 64 KiB block to the actual bytes delivered through the existing AVPlayer resource loader. No ETag-only identity or time/byte-ratio estimate is used. Native memory retains the existing 8 MiB prefix plus an 8 MiB rolling witness, with compact older hashes.
- Gaps, changed overlaps, incorrect ranges, lost partial deliveries and changed evicted bytes fail closed. Playback itself can continue. Rights, public kill switch, pilot membership/expiry, incorrect-skip suspension and preferences still gate execution.
- Source changes and rights purges invalidate progressive records. Overlapping disputed intervals remain vetoed across windows from the same source generation.
- Native polling supplies position/capability, attaches proofs without replacing the player, and rechecks actual delivery before seeking. Proof rollover preserves consumed ranges and Undo; a final guard defers rollover during a pending seek.

No new player, rights framework, database, public rollout or AWS infrastructure was introduced. Older native clients retain the existing opening/static-interval path.

## Measured acceptance

| Check | Result | Evidence |
|---|---|---|
| LUP 690 complete reviewed break | One automatic seek to **90,415 ms**, continued playback, one Undo to **766.238 ms**, exactly the recorded origin | [Live playback](../evals/radiostar-universal-lup-690-playback.json) |
| LUP 635 machine-verified break | One automatic seek to **90,583 ms**, continued playback, one Undo to **983.465 ms**, exactly the recorded origin | [Live playback](../evals/radiostar-universal-lup-635-playback.json) |
| Playback variant mismatch | Denied in both live acceptance runs | Same evidence |
| Native progressive delivery | macOS AVPlayer matched later LUP 690 bytes, attached without replacement, sought 200 → 220 seconds at 1.5× and restored 200 seconds while paused | [Native chain](../evals/radiostar-universal-native-chain.json) |
| Deployed progressive acquisition | AWS obtained windows covering 60–240 and 120–300 seconds, each bounded to 8 MiB, with hashes identical to the local source/native proof | [Deployed runtime](../evals/radiostar-universal-runtime.json) |
| Owned VBR regression | Six progressive windows over a 500-second authored fixture; sample-aligned PCM; acoustic boundaries at mid-episode and near the end; mismatch/restart/dedup/budget-backoff checks passed | [Validation](../evals/radiostar-universal-validation.json) |

The live advert runs used Chromium, the shared native execution adapter, actual preserved publisher audio and live AWS leases. They are **not physical-iPhone results**. The macOS 200–220-second seek verifies native mechanics only; it is not labelled as an advertisement. The authored late-window test is controlled evidence, not a real-world post-roll accuracy claim.

The independent LUP 690 annotation remains unchanged: 0–90,415 ms, bound to source SHA-256 `693acd1c1ae733801013ca37bc937501e1e0e73d630daaf5620b36b7f1c4117c`. Fresh automatic detection produced 0–90,459 ms: start error 0 ms, end error +44 ms, complete labelled-break coverage 100%. The extra 44 ms lies within the measured silent transition. Production acceptance used the original reviewed boundary, not a substituted label.

## Real corpus and catalogue coverage

The preserved 12-episode LINUX Unplugged/Linux Action News corpus was rehashed and re-evaluated: **49 advert candidates, 10 complete opening proposals, five acoustically verified openings** (690, 675, 650, 635, 620). Negative openings LAN 299 and LAN 164 still produced zero advert candidates. The review audit hash is unchanged. Only one independent labelled break exists; whole-corpus precision, recall and false-positive rates remain unavailable. Automatic acoustic verification does not claim human review. [Corpus evidence](../evals/radiostar-universal-corpus.json)

Fresh AWS assessments cover Danny Jones **443, 442, 441** and JRE **2572, 2571, 2570**. All six audio endpoints returned HTTP 200 to AWS HEAD checks; Danny 442 needed a retry after an initial network error. No named-show audio body or paid transcript was acquired. HEAD success does not establish identical playback audio.

All six remain `LEGAL_BASIS_NOT_ESTABLISHED`, with no discovered explicit publisher reservation and no publisher transcript/cache satisfying the pipeline. The existing assessment separates bounded transcription, advert detection, retention and listener outputs from full-episode processing. Danny's channel-level manual assessment and its history remain preserved; fresh RSS observations do not fabricate a grant. JRE's generic copyright information is not treated as an explicit reservation. The unresolved dependency is evidence establishing a processing basis for the actual jurisdiction and activity—not a missing generic admin checkbox. No permission or applicable legal exception was invented. [Assessment](../evals/radiostar-universal-eligibility.json), [initial HEAD checks](../evals/radiostar-universal-audio-initial.json), [retry](../evals/radiostar-universal-audio-retry.json)

The active audience has six followed channels: Danny Jones, JRE, Lex Fridman, Julian Dorey, Tucker Carlson and Dan Carlin. The latest three of each are tracked (**18 episodes**); all currently require an established processing basis. No newly eligible named-show episode was available to demonstrate a genuine skip. The system continues independently verified authorised examples rather than claiming those 18 are ready. [Followed coverage](../evals/radiostar-universal-followed.json)

## Production, costs and rollback

- Verified account **208096650030**, region **eu-west-2**, dedicated instance `i-08537aa0e84163cb9`; no pH7 resources changed.
- Live endpoint: `https://d3ri12f40b85i3.cloudfront.net`.
- Deployed backend source: commit **423d1c0**; archive SHA **99bec7965f384a4daad9e7e1e1e926f8d66a2cdabf90154e6d2cb7a7e6f16286**.
- Pre-deployment SQLite backup verified; post-deployment `integrity_check=ok`, API/worker healthy, about **24.45 GB** free, SQS and DLQ empty, no processing failures in the observed five-minute window. [Health](../evals/radiostar-universal-health.json), [queues](../evals/radiostar-universal-queues.json)
- Previous archive **5c0fb3c136152faf4e83a51663659ede7242f62ee3f2d8413d44486dcc650feb** remains available through the existing rollback procedure. No schema migration was required. Existing two-release retention and bounded logging remain in force.
- **$0 new model expenditure / zero paid model calls** in this execution; cache and mock providers were used. Observed shared ledger: $0.0000001 day, $2.31619276 month, zero transcription seconds today; unchanged before/after verification.
- Limits remain $5/day, $25/month, three transcription hours/day, four-hour canonical episodes. Independently eligible bounded advert windows are not rejected merely because an episode exceeds four hours. Private Translate limits are unchanged.
- AWS Cost Explorer reports **$9.5205449923 USD**, provisional October-to-date unblended account cost. This is not this task's incremental cost or a final invoice. No new infrastructure was created; request/storage-transfer costs are not separately attributable to this execution. [Cost evidence](../evals/radiostar-universal-costs.json)
- Existing cached intelligence, chapters, topics, moment/search and authentication separation still pass live checks. The example remains honestly `PARTIAL_READY`; source excerpts are not called a complete generated summary. [Integration evidence](../evals/radiostar-universal-intelligence.json)

## Native release and remaining blockers

**Implemented and verified locally:** progressive native proof, exact delivery revalidation, late attachment, seek/Undo preservation, TypeScript, iOS export, native Swift witness tests. Full `npm test` (including posttest) passed, as did Expo Doctor 21/21. After the final refresh guard, TypeScript, production iOS export and relevant Ad Skip recovery/integration tests passed again. Task-scoped `git diff --check` passed; unrelated pre-existing files and whitespace were left untouched.

Build **17** (`2510d99a-4f19-45aa-96cb-4c3a98225d34`, source `423d1c0`) finished successfully but was **not submitted**: the final refresh/Undo guard landed afterward in **f23b6f1**. The corrected build attempt was rejected by Expo's exhausted free iOS build quota. No corrected artifact exists and no public release occurred. The failed attempt's generated version increment was reverted so the next authorised successful attempt can use 18. [Build evidence](../evals/radiostar-universal-build.json)

The quota resets **1 November 2026**. Local signing is also unavailable: this Mac has Command Line Tools only, no full Xcode, and zero valid signing identities. The alternative is the user's approval of Expo Starter, currently [$19/month plus usage with $45 build credit](https://expo.dev/pricing); no subscription or billing change has been made.

The two-test listener pilot remains enabled, unchanged, and expires **31 October 2026 at 17:59:01.994 UTC**. That precedes the free build reset. Any later device test must first use the existing authenticated Super Admin renewal workflow; no expired authorisation was silently extended.

**Blocked:** named-show processing basis; corrected signed native build/quota; physical-iPhone installation and acceptance. No manual advert review is required merely to operate the supported automatic acoustic path. Broader independent accuracy measurements still cannot be invented.

**Supported limits:** progressive mode currently requires range-capable MP3 and an exact measured packet timeline. Missing earlier delivered bytes after a distant seek can prevent chain proof. Complete breaks extending outside a bounded window, uncertain boundaries and incompatible variants remain non-skippable. These limitations are not presented as universal catalogue success.

Source commits: **423d1c0** (backend/native progressive path), **99b67bb** (build 17 metadata), **f23b6f1** (seek/Undo refresh guard and deployed-runtime verification). Final evidence/report commit is discoverable with `git log -1 -- docs/UNIVERSAL_AD_SKIP_ACTIVATION.md`; all task commits are pushed to `origin/work` after final verification.
