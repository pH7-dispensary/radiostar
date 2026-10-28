# Ad Skip generalisation — Phase 2

Verified 2026-10-28. Repository `pH7-dispensary/radiostar`, branch `work`.
Implementation commit: `8318944`. Evidence is committed with this report.

## Outcome and operating policy

**IMPLEMENTED / PRODUCTION VERIFIED:** routine private-pilot approval is automatic after commercial evidence, source binding and acoustic verification. The owner's latest instruction supersedes the earlier request for pre-approval of every clip. No owner review is required to run the pipeline. Uncertain intervals remain unskipped automatically. The workbench is optional for complaints and evaluation. Machine approval never creates an independent human annotation.

**PRODUCTION VERIFIED:** LINUX Unplugged 690's unchanged independently reviewed interval was delivered through authenticated AWS leases and actually skipped, with Undo. LINUX Unplugged 635 then passed the same live path with **machine approval only**, no human annotation. Public automatic skipping remains disabled. No native player replacement or TestFlight build was made.

**PARTIALLY VERIFIED:** the corpus contains 12 exact audio variants but only one independently reviewed interval and no fully reviewed episodes. Broad real-world precision, recall and false-positive rate remain unavailable. Ad Skip on a physical iPhone was not verified during this task.

## Prompt 1 inheritance and root cause

The initial detector returned **zero advert candidates**, plus one preview candidate, for LINUX Unplugged 690. The publisher VTT starts the programme welcome at about 11.413 seconds and omits the dynamically inserted opening sponsor message. The actual cached MP3 contains the advert first and the programme welcome at about 102 seconds. Publisher transcript timestamps therefore cannot safely be applied to these bytes.

The acquisition fix keeps the canonical publisher transcript and adds private source-hashed opening ASR. The old commercial join stopped at its first call to action, about 76.8 seconds, losing the advert tail. Complete-break proposals now recognise a commercial closing followed by the first programme welcome or editorial cold open. File start zero is a valid boundary; the ending still needs measured acoustic evidence. No episode names, IDs, timestamps or source hashes are hardcoded in production detection.

Original full MP3 SHA-256: `693acd1c1ae733801013ca37bc937501e1e0e73d630daaf5620b36b7f1c4117c`.
Review WAV SHA-256: `999e15bcfe8d07b73c6a12f91162d81a3922ade0869620568454064ca9e17287`.
The prompt's expected hash refers to the MP3, not the cropped WAV.
Original annotation: `55b1e3df3122d680080ab895b42da671197f23fcd1595ab847945a90738f1c4a`.
Original audit-chain head: `0d677b90e4d7605af567b10ef5583f2935542bb460ca1574f65bcf5d645e5c39`.
The human annotation remains **0–90,415 ms**, unchanged. The review file SHA-256 remains `d739a26bdc398d718a88630f7b27cd3d042d12f3635f3b29e98d2da9125ff7f9`.

| LUP 690 observation | Start | End | End error against human label | Coverage |
| --- | ---: | ---: | ---: | --- |
| Original publisher-transcript detector | — | — | — | Missed advert |
| Source-ASR initial complete proposal (120-second run) | 0 | 89,900 | −515 ms | 99.4304% of labelled interval |
| Human label plus actual acoustic verification, deployed | 0 | 90,415 | 0 ms | 100%, n=1 interval |
| Automatic-only verification (180-second corpus run) | 0 | 90,459 | +44 ms | 100% labelled span; 44 ms extra measured silence |

All detected starts above have zero start error. The measured end pause is 89,893–91,024 ms, before editorial speech. The extra 44 ms is within this pause, not an inferred extension into speech. These are **one-interval** results, not a corpus-wide accuracy rate.

## Generalisation and exact-source corpus

All 12 existing MP3 hashes were recomputed; no duplicate audio was downloaded for the corpus. Opening windows total 36 minutes of free local `faster-whisper/base.en` ASR. Three additional source-bound windows cover LAN 164 (8:40–12:30), LUP 610 (32:19–34:40), and LUP 675 (44:49–47:20). Local ASR is machine evidence, never independent ground truth.

Baseline: 20 advert candidates from the previous records. Opening analysis: 49 overlapping cue/proposal candidates, **10 complete-opening proposals, five automatically audio-verified complete openings**. These counts are not counts of distinct confirmed adverts. The three additional windows produced four candidate spans, without human boundary labels.

