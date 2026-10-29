# Danny Jones / Joe Rogan Ad Skip forensic audit

28 October 2026 · read-only production investigation · branch `work` · HEAD `706a19a`.

## Executive verdict

**Ad Skip has not analysed these episodes. This is not a detector returning zero adverts, and the active pilot is not the present blocker.** Current six latest episodes, plus one additional previously encountered episode, have no transcript, ad-source record, advert analysis, candidate, audio verification or skip lease/receipt. No automatic skip on these shows is established.

The first refusal is proved from current records and the deployed evaluator: an unresolved processing basis represented as `RESTRICTED / LEGAL_BASIS_NOT_ESTABLISHED`. That is **not evidence of an explicit publisher prohibition**. Fixing this record alone is insufficient: the opening preparer cannot start without an existing transcript; all seven exceed the full-source two-hour cap; Danny Jones files additionally exceed 300 MB; and the tested audio streams for all seven episodes fail the native exact-source delivery requirements. These are separate, reproduced conditions, not one generic rights explanation.

**No production data, permission, pilot, budget, source code or deployment changed. No paid provider calls and no TestFlight build.** Only local diagnostics and this report were created. Ongoing ordinary server timers continued normally.

## Production identity and evidence

STS: account **208096650030**, region **eu-west-2**, dedicated StarCast instance. Active release **bf5210e498e0f704c45299d70df079e5de9b7657a736bedce7b1d0744c3d742f**, deployed 2026-10-28T16:07:20.881Z; rollback metadata unchanged. SHA-256 of all nine inspected live pipeline modules matches the working branch. Live HTTPS health reports backend ready, SQLite, configured/enabled OpenAI and audio transcription. Anonymous health's `adSkip:false` is not the enrolled tester's decision.

Read-only SQLite snapshot: **2026-10-28T21:52:54.933Z**; integrity **ok**. Service/worker healthy; both SQS queues have zero visible, in-flight and delayed messages; about 23.05 GiB free. Last 500 application log lines contain limited lifecycle data, not HTTP request/response or device audio traces. Current persisted episode events were inspected instead of treating old logs as current requests.

Evidence: [sanitised machine-readable results](../evals/danny-jones-joe-rogan-ad-skip-forensic.json). Private raw probes and isolated scripts are in `/tmp/radiostar-dj-jre-audit`; signed delivery query strings and listener credentials are excluded from the repository evidence. All four requested previous reports were consulted; live records supersede their historical episode ordering and states. The unrelated edited acceptance document contains pasted directives; it was not executed or overwritten.

## Exact current episodes and identities

Fresh feeds were parsed in full and sorted by publication time, excluding future entries: **443 Danny Jones episodes / 2,771 Joe Rogan episodes**, then latest three. This is independent of catalogue pagination. The production followed window agrees. Danny Jones and Joe Rogan are both followed by the enrolled TestFlight tester with intelligence enabled.

- Danny Jones canonical podcast ID: `9b9be6e898e4d6db`; RSS: https://rss.pdrl.fm/0fcac1/feeds.megaphone.fm/QCD2752074976
- Joe Rogan canonical podcast ID: `a8cbb9fe29ae668e`; RSS: https://feeds.megaphone.fm/GLT1412515089

These are the application's canonical feed IDs ([server.mjs:688](../server.mjs#L688)), not Apple catalogue IDs. Canonical episode IDs follow [episode-pipeline.mjs:45](../episode-pipeline.mjs#L45); full storage keys are in the JSON evidence.

