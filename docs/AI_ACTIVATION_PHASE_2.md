# Automatic intelligence activation — Phase 2

28 October 2026 · `work` · AWS 208096650030 / eu-west-2.

**IMPLEMENTED / VERIFIED:** automatic preparation and recovery changes are deployed. A new authorised real episode was transcribed and delivered automatically, with no Analyse request or new rights approval. Core outputs are usable and honestly labelled PARTIAL_READY. Implementation: `a5682ce`.

**BLOCKED:** the original 18 followed episodes still have no established processing basis. Automation does not invent permission or convert an advisory into a human pause.

## Changes and recovered architecture

Phase 1 was verified from current source, regression tests and live episode readback. OPEN remains the operational default; documented channel permission, feature-specific restrictions, historical recovery, mandatory holds and human-only operational mutation remain enforced.

- `FollowedPreparation.configuration`: new servers default to automatic preparation. Existing saved settings, including a human suspension, remain authoritative. No routine activation click is needed.
- `FollowedPreparation.encounter`: first-open requests establish the planning snapshot and wait for an already-running discovery pass before awaiting dispatch. This fixes the initial NOT_REQUESTED race exposed by tests and live verification. It does not wait for transcription completion.
- `SemanticSearch.buildStage`: persist an empty, checksummed BUILDING checkpoint before the first embedding batch. Budget failure or interruption before the first completed batch no longer makes the stage invisible to existing automatic recovery. Existing provider outcome-unknown protection and request deduplication remain in force.
- Extended the bounded paid acceptance harness to select an exact existing episode and separate output file; added a read-only real-checkpoint interruption/replay verifier. No new provider, scheduler, database or dashboard.

Existing trigger paths remain: new follow, hourly feed discovery (five-minute retry after source errors), app summary/open/play requests, and bounded queue recovery. Canonical publication dates select the latest three; withdrawn/deleted/future/invalid entries are excluded. Canonical episode identity deduplicates listeners globally. Playing/open priorities are 100/80; latest three are 70/60/50. Existing queue ageing prevents older accepted jobs being permanently overtaken. Two-slot dispatch, active work preservation, SQS leases, transactional outbox, checkpoints and cost reservations remain unchanged.

Transcripts feed briefs, chapters, topics, lexical/moment indexing and independent advert inspection. Semantic indexing resumes separately. Partial derived output remains usable; an unfinished index does not require a second audio transcription. Human pauses, rights decisions, feature audience and spending limits still apply to every relevant stage.

## Actual population and followed window

Nine registered installations are present; **two non-revoked, feature-eligible listener profiles** are considered by preparation. These are eligibility counts, not measured DAU. Their ordinary follows cover **six unique feeds / 18 latest-three episodes**. All current eligible follow relationships were included and reassessed.

| Measurement | Ordinary window | Controlled verification |
|---|---:|---:|
| Unique followed feeds | 6 | One temporary additional authorised feed |
| Latest-three episodes | 18 | 3 additional cached episodes |
| Intelligence/transcript cache hits | 0 / 0 | 3 / 3 |
| Verified publisher transcripts in window | 0 | Two existing publisher-derived cases checked separately |
| Unverified publisher references | 3 | Not counted as usable transcripts |
| Episodes needing audio without a reference/cache | 15 | 1 explicitly opened eligible episode outside the latest three |
| Newly created transcription jobs | 0 | 1 |
| Real transcriptions completed | 0 | 1 |
| Newly PARTIAL_READY / READY | 0 / 0 | 1 / 0 |
| Remaining unresolved processing bases | 18 | 0 for the selected verification episode |

The temporary QA follow was removed after each controlled run. No real listener follows were removed. Exact ordinary-window episode identities and remaining reasons are preserved in `evals/ai-activation-phase2.json`; all remain `LEGAL_BASIS_NOT_ESTABLISHED`, not invented publisher prohibitions. Existing copyrighted notices are not converted into internal-processing reservations.

## Live cases

| Case | Verification and result |
|---|---|
| A — Cached intelligence | Live cached Brief, Chapters, Topics, moment and multilingual search checks passed. Repeated reads and duplicate follows did not create jobs or change the ledger. |
| B — Publisher transcript | The two authorised Open Source Security publisher-RSS transcript cases returned persisted partial briefs, chapters and topics with verified source references. Existing generated intelligence was reused, not regenerated for the demonstration. Publisher acquisition/generation paths also passed provider-mocked tests. |
| C — Fresh transcription | **Red Hat's Project Lightwell with Mo Duffy**, Open Source Security, episode `70592bd7-8013-4eff-a9c5-dcc570b9b216`. Publisher RSS expressly provides CC-BY. No cached/publisher transcript existed. Opening the episode automatically queued job `545cc906-0247-4460-b117-d12ac5e6707c`; no Analyse request, rights mutation or allowance extension. |
| D — Interrupted recovery | The real episode's two paid checkpoints were copied through an integrity-verified read-only production snapshot. Local assembly was terminated by SIGTERM after checkpoint one; a fresh process reproduced all 446 segments, text and global timestamps exactly, with zero provider calls. This is real-data checkpoint replay, not a deliberate kill of the production worker mid-provider request. Four-hour transcription/hierarchical-analysis process-kill tests additionally passed using mocked providers. |
| E — Latest-three follow | Following the eligible feed selected precisely its latest three episodes, reused their caches and returned PARTIAL_READY. Duplicate follow created no additional jobs. A 1,000-listener automated regression produced exactly three canonical jobs. |

