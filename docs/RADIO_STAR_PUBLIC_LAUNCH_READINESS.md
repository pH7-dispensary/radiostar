# Radio Star — public launch readiness

18 November 2026. **Final verdict: NO-GO for public release.** Keep the existing internal pilot. Public Ad Skip, public enrolment, Translate billing and Apple uploads remain disabled/deferred. No budget or publisher permission was expanded.

## Revision and deployment

Repository `pH7-dispensary/radiostar`, branch `work`. Baseline `ec26c411574cfee47a66aad59bdb371b6e12dc7e`. Implementation **`f4876d894660ec3c8bfcd3bb89a5cbfc5491cb7b`**, release archive **`3e70cd21dbf95014bdab040286ea61faba791af9671b72851382ca98b1a7fb80`**, AWS account **208096650030**, region **eu-west-2**, existing instance `i-08537aa0e84163cb9`. Release candidate tag **`rc/public-launch-2026-11-18`** identifies an internal candidate, not public approval. HTTPS: https://d3ri12f40b85i3.cloudfront.net.

Live checks: 22.67 GB free, backup age 40 s, six capacity-waiting jobs, zero stalls/provider failures/incorrect-skip reports; four OSS APIs deliver briefs/chapters/topics with honest PARTIAL_READY status. See `evals/public-launch-health.json`. Rollback preserves the preceding archive `d93f3d2c3c824eaffdfe9fe9a69c1306f17491aebf83886ded25409e54640c18` and previous source directory. Unrelated local changes were preserved.

## Actual corrections

- Removed duplicate intelligence status evaluation. Bounded caches reuse only pure, source-bound claim validation and valid semantic-index summaries. Rights, listener access and audio identity are checked on every request. A small additive SQLite revision table and triggers invalidate semantic validation for direct SQL writes, other database connections, deletion and rollback; unchanged vector blobs are no longer parsed on each poll. No transcript, rights or ledger records were replaced.
- Added four genuine operational signals and alarms: capacity waits, overdue unfinished jobs, provider failures and incorrect-skip reports. These also appear in the existing protected operations dashboard. Capacity waits and completed partial outputs are not labelled stalled. Reports are not adjudicated false-positive measurements.
- Restored the missing operations email subscription. AWS confirmed it; the owner confirmed receipt of **PUBLIC-LAUNCH-20261118**. Existing CloudWatch infrastructure was reused: 15 alarms OK; capacity-wait correctly ALARM for six saved jobs.
- Closed a deletion/restore defect: an old database could resurrect a deleted profile. Cloud startup now reconciles a separate encrypted, versioned S3 record of hashed revocations before accepting listeners or running workers. Deletion acknowledgement waits for a conditional durable write. Storage failure returns a retryable error; concurrent writes cannot silently overwrite each other. IAM access is restricted to that single object. Historical backup bytes are not immediately erased.
- Patched the native build dependency `@expo/fingerprint > minimatch` to 11.0.9. Corrected two native explanations that incorrectly promised transcription always asks first. These source changes await a future native build; retained signed build 18 does not contain them.

## Acceptance matrix

The gates below were established before Phase 4 changes; thresholds were not relaxed to obtain a pass.

| Capability | Implemented / automated tested | Production verified | Device verified / remaining gate |
| --- | --- | --- | --- |
| Catalogue, follows, playback | Existing regression suite passes | HTTPS catalogue and authenticated APIs | Prior owner confirmed Lightwell playback/navigation; complete fresh build-18 journey NOT TESTED |
| Automatic latest-three preparation | Scheduling, deduplication, rollover, bounded retry and restart tests pass | Real eligible followed work and saved checkpoints | >=95% fully complete preparations in a funded window NOT VERIFIED |
| Four-hour transcription | Bounded acquisition/chunks, durable checkpoints and interruption tests pass | Real HPR source: 3/12 chunks saved | BLOCKED by today's remaining audio capacity; full completion NOT VERIFIED |
| Brief / Chapters / Topics | Independent feature states, grounded references and cache reuse | Real OSS outputs persist; some brief/chapter content remains partial | Perceptual accuracy sample NOT VERIFIED for this release |
| Find a Moment / conversational search | Lexical/semantic retrieval, citations, timestamp validation | OSS segment/index checks pass | Prior Lightwell owner acceptance; full new-user field test NOT TESTED |
| Automatic Ad Skip / Undo | Variant, expiry, failed seek, manual seek, speed, duplicate and Undo tests pass | Two exact-source desktop executions from Phase 3 | Native field test and held-out accuracy gate NOT VERIFIED |
| AI Sleep / background recovery | Existing lifecycle/extension/recovery tests pass | No cloud inference added | Physical background, lock-screen, headphones and long sessions NOT TESTED |
| Authentication, rights, budgets | Full protected-route, role, CSRF, reservation and restriction regressions | Existing private access/limits preserved | Public access scope and AI consent review BLOCKED |
| Operations / restoration | Restore, alerts, monitoring and deletion replay tests pass | API/worker/database healthy; empty SQS/DLQ; deletion replay verified | Email delivery DEVICE/OPERATOR VERIFIED; crash-free session rate unavailable |