| Ref | Exact episode | Published | RSS duration | RSS GUID | Canonical episode ID |
| --- | --- | --- | --- | --- | --- |
| D1 | #443 - Ex-Banker Exposes Who Trump, Elon & Netanyahu Actually Work For \| Simon Dixon | 2026-10-26 17:06:00 UTC | 3:16:38 | `95765502-d155-11f1-b17a-bb47d8c507da` | `9b9be6e898e4d6db:8cb04923e9514c30` |
| D2 | #442 - "It Wasn't Russia" 27-Year CIA Agent Drops DNC Hack Bombshell \| Ray McGovern | 2026-10-24 17:00:00 UTC | 3:00:38 | `db8f0462-ce08-11f1-8abf-af529c8252cb` | `9b9be6e898e4d6db:9d8a7a48ef324c49` |
| D3 | #441 - DARPA Insider: Steve Jobs CIA Deal, Stargate Argentina & Facebook Weapon \| Sharon Weinberger | 2026-10-19 17:32:00 UTC | 2:47:28 | `9ed45572-cbd8-11f1-af09-e3a39c6e3b27` | `9b9be6e898e4d6db:24d135b738561419` |
| J1 | #2571 - Jimmy Carr | 2026-10-28 19:00:00 UTC | 2:52:35 | `2261e0d2-d2fd-11f1-88f9-877628146802` | `a8cbb9fe29ae668e:6f1b5330eeadc765` |
| J2 | #2570 - Mystery Boys | 2026-10-23 17:00:00 UTC | 2:49:41 | `ec46995e-ce9a-11f1-9c7e-fbbdba278d52` | `a8cbb9fe29ae668e:97e358f1d81aa887` |
| J3 | JRE MMA Show #187 with Robert Whittaker | 2026-10-22 17:00:00 UTC | 2:54:55 | `ed2504ac-cdc1-11f1-b263-83f2c9b36709` | `a8cbb9fe29ae668e:be61ab3c67a13cb8` |

Additional recorded encounter: **#2569 - Bill Thompson**, 2026-10-21T17:00:00.000Z, 2:53:02, GUID `23251e48-ccfa-11f1-8407-c76a5ec426f3`, canonical ID `a8cbb9fe29ae668e:c61a58a9518edef5`. Its last encounter is 24 October, so it is included separately rather than mislabelled as current top three.

The audit also checked historical Danny Jones #440 and JRE #2568 records for prior duration and stale-restriction clues; they are not counted in the seven-episode current/encounter audio denominator.

Every episode's exact RSS enclosure, source URL hash, sampled byte hashes, follow state, feature decisions and history is in the JSON. Current publisher transcript references: **none in any of the seven RSS items**, including supported description transcript links. Canonical, matching-audio, checkpoint and Ad Skip source caches contain **no usable transcript for them**. No claim is made that an unaudited third-party website cannot contain a transcript.

## Episode-by-episode first and secondary blockers

| Episode | First blocker | Secondary blockers | Root cause | Smallest recovery |
| --- | --- | --- | --- | --- |
| Danny Jones #443 | Inherited channel record → LEGAL_BASIS_NOT_ESTABLISHED before detection | No transcript; 2h source cap; 300MB download cap; unverifiable stream + 32MiB fallback; cold first load | Legacy approval lacks supporting evidence; no ad-only acquisition entry point | Establish supported scoped basis; decouple ad source preparation; bound windows; use provably identical playback source; then native acceptance |
| Danny Jones #442 | Inherited channel record → LEGAL_BASIS_NOT_ESTABLISHED before detection | No transcript; 2h source cap; 300MB download cap; unverifiable stream + 32MiB fallback; cold first load | Legacy approval lacks supporting evidence; no ad-only acquisition entry point | Establish supported scoped basis; decouple ad source preparation; bound windows; use provably identical playback source; then native acceptance |
| Danny Jones #441 | Inherited channel record → LEGAL_BASIS_NOT_ESTABLISHED before detection | No transcript; 2h source cap; 300MB download cap; unverifiable stream + 32MiB fallback; cold first load; historical cancelled job | Legacy approval lacks supporting evidence; no ad-only acquisition entry point | Establish supported scoped basis; decouple ad source preparation; bound windows; use provably identical playback source; then native acceptance |
| JRE #2571 | Episode RSS-v4 record → LEGAL_BASIS_NOT_ESTABLISHED before detection | No transcript; 2h source cap; unverifiable stream + 32MiB fallback; cold first load | RSS evaluator has no established basis; no ad-only acquisition entry point | Establish supported scoped basis; decouple ad source preparation; bound windows; use provably identical playback source; then native acceptance |
| JRE #2570 | Episode RSS-v4 record → LEGAL_BASIS_NOT_ESTABLISHED before detection | No transcript; 2h source cap; unverifiable stream + 32MiB fallback; cold first load | RSS evaluator has no established basis; no ad-only acquisition entry point | Establish supported scoped basis; decouple ad source preparation; bound windows; use provably identical playback source; then native acceptance |
| JRE MMA #187 | Episode RSS-v4 record → LEGAL_BASIS_NOT_ESTABLISHED before detection | No transcript; 2h source cap; unverifiable stream + 32MiB fallback; cold first load | RSS evaluator has no established basis; no ad-only acquisition entry point | Establish supported scoped basis; decouple ad source preparation; bound windows; use provably identical playback source; then native acceptance |

