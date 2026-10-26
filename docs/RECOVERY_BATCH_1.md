# Recovery Batch 1 — intelligence availability and first listen

Verified 26 October 2026. Repository `pH7-dispensary/radiostar`, branch `work`.

## Outcome

**IMPLEMENTED / VERIFIED:** automatic rights notice correction, preserved human restrictions, scoped feature decisions, evidence-bearing administrative advisories, authenticated cached discovery, native recovery navigation, latest-three follow/cache reuse, and compatible AWS deployment.

**PARTIALLY VERIFIED:** native UI works in the actual Expo web export at 320, 390, 430 and 1024 pixels, including dark mode, error/empty states, restart and playback navigation. Native TypeScript and iOS production bundle export pass. This is not physical-iPhone verification; no TestFlight build or upload was triggered.

**BLOCKED for the followed catalogue:** all 21 current followed episodes still need an established processing basis. Three incorrect `PUBLISHER_RESTRICTION` decisions were corrected to `LEGAL_BASIS_NOT_ESTABLISHED`; this correction does not create a licence. None of those 21 became newly eligible, queued or READY. Their processing was not purchased.

Eight existing real episodes are now discoverable through `/api/intelligence/ready` and the locally implemented **Explore AI-Ready Episodes** section. Every listed episode was checked through the listener API for Brief, Chapters, Topics, Find a Moment and conversation search. Fixtures and historical READY records without currently deliverable intelligence are excluded.

## Changes and preserved controls

- `rights-assessment.mjs`: `publisher-rss-v4` retains generic copyright notices as evidence; recognises scoped transcription/TDM/distribution restrictions separately from explicit AI restrictions and publisher licences. Public sequential captions remain covered by a transcript-distribution reservation. Generic notices neither grant permission nor prove an AI prohibition.
- `rights-registry.mjs`: narrowly repairs v1–v3 automatic records whose only recorded prohibition is the generic rights-reserved notice. The prior record is preserved in an audit event. Human reservations, disputes, takedowns, legal prohibitions and structured approvals cannot enter this repair path. Episode reservations still constrain inherited channel grants.
- The existing operational default was already ZERO / **OPEN** and is preserved. No administrator policy was changed. Existing valid channel authorisations and recorded approved exceptions are reused; no new policy engine or legal-exception inference was added.
- Feature decisions remain independent. Internal acquisition/transcription/analysis, Brief, Chapters, Topics, moments, search, ad detection, output distribution, captions, translation, dubbing and voice replication retain their gates. Automatic Ad Skip still requires its separate safety and private-pilot controls.
- Needs Attention now includes the actual assessment evidence, scope, affected features and recommended action. A specific restriction is distinguished from an unestablished processing basis. Advisories cannot automatically pause a podcast.
- `ready-discovery.mjs`: projects existing canonical jobs through the player's current delivery checks. Authentication is required, revoked content disappears on the next request, full transcripts are never returned, and discovery never requests paid processing. Responses are bounded to 12 episodes.
- Native Discover uses real metadata, publication dates, artwork and available-feature labels. It opens the existing player. Refreshes are bounded and stop when inactive; failed refreshes clear potentially stale availability. Unavailable player states offer **Explore AI-ready episodes**. QUEUED says **Waiting for Capacity** and READY says **AI Ready**; genuine worker states retain their existing animations and measured-ETA safeguards.
- No database replacement or destructive migration. Existing stores, processing pipeline, queue deduplication, caches, budgets, local development and private Translate controls remain in place.

## Follow verification and costs

The existing QA installation temporarily followed Open Source Security after verifying that its latest three episodes were already authorised and cached. All three reached READY through the existing follow workflow; one first refreshed its source metadata. Repeating the follow did not duplicate jobs or paid usage. The QA follow was removed afterwards; the original seven follows and 21-episode window were restored. No invitation was consumed.

