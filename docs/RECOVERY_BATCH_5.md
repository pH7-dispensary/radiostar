# Recovery Batch 5 — semantic intelligence and grounded answers

Verified 2026-10-26T18:37:46.693Z. Repository `star-cast`, branch `work`; implementation commit `ff3056c` (baseline `59b52d1`). Dedicated AWS account **208096650030**, **eu-west-2**, profile `radiostar`.

## Implemented and verified

- Unicode word segmentation, Chinese overlapping bigrams, Portuguese accent folding, and preservation of non-Latin combining marks replace ASCII-only tokenisation. Shared retrieval serves conversation search and Find a Moment.
- Existing SQLite derived indexes now support `text-embedding-3-small`, 512 dimensions. **Semantic ranking won the final comparison** and is deployed for indexed passages. Unicode lexical retrieval remains available for other authorised caches and provider/budget failures. Weighted hybrid ranking remains an evaluated alternative, not the selected ranking algorithm. No additional provider, vector database, queue, or transcription engine.
- Answers present relevant source excerpts, explicit supported opposing positions, source references, original timestamps, unknown-speaker and partial-coverage limitations, and honest abstention. They do not invent free-form conclusions. Native source cards now show corresponding citation numbers and suppress anonymous diarisation labels as personal names.
- Material brief/chapter claims require verbatim evidence, narrowly supported topic labels, or an independent, source-bound model review. Numbers, dates, attribution, qualifications, contradictions and unsupported medical claims are covered by regression cases. Valid citation IDs alone no longer validate a claim. Reviews are bounded, cached batches; incomplete or unavailable reviews abstain.
- Chapters retain chronological original-audio bounds. Verification includes the canonical speech within cited chapter boundaries. Unverified labels become visibly quoted source excerpts. Topics use exact supporting source IDs from validated claims, including paraphrased themes; their navigation does not fall back to a generic introductory citation.
- Existing hierarchical map/reduce processing and durable checkpoints remain. Reduction carries both brief and chapter source references; final claims are checked against canonical speech. Restart, late long-form source positions, and minority/opposing fixture passages are tested. No audio was transcribed for this batch.
- Index fingerprints/checksums detect corruption, changed audio and mixed legacy versions. Interrupted embedding builds resume from durable batches. Completed provider responses are reused. Rights are rechecked after asynchronous provider work; removed content cannot reappear through a late response. Rights deletion also removes new derived records.
- Atomic reservations use the existing AWS-owned budget ledger. Duplicate and unknown-outcome calls cannot silently replay. Query cache capacity is bounded at 500 entries; indexing is bounded to 32 inputs per batch, with at most eight batches per completion and one resumed batch per search. No bulk catalogue indexing was enabled.
- Sub-microdollar charges now retain nine decimal places. Historical usage records were preserved, with a conservative **$0.00000756** append-only rounding correction. Translate keeps its independent controls and ledger.

## Measured retrieval

Frozen baseline: **24 owned queries**, 22 supported and two absent. Engineering-labelled fixtures cover Chinese, Portuguese, paraphrase, speakers, disagreement, recommendations, partial transcripts and a source at 9,000,000 ms.

| Same 24-query set | Recall@5 | MRR | Multilingual Recall@5 |
|---|---:|---:|---:|
| Original ASCII retrieval | 73.9% | 0.742 | 42.9% |
| Final Unicode lexical retrieval | 77.3% | 0.773 | 100.0% |

Expanded evaluation: **30 queries**, 27 supported and three absent; the same 24 owned cases plus six labels from two currently authorised Open Source Security Podcast transcripts. Do not compare the 30-query results as if they were the original 24-query baseline.

| Same 30-query set | Recall@5 | MRR | Absent-query accuracy |
|---|---:|---:|---:|
| Unicode lexical | 74.1% | 0.741 | 100.0% |
| Weighted lexical/semantic combination | 88.9% | 0.889 | 100.0% |
| **Selected semantic ranking** | **96.3%** | **0.923** | **100.0%** |

Selected threshold: 0.35. Fixed alternating train/held-out split: Recall@5 96.7% / 95.8%. The train split has no absent questions; its abstention metric is unavailable, not zero. Cached retrieval computation averaged 38.4 ms on the existing EC2 host, excluding provider/network time.

All **12 labelled adversarial claim cases passed**: nine unsupported claims rejected and three valid paraphrases accepted. This small authored set is not a calibrated population-wide accuracy or citation-precision estimate. Detailed labels, original source timestamps and measured results are in [the evaluation record](../evals/recovery-batch5-results.json).

## Live HTTPS verification