| Source | Exact SHA-256 | Complete opening result |
| --- | --- | --- |
| lup-690 | 693acd1c1ae733801013ca37bc937501e1e0e73d630daaf5620b36b7f1c4117c | 90459 ms / VERIFIED |
| lup-684 | faaab582ade5d5cde3017212b7ff768bd2fb79fe156af693c74b8e047aa40137 | 71440 ms / CANDIDATE |
| lup-675 | c27198be1781a1f7842277f55ac96782da5642070624f7fa606bbb8bad7f51ae | 90476 ms / VERIFIED |
| lup-665 | e9ce50054554c70547471c9f8964f251444a3ea6fe3af2d99fe8d8bded9dc953 | 60000 ms / VARIANT_MATCHED |
| lup-650 | 877ed4bada979df6b057552d0d761285575c14703889167cb90147844b74eede | 90459 ms / VERIFIED |
| lup-635 | c10cb5417527eed40d71200aaa3b31777d7dca3f96864a7a45919de426fa0b27 | 90583 ms / VERIFIED |
| lup-620 | 1bf4a36754fe4a0e5b1bfaf8f540f4c978dd06198815edb89cba2a0ff3e64beb | 60137 ms / VERIFIED |
| lup-610 | b071963ec9a4217cd816c6e06164e528747cf28f97afd9f62c8564bae9fb6ee8 | 60100 ms / CANDIDATE |
| lup-600 | 88c172e62dcebfb2b8acb2070674aa4566aacd1cd6085b628044950b89b586ed | 60080 ms / CANDIDATE |
| lup-598 | 46aecdecd2a27b2682d66256233d95239e857541045f492036357e8f736ea690 | 91200 ms / CANDIDATE |
| lan-299 | 29307bb828f38df6446e93cfa0a908d80574a5c6c56e7df2212cd9fc9a37fbe9 | No complete opening proposal |
| lan-164 | d6faaeb5e1366f04a72507f140eb417e008389ad589e48001ca852454769bcd4 | No complete opening proposal |

The automatically verified openings are 690, 675, 650, 635 and 620. They include repeated sponsor creatives and are not five independent advertising styles. Both LAN opening windows yield no complete opening proposal; this does not certify the whole episodes ad-free. The corpus covers two shows from one publisher, not the global catalogue.

The complete detector requires sponsor declaration, commercial offer, closing action/address and an explicit editorial transition. Automatic approval adds measured acoustic boundaries and exact-byte identity. Wider mid/post-roll proposals can qualify through the same commercial-closing rules; vague sponsorship discussion, endorsements without a commercial offer, ordinary introductions and non-commercial calls to action remain insufficient. Adjacent qualified commercial spans retain all source IDs. Shorter contained call-to-action fragments cannot supersede a qualified complete break.

A real corpus error was caught before activation: LUP 610's initial proposal swallowed a voicemail comedy segment while waiting for the programme welcome. The general editorial cold-open guard now stops the proposal at 60,100 ms rather than 110,600 ms. Its coarse transition lacks sufficient automatic boundary evidence, so it remains unskipped without needing owner action. Synthetic negatives cover product discussion, guest recommendations, sponsor discussion, explicit sponsorship denial and non-commercial directions. **No corpus false-positive rate is claimed** without full independent labels.

## Automatic workflow and complaint handling

`encounter/follow preparation → canonical cache → exact-source sidecar if needed → commercial candidates → acoustic verification → stored interval → authenticated private-pilot lease → confirmed seek → optional Undo`.

Source acquisition uses the existing authorised transcription provider and atomic budget ledger, serial queue, deduplication, persisted attempts (maximum two), cache reuse, and before/after rights checks. It is bounded to an opening of at most 180 seconds and still enforces the **full source's two-hour maximum**. It does not require AI Brief completion. Unknown paid outcomes are not blindly retried. This is opening recovery, not automatic full-catalogue or full-episode transcription.

Automatic opening verification uses source-bound commercial evidence and a measured silent pause, without trimming final ad speech or crossing the editorial transition. Human-reviewed boundaries remain usable when actually present. All permissions, disputes, takedowns, source changes, tester membership, listener preferences and leases remain enforced. Approval provenance is exposed to authenticated operations as `AUTOMATED_AUDIO_VERIFICATION` or `HUMAN_REVIEW_PLUS_AUDIO`.

A listener's `skipped_conversation` report immediately disputes the interval; disputed/rejected overlaps veto future leases. Super Admin can suspend or reject through the existing protected, CSRF-checked and audited route. Automatic reprocessing cannot reinstate disputed evidence. Undo restores the exact pre-skip position, preserves speed/pause state and prevents duplicate immediate seeks.

Optional workbench: `http://127.0.0.1:4318/`. Fourteen clip contexts remain available for later complaints or quality review. No independent labels were written by the agent. There is **no owner-review task blocking operation**. The local workbench session expires; its corpus and audit persist on disk.

## Dynamic variants and real playback

A fresh download from LUP 690's current RSS URL had hash `36b7176fe20f931a22260592d0cc664318d510ed0353340f4785da5be1aef581` and a different opening sponsor (Namecheap, approximately one minute). The old 90.415-second cut was **not** applied. RSS URL identity was never treated as audio identity.

The existing private S3 bucket preserves the actual evaluated bytes. Each object was conditionally fetched and fully SHA-256 checked against the local original. Short-lived signed delivery URLs use the existing native `If-Match` and three range-witness checks, reading 196,608 bytes rather than redownloading the whole file. No public object policy or listener transcript distribution was added. Publisher attribution and CC BY-SA 4.0 evidence are retained; the publisher's [licence declaration](https://www.jupiterbroadcasting.com/contact/) was fetched and checked. Existing rights records were preserved; scoped processing evidence was added for the two acceptance episodes.