Automated fixtures additionally cover new automatic transcription and intelligence generation, concurrent followers, latest-three ordering, disputes, cache hits, retry deduplication and budget limits with mocked paid providers.

Recorded AI usage remained **41 entries, $1.562445 total/month**, with **$0 additional processing cost** and no outstanding reservations from this batch. No new real episode was transcribed merely to demonstrate the feature.

Standard controls remain $5/day, $25/month, three transcription hours/day and a two-hour audio episode maximum. The pre-existing, separately authorised internal test configuration remains unchanged: $25/day, $125/month, 15 transcription hours/day, four-hour audio maximum, expiring **2026-10-27T21:53:27.023Z**. Private Translate's independent ledger was not changed.

AWS Cost Explorer reports **$7.085998757 USD** for October 1–25, excluding credits/refunds, marked **Estimated**. This is account expenditure, not an incremental deployment charge. No infrastructure or recurring service was added. Small existing storage/API/deployment charges cannot be isolated before AWS billing settles.

## Verification

- Full `npm test`, including posttest, cloud guards, rights, security, budgets, queue, automatic follow and delivery suites.
- New `test-recovery-batch1.mjs`: generic notice retention, narrow legacy correction, scoped TDM, public-transcript restrictions, valid licence/exception, inherited authorisation, explicit episode reservation, dispute/takedown preservation, advisory scope and cache-only discovery.
- Extended automatic-assessment integration test: publisher-licensed fixture reaches READY; authenticated discovery delivers valid features; anonymous access is refused; revocation removes the episode; repeated discovery does not purchase analysis.
- Native `npx tsc --noEmit`; Expo web and iOS production exports. No dedicated lint command is configured. `git diff --check` passes.
- `scripts/verify-ready-discovery.mjs`: actual Expo UI, bounded test responses, recovery navigation, empty/error/restart states, light/dark and tablet widths; no page errors or horizontal page overflow. `--live` renders the eight real cached API records and their publisher artwork; other interactions remain isolated and are not physical-device audio evidence.
- `scripts/verify-native-processing.mjs`: active-state animation, reduced motion, automatic READY refresh, partial results, network recovery, continued browser audio and existing player controls.
- `scripts/verify-admin-phase5.mjs --live`: protected session, unauthenticated and missing-CSRF refusals, navigation, Needs Attention and responsive operations pages; no policy changes.
- `scripts/verify-recovery-batch1.mjs --live`: actual rights reassessment and cached listener APIs. `scripts/verify-cached-follow.mjs --live`: controlled latest-three follow and duplicate request verification.

Initial checks exposed a mismatch in the accessible recovery-link name and overly broad restriction-advisory feature lists; both were corrected and retested. The existing public-transcript restriction regression also caught a dropped caption hold, which was restored before deployment. One historical episode returned no moment for the theme “Podcast evolution”; a query using its other recorded theme returned grounded results. This remains query-dependent retrieval, not a claim that every natural-language question finds a match.

Local evidence: `.starcast/batch1-live.json`, `.starcast/batch1-follow.json`, `.starcast/batch1-visual/`, `.starcast/batch1-processing-visual/`, and `.starcast/phase5-live-admin/`. These remain ignored operational artefacts, not committed listener data or credentials.

## Production and rollback

STS verified dedicated account **208096650030**, deployment role `RadioStarDeploymentRole`, region **eu-west-2**, instance `i-08537aa0e84163cb9` with the StarCast ownership tag. The four inspected production source hashes matched starting commit `ca7dfce`; the deployed baseline was release `6adbb0eb838b733c1f1fba174b317d27fec71f34edc8d66c1c66e8202d1baf8c`.

Predeployment SQLite integrity passed and recovery backup `/var/lib/starcast/pre-command-centre-1793025340736.sqlite` was verified. Disk headroom exceeded 23 GiB. Deployment used the existing guarded S3/SSM release workflow with automatic health-check rollback and retained releases. No pH7 resources were modified.