The 17-step installed-iPhone journey remains incomplete; no attached iPhone or new device log was available. Desktop executions and exports do not substitute.

## Fixed catalogue and quality

Each named episode retains its own outcome; none is replaced by a successful fixture.

| Episode | Actual outcome |
| --- | --- |
| Danny Jones #443 | `LEGAL_BASIS_NOT_ESTABLISHED`; no new transcript, intelligence or skip authorisation |
| Danny Jones #442 | Same actual eligibility dependency; not READY |
| Danny Jones #441 | Same actual eligibility dependency; not READY |
| Joe Rogan #2572 | `LEGAL_BASIS_NOT_ESTABLISHED`; no new transcript, intelligence or skip authorisation |
| Joe Rogan #2571 | Same actual eligibility dependency; not READY |
| Joe Rogan #2570 | Same actual eligibility dependency; not READY |
| HPR2578: LinuxLUGcast 102 (235.2 min) | 3/12 saved chunks; `WAITING_FOR_CAPACITY`, next daily reset 19 November 00:00 UTC; no full transcript or invented completion |
| OSS “Finding missing security backports” (29.6 min) | 510 segments, 2/2 chunks; searchable; brief/chapters partial |
| OSS “The Apache Software Foundation” (36.1 min) | 740 segments, 2/2 chunks; searchable; brief/chapters partial |
| OSS “Trusting your computing with Lance and Anton” | 821 segments; persisted searchable output; partial intelligence |
| OSS “Red Hat's Project Lightwell with Mo Duffy” | 446 segments; persisted intelligence/search; prior owner confirmed playback, brief and chapter/moment navigation |

For the sampled complete OSS transcripts: zero detected timestamp-order errors, adjacent overlap duplicates or broken chapter references; search and semantic checksums pass. These are structural checks, not measured word-error rate or independent listening accuracy. Current snapshot: 28 jobs, including 5 READY and 17 PARTIAL_READY; this mixed historical population is not a valid preparation-success denominator.

Phase 3 Ad Skip evidence remains unchanged: LUP 690 human label **0–90,415 ms**, detected **0–90,459 ms**: 100% labelled-break coverage, 0 ms start error, +44 ms end error/extra audio. Exact matching audio and desktop automatic seek/Undo passed for LUP 690 and machine-reviewed LUP 635. No new physical-iPhone skip is claimed. Corpus: 12 files, two shows, one publisher, 0.745 assessed audio hours; five acoustically verified openings. Held-out release gate remains **0/20 complete episodes, 0/6 publishers, 0/50 independently labelled adverts and 0/50 hard negatives**. Historical BLAB diagnostic: 45.08% any-overlap recall, 7.25% complete boundaries, 116 candidates outside labels; no automatic authorisation without audio. These are not acceptable public accuracy evidence. Pilot expiry remains **9 December 2026 15:48:29 UTC**, two testers only.

## Reliability and tests

A checksum-verified 129,511,424-byte production snapshot was restored privately with outbound calls and paid processing disabled. Integrity, canonical records, listeners, cache, ledger and mock-queue acknowledgement passed. Final restore/startup took **2.974 s**; this is not a complete EC2 disaster-replacement time.

Same 400-request mix before/after: concurrency 16 fell from **23% errors / 34.185 s p95** to **0% / 8.608 s**. Final concurrency 1/4/8/16 p95: **0.221/1.325/5.897/8.608 s**, all 400 responses HTTP 200. Search/admin/status use restored records; RSS and SQS are mocked. This workstation result does not establish EC2 throughput or public latency. Queue delay and event-loop saturation still argue for a small pilot and measured scaling, not an arbitrary user-count promise.

Seven-day CloudWatch probe results: **99.744% ready among observed samples**, but only **92.966% minute coverage**, with **709 missing minutes**. Missing observations are not assumed healthy. The representative 99.5% availability gate is NOT VERIFIED. There is insufficient physical-session telemetry to measure 99.5% crash-free sessions.

Validation: **PASS: full `npm test` including posttest suites**. Native TypeScript and final iOS export pass; Expo Doctor 21/21 passed after dependency patch. No separate lint command is configured. Terraform validation passes. Migration/rollback, corrupted indexes, concurrent deletion, failed storage, rights revocation and unchanged spending ledgers have targeted coverage. Real provider outage/destructive worker termination were not repeated against today's production; existing fault-injection and saved-chunk evidence are retained.

