# Radio Star — Intelligence Engine, Phase 2

Acceptance date: 18 November 2026. Repository `pH7-dispensary/radiostar`, branch `work`. Production account **208096650030**, region **eu-west-2**. No pH7 infrastructure, public Ad Skip, public Translate, native build or spending-limit changes.

## Release and scope

Baseline revision: `db863ae`. Implementation commits: `ec28ef1` (capacity/recovery), `4ad9b04` (production disk staging), `a75e457` (original-source synthesis), `3eb1338` (resumed audio identity), `b7063b3` (administrative capacity visibility), `8d284c2` (active provider maintenance guard). Subsequent commits: `e6d5d66` and `137a35c` (exact-source claim review), `40ce513` (queue reconnect and persisted progress), `ab6e134` (scoped search), `7bbe6b2` (response validation performance).

Runtime revision **`7bbe6b2`** is deployed as archive **`951ebf792d024d39b81cd7be24c90caf8b58b419d0e4eb869f47d1cf0ac0d1bc`**, at **2026-11-18T14:49:51.913Z**. SSM deployment `6dadd049-c354-4802-9dda-f06f40907a74` succeeded. The prior archive `e574030c8b5eb15bd2452e3ce454d51811b0cfaa429843b8676c7f72404a5b88` remains available for rollback. The pre-deployment SQLite backup `/var/lib/starcast/pre-command-centre-1795013333262.sqlite` passed integrity validation. Final acceptance scripts and evidence are a subsequent documentation/tooling commit; they do not change deployed runtime code.

This is backend acceptance. No new physical-iPhone acceptance is claimed. The earlier user-confirmed Project Lightwell device test remains historical evidence, not a test of this release.

## Root causes corrected

1. Capacity recovery assumed another full 1,200-second chunk even when only a short tail remained. Capacity now includes reservations, overlap and the actual next chunk, with UTC day/month reset times. Limits remain $5/day, $25/month, 10,800 new audio seconds/day and 14,400 seconds per source.
2. Administrator-approved processing was not enrolled in automatic capacity recovery. Valid approved jobs now use the existing platform-processing workflow.
3. Missing RSS duration caused a permanent refusal. Bounded disk acquisition now measures actual duration before any paid audio call; sources over four hours still fail.
4. Episode-page transcript links were not discovered when RSS lacked transcript metadata. Bounded, explicit downloadable transcript/subtitle links are now checked before authorised paid fallback. Page descriptions are never substituted for speech.
5. Semantic-index failures lacked durable capacity/backoff states and could leave accepted work unfinished without a current follower. Existing worker recovery now advances one bounded indexing batch, preserving completed Brief/Chapters/Topics and lexical search.
6. Initial production verification exposed a regression in the new disk guard: Amazon Linux's `/tmp` is a roughly 1 GB memory-backed filesystem. The guard refused acquisition before paid calls. Production now stages on the existing data disk, with byte/headroom limits, cancellation, file cleanup and dead-process cleanup restricted to marked temporary directories. One bounded recovery covers the unpaid pre-fix failures.
7. Hierarchical summary verification could skip oversized evidence and degrade section summaries to introductory excerpts before final synthesis. Review now selects bounded windows of original cited speech, retains neighbouring context, reuses bound verified chapter claims and verifies final synthesis against original transcript segments. Unverified intermediate notes are never listener output. Contradictions, invalid quotes and unsupported claims still abstain.
8. A resumed download could resolve to different audio bytes. The resolved source is now pinned privately; a changed hash on the same enclosure stops new paid work with `AUDIO_VARIANT_CHANGED`, retaining existing checkpoints. An explicitly changed enclosure has its own compatibility checks and cache identity.
9. Live review revealed a second summary defect: the verifier returned `entailed: true` but paraphrased or combined its supposed exact quotations. Those correctly failed validation, degrading valid synthesis. The verifier now selects IDs from the actual reviewed source windows; the server attaches exact stored text. Unknown, repeated, empty or unreviewed selections fail. Live verification additionally exposed combined/range-like IDs; response schemas now enumerate the actual evidence IDs and permit up to 16 distinct supporting passages for a compound claim, preserving every assertion check. The entailment decision, binding and contradictory-evidence rejection remain mandatory. Existing invalid quote verdicts are not upgraded; one versioned, budgeted review reuses saved analysis and audio.
10. Administrative episode details labelled an accepted budget pause `UNAVAILABLE` and could ask for approval again. They now expose `WAITING_FOR_CAPACITY`; installed clients retain their compatible `BUDGET_PAUSED` status and receive additive per-feature execution states.