API, worker and SQS/DLQ checks pass. SQLite integrity is `ok`; FFmpeg/FFprobe execute successfully. The existing protected legacy deployment directory remains an explicitly reported retention warning; it contains macOS metadata outside the deletion allowlist and was preserved. Do not interpret that known warning as a failed API or an entirely clean infrastructure dashboard.

Backend commits: `fb2e258`, `9a20040`. Native and acceptance scripts: `69eb491`. The final release identifier and observed backlog follow below.

## Remaining work

Publishers or qualified rights reviewers must supply an applicable, documented processing basis for the 21 followed episodes before acquisition/analysis can proceed. A transcript reference alone is insufficient, and publisher references are not claimed to have been downloaded or validated for restricted episodes. Duration and budget checks still apply after rights become eligible.

The new native discovery section awaits a separately authorised native distribution/release and physical-iPhone check. Backend rights and intelligence delivery fixes are live for existing clients. Later recovery batches remain outside this implementation; no claim is made that the entire catalogue or application is production-complete.


## Final observed production evidence

Observed 2026-10-26T14:58:46.102Z. Release `6b9d2cecc527eec2154d3a8a709b27a6957277e4990eaee650c21328645feb33`, previous release `7ef52ab4507ab7534fc107179b4a9419be3a44caa06294c904644ea092085831`; rollback remains available. Final SSM observation 2026-10-26T15:01:35.891Z: SQLite integrity **ok**, service **active**, 24.05 GiB free. All four inspected deployed source hashes match the committed local source. API, worker, SQS and DLQ are healthy; queue and DLQ have zero visible, in-flight or delayed messages.

| Measure | Actual |
|---|---:|
| Original followed window | 21 |
| Incorrect blanket restrictions corrected | 3 |
| Original backlog newly eligible | 0 |
| Original backlog newly queued | 0 |
| Original backlog newly READY | 0 |
| Existing real AI-ready episodes surfaced | 8 |
| Controlled follow episodes READY from cache | 3 |
| Additional paid calls | 0 |

### Listener-visible cached episodes

Every row has an accessible Brief, Chapters, Topics, moments and conversation search. The moment counts are results for the recorded verification query, not a guarantee for every question. All episodes except Research Culture #172 are from Open Source Security.

| Episode | Chapters | Topics | Verified moment matches | Search |
|---|---:|---:|---:|---|
| Dependency attacks in 2026 with James Matchett | 10 | 14 | 1 | Indexed source retrieved |
| Sovereignty, policy, and OpenUK with Amanda Brock | 14 | 18 | 1 | Indexed source retrieved |
| The curl summer of Bliss with Daniel and Stefan | 15 | 20 | 1 | Indexed source retrieved |
| (Episode 172) Authorship Uncovered: Who Gets the Credit? | 5 | 10 | 5 | Indexed source retrieved |
| Finding difficult vulnerabilities with Jaya Baloo from AISLE | 8 | 13 | 4 | Indexed source retrieved |
| Forking Open Source Projects with Sheogorath | 7 | 12 | 1 | Indexed source retrieved |
| Safety vs Security with Thomas Depierre | 7 | 12 | 3 | Indexed source retrieved |
| The Future of Open Source Security | 8 | 11 | 5 | Indexed source retrieved |

### Current followed backlog

All rows have **no canonical transcript cache**. “Publisher reference” means RSS metadata only, not a verified/downloaded transcript. `L` = **LEGAL_BASIS_NOT_ESTABLISHED**, not a proven publisher prohibition. `A` = record a documented publisher permission or independently approved applicable processing basis, then re-assess through existing preparation; duration and budget gates remain independent. None has an estimated completion time because no eligible processing job exists.

