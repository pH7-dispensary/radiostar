# Recovery Batch 2 — canonical catalogue and durable following

Date: 26 October 2026. Repository `pH7-dispensary/radiostar`, branch `work`.
Baseline: `d2708bb` and deployed release `6b9d2cecc527eec2154d3a8a709b27a6957277e4990eaee650c21328645feb33`.
Scope: RT05, RT06 and RT07. No Batch 3, TestFlight, new infrastructure, rights grants or budget increases.

## IMPLEMENTED

- **RSS/Atom:** bounded complete XML parsing with pinned `saxes@6.0.0`; 8 MB input, 150,000 nodes, 64 levels, no DTD/external entities. Validate before extraction, normalise, deduplicate, sort and only then select the catalogue window. Default and prefixed Atom feeds supported.
- **Selection:** newest 30 catalogue entries; existing latest-three scheduler sees the complete validated archive. Future entries are withheld; undated entries remain browsable after dated entries but cannot enter latest-three preparation. Duplicate GUIDs collapse deterministically; conflicting audio or rights evidence produces `IDENTITY_CONFLICT`, not a fabricated identifier.
- **URLs and failures:** decode XML enclosure attributes once, preserving signed query bytes. Invalid/non-public/non-audio enclosures are not playable. Valid empty feeds, malformed XML, publisher outages, invalid enclosures and identity conflicts have distinct results/diagnostics. Existing DNS pinning and per-hop SSRF checks remain enforced. Missing safe artwork uses existing native fallback artwork.
- **Canonical identity:** the backend's SHA-256 of `JSON.stringify([feedUrl, episodeId])` is unchanged. Feed aliases are additive records supported by validated permanent 301/308 redirect chains. An existing record-bearing feed remains the anchor. Conflicting existing record sets are retained for review; no title-based or global-GUID merges. Temporary/CDN redirects remain delivery locations, not proof of canonical identity.
- **Shared lookup:** canonical identities reach HTTP inputs, catalogue encounters, processing request deduplication, status, administrative lookup and latest-three preparation. Concurrent feed fetches share an in-flight request. Existing observed identities avoid a publisher network dependency on every heartbeat/status request.
- **Native identities:** saved episodes, history, playback positions, discovery ranking/deduplication and episode rows use feed-and-episode tuples. Show follows compare feed identity across catalogue providers. Unknown records retain scoped legacy identities; titles do not establish identity.
- **Durable following:** optimistic UI plus an app-private outbox, persistent operation versions, acknowledgements, restart recovery, foreground/15-second retry and a visible retry notice. Rapid toggles retain the latest intent. Stale acknowledgements cannot clear a newer operation. A newer authoritative server result is reconciled. Persist failures are surfaced.
- **Server ordering:** additive transactional follow-operation records retain unfollow tombstones. Duplicate requests do not repeat preparation; older or unversioned requests cannot reverse a versioned unfollow. Legacy clients remain supported until that installation/feed adopts ordered writes. Profile deletion also removes its operation records.
- **Large libraries:** refresh every followed show, three requests at a time with a pause between batches; refresh again on foreground and every ten active minutes. Successful batches become visible incrementally. Publisher failures preserve cached episodes, including podcast detail. No first-30-show ceiling.
- **Intelligence handoff:** confirmed new follows use the existing latest-three workflow, canonical job deduplication, cache, rights checks and spending ledger. The durable follow remains discoverable by the existing monitor if the immediate handoff is interrupted.

## Migration and rollback compatibility — VERIFIED locally

New listener and playback documents use `v2` keys. Original `v1` documents and GUID-keyed positions are preserved. Feed identity is recovered from followed-show metadata only where unambiguous. A legacy GUID position is copied only when one known feed identity matches; the separately scoped current-player snapshot can recover its own position. Ambiguous legacy positions remain in the original document rather than being assigned to a different podcast. Saved/history/moment records are retained. Alias persistence is serialised, and old composite positions can be resolved through an evidenced alias without merging conflicting positions.

For a feed already upgraded to versioned follow writes, an older binary’s unversioned changes are rejected rather than allowed to reverse a newer intent. The currently installed legacy binary remains compatible until that installation/feed adopts versioned writes. Rolling back to an older native binary reads the preserved v1 baseline; it does **not** see subsequent v2-only changes. Returning to the new binary restores its v2 data. Profile deletion removes both versions and the outbox/alias documents. Backend changes add record kinds and require no destructive schema migration or key rewrite.

## VERIFIED — automated and browser checks

- Full `npm test`, including its `posttest` release/security/native/rights/budget/queue suites: passed.
- Native TypeScript, Expo production web export and iOS JS/assets export: passed. The iOS export is **not** a signed build.
- `test-recovery-batch2.mjs`: ascending 31-item and descending feeds; duplicate/conflicting GUIDs; cross-podcast GUIDs; escaped signed enclosure queries; malformed/empty XML; prohibited DTD; missing/future dates; invalid enclosures; Atom namespaces; permanent/temporary aliases and conflicts; unchanged backend hash contract; saved/history and position migration; offline follow/unfollow; pending restart; rapid toggles; stale/local-newer and server-newer acknowledgements; tombstones; authenticated HTTP reconciliation; outage errors; canonical processing deduplication; 37-feed refresh with maximum concurrency three.
- Existing owned-fixture latest-three pipeline test passed with mocked transcription/analysis, multiple listeners, cache reuse, rights refusals, budgets and restart recovery. No paid provider is used by automated tests.
- `scripts/verify-recovery-batch2-native.mjs` exercised the real web export at 390 px: 35 followed feeds visited, an outage retained cached episodes, two saved records sharing a GUID remained separate, offline follow and unfollow each survived reload and reconciled exactly once. No browser errors or horizontal overflow. Screenshots inspected.
- Existing native player interaction harness passed at 320/375/390/430 px, including restored playback, processing states and interruption handling. Discovery harness passed at 320/390/430/1024 px with empty/error/reload states. These are browser checks, not physical iPhone audio verification.
- `git diff --check`: passed. No configured standalone lint task exists.

