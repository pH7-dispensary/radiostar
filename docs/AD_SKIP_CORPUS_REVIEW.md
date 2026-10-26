# Hash-bound Ad Skip corpus and review workflow

2026-10-26 · local evaluation, not production skip authorisation.

Phase 2 update: detector v10 and the richer existing workbench are now verified;
backend diagnostics are deployed. The corpus still has 20 provisional candidates
and no independent human labels. The workbench adds five priority buttons,
waveforms, bounded transcript context, keyboard controls and corrections. Cached
PCM clips are hash-checked and reused. See `PRODUCT_ACTIVATION_PHASE_2.md` for
current deployment, measurements and the precise outstanding review tasks.

## Delivered and measured

- **12 real episodes, 13.1121 hours, 748,368,148 audio bytes**, all SHA-256 checked. Ten LINUX Unplugged episodes across 2025–2026, Linux Action News 164 and 299. This initial cohort is limited to one publisher; it is not representative platform-wide evidence.
- Publisher permission evidence: [Jupiter Broadcasting licence notice](https://www.jupiterbroadcasting.com/contact/), CC BY-SA 4.0. Original titles, links, attribution and licence are retained, along with a hash of the retrieved notice. Audio is private local evaluation material; no production rights record is fabricated or changed.
- Ten RSS publisher VTT transcripts reused. The existing AWS LAN 164 transcript was copied read-only and reused only after its audio hash matched. LAN 299 has no acquired transcript; its zero candidates do **not** establish no adverts. No paid transcription, model calls, budget increases or pilot membership changes.
- **20 preliminary candidates** from the existing `SkipService`, detector v9. Publisher transcript/audio alignment remains unverified, especially for ad-insertion delivery. These are not independent labels or automatic-skip permissions.
- Five decoded PCM review clips include source offset, source SHA-256, excerpt SHA-256 and attribution. Their ranges are review windows, not asserted advert boundaries.
- Real browser playback/seek and 250-ms controls verified at desktop 1280×900 and mobile 390×844; no page errors or horizontal overflow. Test created zero real human annotations. See `evals/ad-skip-corpus-browser.json`.
- Controlled owned-fixture end-to-end automatic seek and duplicate Undo passed against the real isolated backend and Chromium media engine: one Undo seek, original position restored, pause and 1.5x retained. See `evals/recovery-batch6-playback.json`. This is not iPhone or real-advert accuracy evidence.

**Accuracy currently UNMEASURED:** zero independently reviewed episodes. Recall, precision, boundary error, false-positive duration and complete-break coverage remain null. No false claim of a completed labelled corpus is made. Dynamic-insert, host-read, product-discussion and no-advert classifications require the human review below.

## Use the review workbench

From the repository run `npm run corpus:review`. Open the one-time local access link printed by the command. It exchanges access for an eight-hour HttpOnly, SameSite session. The workbench binds only to `127.0.0.1:4318`; it is not published to AWS or the public internet.

1. Enter your reviewer name and choose an episode. Use the proposed review windows as leads, not answers.
2. Listen to the actual audio, mark both boundaries with current-position buttons, adjust in seconds or 250-ms steps, and preview the range with context. Move outside a proposed window whenever needed to capture the **complete** break.
3. Classify advertisement (format separately), ordinary product discussion or uncertain. Record what establishes the decision. Save only after independently listening. Incorrect labels can be removed and replaced; the history remains append-only and hash-chained.
4. Add missed adverts anywhere in the episode. Only after listening to the **entire** episode and resolving uncertain/overlapping ranges mark its full review complete. A no-advert label requires a complete listen, not absence of detections.
5. Rerun `node scripts/export-ad-skip-corpus.mjs` to regenerate results. Only completely reviewed episodes enter recall/complete-break metrics. Candidate-only reviews are excluded from that denominator. Non-advert predicted duration reveals overreach even when a large candidate overlaps a true advert.

Audio, publisher VTT, cached transcript and human reviews are in `~/Library/Application Support/RadioStar/AdSkipEvaluation` on this Mac. This avoids iCloud evicting large files from Documents (one early copy became unreadable; the replacement was redownloaded and its existing hash verified). The original ignored working copies remain untouched. `RADIOSTAR_CORPUS_DIR` overrides this location. The repository contains reproducible sources, hashes, windows, metrics and tools; it does not contain full audio or full transcripts.

The server rehashes all audio before serving, refuses changed files, supports bounded byte-range playback, checks Host/Origin/CSRF, validates timestamps and hash/version identity, serialises concurrent edits and verifies the review audit chain. A chain detects accidental/ordinary tampering; it is not externally anchored against a machine owner rewriting the entire ledger. Labels never mutate the production verifier, rights registry, budgets or pilot gates.

## Specific human review queue

| Episode / global review window | Required decision |
| --- | --- |
| LAN 164 · **08:40–12:30** | Locate the complete Linode sponsorship; determine how much the existing short fragment misses. Exact audio SHA starts `d6faaeb5e1366f04`. |
| LINUX Unplugged 610 · **32:19–34:40** | Check ConfigCat host-read start/end and whether the two candidate spans form one complete break. |
| LINUX Unplugged 675 · **44:49–47:20** | Check promotional-code context and full boundaries; distinguish sponsor speech from product discussion. |
| LINUX Unplugged 690 · **00:00–02:00** | Check possible insertion/alignment differences between delivered audio and publisher transcript. No detected candidates is inconclusive. |
| LAN 299 · **00:00–02:00**, then the full **13:13.469** | Negative-control review. Only a full listen can establish a no-advert episode. |

Remaining work: review all 12 full episodes (13.11 source hours; playback speed is available), record every full break and relevant product discussion, correct transcript alignment where needed, then measure the complete corpus. Seek/Undo safety stays independently gated. Additional publishers/genres and language cohorts are needed before platform-wide claims; this corpus cannot establish that breadth.

## Engine changes and regression evidence

Detector v9 suppresses personal “pay me a visit” remarks and explicit negative directions as standalone commercial calls to action. Actual corpus examples exposed those noisy candidates. Sponsor declarations and offers still produce candidates, and independent acoustic gates remain required. This is a candidate-quality change, not a claim of measured real-world precision improvement.

Tests cover audio hash mismatch, bounds, human attestations, incomplete-review exclusion, fragment vs complete break, oversized predictions, audit corruption, authentication, CSRF, concurrent version conflicts, range requests and changed-file refusal. Existing full regression suite passes. Candidate windows are sorted chronologically before grouping so later-added composite candidates cannot swallow earlier review windows.

No TestFlight build/upload, public automatic skip activation, public Translate activation or production rights changes. Corpus labels cannot enable any of those. The native sleep work and device limitations are recorded separately in `docs/RECOVERY_BATCH_7.md`.

Historical corpus-preparation checks: AWS account 208096650030 / eu-west-2 verified; HTTPS health returned backend ready; SQLite integrity `ok`; 18 canonical transcript records retained. At that time AI usage was 121 entries / $1.5886908, zero reservations, and v9 was local only. Phase 1 subsequently added a real transcription; Phase 2 deployed v10. Current ledger and release evidence are in the Phase 2 report above.
