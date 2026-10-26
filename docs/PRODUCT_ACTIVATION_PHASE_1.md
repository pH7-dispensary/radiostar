# Product activation phase 1 — production evidence

Verified 26 October 2026, branch `work`, repository `pH7-dispensary/radiostar`.

**PARTIALLY VERIFIED overall.** Automatic acquisition, transcription, analysis,
index completion and listener retrieval work on authorised real audio. The
original followed window still contains 18 episodes without an established
processing basis. This release does not claim those episodes are ready, or
that the new episode's partially grounded brief and chapters are fully ready.

## Delivered — IMPLEMENTED and deployed

- Isolate assessment failures per episode: one source outage no longer prevents
  the other latest episodes entering preparation. Retain the failed episode as
  a specific recoverable wait, rather than silently dropping it.
- Canonicalise historical feed aliases consistently through planning, dispatch
  and reporting. Multiple listeners share the same latest-three jobs.
- Recognise completed `PARTIAL_READY` intelligence as reusable cached output.
  Do not continually dispatch it as unfinished paid work. Source changes still
  invalidate the relevant assumptions and require reassessment.
- Resume unfinished semantic indexes automatically through the existing
  preparation monitor, in bounded batches, without requiring a search request.
  Reuse existing provider checkpoints, deduplication and atomic reservations.
- Recheck operational policy and processing rights before index resumption.
  Human pauses remain authoritative; stale derived pause states can clear when
  the actual policy permits preparation again.

No parallel processing system, new infrastructure, native build, rights grant,
flag rollout or budget increase was introduced. Existing public Ad Skip and
private Translate restrictions remain in place.

## Production population and latest-three window — VERIFIED

| Measure | Before | After |
|---|---:|---:|
| Registered, non-revoked installations | 9 | 9 |
| Profiles eligible for current private-pilot preparation | 2 | 2 |
| Unique followed podcasts in that cohort | 6 | 6 |
| Latest-window episodes | 18 | 18 |
| Fully READY in original window | 0 | 0 |
| Newly eligible in original window | — | 0 |
| Original window requiring a processing basis | 18 | 18 |
| Discoverable processed episodes, including partial intelligence | 8 | 9 |

These are eligibility/installation counts, not measured DAU. The seven other
installations were not granted pilot access to inflate coverage. The temporary
QA follow was removed after verification; existing listener follows were
preserved.

Operational default remains `ZERO` / **OPEN**, with no HIGH/PAUSED overrides.
Preparation remains enabled at its existing configuration version. No automated
policy changes were made. Missing assessments initiate the existing evidence
assessment; the new isolation/recovery logic prevents a transient assessment
failure from becoming a feed-wide administrative deadlock. A valid assessment
is reused without another approval.

## Real audio acceptance — VERIFIED, with output-quality limits