11. A single administrator progress lookup fetched and evaluated the entire publisher feed, causing a live 55-second request timeout. Episode detail now uses its existing canonical job metadata, labels it cached, and evaluates current rights/state locally. Publisher refresh remains a separate catalogue operation; an outage no longer prevents inspection of persisted work.

12. A live transient AWS `CredentialsProviderError` escaped the receive/recovery loop and permanently stopped its sole consumer. A durable queued review remained in the outbox; no provider work was lost. Transport now reconnects with exponential backoff and a five-minute circuit after five failures, publishes degraded readiness, and retains normal lease/DLQ/paid-stage protections. Maintenance can recover a stopped worker with queued work only when a fresh heartbeat confirms it is offline; active processing/reservations still refuse deployment.

13. Semantic search eagerly constructed a full lexical response and then repeated that work after embedding retrieval, projecting unrelated podcasts before scope filtering. Search now projects only the requested scope and constructs the chosen response once; fallback and post-await rights/source checks remain intact. Moment retrieval likewise avoids an unused preliminary fallback.

14. Delivery rebuilt all grounded topics inside each topic check and repeated the original claim validation. Each request now reuses its own exact checks, never a cross-request rights cache. A read-only AWS comparison on real source records produced identical validation: 510 segments **794.6 → 132.1 ms**; 740 segments **3,736.1 → 486.9 ms**. These are isolated CPU samples, not end-to-end percentiles.

## Automatic preparation

The actual baseline was **zero active eligible followed feeds**, not the historical 18-episode figure. Stale demand rows and expired beta installations are not an active backlog. Existing user invitations and installations were preserved.

A separate, one-use, temporary beta installation followed Open Source Security through `/api/listener/follow`. The ordinary request discovered and scheduled its latest three episodes. Replaying the same follow did not create another job. No listener Analyse call was used. The existing hourly feed monitor handles publication while the app is closed; publication rollover is automated-tested, not claimed as an observed new publisher release during this session.

The existing canonical feed/episode identity, transactional outbox and SQS worker remain authoritative. Playing/opened/followed work retains existing priority; a long job yields only between completed chunks after a two-chunk quantum when other episodes are queued. Concurrent-listener deduplication is tested with 1,000 listeners sharing three jobs. The live test uses one installation plus a duplicate follow, not 1,000 real listeners.

| Target | Duration | Current decision | Persisted execution / outputs |
|---|---:|---|---|
| Danny Jones #443 | 196m 38s | `LEGAL_BASIS_NOT_ESTABLISHED` | No eligible current execution or transcript/intelligence. 0 historical attempt records. |
| Danny Jones #442 | 180m 38s | `LEGAL_BASIS_NOT_ESTABLISHED` | No eligible current execution or transcript/intelligence. 0 historical attempt records. |
| Danny Jones #441 | 167m 28s | `LEGAL_BASIS_NOT_ESTABLISHED` | No eligible current execution or transcript/intelligence. 2 historical attempt records. |
| Joe Rogan #2572 | 184m 44s | `LEGAL_BASIS_NOT_ESTABLISHED` | No eligible current execution or transcript/intelligence. 0 historical attempt records. |
| Joe Rogan #2571 | 176m 35s | `LEGAL_BASIS_NOT_ESTABLISHED` | No eligible current execution or transcript/intelligence. 0 historical attempt records. |
| Joe Rogan #2570 | 169m 41s | `LEGAL_BASIS_NOT_ESTABLISHED` | No eligible current execution or transcript/intelligence. 0 historical attempt records. |