| Live AWS test | Approval | Actual seek destination | Undo restored | Evidence |
| --- | --- | ---: | ---: | --- |
| LUP 690 first real trial | Human + acoustic | 90,415 ms | 329.55 ms | `evals/ad-skip-p0-live-playback.json` |
| LUP 690 private S3 trial | Human + acoustic | 90416.26 ms | 27.291 ms | `evals/ad-skip-phase2-live-playback.json` |
| LUP 635 automatic-only trial | Machine + acoustic | 90583 ms | 20.045 ms | `evals/ad-skip-phase2-machine-live-playback.json` |

All three trials continued playback at 1.5×, preserved the paused state after Undo, rejected a mismatched hash and performed one Undo seek despite concurrent Undo requests. They use real publisher MP3 bytes, live AWS authorisation/receipts and the shared native execution adapter in Chromium. **DEVICE VERIFIED: no physical-iPhone Ad Skip claim.** Platform counters increased from three recorded automatic skips/three Undos to six/six; historical counters are not detection-quality metrics.

## Performance and cost

Desktop detector P95: 7.561 ms across 12 opening analyses; Node peak RSS: 118672 KiB. Actual local audio-verification durations are recorded per episode in the corpus evidence. These are not iPhone benchmarks.

The LUP 635 AWS verification reused source audio and took approximately 1,200 ms server-side. Its native range-proof helper took 806.498 ms; playback harness source preparation 243.700 ms; lease acquisition 877.800 ms; play promise 2.600 ms; confirmed seek 4.800 ms; Undo 2.500 ms. These are single observations. Optional preparation remains asynchronous; ordinary playback is not held for uncertain verification. The acceptance harness deliberately waits for proof before playing its controlled sample and is not a general startup benchmark.

Local corpus ASR and cached acceptance replay cost **$0 in provider calls**. The live automatic fallback separately transcribed one authorised 180-second Open Source Security opening for **$0.018**, recorded by the existing AWS-owned ledger. Final totals: **$0.22969024 day / $2.04802398 month / 2,133 transcription seconds today**, zero outstanding reservations. Limits remain **$5/day, $25/month, three transcription hours/day, two-hour source maximum**. The earlier accelerated paid allowance remains expired. Translate's separate ledger was not changed.

No new instances, databases, NAT gateways or monitoring services were created. Existing S3 stores about 151.7 MB of the two preserved MP3 variants; storage/requests add small metered charges. **Exact incremental AWS billed cost is not isolated or claimed as zero.**

## Validation and deployment

- **AUTOMATED TESTED:** full `npm test` passed after production changes; targeted opening/acoustic, private-pilot, recovery, corpus and shared native seek/Undo checks passed. Native TypeScript check passed; no native code changed in this task.
- Tests cover automatic approval without a human record; optional immutable human review; uncertain/no-silence boundaries; exact-source mismatch; editorial cold opens; full commercial breaks vs CTA fragments; complaint suspension; authentication/RBAC/CSRF; deduplicated acquisition; full-source duration cap; budget exhaustion; expiry; source changes; manual seek suppression; failed seek; playback speed; duplicate prevention; Undo; and bounded retry. Paid providers are mocked in the automated suite.
- **PRODUCTION VERIFIED:** STS account `208096650030`, region `eu-west-2`, dedicated StarCast instance. Final release `953d0554cbeb27110c6f18f15d1981035b941321157a2c1cfdeb3973343e0d6f`, deployed `2026-10-28T15:05:04.017Z`. Deployment command `0f7201c9-4e6d-4c61-a200-4be4f1f4867a` succeeded.
- HTTPS API, durable worker and SQS healthy; queue and DLQ empty. Authenticated ready-discovery still returned ten existing episodes with intelligence feature availability. SQLite integrity `ok`; 24,977,620,992 bytes available (about 23.26 GiB). Preflight SQLite backup verified. Previous source release retained for rollback. No pH7 resources modified.
- Operational monitoring honestly remains **DEGRADED** for one protected legacy deployment directory containing metadata outside the cleanup allowlist (three retained copies vs target two). It was preserved rather than deleted. API/worker/database/disk health are healthy. Application-side CloudWatch/S3 freshness probes remain `UNKNOWN`; this change does not claim those probes were implemented.
- Separately controlled Ad Skip pilot: two existing enrolled testers, expiry `2026-10-29T14:11:12.730Z`. Its expiry does not renew paid allowances. Public automatic skipping remains off. No TestFlight build.
- `git diff --check` passed for task changes. The unrelated edit to `docs/AI_ACTIVATION_FINAL_ACCEPTANCE.md` and unrelated untracked files remain untouched.

## Remaining limits

No mandatory human-review work is assigned to the owner. Future qualified intervals can be automatically approved; uncertain boundaries stay unskipped and complaints can be investigated later. Broad independent accuracy remains unmeasured; machine approval is not independent ground truth. Physical-iPhone Ad Skip acceptance, multilingual advert coverage, and broad cross-publisher/full-episode evaluation are not verified by this phase. The controlled pilot is time-limited, not a public launch. Existing paid budgets can legitimately pause preparation.