Source: [Open Source Security RSS](https://opensourcesecuritypodcast.libsyn.com/rss).
Episode: **Open source verification with Sal Kimmich**, 1 June 2026,
`5e9a9317-8373-41d0-9465-641a66b2f90d`.

The existing RSS assessor recorded the publisher's CC-BY licence evidence.
Preflight found neither a canonical transcript nor a publisher transcript for
this episode. Internal transcription, analysis and derived intelligence were
eligible; captions, translation and voice replication were not enabled by this
test. No administrator-created licence or invitation was used.

The controlled listener followed the podcast. Its current three latest episodes
were already cached and were reused. Opening the selected older episode then
started automatic processing: **no Analyse/request call**. These are separate
parts of the acceptance test: fresh transcription was not falsely attributed
to the cached latest-three follow window.

| Output | Observed result |
|---|---|
| New canonical jobs | 1, automatic trigger |
| Fresh transcription jobs completed | 1 episode, 2 bounded Whisper chunks |
| Audio duration | 1,913,235 ms, about 31m 53s |
| Timestamped transcript segments | 603 |
| AI Episode Brief | Available, `PARTIAL_READY`, verified-partial mode |
| Smart Chapters | 11, `PARTIAL_READY`, extractive fallback where required |
| Topics | 13, READY |
| Find a Moment | READY; live source references and timestamps checked |
| Lexical search | READY |
| Semantic index | READY, 603/603 segments, completed automatically |
| Ad analysis | Complete, **0 candidates**; not evidence of real-world ad accuracy |
| Overall job | `PARTIAL_READY`, completed; no indefinite processing spinner |

Audio SHA-256:
`8df934a5f1ab1af504092c4cb61a3e0702c7e36aa127268c1e3531e3afad9210`.

Observed TRANSCRIBING at 20:56:40 UTC, ANALYSING at 20:58:22, completed
intelligence at 20:59:13.976. Recorded processing duration: **162,908 ms**.
The initial semantic callback stopped at its batch bound. The deployed fix
resumed it automatically; all 603 segments were indexed at **21:06:23.327**,
verified by a read-only database check before any acceptance search query.

Listener API checks returned the brief, chapters and topics without exposing
the full transcript. Find a Moment returned real segment positions, including
782,120 ms. An exact source query ranked the fresh episode first. The broader
query about verification and provenance returned grounded excerpts from other
episodes and did **not** rank this episode in its top eight; this remains a
retrieval-quality limitation, not a claimed passing paraphrase benchmark.

Read-only production validation matched **26 returned source references** to
canonical transcript text and exact start/end timestamps, and checked all new
chapter/topic source IDs. This verifies provenance, not independent human
transcription accuracy. Grounding safeguards were not weakened to force READY.

Repeated status reads and repeated search queries produced **zero additional
AI usage** and no duplicate jobs. Native polling/foreground refresh regression
tests passed; a physical iPhone refresh was **not** observed in this phase.

## Remaining rights restrictions — BLOCKED for the original 18

The original window spans three episodes each of:

- Danny Jones Podcast.
- Julian Dorey Podcast.
- Dan Carlin's Hardcore History.
- The Tucker Carlson Show.
- Lex Fridman Podcast.
- The Joe Rogan Experience.

All return `LEGAL_BASIS_NOT_ESTABLISHED`. Danny Jones records additionally
identify legacy approvals without documented publisher permission or another
applicable processing basis. The other records identify no publisher permission
or deployment-approved basis in the available evidence. These are **not**
findings of an explicit publisher prohibition.

Required evidence is a publisher/rights-holder permission covering the relevant
internal transcription, analysis and short derived outputs, or a documented
applicable exception with its scope, conditions, source evidence and deployment
applicability. Episode-specific approvals must not be expanded to an entire
feed without evidence. An RSS address, generic copyright notice, missing
reservation or administrator status does not establish that basis.

Transcript distribution, captions, translation, dubbing and voice replication
remain independently evaluated. A restriction on distribution alone is not
converted into an internal-analysis prohibition. Existing actual restrictions,
disputes and takedowns remain enforceable independently of OPEN policy.

## Costs, backlog and ETA — VERIFIED measurements; estimates labelled

- Phase AI ledger increase: **$0.22964294**.
- Fresh transcription: **$0.1915**, two usage entries accounting for chunk
  durations rounded to 1,200 and 715 seconds.
- Analysis, grounding, indexing and acceptance-query embeddings: **$0.03814294**.
- Cumulative recorded AI ledger: **$1.58869080 → $1.81833374**; 121 → 163 entries.
- Outstanding reservations at final verification: **0**.
- Standard controls preserved: $5/day, $25/month, three transcription hours/day,
  two hours/episode. The controlled test was preflighted against these limits.
- A pre-existing temporary pilot allowance remains as found: $25/day,
  $125/month, 15 hours/day, four hours/episode, expiring
  **2026-10-27T21:53:27.023Z**. It was **not renewed or increased**. Do not confuse
  these effective temporary limits with the unchanged standard controls.
- Translate has its separate unchanged ledger and limits.
- Original-window estimated backlog: **$22.40069167**; currently eligible
  estimated cost **$0**. Acquisition planning reports 15 episodes requiring
  audio and three unverified publisher references; estimated audio 42.2078
  hours. This is a planning estimate, not expenditure or permission to queue.
- Backlog completion ETA: **unavailable**. Rights, per-episode limits and budget
  windows prevent a defensible completion forecast. The measured single-job
  duration above is not extrapolated into a promise.

No new AWS resources or recurring services were created. Deployment/verification
uses the existing instance, S3, SQS and SSM. Incremental AWS charges have not
been separately attributed and are not claimed to be zero.

## Tests and AWS release — VERIFIED

Targeted activation, followed-preparation/recovery and semantic-index regression
tests passed. Full `npm test` passed after both implementation milestones;
the final additional human-pause/rights-revocation assertions passed on rerun.
Paid providers are mocked in routine tests. Syntax checks and `git diff --check`
passed. Existing suite coverage includes missing assessments, licences,
exceptions, explicit restrictions/takedowns, publisher transcripts, chunk
checkpoints, deduplication, budget exhaustion, worker recovery, feature status,
native projections and administrative advisories.

STS/ownership checks restricted deployment to **208096650030**, **eu-west-2**.
No pH7 resources were modified. Production results:

- HTTPS backend ready; protected administrative session works.
- Worker running; SQS visible/in-flight/delayed **0/0/0**; DLQ **0/0/0**.
- SQLite integrity check **ok**; FFmpeg/FFprobe executable checks pass.
- Approximately **23.8 GiB available**, 21% disk used.
- Verified pre-deployment database backup and previous source releases retained.
- Existing scheduled backup reports successful integrity check and S3 upload
  at 21:05:24 UTC. This phase did not perform another destructive restore test.
- Operational dashboard remains **DEGRADED** solely for three retained release
  copies: two normal rollbacks plus one protected legacy directory containing
  macOS metadata. Its removal is intentionally outside the cleanup allowlist.
  App-level CloudWatch/S3 remote probes remain UNKNOWN; health is not overstated.

Release archive:
`118492d5fd135f0658e890ebd0454769f8c557d03be036c4518cda791c12f917`.
Deployment SSM command `d3b21e47-e87f-4327-9485-de207cfa81b6`: **Success**.
Previous release `253972ff4e8f7b793870fc9f8a7ac9b1651d4fddb2c7d33150c5411f8610c45d`
remains available for source rollback; preserve the current database and ledger.

Implementation commits pushed to `origin/work`:

- `3c4b3db` — failure isolation, canonical dispatch and completed-cache reuse.
- `322188f` — automatic unfinished semantic-index recovery and bounded live test.

This report and sanitised evidence are committed separately. Detailed private
acceptance responses remain ignored under `.starcast/activation-*.json`.
Shareable evidence: `evals/product-activation-phase1.json`.

## Acceptance limits and next actions

**IMPLEMENTED / VERIFIED:** automatic eligible preparation, one real fresh
transcription, persisted listener-accessible outputs, canonical cache reuse,
bounded automatic indexing, rights/pause guards, budgets and backend deployment.

**PARTIALLY VERIFIED:** latest-three follow path used real cached episodes;
fresh acquisition used an explicitly opened older authorised episode. The new
brief/chapters retain partial quality status; broad semantic ranking and
transcript-derived labels need further quality work. Physical iPhone polling
was not tested in this phase.

**BLOCKED:** universal activation of the original 18 requires the specific
rights evidence described above. No fake permissions, forced READY states,
invented ad candidates or artificial historical metrics were introduced.

**No TestFlight build or public release was triggered.**