Fresh audio: **1,951,086 ms**, exact SHA-256 `99867e0ee347942f71f0217c67bcdac892f8af8cbf7a66d641eca070e203b22f`; two completed Whisper checkpoints, **446 timestamped segments**, **5 chapters / 5 topics**. Accepted 12:34:22.475 UTC; completed 12:36:31.673 UTC: **129.198 seconds**. This measured observation is not a general ETA.

Feature readback: transcript READY; brief and chapters PARTIAL_READY; topics, Find a Moment, search and advert-candidate stage READY. Semantic index completed **446/446** inputs. Five live moment references and five fresh conversation-search references matched persisted source timestamps; semantic-with-lexical-fallback retrieval returned the new episode.

Advert analysis completed with **zero candidates**. That is not independently measured proof of no adverts. No interval was promoted to verified or automatically skipped; audio-variant verification, listener preference and Undo safeguards remain. Captions/dubbing remain restricted independently.

## Expenditure and backlog

Plan before paid dispatch: one new eligible episode, approximately **0.5422 audio hours**, three latest-three cache hits, estimated audio **$0.1952**, text planning allowance **$0.05**. The harness required **$0.50** of remaining standard capacity and zero outstanding reservations. No temporary allowance was renewed.

Actual additional recorded expenditure: **$0.21169012**:

- Transcription: $0.19530000.
- Text intelligence: $0.00576560.
- Grounding review: $0.01048000.
- Embeddings, including the new retrieval check: $0.00014452.

Ledger moved from **$1.81833374 / 163 entries** to **$2.03002386 / 187 entries**, with **zero reservations** after completion. Warm-cache verification left it unchanged. This is server-recorded usage cost, not a reconciled provider invoice.

Caps remain **$5/day, $25/month, 3 new audio hours/day, 2 hours/episode**. Temporary testing allowance is expired. Remaining standard capacity at verification: $4.78830988 today, $22.96997614 this month, 8,847 transcription seconds today. Translate retains its separate ledger and limits.

Ordinary-window estimate: **$22.49704167 / about 42.0631 source hours**, including possible fallback for unverified publisher references. Eligible estimated cost is **$0** because none of the 18 has an established basis. This is a planning estimate, not approved queued work or a completion ETA; future duration/budget checks remain mandatory.

## Tests and production

**PASS:** full `npm test` on final backend source; targeted initial-open integration, followed preparation/recovery, latest-three canonical selection, new 1,000-listener regression, semantic checkpoint recovery, paid-stage SIGTERM/restart, budgets, concurrency, native polling/status tests, rights and human-pause tests, syntax and `git diff --check`. Added concurrent-discovery encounter regression passed. Paid providers were mocked in automated suites.

An initial full-suite failure exposed the missing first-open planning snapshot and was fixed. An initial live reference-check failure used the pre-transcription database snapshot; the refreshed snapshot contains the new episode, and all source assertions then passed without weakening checks.

STS verified account **208096650030**; commands targeted **eu-west-2** and existing StarCast-tagged instance `i-08537aa0e84163cb9`. Preflight SSM `b3c7fd34-3bd4-4a42-b5d5-8903e79b0977` succeeded: integrity-checked backup `/var/lib/starcast/pre-command-centre-1793190676153.sqlite`, **25,386,737,664 free bytes**, rollback present.

Final deployment SSM **`485035a2-a606-4241-9b85-cae96054fda0`** succeeded. Release **`04ec9623bbdac21b100e7e766e55cece956d8bb92ac8f691327eb39138621bc3`**, previous **`56ca4cff5854ee9ad18982cc8273cb690740dc9dd7196807d46e0f4378c360a9`**, rollback available. Deployment occurred after paid transcription/indexing settled; caches, checkpoints and results survived restart.

Existing backup service succeeded at 12:43:13 UTC. Downloaded snapshot SHA-256 matched S3 metadata; SQLite integrity was `ok`. Final protected live checks: HTTPS ready, database/worker/SQS/DLQ/backup healthy, secure administrative sessions, CSRF/anonymous rejection and logout revocation passed. Existing retention DEGRADED and CloudWatch/S3 application-dashboard UNKNOWN placeholders remain disclosed; no new monitoring infrastructure was created.

No pH7 resource changes, database migration, new recurring infrastructure, budget increase, public Translate/Ad Skip activation or TestFlight build. No configured GitHub Actions workflow exists; validation ran locally and against production.

## Remaining limits

**BLOCKED:** the 18 ordinary followed episodes need an evidenced applicable processing basis; their full intelligence was not activated by assertion. The new default does not override human suspension, lawful restrictions or feature audience security.

**PARTIALLY VERIFIED:** brief/chapter quality remains partial rather than fully READY. Physical iPhone live-refresh behaviour was covered by existing native automated tests and live API states, not a new device observation. Production was not intentionally interrupted during an uncertain paid provider call; such outcomes remain protected from automatic duplicate billing.

**VERIFIED:** eligible content follows the automatic pipeline, produces real usable intelligence, persists centrally, becomes searchable, preserves costs, and recovers from durable checkpoints. Detailed sanitised evidence: `evals/ai-activation-phase2.json`.