Local verification evidence is under ignored `.starcast/batch2-*`, with test/export logs under `/tmp/starcast-batch2-*`. No credentials, full transcripts or listener secrets are committed.

## VERIFIED — real publishers and live AWS

| Podcast | Newest episode returned | Catalogue entries | Observation |
|---|---|---:|---|
| Open Source Security | Dependency attacks in 2026 with James Matchett | 30 | Valid artwork/audio; 302 delivery redirect retains original feed identity |
| Lex Fridman Podcast | #502 — Psychiatry, Insane Asylums, Mental Illness, ECT, Lobotomies, Freud & Jung | 30 | Valid artwork/audio; newest three agree with complete publisher feed |
| Research Culture Uncovered | Episode 175 — Bear With Us | 30 | Valid artwork/audio; newest three agree with complete publisher feed |
| Dan Carlin's Hardcore History | Show 74 — Mania for Subjugation IV | 13 | Latest audio valid; no safe HTTPS artwork; eight historical enclosure diagnostics |

The live catalogue matched independently parsed complete publisher feeds for the newest three, with no duplicate IDs or XML-escaped enclosure query separators. Unauthenticated production catalogue access remained denied; verification used the existing protected connection.

The existing QA installation followed Open Source Security using a versioned request. Its newest three episodes became READY through existing cached transcripts/intelligence: Matchett, Brock and curl summer of Bliss. Repeating the same version added no jobs. A later unfollow succeeded; replaying the older follow returned `following: false`, `accepted: false`. Cleanup restored the prior followed window. The user's invitation was not used.

Eight existing authorised episodes retained live Brief, Chapters, Topics, Find a Moment and conversation-search access. The 21 current followed episodes awaiting a documented legal basis remained restricted. No permissions were fabricated or broadened. AI usage stayed at **41 recorded entries, $1.562445 total, zero active reservations**; these checks added **zero jobs and $0 AI usage**.

## Deployment and costs

AWS STS and resource ownership verified: account **208096650030**, region **eu-west-2**, profile `radiostar`, dedicated StarCast instance `i-08537aa0e84163cb9`. No pH7 resources were changed.

Preflight: no active intelligence work; database backup `/var/lib/starcast/pre-command-centre-1793028441732.sqlite` passed integrity validation; 25,817,894,912 bytes free (about 24 GiB); rollback releases present. Deployments used the existing explicit source archive allowlist, checksum validation, npm lockfile, health checks and retained rollback. No listener database replacement or seed import.

**VERIFIED:** final backend release `15cb0449eae682a031a26cac4915aade5c57ffcab5af0899690200842db554f5`, deployed 2026-10-26T15:39:38.242Z; previous release `b0b710a22d1e8c4cbbc249d27481a0ba4da021e646fc84fcdc628347fecf339e` retained. The original Batch 1 release also remains in the retained rollback window. HTTPS API and eight cached intelligence episodes passed post-deployment verification. Database integrity is `ok`; the API and single processing worker are healthy; SQS and DLQ visible/in-flight/delayed counts are all zero. Final measured disk headroom: 25,803,116,544 bytes (about 24 GiB). The pre-existing retention warning below is unchanged.

AWS Cost Explorer reports **$7.085998757** unblended usage for 1–25 October (end-exclusive 26 October), excluding credits/refunds; marked **estimated**. No recurring resources were added. Deployment/API/storage request charges are not separately settled in this billing window and must not be claimed as exactly $0. Standard and existing temporary internal AI limits, and the independent Translate ledger, were left unchanged.

## Commits and remaining verification

- `ed60c78` — catalogue, identity, migration, durable following and regression/browser tests.
- `1ed18a6` — authoritative acknowledgements, serial alias persistence and canonical lookup completion; versioned live follow acceptance.
- Final report commit also includes explicit React setter/cancellation callback types; native TypeScript passed after those corrections.
- Report commit and push: recorded in the final delivery message.

**PARTIALLY VERIFIED:** native device behaviour. Source, TypeScript, web interactions and iOS export are verified; this batch deliberately creates no TestFlight build or OTA release. An installed iPhone build must subsequently verify migration, interrupted playback and offline reconciliation on device.

**BLOCKED for automatic merging:** redirects joining two existing independent identity record sets. They are explicitly flagged and retained; resolving such a conflict requires evidence-based review, not automatic rights/data merging.

**Existing operational warning:** one protected legacy release directory contains macOS metadata outside the cleanup allowlist. The dashboard reports three retained copies against a two-copy target. It remains preserved; database, API, worker, queues and deployment checks pass. CloudWatch delivery and remote S3 restoration are not independently proven by the application health panel.

No Batch 3 work or public release was started.