## Economics and limits

No paid model calls were made by this phase. Latest recorded daily/monthly AI usage: **$1.2907558**, **10,747/10,800** audio seconds, zero outstanding reservations. Limits remain $5/day, $25/month, three billed audio hours/day, four-hour episode ceiling; Translate's separate $2/$10/10-minute limits remain unchanged.

Measured transcription **$0.36/hour**, mean generation **$0.010392/episode**, indexing **$0.000155**, claim checking/repair **$0.059899** from three partial episodes. Estimated four-hour preparation **$1.9288**, including overlap; actual fully completed four-hour cost unavailable. Observed batch throughput **1.739 source hours/wall hour**, including waits and partial outputs, is not steady-state capacity. Global cache-hit rate, duplicate savings and acoustic-analysis unit cost are unavailable.

Assume five follows/user, one weekly one-hour episode/show, one listening hour/user/day, shared catalogue of 35/140/420 shows, 60% completed cache, 20% publisher transcripts and 20% fresh transcription:

| Active users | Unique hours/day | Fresh hours/day | Model/month | Core cost floor / user/month |
| --- | ---: | ---: | ---: | ---: |
| 100 | 5 | 1 | $18.11 | $0.3921 |
| 1,000 | 20 | 4 | $72.45 | $0.0935 |
| 10,000 | 60 | 12 | $217.36 | $0.0238 |

Only the first scenario fits current caps before query traffic; higher scenarios have no bounded sustainable delay. Cold-start audio floors without new arrivals: 7/28/84 days. Funding figures are optional lower bounds, not applied settings. The cost floor includes an existing **$21.09/month** linear AWS run rate, which cannot be assumed sufficient at scale. Cost Explorer: **$11.9533048685 for November 1–17**, estimated and billing-delayed. Four added metrics/alarms plus tiny recovery-object requests incur incremental AWS usage not yet separately billed. No instance, GPU, NAT gateway or parallel service was added.

At hypothetical £14.99 Translate pricing, 20% VAT, 15% store fee and $1.25/£ planning FX, at least 3/8/18 paying users would cover those core floors **before Translate generation, queries, delivery, support and scaling**. This is not actual break-even or verified fee eligibility. Cache-first shared preparation on existing infrastructure remains the smallest sensible strategy. Full reproducible assumptions: `evals/public-launch-economics.json`.

## Security, privacy and exact next actions

Backend dependency audit: zero findings. Native moderate findings fixed; npm still reports 21 propagated high flags from [withdrawn GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf); no forced Expo downgrade or suppression. Native release-environment checks exclude server credentials. No secret is included in this evidence.

Every unresolved launch gate has a specific next action:

| Owner | Evidence / blocker | Next executable action |
| --- | --- | --- |
| Owner / Apple Account Holder + iPhone tester | Uploads explicitly deferred; build 18 predates these source changes; no current field logs | Renew/accept Apple agreement when ready, authorise resumption, make one consolidated candidate and execute the 17-step device matrix with native logs/screenshots |
| Rights owner / counsel | Six named episodes lack an established applicable processing basis | Record actual activity-specific evidence or remove these episodes from advertised coverage; do not override takedowns or invent licences |
| Engineering + capacity owner | HPR 3/12, only 53 audio seconds today; three short outputs remain partial | Let existing rollover resume saved chunks, verify complete output/quality, then measure >=95% success in an agreed funded cohort; approve any larger operating scope separately |
| Ad Skip evaluation lead | Held-out publisher/advert/negative and device gates unmet | Expand exact-hash audio evaluation and independent assessment, then verify native seek/Undo; no automatic public rollout meanwhile |
| Operations | Monitoring gaps and no device crash denominator | Collect a complete representative window and real beta session diagnostics; retest latency on the existing production class before increasing cohort size |
| Controller/legal editor + engineering | Live privacy page proposes unwanted 90-day transcript expiry and says deletion is unfinished; territorial/AI consent/processor/retention scope not approved | Correct published policy against actual behaviour, approve necessary disclosures and personal-data AI permission flow, implement/test the approved flow before public onboarding |

No scheduled transcript expiry was introduced. AI-data-sharing permission must meet [Apple 5.1.2(i)](https://developer.apple.com/app-store/review/guidelines/#data-use-and-sharing); an existing toggle alone is not compliance proof. Metadata and reviewer instructions are updated in `RADIO-STAR-APP-STORE-PACKET.md`; actual iPhone screenshots, final age/privacy disclosures and public approval remain outstanding. Existing emergency switches can stop new paid work or private Ad Skip independently of ordinary playback.