[Existing AWS API](https://d3ri12f40b85i3.cloudfront.net) passed all **seven** exact, paraphrase, Portuguese, Chinese and no-evidence queries. Every returned quote/source reference and timestamp was checked against the existing canonical snapshot. This establishes source-position consistency, not independent acoustic boundary accuracy.

- Cached queries: approximately 0.67–0.78 seconds from this Mac. One provider cache miss: 1535 ms; repeat: 654 ms with no second charge. Small sequential sample, not a load benchmark.
- Find a Moment returned the actual safety-definition segment at **219851 ms (3:39.851)**. Playback references retain the source's end time, **232319 ms**.
- Two real cached episodes expose Brief, Chapters, Topics, Search and Moments. They are honestly **PARTIAL_READY**: supported brief sentences remain, and unverified chapter wording uses source excerpts. Safety vs Security exposes seven chapters/eight topics; The Future of Open Source Security exposes eight chapters/thirteen topics. Original historical briefs/chapters are preserved in protected rollback records.
- Only these two real episodes have semantic indexes (241 and 74 segments). Six owned evaluation indexes are private fixtures and never enter the listener catalogue. Other eligible episodes continue to use Unicode lexical search.
- Anonymous requests are rejected. Existing pilot credentials were reused; no invitation was consumed. No new intelligence job or transcription usage appeared during acceptance.

## Costs and safeguards

The user authorised a **$0.05** one-time evaluation. Provider-token-priced evaluation cost is **$0.02624132**; the conservative ledger total, including the rounding correction, is **$0.02624580**. These are usage-priced records, not a reconciled provider invoice. No outstanding reservations or unknown derived-provider outcomes remain.

The final embedding version consumed 3834 tokens for Safety vs Security and 1093 for The Future of Open Source Security: approximately $0.00007668 and $0.00002186 respectively. The live uncached query cost $0.00000024. A hypothetical 100-token query costs $0.000002 at the verified $0.02/million input-token rate ([model pricing](https://developers.openai.com/api/docs/models/text-embedding-3-small)). Review cost varies with evidence length; token-priced totals include bounded review iterations and incomplete responses.

Unchanged server limits: **$5/day, $25/month, three transcription hours/day, two-hour audio limit**. RSS-first acquisition, authoritative rights, captions/dubbing permissions, Ad Skip verification gates and local paid-authority restrictions remain intact. No TestFlight build, public Translate activation, budget increase or pH7 change.

## Deployment and recovery

- Release: `b9eb8af6b36968cb30da5b5d4909a4275105e55a955f35e15da89f3eaf290913`, deployed 2026-10-26T18:36:17.098Z.
- HTTPS healthy; worker running; SQS visible/in-flight/delayed messages **0/0/0**, dead-letter depth **0**.
- SQLite integrity **ok**; all **18 canonical transcript payloads unchanged**; 23.95 GiB disk headroom.
- Fresh pre-deployment SQLite backups and retained release archives verified. The Batch 4 archive `ebb927672f7551581d3223e271bba121a2b2255350c221977113b40ff3009dc8` remains encrypted in the existing S3 bucket. Local retention keeps two preceding releases.
- Two server-side secret **configuration flags** enable semantic retrieval and claim review. Existing secret values were preserved. Prior secret-version metadata is retained privately in `.starcast/batch5-release.json`.
- Derived migration uses existing record storage; no new database or destructive schema migration. Canonical caches and original generated material remain. Initial evaluation identity-tuple cache keys were safely moved to canonical episode hashes; original financial usage IDs remain unchanged.
- For rollback, stop the API/worker, back up the current database, run `STARCAST_DB=/var/lib/starcast/backend.sqlite node scripts/rollback-recovery-batch5.mjs` for a preview, then `--apply` with the current release before restoring the selected previous application release/configuration. It restores compatible derived presentation only, skips changed source fingerprints, and does not replace listener, rights or financial records. Do not restore the entire old database over newer listener data.
- Temporary evaluation directory removed; all versions of both temporary S3 object keys removed and verified absent. No extra compute, database, monitoring service or recurring infrastructure was created. Incremental AWS request/storage charges are not separately invoice-attributable in real time; no invented AWS cost is reported.

## Validation and remaining limits

**VERIFIED:** full `npm test` including posttest; native `tsc --noEmit`; source/archive validation; targeted final selection, HTTP, rights-race, restart, corrupted/legacy index, source-bound topic, ellipsis, grounding, rounding, budget and rollback regressions; `git diff --check`; live acceptance and production database/worker checks. Mock providers were used for routine tests. Old fixtures with unsupported stock prose were changed to genuinely source-backed text while retaining their READY/lifecycle assertions.

**PARTIALLY VERIFIED:** broad real-world semantic relevance, multilingual answer completeness, diarisation identity, chapter audio boundaries, and unconstrained cross-episode reasoning. Answers deliberately use evidence excerpts and explicit supported comparisons; they are not unrestricted abstractive synthesis. Model review is fallible, and conservative abstention can qualify valid paraphrases. Legacy originals are recoverable; qualification is not evidence that those originals are false. No independent human-labelled benchmark or physical iPhone test was performed. Native citation/partial-state changes are prepared and type-checked, not shipped in a new binary.

**Operational bounds:** new semantic indexing is attached to eligible completion and bounded resumptions, not a catalogue backfill. A long index can remain BUILDING until a later eligible search resumes it. A full query cache falls back to lexical retrieval. Large claims beyond bounded reviewer input remain unverified; sources are not truncated to pretend completion.

Next milestone: independently review a larger multilingual real corpus, calibrate relevance/abstention and comparison quality, then consider widening semantic coverage within existing rights and budgets.

Implementation commit: **ff3056c**. This report and machine-readable evidence are committed separately on `work`; push status is recorded in the final engineering response.
