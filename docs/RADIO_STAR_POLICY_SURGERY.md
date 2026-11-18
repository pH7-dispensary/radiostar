# Radio Star — Policy execution surgery

Phase 1 of Operation Break the Loop. Repository `pH7-dispensary/radiostar`, branch `work`. Backend-only; no native or TestFlight changes. Deployed and verified on 18 November 2026; the named-podcast activation remains blocked as detailed below.

## Corrections

| Source function | Proven defect | Correction / boundary |
| --- | --- | --- |
| `RightsRegistry.resolve` | A channel basis without `canProcessForAi` could not supersede an automatic episode missing-basis finding, even for separately permitted advert detection or transcription. | Reuse the existing documented channel basis, then evaluate each requested feature. Human episode holds, coverage limits, reservations, revocation, expiry and takedowns remain authoritative. |
| `EpisodePipeline.run` | Publisher-transcript acquisition permission was required before looking in the matching-audio transcript cache, even when there were no publisher references and independently authorised audio transcription was possible. | Read matching cached text before acquisition. Check acquisition permission only for fetching publisher transcripts; denied fetches do not prevent separately authorised audio fallback. Retention/analysis and audio permissions still apply. |
| `RightsRegistry.assessAutomatic` | An explicit restriction recorded automatically from RSS could never be refreshed after that publisher evidence changed. | Refresh only the same automatic episode evidence, preserve its prior record in audit, and evaluate the new evidence. Human holds, channel restrictions, disputes and takedowns cannot be erased by this path. Removing a reservation does not itself grant permission. |
| `FollowedPreparation.dispatch` / `summary` | An old one-hour missing-basis backoff and saved `eligible:false` could conceal current channel permission. | Re-evaluate denied demand before applying its backoff; use current eligibility in status. Existing queues, latest-three selection and shared deduplication remain in use. |
| `EpisodePipeline.rightsRecovery` | Historical expiry, revocation, territorial, optional-feature and operational-pause refusals were omitted from recovery. | A current permitted decision can replace those obsolete refusals. Preserve the old job and audit; do not retry a still-blocked activity. |
| `recoverableTechnicalJob` / `requestOnce` | The actual `TIMEOUT` failure code was absent from the bounded technical recovery set; provider configuration outages were reported non-retryable. | Recognise existing timeout/source failure codes and mark provider unavailability recoverable. Retry limits and uncertain-paid-outcome protection remain intact. |

## One decision contract

`EpisodePipeline.executionDecision` composes the existing rights evaluator, operational registry, cost ledger and persisted job. Request dispatch, followed preparation and the protected episode API share this contract. It contains five independent dimensions:

1. `operationalPolicy`: OPEN/other stored tier, source, version and future-preparation setting.
2. `processingBasis`: current activity permissions, evidence, effective record and assessment revision.
3. `riskAdvisory`: evidence concerns; never writes operational settings.
4. `technicalReadiness`: provider/audio availability, cache/reference facts, capacity and current allowance availability.
5. `executionState`: actual saved job, stage, code and completion time.

`firstBlocker`, `secondaryBlockers` and `nextAction` are explicit. Source metadata resolution is not proof that audio has been downloaded. Publisher references are not proof that a transcript is usable. Budget headroom in this projection is not a reservation: the existing atomic ledger remains authoritative before each paid call, and accepted work survives a temporary budget wait.

No global operating mode or permission was changed. Existing session-only Super Admin controls and CSRF/RBAC tests continue to protect PAUSED and resume. Captions, transcript distribution, translation, dubbing and voice replication remain separate. Ad detection retains its independent source path and existing pilot, audio identity and boundary gates.

## Closing the missing-basis question

The existing registry now records one durable `rights-decision-request` per podcast/execution jurisdiction, with affected episodes/activities, evidence, responsible role, exact question and audit history. Unchanged evidence does not reissue it; a supported channel grant resolves its covered episodes without duplicate approvals. These are operational requests for evidence, never licences.

For Danny Jones and Joe Rogan the unresolved decision is: **what documented licence or applicable exception covers Radio Star's UK-hosted copying/transcription, retention, AI analysis and bounded listener outputs, including provider processing?** The responsible action is for the Super Admin to obtain the scope from the rights holder or a qualified jurisdiction-specific reviewer and record it through the existing review interface. Operator identity/purpose, relevant territories, reservations and expiry must be established; administrator preference and a public RSS address do not answer this question.