- RSS 1: [Danny Jones Podcast](https://rss.pdrl.fm/0fcac1/feeds.megaphone.fm/QCD2752074976)
- RSS 2: [Dan Carlin's Hardcore History](https://feeds.feedburner.com/dancarlin/history?format=xml)
- RSS 3: [The Tucker Carlson Show](https://feeds.megaphone.fm/RSV1597324942)
- RSS 4: [Julian Dorey Podcast](https://rss.pdrl.fm/59fdc5/feeds.megaphone.fm/QCD7565826865)
- RSS 5: [Lex Fridman Podcast](https://lexfridman.com/feed/podcast/)
- RSS 6: [The Joe Rogan Experience](https://feeds.megaphone.fm/GLT1412515089)
- RSS 7: [Research Culture Uncovered](https://feeds.captivate.fm/research-culture/)

| Podcast / episode | RSS | Policy | Recorded evidence | Transcript availability | Blocker / next action |
|---|---:|---|---|---|---|
| Dan Carlin's Hardcore History — Show 72 - Mania for Subjugation II | 2 | OPEN | COPYRIGHT_NOTICE, LAWFUL_ACCESS_OBSERVED, TDM_REVIEW | No cache; no publisher reference; authorised audio would be needed | L / A |
| Dan Carlin's Hardcore History — Show 73 - Mania for Subjugation III | 2 | OPEN | COPYRIGHT_NOTICE, LAWFUL_ACCESS_OBSERVED, TDM_REVIEW | No cache; no publisher reference; authorised audio would be needed | L / A |
| Dan Carlin's Hardcore History — Show 74 - Mania for Subjugation IV | 2 | OPEN | COPYRIGHT_NOTICE, LAWFUL_ACCESS_OBSERVED, TDM_REVIEW | No cache; no publisher reference; authorised audio would be needed | L / A |
| Danny Jones Podcast — #440 - "I Know the Scientist" Plague Expert on What's REALLY Happening in Russia \| Wendy Orent | 1 | OPEN | EVIDENCE_REVIEW_NO_BASIS | No cache; no publisher reference; authorised audio would be needed | L / A |
| Danny Jones Podcast — #441 - DARPA Insider: Steve Jobs CIA Deal, Stargate Argentina & Facebook Weapon \| Sharon Weinberger | 1 | OPEN | EVIDENCE_REVIEW_NO_BASIS | No cache; no publisher reference; authorised audio would be needed | L / A |
| Danny Jones Podcast — #442 - "It Wasn't Russia" 27-Year CIA Agent Drops DNC Hack Bombshell \| Ray McGovern | 1 | OPEN | EVIDENCE_REVIEW_NO_BASIS | No cache; no publisher reference; authorised audio would be needed | L / A |
| Julian Dorey Podcast — Exiled Professor WARNS: “They’re Funding a NEW Matrix and it’s Not What You Think!” \| Neema Parvini | 4 | OPEN | COPYRIGHT_NOTICE, LAWFUL_ACCESS_OBSERVED, TDM_REVIEW | No cache; no publisher reference; authorised audio would be needed | L / A |
| Julian Dorey Podcast — EXPLOSIVE Jared Kushner Allegations, Shawn Ryan Drama & Lindsey Graham SHOCKER \| Julian Dorey | 4 | OPEN | COPYRIGHT_NOTICE, LAWFUL_ACCESS_OBSERVED, TDM_REVIEW | No cache; no publisher reference; authorised audio would be needed | L / A |
| Julian Dorey Podcast — Top-5 Chemist UNLOADS on MKUltra, Blood Lines & the AI Bubble \| Dave Collum | 4 | OPEN | COPYRIGHT_NOTICE, LAWFUL_ACCESS_OBSERVED, TDM_REVIEW | No cache; no publisher reference; authorised audio would be needed | L / A |
| Lex Fridman Podcast — #500 – Khabib Nurmagomedov: Dagestan, MMA, UFC, Islam, Conor, Fedor & Football | 5 | OPEN | LAWFUL_ACCESS_OBSERVED, TDM_REVIEW | No cache; 1 publisher reference(s), unverified | L / A |
| Lex Fridman Podcast — #501 – DHH: Future of Programming, AI, Agentic Engineering, Vibe Coding & Linux | 5 | OPEN | LAWFUL_ACCESS_OBSERVED, TDM_REVIEW | No cache; 1 publisher reference(s), unverified | L / A |
| Lex Fridman Podcast — #502 – Psychiatry, Insane Asylums, Mental Illness, ECT, Lobotomies, Freud & Jung | 5 | OPEN | LAWFUL_ACCESS_OBSERVED, TDM_REVIEW | No cache; 1 publisher reference(s), unverified | L / A |
| Research Culture Uncovered — (Episode 173) Beyond Town and Gown: The Civic Exchange at University of Leeds | 7 | OPEN | COPYRIGHT_NOTICE, LAWFUL_ACCESS_OBSERVED, TDM_REVIEW | No cache; 1 publisher reference(s), unverified | L / A |
| Research Culture Uncovered — (Episode 174) Openness, equity and the changing information ecosystem with Monica Westin | 7 | OPEN | COPYRIGHT_NOTICE, LAWFUL_ACCESS_OBSERVED, TDM_REVIEW | No cache; 1 publisher reference(s), unverified | L / A |
| Research Culture Uncovered — (Episode 175) Bear With Us: Reflections from this year's International Research Culture Conference | 7 | OPEN | COPYRIGHT_NOTICE, LAWFUL_ACCESS_OBSERVED, TDM_REVIEW | No cache; 1 publisher reference(s), unverified | L / A |
| The Joe Rogan Experience — #2569 - Bill Thompson | 6 | OPEN | COPYRIGHT_NOTICE, LAWFUL_ACCESS_OBSERVED, TDM_REVIEW | No cache; no publisher reference; authorised audio would be needed | L / A |
| The Joe Rogan Experience — #2570 - Mystery Boys | 6 | OPEN | COPYRIGHT_NOTICE, LAWFUL_ACCESS_OBSERVED, TDM_REVIEW | No cache; no publisher reference; authorised audio would be needed | L / A |
| The Joe Rogan Experience — JRE MMA Show #187 with Robert Whittaker | 6 | OPEN | COPYRIGHT_NOTICE, LAWFUL_ACCESS_OBSERVED, TDM_REVIEW | No cache; no publisher reference; authorised audio would be needed | L / A |
| The Tucker Carlson Show — Expert Audits the True Cost of the Iran War and What the Pentagon Is Hiding From You | 3 | OPEN | COPYRIGHT_NOTICE, LAWFUL_ACCESS_OBSERVED, TDM_REVIEW | No cache; no publisher reference; authorised audio would be needed | L / A |
| The Tucker Carlson Show — Exposing the True Evils of the Uniparty: Soros Money, Surveillance, and the Rise of a Third Party | 3 | OPEN | COPYRIGHT_NOTICE, LAWFUL_ACCESS_OBSERVED, TDM_REVIEW | No cache; no publisher reference; authorised audio would be needed | L / A |
| The Tucker Carlson Show — Paris Burns as the Great Replacement Reaches Its Inevitable Conclusion | 3 | OPEN | COPYRIGHT_NOTICE, LAWFUL_ACCESS_OBSERVED, TDM_REVIEW | No cache; no publisher reference; authorised audio would be needed | L / A |

The three corrected Joe Rogan records retain the exact generic notice **“© All rights reserved”**. They now report missing processing basis, not a feature-specific ban. Other copyright notices are retained verbatim in the registry; lawful-access observations establish retrieval, not permission. `TDM_REVIEW` records that no deployment-approved applicable exception was established. The Danny Jones channel/episode evidence retains the prior human review finding that an earlier bare administrator approval lacked supporting rights evidence; that record was not converted into a licence.

No licence for Research Culture episode 172 was propagated to episodes 173–175. The eight discoverable episodes and the three controlled-follow cache hits are not counted as newly processed backlog episodes.