These are actual current canonical identities from `evals/intelligence-engine-named.json`. The policy is operationally OPEN, but Phase 1 did not establish the required processing basis. This is **not** an invented publisher prohibition. Existing refusal/attempt history is preserved.

All four completed transcripts below have valid lexical and semantic index checksums. The three newly followed episodes reached **PARTIAL_READY**, not full READY. The two `verified_partial` briefs retain only supported assertions. Extractive fallbacks remain explicitly marked.

| Eligible source | Audio / transcript | Brief | Chapters / Topics | Search and current execution |
|---|---|---|---|---|
| OSS: Apache Software Foundation with Ruth Suehle | 36m 08s; 2/2 chunks; 740 segments | Verified partial summary | 12 chapters: 3 reviewed, 9 extractive; 17 topics | Semantic 740/740; live moment and search references verified |
| OSS: Trusting your computing with Lance and Anton | 38m 21s; 2/2 chunks; 821 segments | Extractive; later review outcome unknown | 14 chapters: 11 reviewed, 3 extractive; 14 topics | Semantic 821/821; live search reference verified |
| OSS: Finding missing security backports with Roi Nisimi | 29m 33s; 2/2 chunks; 510 segments | Verified partial summary | 10 chapters: 6 reviewed, 4 extractive; 13 topics | Semantic 510/510; index/source integrity verified, not returned in the sampled final queries |
| OSS reference: Project Lightwell with Mo Duffy | Cached 32m 31s; 2/2 chunks; 446 segments | Existing extractive brief | 5 extractive chapters; 5 topics | Semantic 446/446; live moment and search references verified; no retranscription |
| HPR2578 long source | 3h 55m 13s; 3/12 paid chunks saved | Pending | Pending | `WAITING_FOR_CAPACITY`; no full transcript or index yet |

The persisted outputs, hashes, actual feature states and per-job usage are in `evals/intelligence-engine-production.json` and `evals/intelligence-engine-live.json`. The six unresolved named targets incurred **no new processing charge** in this phase; historical attempts are not counted as new successful work.

## Four-hour source and checkpoints