JRE #2569 has the same episode-level first blocker and secondary technical conditions as the three current JRE episodes.

Danny #441 has additional historical evidence: job `9e78257e-e66d-422d-b55f-8770f047fbc9` reached a worker on 20 October and stopped at DURATION_LIMIT; retry `db3977cf-57ad-48f0-a46e-57b069897824` was cancelled by an administrator before its worker started. Current #441 state still has that CANCELLED job, but current automatic dispatch stops at the rights decision first. #443, #442 and all four investigated JRE episodes have no canonical intelligence job. Historical #440 also reached DURATION_LIMIT; no transcription checkpoints resulted.

## Complete execution trace for each episode

The following stage matrix applies independently to D1, D2, D3, J1, J2, J3 and the extra JRE #2569; episode-specific differences are stated above and recorded per episode in the JSON.

| Stage | Reached / observed | Exact condition and location | Recovery / interpretation |
| --- | --- | --- | --- |
| Episode discovered | Yes, 7/7; current six match live followed plan | publication sort in [followed-preparation.mjs:11](../followed-preparation.mjs#L11) and RSS parsing | No discovery or pagination repair needed |
| Listener opens/plays | Encounters recorded 7/7; actual open/play type not retained for every event | [followed-preparation.mjs:106](../followed-preparation.mjs#L106) stores encounteredAt; later feed refresh overwrites source to followed | Do not call every encounter confirmed playback |
| Tester feature eligibility | Pass for both existing testers | pilot membership/expiry [intelligence-test-mode.mjs:37](../intelligence-test-mode.mjs#L37); feature audience [admin-service.mjs:283](../admin-service.mjs#L283) | No renewal, new enrolment or public enablement needed now |
| Automatic processing dispatch | Refused for all 7 current records | [followed-preparation.mjs:148](../followed-preparation.mjs#L148): !processing.allowed → REVIEW_REQUIRED, one-hour retry, no pipeline.request | Establish a valid scoped basis; separate ad-only preparation from general preparation |
| Ad Skip inspection | Refused before source acquisition | [skip-service.mjs:175](../skip-service.mjs#L175) evaluates both ad-detection and intelligence-processing; first denied decision returns at 176 | Current classifications/permissions produce LEGAL_BASIS_NOT_ESTABLISHED |
| Source / transcript acquisition | Not run for these adverts | [skip-service.mjs:148](../skip-service.mjs#L148) also returns when !value?.transcript?.segments?.length, even if all rights checks are synthetically allowed | Admit metadata-only episodes to a bounded, independently authorised ad-source job |
| Advertisement classification | Not run, not zero candidates | needsAnalysis requires transcript segments at [skip-service.mjs:183](../skip-service.mjs#L183) | Acquire real source-aligned speech evidence first |
| Candidate generation | No analysis/interval records | candidate creation at [skip-service.mjs:206](../skip-service.mjs#L206) is unreachable here | Do not change thresholds without actual detector input |
| Boundary verification | Not queued/attempted | [skip-service.mjs:276](../skip-service.mjs#L276) requires eligible candidates; [server.mjs:456](../server.mjs#L456) requires detection + general processing + transcription permission | Reuse authorised exact audio when available; require only permissions needed for the actual operation |
| Audio identity | No server verification hash; no delivered variant | [ad-skip-verification.mjs:161](../ad-skip-verification.mjs#L161) requires exact transcript/audio hash; whole content compared at 166 | RSS/enclosure URL hash is not audio identity |
| Skip authorisation/status | Local replay of live records gives DISPLAY_NOT_AUTHORISED, zero active intervals, null variant for all 7 | [skip-service.mjs:366](../skip-service.mjs#L366) requires general intelligence-display plus automatic-skipping; [skip-service.mjs:384](../skip-service.mjs#L384) chooses display error before other diagnostic codes | Fix scoped eligibility and underlying preparation; changing the message alone cannot enable skipping |
| Native receives usable interval | No persisted interval exists; a successful delivery cannot be established | server response at [server.mjs:1756](../server.mjs#L1756); native proof returns null without variant at [native/src/verifiedAudio.ts:55](../native/src/verifiedAudio.ts#L55) | Need a verified playable source; no captured iPhone status response exists |
| Playback enters advert | Not established | only latest listening clock and one old missed report available | Actual ad times on these representations have not been measured |
| Automatic seek | No target receipts or leases | [native/src/AdSkipRuntime.tsx:59](../native/src/AdSkipRuntime.tsx#L59) returns without fingerprint/automaticSkipping; actual lease requires active interval at [skip-service.mjs:401](../skip-service.mjs#L401) | Reach upstream gates first; native failure is not proved |
| Seek confirmation / continuing playback | No applicable receipt | native completion path [native/src/AdSkipRuntime.tsx:91](../native/src/AdSkipRuntime.tsx#L91) never evidenced for these episodes | Physical-device acceptance still needed after preparation |
| Undo | No applicable successful skip/Undo | [native/src/AdSkipRuntime.tsx:97](../native/src/AdSkipRuntime.tsx#L97) attaches Undo after confirmed seek | Existing LUP/Chromium success does not prove these podcasts or this iPhone |

The same seven records were replayed **locally** through the unmodified production evaluator and SkipService. No production /skips/status request was used: that ostensibly diagnostic route calls inspect and can schedule work or write playback state. Counterfactual all-allowed tests used isolated memory stores and mocked providers only.

## Rights, operational policy and unwanted coupling

Global optional rights mode is already **OFF**, version 2. Both current podcast policies resolve to operational **ZERO / OPEN**, with no HIGH/PAUSED override. All current seven resolved records have no takedown, no dispute, no explicit reservation, no approval expiry, and no reserved feature list. Current RSS evidence contains no recognised machine-readable licence or processing-specific reservation. These observations are evidence about this application's inputs, not a legal opinion or permission grant.

**Danny Jones:** latest episodes inherit the channel record `5722726d8eaf857cdba3376a132b4262c7d930d718495a97fb76563635bb9c38`. The older “i said yes” approval remains in history, but a 22 October technical correction records no supporting basis and sets processing, transcription, advert detection and display permissions false. The optional channel override only enables three product flags; it cannot change those permissions. There is no valid affirmative episode override for the latest three. Record selection: [rights-registry.mjs:428](../rights-registry.mjs#L428).

**Joe Rogan:** each current episode has a publisher-rss-v4 record. The generic copyright notice is correctly recorded as a notice; rightsReserved is false. The evaluator returns the missing-basis code at [rights-registry.mjs:482](../rights-registry.mjs#L482) because classification is RESTRICTED. The automatic assessor at [rights-assessment.mjs:186](../rights-assessment.mjs#L186) sets false permissions when it lacks a recognised licence/deployment-approved basis. No general legal/TDM reasoning engine actually adjudicates an exception here: the TDM_REVIEW entry records that it was not asserted. Do not portray that as a new publisher prohibition.

An **out-of-window JRE #2568** still has an older publisher-rss-v1 PUBLISHER_RESTRICTION based on a generic copyright notice. The existing narrow correction at [rights-registry.mjs:671](../rights-registry.mjs#L671) can reassess that on a future encounter; it is not the blocker for the six latest episodes. It was not changed during this audit.

Ad detection does not wait for Brief/Chapters/Search to finish, but it is still **coupled to their general source/permission pathway**: inspect needs intelligence-processing; canVerifyAudio always requires audio-transcription even if it would only reuse already authorised audio; playback requires intelligence-display. The existing permission map also combines canDetectAdvertisements and canDisplayDerivedIntelligence for automatic-skipping ([rights-registry.mjs:61](../rights-registry.mjs#L61)). A scoped ad-only assessment cannot currently avoid all general gates. Refactor these existing checks around required activities rather than adding another rights framework; preserve mandatory restrictions and distinct captions/dubbing/voice permissions.

## Duration, cache order, budgets and four-hour capability

- Standard **7,200-second** maximum is a financial/administrative policy, not an MP3 or chapter-engine technical limit. Every examined episode exceeds it by RSS metadata; all are below four hours. The pipeline checks it before downloading new audio at [episode-pipeline.mjs:1037](../episode-pipeline.mjs#L1037).
- Canonical/publisher/matching-audio transcript reuse correctly precedes that cap: [episode-pipeline.mjs:934](../episode-pipeline.mjs#L934), 968 and 990. Existing authorised long transcripts can still be analysed. None exists here.
- The separate **180-second opening** helper passes the whole source through prepareAudio(maxEpisodeSeconds), then repeats the whole-duration check **before** cross-episode source cache lookup ([ad-skip-source.mjs:27](../ad-skip-source.mjs#L27)–33). Its window is bounded for billed transcription, **not for acquisition**. A synthetic 10,355-second source caused one audio-factory call, zero cache reads and zero provider calls, then the exact “Exact source exceeds processing limits or has no hash” refusal. prepareAudio also checks duration at [transcription.mjs:114](../transcription.mjs#L114) after downloading the full file.
- Danny files exceed the existing **300,000,000-byte** limiter ([safe-network.mjs:118](../safe-network.mjs#L118)). Opening recovery or independent verification still downloads through that path, so raising only the duration cap would not fix Danny. The live normal path currently fails earlier and did not waste those downloads.
- No saved target checkpoints exist. Four-hour mock transcription/analysis with SIGTERM and fresh-process resume **passed** without repeated completed provider work. This establishes code capability, not successful real-world four-hour analysis.
- Accelerated testing allowance expired **27 October 2026 21:53:27.023 UTC**. The independent Ad Skip pilot remains active. Restoring the pilot does not enable the four-hour paid allowance. Nothing was renewed.
- Current usage **$0.49785892/day, $2.31619266/month, 4,575 audio seconds/day**, no reservations. Limits stay **$5/$25, 10,800 seconds/day, 7,200 seconds/source**. There is budget headroom, but only **6,225 transcription seconds** remain today—less than any full target episode. No global budget-exhaustion record caused these refusals.
- A proposed 180-second source window costs **$0.018** at the repository's current accounting rate; two episodes **$0.036**, six **$0.108** for transcription alone. These are planning amounts, not charges or an approval to bypass source policy. Existing daily/monthly reservations, time budgets and retries must remain atomic and enforced.

## Bounded audio and variant findings

All seven enclosures are reachable as **audio/mpeg**, HTTP **206**, with valid range lengths from both the Mac network and the dedicated AWS host. Danny chains use five redirects; JRE uses one, within the current limit. Header probes identify **MP3, 44.1 kHz; Danny 320 kb/s, JRE 112 kb/s**. Embedded JPEG artwork is not a second audio source. Full media duration was **not independently measured**: bounded ffprobe yielded no duration. The two-hour pipeline refusal specifically uses the verified current RSS duration; no full multi-hour download was needed to prove that conditional.

| Episode | Mac delivered length (bytes) | AWS delivered length (bytes) | First 64KiB cross-network | Range / validator test |
| --- | ---: | ---: | --- | --- |
| #443 - Ex-Banker Exposes Who Trump, Elon & Netanyahu Actually Work For | 467,974,266 | 463,614,954 | different | 206 / no ETag / wrong If-Match → 206 |
| #442 - "It Wasn't Russia" 27-Year CIA Agent Drops DNC Hack Bombshell | 431,744,805 | 425,205,837 | different | 206 / no ETag / wrong If-Match → 206 |
| #441 - DARPA Insider: Steve Jobs CIA Deal, Stargate Argentina & Facebook Weapon | 393,593,542 | 393,593,542 | same | 206 / no ETag / wrong If-Match → 206 |
| #2571 - Jimmy Carr | 143,351,863 | 143,872,640 | different | 206 / no ETag / wrong If-Match → 206 |
| #2570 - Mystery Boys | 137,557,759 | 138,499,472 | same | 206 / no ETag / wrong If-Match → 206 |
| JRE MMA Show #187 with Robert Whittaker | 141,952,755 | 142,473,532 | same | 206 / no ETag / wrong If-Match → 206 |
| #2569 - Bill Thompson | 140,377,785 | 140,898,562 | same | 206 / no ETag / wrong If-Match → 206 |

Two repeated Mac prefix requests matched for each episode. However, **five of the six current episodes** returned different total lengths from Mac versus AWS; three also differed in the sampled prefix, including bytes after ID3. Additional #2569 differed in total length too. Danny #441 matched length and prefix in this sample. Thus different representations are **observed**, not assumed. The specific inserted adverts or changed timestamps are **not known** without analysing the actual audio, and matching prefixes do not prove matching whole episodes.

Final redirects contain session/key/timetoken query parameters and several Megaphone delivery hosts. Tokens were not published. Prefix SHA-256 values are labelled as **sample hashes**, never full-audio fingerprints. No existing verified interval exists to compare against a phone variant, so “a stale interval mismatch caused the reported failure” is **not established**.

The CDN tests matter even after detection is fixed: no strong ETag is supplied, and a deliberately wrong If-Match still returns 206 rather than 412. The native validator rejects missing ETags at [native/src/verifiedAudioRanges.mjs:5](../native/src/verifiedAudioRanges.mjs#L5) and ignored preconditions at 19–20. All targets exceed the **32 MiB** exact-file fallback at [native/src/verifiedAudio.ts:66](../native/src/verifiedAudio.ts#L66). Consequently the currently sampled publisher streams cannot become a verified native playback source through either existing route. Never fix this by removing identity checks or declaring a URL hash to be a fingerprint.

## Pilot and native evidence

Pilot version **2**, explicit expiry **29 October 2026 14:11:12.730 UTC**, both enrolled testers active/unrevoked. TestFlight installation is enrolled until **14 November**, preferences adSkipEnabled=true and advert=true. Ad Skip flag is PRIVATE_BETA, 100% of its eligible audience, version 5. Unmodified local policy replay returns ROLLOUT_ELIGIBLE and adSkipAllowed=true for both testers. Preparation is enabled. Public automatic skipping stays off. No target lease exists; lease expiry therefore did not cause these misses. No kill-switch or pilot renewal is required at this audit time.

Recent encounters: Danny #441 at 20:45:11.863 and #443 at 20:45:15.289 on 28 October; JRE #2571 at 20:45:17.614. The latest authenticated TestFlight listener clock records **#2571 at 7,089 ms, paused, speed 1, 20:45:27.164 UTC**. This is client-reported position, not proof of audible playback or an ad boundary. Danny #441 also has a historical missed-advert report at 1,858 ms, 19 October; it is listener feedback, not an independently verified advert annotation.

There are no target skip attempts, authorisations, successful seek confirmations or Undo receipts. Detailed native capture is opt-in and memory-only ([native/src/nativeDiagnostics.mjs:1](../native/src/nativeDiagnostics.mjs#L1)); listening-event/session records deliberately do not preserve a full per-episode history ([listener-service.mjs:353](../listener-service.mjs#L353)). Installed build identity and the actual iPhone response/audio URL cannot be reconstructed from these records. They remain unknown, not a proved iPhone seek defect. Chromium evidence from LUP is excluded.

A separate predictable first-play limitation exists: [native/src/PlaybackProvider.tsx:258](../native/src/PlaybackProvider.tsx#L258) applies only an already cached verified source. At 297 proof starts asynchronously **after** playback, and does not update the active fingerprint/replace active audio. Runtime polling cannot make that cold source skip by itself ([native/src/AdSkipRuntime.tsx:59](../native/src/AdSkipRuntime.tsx#L59)). Prewarm before a deliberate source load for controlled acceptance; a reliable first-listen design needs same-source proof attached safely to that playback session, not a hot swap to different audio.

## Quantified impact without double-counting

| Measure | Current six | Additional #2569 | Interpretation |
| --- | ---: | ---: | --- |
| Episodes investigated with live metadata/audio | 6 | 1 | Separate denominators |
| Usable cached/publisher transcripts found | 0 | 0 | RSS references and backend caches checked |
| Accessible bounded audio | 6 | 1 | Both Mac and AWS |
| Actually analysed for adverts | 0 | 0 | No skip-analysis/source record |
| Detected candidate count | N/A | N/A | Analysis never ran; stored intervals 0 |
| Audio-verified intervals / eligible automatic skips | 0 / 0 | 0 / 0 | Current state |
| First blocked by processing eligibility | 6 | 1 | Mutually exclusive first-blocker count |
| Secondary full-source duration barrier | 6 | 1 | Not an additional seven failures |
| Secondary 300MB source-download barrier | 3 | 0 | Danny only |
| Secondary native stream-proof/fallback barrier | 6 | 1 | Missing validators, If-Match ignored, >32MiB |
| Different representation observed across networks | 5 | 1 | Not proof of changed advert content |
| Confirmed recorded audio-mismatch refusals | 0 | 0 | Verification never ran; phone identity unknown |
| Blocked by active pilot/preference/rollout now | 0 | 0 | All current gates pass for enrolled tester |
| Confirmed native execution failure | 0 | 0 | Execution never evidenced; not a device pass |
| Target paid checkpoints reusable | 0 | 0 | No existing work to resume |

## Smallest recovery, ranked

Effort is an engineering estimate for implementation plus targeted validation, not a delivery promise. None of these changes was made in this audit.

| Rank | Specific correction | Potential reach / confidence | Estimated effort | Cost / safety |
| --- | --- | --- | --- | --- |
| 1 | Record a genuinely supported **scoped** internal ad-transcription/analysis/detection and skip-output basis through the existing registry. Resolve Danny's channel correction and JRE episode coverage; do not merely change OFF/ZERO or mark old approval QUEUED. | First gate for 6/6 (7/7 with extra); high technical confidence, evidence availability unknown | Existing UI/configuration once supporting evidence exists; external assessment time unknown | No AI cost; never invent permission or reinterpret ordinary admin approval as a licence |
| 2 | Make SkipService.scheduleSource accept resolved episode metadata when no transcript exists; invoke this existing path from eligible encounters/follows before the general-intelligence dispatch gate. Evaluate only activity-relevant permissions; reuse authorised ad/source cache first. | Removes proven source deadlock for 7/7; high | 0.5–1 engineering day plus tests | Keep provider deduplication, two-attempt limit, rights rechecks and reservations; no manual advert approval requirement |
| 3 | Replace full-source prepareAudio in opening recovery with a real byte/time-bounded acquisition adapter, exact window-to-source mapping and a separately approved 180-second ad-analysis scope. Check reusable source/windows before acquisition. Keep full-transcription 2h limit unchanged. | Removes duration coupling for 7/7 and 300MB acquisition issue for Danny; high diagnosis, implementation needs CDN fixtures | 1–2 days | Estimated $0.018/window, within unchanged ledgers; a 3-minute window cannot promise mid-roll coverage |
| 4 | Provide one provably identical playback representation. Prefer a provider immutable/conditional source; otherwise use the **existing private verified-source delivery mechanism only where source retention/delivery is authorised**, with bounded storage/retention. Keep source/hash/witness checks. | Required for all observed 7 streams; high | 0.5–2 days if immutable authorised source exists; native same-byte buffering otherwise larger and unestimated | Cannot safely solve by dropping If-Match or silently raising native/backend file caps; mirror/storage rights and exact variant remain prerequisites |
| 5 | Prewarm that verified source before deliberate source selection for the initial pilot demonstration. For first-listen automation, attach proof only to the same active audio with source/revision guards; retain immediate ordinary playback. | All cold first loads; high code evidence, physical behaviour unverified | 0.5–1 day plus iPhone acceptance | No new player; preserve manual seek, speed, expiry, Undo and source-change guards |
| 6 | Persist a small bounded diagnostic refusal event even without skip-analysis; preserve distinct encounter source/time. Keep optional complaint review and automatic audio qualification. | Makes 7/7 blocked paths visible; high | 0.25–0.5 day | No full listening history, URLs with tokens or transcript text |

Cache reuse is first in every recovery path, but **there is nothing to reuse for these seven today**. Four-hour full transcription is not the fastest fix: it requires explicit allowance policy, would exceed today's remaining transcription time for one target, does not solve Danny's file-size limit or native source pinning, and adds roughly $1.00–$1.18 per selected full episode before analysis. Do not renew the old expanded dollar/time limits just to obtain a larger source cap.

## Fastest safe demonstration on both shows

Select one current Danny episode and one current JRE episode **after** establishing the scoped processing basis and an accessible exact playback representation. Danny #441 is a practical initial network-consistency candidate because its sampled prefix/length matched both locations; that is not proof that it contains an advert. Find the real complete advert in bounded source-aligned audio, using the existing detector and acoustic rules; no owner pre-review is required for machine-qualified intervals. If no complete advert is found in the opening, expand only an explicitly budgeted additional window—do not fabricate a boundary or claim the whole episode was analysed.

After ranks 1–4, prewarm and deliberately load the verified source with the existing enrolled tester while the explicit pilot is still active. Confirm actual iPhone interval delivery, entry, one automatic seek, destination, continued playback and exact Undo. If the pilot has expired by then, an explicit later renewal is required; this audit did not renew it. Store device evidence separately from desktop tests. This can use short internal transcription **without producing the full transcript, Brief, Chapters or Search**, but the current implementation cannot do so for these episodes without the source scheduling/acquisition and permission decoupling above.

## Verification and remaining unknowns

Passed: seven live-record local replays; permission-only counterfactual showing zero source jobs; long-source bounded-window rejection before cache lookup; native missing/ignored validator reproductions; duration-safe transcript/cache/rights/budget tests; four-hour mocked checkpoint/restart tests; opening detection/editorial negatives/acoustic/pilot regressions. All provider calls mocked. No broad detector accuracy claim results from these tests.

Report validation: both audit artifacts parse/validate, all 38 source links resolve, and neither new file has trailing whitespace or detected credential patterns. Repository-wide `git diff --check` reports pre-existing trailing whitespace at lines 63–65 of the unrelated edited `docs/AI_ACTIVATION_FINAL_ACCEPTANCE.md`; that file was preserved unchanged by this audit.

Unknown: actual advert boundaries/content on Danny/JRE variants; full-audio SHA-256; actual iPhone delivered bytes/installed build/status response; complete per-episode listen history; authoritative processing/delivery basis outside recorded/RSS evidence; future per-listener CDN behaviour. Prefix equality is not complete audio equality. No production failure was inferred solely from absent telemetry.

**Verdict:** current refusal is established, and the additional technical deadlocks are proved independently. Neither changing the pilot nor toggling an admin policy alone will make either podcast skip. Repair the existing ad-only acquisition path and exact-source delivery, preserve scoped permissions and budgets, then measure the two real iPhone skips. This audit makes no deployment or success claim.