The [UK IPO guidance](https://www.gov.uk/guidance/exceptions-to-copyright) and [CDPA 29A](https://www.legislation.gov.uk/ukpga/1988/48/section/29A?view=extent) describe non-commercial research conditions, which the current listener-service purpose does not establish. [EU Directive 2019/790, Articles 3–4](https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX%3A32019L0790) does not by itself establish the applicable national/territorial basis for processing in London. This is an unresolved applicability finding, not an assertion that every podcast use is prohibited. The official [Danny Jones site](https://dannyjonespodcast.com/) and [Joe Rogan site](https://www.joerogan.com/) were checked; their public listening links do not supply the missing processing grant. Generic copyright notices are retained as evidence without being converted into a specific transcription prohibition.

## Verification

`test-policy-surgery.mjs` exercises 16 required cases using the real registry, pipeline, durable queue handoff and SQLite. Only paid-provider boundaries are mocked. Cases include missing records, generic notices, activity-specific restrictions, channel and episode grants, documented exceptions, public-output-only restrictions, human pause, non-blocking advisories, outages, historical refusal recovery, budget wait/resume, transcript reuse, audio fallback, independent ad permission and duplicate follow requests. Successful cases actually reach READY; queue redelivery does not repeat provider work. Changed-evidence audit and decision-request persistence survive reopening the database.

Existing suites additionally exercise authenticated Super Admin actions, CSRF/privilege denial, automatic ad acquisition without canonical transcripts, audio mismatch safeguards, source checkpoints and unknown provider outcomes. No new paid calls are used by these tests.

## Phase 2 handoff

- Use the current per-activity decision and existing automatic latest-three demand; do not introduce another activation acknowledgement.
- Record an actual channel/activity basis for the named podcasts if supplied. Do not convert the outstanding request or OPEN policy into permission.
- Retain `$5/day`, `$25/month`, `10,800 new audio seconds/day` and the already-deployed `14,400-second` source ceiling. This phase does not change them. Longer eligible jobs use existing checkpoint rollover; the 3-hour daily allowance is independent of the 4-hour individual-source ceiling.
- Restore/renew expired test-device access only through the existing authenticated enrolment workflow, if needed; this phase does not silently extend private access.
- Confirm real source acquisition and actual jobs after these dependencies are satisfied. The six named episodes must not be credited with an unrelated fixture's successful handoff.

## Named-episode production outcomes — 18 November 2026

Canonical identities were resolved through the live catalogue, and each episode was reassessed through the authenticated API. Both publisher channels now have one persisted decision request covering their three named episodes. No rights grant was fabricated.

| Episode | Canonical publisher episode ID | RSS minutes | Operational policy | First blocker | Transcript |
| --- | --- | ---: | --- | --- | --- |
| Danny Jones #443 | 95765502-d155-11f1-b17a-bb47d8c507da | 196.63 | OPEN | LEGAL_BASIS_NOT_ESTABLISHED | No cache; 0 publisher references |
| Danny Jones #442 | db8f0462-ce08-11f1-8abf-af529c8252cb | 180.63 | OPEN | LEGAL_BASIS_NOT_ESTABLISHED | No cache; 0 publisher references |
| Danny Jones #441 | 9ed45572-cbd8-11f1-af09-e3a39c6e3b27 | 167.47 | OPEN | LEGAL_BASIS_NOT_ESTABLISHED | No cache; 0 publisher references |
| Joe Rogan #2572 | a7f8279c-d37a-11f1-a462-fb1f7204087b | 184.73 | OPEN | LEGAL_BASIS_NOT_ESTABLISHED | No cache; 0 publisher references |
| Joe Rogan #2571 | 2261e0d2-d2fd-11f1-88f9-877628146802 | 176.58 | OPEN | LEGAL_BASIS_NOT_ESTABLISHED | No cache; 0 publisher references |
| Joe Rogan #2570 | ec46995e-ce9a-11f1-9c7e-fbbdba278d52 | 169.68 | OPEN | LEGAL_BASIS_NOT_ESTABLISHED | No cache; 0 publisher references |

All six have an enabled processing provider, audio capability, free processing slots and budget headroom. All fit the existing four-hour source ceiling. Danny #443/#442 and JRE #2572 exceed one day’s three-hour audio allowance; their eligible full transcription would need checkpointed rollover. This is a secondary capacity constraint, not a policy prohibition. Metadata resolution is verified; new full-audio acquisition on these six was not authorised by their basis decision and was not attempted. No explicit publisher reservation was discovered in their assessed RSS evidence.

The historical 18-episode backlog is no longer current: the live followed snapshot has **0 active users, 0 follows and 0 selected episodes**. The database still has 9 unrevoked installations, but both unrevoked private test-device enrolments have expired (**0 active / 2 expired**). No installations or follow records were deleted, and no expiry was extended. This is an independent authentication/audience dependency for automatic listener-triggered preparation.

## Live processing handoff and cost

A protected Super Admin session submitted the existing owned corpus through the ordinary preparation endpoint. Job `16e893ca-f9d7-4861-8b62-80dc916de2b1` was **QUEUED**, started by the production worker, acquired its authorised publisher transcript, generated intelligence, indexed search and finished **PARTIAL_READY**. It has a brief, six chapters and six topics; search and moments are READY. Brief and chapters retain PARTIAL_READY quality status. This is not claimed as complete READY, nor as activation of the six commercial episodes.

The ledger recorded **$0.0043411** across five new text/review/embedding operations, **0 audio-transcription seconds**, no failed or uncertain charges, and unchanged limits. These are recorded usage costs, not an invoice. A second request reused the same completed job with **0 new jobs and 0 new usage entries**. No new AWS infrastructure was provisioned.

Live verification also exposed a diagnostic error for transcript-only episodes with no audio enclosure: the new contract initially looked up no cache key, although the worker uses the empty-audio-URL variant. The projection now uses the worker's identity consistently; an additional real-pipeline regression covers this case.

## Deployment, recovery and final checks

STS verified account `208096650030`; all deployment operations used `eu-west-2` and the existing dedicated instance `i-08537aa0e84163cb9`. The HTTPS API at `https://d3ri12f40b85i3.cloudfront.net` accepted the protected workflow and rejected anonymous administrative access. The final deployment completed at **2026-11-18 12:28:23 UTC** from source commit `29c9107`:

- Active release: `3c3ca9bd4be14d5c535cfc5c92f564374c94898a1c199ad0832c20be83700c8b`.
- Immediate rollback: `a646cad7f622c4a82bc211fd9ea8112f168c5e215b3152b911bc536f952b8189`; the original pre-phase release `99bec7965f384a4daad9e7e1e1e926f8d66a2cdabf90154e6d2cb7a7e6f16286` was also retained.
- Pre-deployment database backup: `/var/lib/starcast/pre-command-centre-1795004842269.sqlite`, verified integrity `ok`.
- Final database integrity: `ok`; API and worker readiness both `1`; no processing failures in the measured five-minute window.
- Disk: **24,235,118,592 bytes free** (24.24 GB decimal), 24.58% used.
- SQS: zero visible, in-flight or delayed messages; dead-letter queue: zero visible or in-flight messages, observed at 12:30:38 UTC.
- A repeat owned-corpus request after the final deployment returned the same job, reported the transcript cache AVAILABLE, and recorded no new job or usage.

The complete `npm test` command, including `posttest`, passed. After the final transcript-only projection correction, the policy-surgery, processing-activities, intelligence-first-policy and pipeline suites passed. Verification scripts passed syntax checks and were exercised against production. Task-scoped whitespace checks passed; an unrelated pre-existing edit in `docs/AI_ACTIVATION_FINAL_ACCEPTANCE.md` was preserved. No tracked CI workflow is configured in this repository, so these results are local and live checks, not a claimed hosted CI result.

No database schema migration, new infrastructure, public feature activation, rights grant, budget increase or native build was performed. Existing pH7 resources were not modified. Incremental AWS invoiced cost was not measured; no zero-cost claim is made for existing infrastructure and verification requests.

## Evidence and delivery

Implementation commits on `work`:

- `f2cf4c8` — activity-scoped processing gates, stale-refusal recovery, grouped evidence requests and regression coverage.
- `29c9107` — production handoff verification and consistent transcript-only cache reporting.

The accompanying evidence commit contains this report and the final read-only health-verifier refinements. It does not change the deployed backend archive. Existing unrelated working-tree files remain untouched.

Machine-readable evidence under `evals/`:

- `policy-surgery-before.json` and `policy-surgery-after.json`: six canonical episodes, actual decisions, controls and new-job counts.
- `policy-surgery-handoff.json`: actual owned-corpus queue/worker timeline and recorded usage.
- `policy-surgery-cache.json`: post-deployment reuse, feature states and zero additional usage.
- `policy-surgery-health.json`: deployment identity, integrity, disk, pilot counts and final queue observations.
- `policy-surgery-queues.json`: earlier queue baseline; use the timestamped final observations in the health file for release acceptance.
- `policy-surgery-validation.json`: test commands, outcomes and local log hashes.

**Implemented and verified:** the policy execution corrections, automated regression matrix, authorised production handoff, cache reuse, health checks and retained rollback. **Blocked:** processing the six named commercial episodes because their applicable processing basis remains unestablished; current private-device acceptance also requires renewed enrolment through the existing authenticated flow. The live owned fixture is PARTIAL_READY, not full READY. These limits prevent a claim that all requested real-podcast activation has succeeded.