Hacker Public Radio **HPR2578 — LinuxLUGcast 102 the lost episode** is the long-form acceptance source. The [episode page](https://hackerpublicradio.org/eps/hpr2578/index.html) identifies a CC-BY-SA release; the [publisher policy](https://hackerpublicradio.org/about.html) identifies CC BY-SA 4.0. The recorded grant is restricted to this episode and the selected core intelligence features. Attribution and ShareAlike conditions remain recorded. Captions, dubbing and voice replication were not activated. This is an engineering check of published evidence, not a claim of independent human legal review.

Publisher-linked SRT/text retrieval failed in the bounded acquisition checks, so paid audio fallback was necessary. The actual decoded source, not the shorter page duration, controls eligibility and chunking.

- Local acquisition decoded **14,106,687 ms**, 112,854,770 bytes, into 12 bounded chunks. SHA-256 `48b7f66b193f5e6062c72a96d3502d6af082b7ab6ec0342f24a70e32b8221df7`. This is decoding/chunking evidence, not full paid transcription.
- AWS received a different variant: **14,112,722 ms**, SHA-256 `4bcc0a6339851fac9893fb8405d52a2b58899abd4bdd26af3a53172878661e4d`. Local timestamps/checkpoints were not reused against it.
- The live worker completed **3 of 12** paid chunks, covering source time through **3,598,000 ms**. The remaining nine are pending. The saved next chunk needs 1,200 seconds; only 953 seconds of the day's allowance remained after the three short episodes and these chunks.
- This job began before resolved-delivery pinning was deployed. Its saved content hash still gates continuation: if the redownload differs, it must stop for source reconciliation rather than reuse incompatible chunks. New acquisitions additionally pin the resolved delivery URL.
- Resume is recorded for **2026-11-19T00:00:00.000Z**. UTC rollover is automated-tested. The subsequent real next-day completion is **pending**, not claimed.
- A 14,400,000 ms boundary fixture produces 13 chunks with one-second overlaps, charging 14,412 seconds. The real near-four-hour source is shorter and produces 12. Neither is represented as a completed four-hour paid transcript.

Completed provider responses are keyed by canonical episode, verified audio hash, model, duration and chunk index. An uncertain provider outcome remains held for reconciliation; it is never silently purchased again. Explicit 429 rejections release the reservation and enter bounded retry. Acquisition is streamed to disk, and each encoded chunk is approximately 7 MB rather than a four-hour in-memory MP3.

## Recovery evidence

| Scenario | Evidence and outcome |
|---|---|
| Worker termination during paid stages | Automated SIGTERM/fresh-process four-hour transcription and hierarchical analysis tests; completed mock provider stages are not repeated. |
| Real saved responses after termination | Read-only production backup replay of Project Lightwell: SIGTERM after chunk 1, fresh process reconstructs all 446 segments from two real paid responses exactly; zero provider calls. |
| API/worker restart | Production deployments preserve SQLite jobs and checkpoints; paused long-form work survives. No live provider request was deliberately killed. |
| Duplicate follow / multiple listeners | Live duplicate follow creates no second job; automated 1,000-listener test shares three canonical jobs. |
| Expired lease / network interruption | Existing SQS renewal/redelivery and bounded source/provider recovery tests pass. Unknown provider outcomes remain held. |
| Provider timeout | Automated uncertainty test refuses automatic repurchase; this can legitimately require provider reconciliation. |
| Budget exhausted / rollover | Live long-form capacity pause with saved chunks; automated UTC reset and short-tail reservation tests. Live next-day completion pending. |
| Corrupt audio | Real FFprobe rejects a deliberately corrupt fixture before any provider call; staging is removed. |
| Partial semantic indexing | Persisted cursor/backoff/capacity tests and live per-feature retrieval; successful lexical search and chapters remain usable. |
| New publication while processing | Automated follow-monitor rollover test; no invented live publication event. |
| Changed source bytes | Real Mac/AWS variant difference recorded; automated pinned-source mismatch test makes zero paid calls. |

## Progressive delivery and source quality

`featureExecution` persists `NOT_STARTED`, `QUEUED`, `PROCESSING`, `WAITING_FOR_CAPACITY`, `RETRY_SCHEDULED`, `READY`, `FAILED` and `INELIGIBLE`, plus explicit partial completeness. Existing native contracts remain compatible. Full READY requires validated core outputs and the configured semantic index. Ad candidate inspection runs when the transcript is ready, independently of summary/index success.

The live Apache episode exposed chapters, topics and playable moments while its summary was still being generated. This observation is retained in `evals/intelligence-engine-progressive.json`.

Across the four completed transcripts, automated structural verification checked **2,517 segments and 8/8 expected chunks**: zero missing chunks, invalid/retrograde/out-of-range timestamps, overlapping duplicate passages or broken chapter source references. Two adjacent repeated short utterances were preserved; both occur within a chunk and do not overlap. They are not chunk-stitching duplicates. Beginning/middle/end source samples have stored segment IDs, times and text hashes for reproducible checks.

Final authenticated HTTPS checks returned five within-episode moments and eight conversational matches for each of the Apache and Lightwell queries. All Processed Podcasts returned eight matches across five actual episodes, with coverage of 16 processed episodes and 10 semantic indexes. The returned matches were all Open Source Security; this verifies the global route and its explicit limited coverage, not a measured multi-publisher synthesis. Responses used **SUPPORTED_EXCERPTS**, not an unsupported generated comparison.

A separate read-only database check verified **34/34 citations** against their exact stored episode, segment, transcript version, text and start/end positions; zero mismatches. Examples: Apache foundation introduction at **56,580–58,160 ms**; Lightwell question at **675,120–678,280 ms**. These are verified stored navigation references, not a new physical-device seek confirmation. See `evals/intelligence-engine-search.json`, `intelligence-engine-global-search.json`, and `intelligence-engine-search-integrity.json`.

The three new episodes contain **1.734 source hours**. Their latest persisted partial results completed within **59.84 minutes** of the follow, including deployment, queue and bounded review-repair time; individual recorded processing intervals were 42.8–59.8 minutes. This is an observed recovery-run rate of roughly **1.74 source hours per elapsed hour**, not steady-state provider throughput. Initial paid audio itself was not repeated by these review repairs.

Structural timestamp/citation checks do not establish word accuracy or perceptual alignment. No independently human-labelled transcript sample exists for the newly processed episodes. Word error rate and independently listened timestamp error therefore remain **unmeasured**. Names in ASR can differ from RSS spellings; those differences are not silently presented as corrected quotations. No claim of “perfect transcription” or physical playback verification is made.

## Costs, capacity and scalability

Phase model-ledger delta: **$1.19641466**. Current UTC day/month ledger: **$1.20075576**, with **9,847 new audio seconds** and **zero active reservations**. Breakdown: audio **$0.98470000**, text generation **$0.03117600**, embeddings **$0.00084066**, independent claim checks **$0.17969800**. These are usage-based recorded charges plus conservative unknown-outcome holds, not an OpenAI invoice. The unknown holds are listed below.

| Newly prepared episode | Audio | Text | Index | Claim checks including repairs | Recorded total |
|---|---:|---:|---:|---:|---:|
| Trusting your computing with Lance and Anton | $0.230200 | $0.012491 | $0.00017768 | $0.066953 | $0.30982168 |
| Finding missing security backports with Roi Nisimi | $0.177500 | $0.008273 | $0.00011626 | $0.050719 | $0.23660786 |
| The Apache Software Foundation with Ruth Suehle | $0.217000 | $0.010412 | $0.00017102 | $0.062026 | $0.28960942 |

Measured billed transcription cost is **$0.36/audio hour**. Average text generation is **$0.010392/episode**, indexing **$0.00015499/episode**, claim checking including bounded repairs **$0.05989933/episode**, and total **$0.27867965/unique partially prepared episode** in this three-episode sample. The long source's first three chunks cost **$0.36**; nine saved-plan chunks still require **10,524 billed seconds**, approximately **$1.0524** in audio charges, plus derived intelligence.

The current daily allowance is three billed audio hours; overlap also consumes it. The remaining 953 seconds today cannot accommodate the next deterministic 1,200-second chunk. Tomorrow's fresh allowance can fit the nine remaining chunks if no competing work consumes it and source identity is unchanged. No additional funded configuration is required for that continuation.

Optional cold-start operating configurations, **not applied**:

| Cohort | Fresh audio including overlaps | 24-hour capacity and model funding | 72-hour average capacity and model funding |
|---|---:|---|---|
| Actual baseline active eligible follows | 0 episodes | No backlog funding required | No backlog funding required |
| Three verification episodes plus HPR, from empty cache | 20,371 s (5.66 h) | 20,371 s/day; approximately $2.73 total | 6,791 s/day; approximately $0.91/day ($2.73 total) |
| Six named Danny Jones/JRE episodes, **only if a valid basis is established** | 64,595 s (17.94 h) | 64,595 s/day; approximately $8.64 total | 21,532 s/day; approximately $2.88/day ($8.64 total) |

These are minimum capacity/model estimates using measured analysis overhead, with no contingency for provider latency or future failures. The verification batch fits existing caps across 72 hours. The named cohort would exceed the audio cap even across 72 hours; funding alone cannot resolve its rights dependency. A 24-hour named-cohort run would also exceed the $5 daily monetary cap. No limit has changed.

For a 30-day month, the audio ceiling alone is 90 hours. With all $25 reserved for preparation at this measured repair-inclusive cost, approximately **89 similarly sized partially prepared episodes**, or **51 fresh one-hour episodes**, fit the monetary allowance. Query serving and unrelated work reduce that figure; full semantic-summary quality is not guaranteed by the cost estimate.

Explicit scalability assumptions: each listener consumes one hour/day, follows five overlapping shows, and each row requests the indicated number of distinct one-hour episodes/day across all listeners. Assume **60% completed cache reuse, 20% publisher transcripts needing analysis, 20% fresh transcription**. These are scenarios, not observed hit rates.

| Active users | Distinct episode-hours requested/day | New audio hours/day | Estimated preparation models/day | Models/30 days |
|---:|---:|---:|---:|---:|
| 100 | 5 | 1 | $0.60 | $18.11 |
| 1,000 | 20 | 4 | $2.42 | $72.45 |
| 10,000 | 60 | 12 | $7.25 | $217.36 |

Only the first scenario fits the current model/audio caps before query traffic. These figures exclude search-query serving, delivery, staffing and other unmeasured costs. They are not user-growth capacity guarantees.

AWS Cost Explorer reported **$12.01201458** for November 1–18, marked **estimated**, with billing delay. The existing infrastructure's linear 30-day run rate from complete accrued days is **$21.09**. EC2 compute accounted for $4.1967, EC2 Other $2.4751, VPC $2.06, S3 $1.6680, Secrets Manager $0.7115, KMS $0.5708 and CloudWatch $0.3299. No new infrastructure was created; this phase's incremental AWS charges cannot yet be isolated. Do not multiply or assume that infrastructure figure remains sufficient at 1,000 or 10,000 users. Other operational and scaling costs remain unmeasured.

Reproducible ledger calculations and assumptions: `scripts/cloud/intelligence-engine-economics.mjs`, `evals/intelligence-engine-economics.json`, `evals/intelligence-engine-aws-costs.json`.

The figures include bounded software-repair reviews and therefore are not a steady-state optimisation benchmark. The baseline has no active eligible followed catalogue. The verification cohort has one synthetic test installation following a real licensed podcast, not fabricated podcast episodes. Its duplicate follow caused no extra canonical jobs; real saved-response restart replay required zero additional provider calls. A global cache-hit percentage and monetary duplicate savings are not instrumented reliably, so they are unavailable rather than inferred from this tiny sample.

The economically smallest strategy remains shared canonical preparation: latest three followed episodes, cache and publisher transcripts first, opened/playing priority, bounded background refresh and no bulk catalogue transcription. User count alone is not a transcription-cost multiplier; unique uncached eligible audio is.

## Validation and operations

Full `npm test` (including posttest, cloud, security/rights, budgets, native contract, restart and new engine tests) was run. Additional targeted checks covered actual disk staging, corrupt audio, source identity and source-grounded synthesis. Production archives exclude native files and credentials. No schema migration or database replacement was needed. The final full suite passed after the queue, search and response-validation changes (`7bbe6b2`). The temporary AWS credential error is reproduced in the automated transport test; six failures enter bounded backoff, followed by exactly one execution/acknowledgement. Earlier concurrent verification encountered 55-second timeouts and one HTTP 502; those failures are not removed from the assessment. After the final correction, all sampled requests succeeded: administrative episode detail 97–6,057 ms, listener status 7,518–9,564 ms, moments 577–1,723 ms, scoped conversation search 3,302–3,315 ms, and global search 12,915 ms. Status/global search latency remains an operational limitation. These are individual measured requests, not percentile or load-test results.

Final public HTTPS health: **HTTP 200 in 346 ms** at 2026-11-18T14:54:36.199Z. Production snapshot at 2026-11-18T14:52:48.738Z reports API ready, worker ready, SQLite integrity **ok**, zero recent processing failures, **23.19 GB** free disk and a 162-second-old backup. Both main SQS and DLQ have zero visible/in-flight/delayed messages. **29 completed chunk checkpoints** remain. The long job is durably paused in the database, not lost merely because its SQS message is acknowledged. Ledger reservations are zero. Across all stored historical jobs, the snapshot contains 5 READY, 17 PARTIAL_READY, 2 FAILED, 3 BLOCKED and 1 CANCELLED; these are not all new acceptance episodes or a claim that every historical failure was repaired.

The monitor's last publication snapshot predates test cleanup; it is a dated discovery snapshot, not a new active-user measurement. `evals/intelligence-engine-test-cleanup.json` records successful unfollow and revocation of only the temporary test installation. The independent long-form approval remains in place.

Full-suite exit status and log hash, deployment/backup IDs and final HTTPS evidence are in `evals/intelligence-engine-final-validation.json`. Rollback retains the prior runtime archive and integrity-checked database backup. No database migration, native compatibility change or TestFlight build was required. Existing unrelated local documents/files were preserved.

The temporary verification follow/access was removed after acceptance; user invitations, existing credentials and rights holds are preserved. The approved long-form job remains accepted and scheduled for capacity recovery independently of the temporary listener.

## Phase 3 Ad Skip handoff and remaining limitations

- Reuse the canonical transcript, audio hash, stored source segment IDs, candidate records and execution decisions. Do not make Ad Skip wait for semantic indexing or summary completion.
- HPR's AWS hash differs from its local decoding fixture. It has only three paid chunks so far and no complete transcript; do not use the local variant or fabricate full-episode candidate coverage.
- Source byte identity, complete advert boundaries, verification expiry, actual seek acknowledgement, duplicate prevention and Undo remain separate Ad Skip safety requirements. This phase does not activate public automatic skipping or claim a real advert seek.
- The six Danny Jones/Joe Rogan targets remain blocked by an unresolved documented processing basis. There are no new transcripts, Briefs, Chapters, Topics or searchable moments for them. No synthetic substitute is counted as their acceptance.
- Real long-form completion after the daily reset, independent listening/word-error evaluation, and current physical-iPhone acceptance remain outstanding. Source changes and unknown provider outcomes may legitimately require reconciliation.
- One new Lance/Anton claim-review request has an unknown provider outcome: ledger ID ends `claims-enumerated-source-selection-v3:ee25b3e4706094aa05b7b7ea8301484e9e1b9335f63393f91c8457d8bd81aee9`, with **$0.0099664** conservatively charged and no saved response. Its request format/review is not automatically repurchased. The stored legacy derived-request record has no provider response identifier to retrieve; reconciliation requires a provider-side request/usage record. Three older episode embedding outcomes are also held, totalling **$0.00010722**; the three new episode indexes are complete.
- Partial summary/chapter quality and the measured status/global-search latency remain product limitations. Another broad unbounded regeneration run is not justified; preserve supported outputs and investigate claim-level failures from the stored evidence.
- No full-catalogue activation or universal production readiness is claimed.

## Capability classification

| Capability | Classification |
|---|---|
| Latest-three follow scheduling and shared jobs | IMPLEMENTED · AUTOMATED TESTED · PRODUCTION VERIFIED |
| Hourly new-publication preparation, playing/opened priority | IMPLEMENTED · AUTOMATED TESTED; no new publisher release observed during acceptance |
| Four-hour chunk plan, bounded disk acquisition and restart checkpoints | IMPLEMENTED · AUTOMATED TESTED · real near-four-hour source decoded; paid completion PENDING |
| Atomic capacity pause and UTC resumption | IMPLEMENTED · AUTOMATED TESTED · production pause VERIFIED; live next-day resumption PENDING |
| Core outputs, semantic index and moment retrieval | See the per-episode matrix; partial output is never full READY |
| Credential/network reconnect and queue diagnostics | IMPLEMENTED · AUTOMATED TESTED; final worker readiness recorded above |
| Six named Danny Jones/JRE targets | BLOCKED: legal processing basis not established |
| Independent human transcript/timestamp quality | BLOCKED: no independently labelled reference for these sources |
| Physical iPhone acceptance of this release | NOT DEVICE VERIFIED; no new native build |
