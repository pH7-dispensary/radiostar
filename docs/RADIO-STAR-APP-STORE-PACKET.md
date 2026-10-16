# Radio Star — App Store preparation

Prepared 16 October 2026. Draft metadata, not an App Store submission. No Apple application, product, price or approval has been invented.

## Metadata draft

| Field | Proposed value / owner action |
| --- | --- |
| Name | Radio Star |
| Subtitle | Your personal podcast space |
| Primary category | Entertainment — owner to confirm |
| Secondary category | Lifestyle — owner to confirm |
| Keywords | podcast,audio,listening,episodes,chapters,search,sleep,player |
| Marketing URL | https://www.getradiostar.com/ |
| Privacy URL | https://www.getradiostar.com/privacy |
| Terms URL | https://www.getradiostar.com/terms |
| Support | info@getradiostar.com; establish/approve a dedicated support webpage before submission |
| Copyright | 2026 TETRODAXOL, UNIPESSOAL LDA — owner confirmation required |
| Bundle | app.radiostar.ios |
| Version | 1.0.0; EAS testflight auto-increments build number |

Description draft:

Radio Star brings podcast discovery, your followed shows, saved episodes and listening history into one personal listening space. Search for podcasts, choose an episode, and make playback your own with seeking and playback-speed controls.

For authorised, processed episodes, explore an episode brief, chapters and source-grounded moments. Coverage depends on available transcripts, publisher permissions and processing status. Captions, where authorised, follow playback; Radio Star does not provide unrestricted transcript browsing.

AI Sleep uses timing preferences and feedback stored on your device. Switch between day and night appearance, manage episode intelligence, and find privacy controls in Profile.

Do not add claims of reliable background sleep, universally available AI, automatic advertisement skipping, live subscription benefits, or qualified-referral rewards until their release gates are met. Automatic Ad Skip is disabled. StoreKit configuration is currently disabled. Referral qualification lacks the trusted identity/listening verifier needed for real rewards.

## App Store Connect owner inputs

Confirm the existing Apple Developer team and the existing app record for the exact bundle ID. Supply the numeric App Store Apple ID, not a company name. Configure signing in EAS interactively; do not paste secrets into chat or source control. Complete agreements, tax/banking, territories and pricing only with owner authority.

Age rating: third-party podcast content may contain mature themes, language, violence, sexual references or health discussion. Do not answer “None” globally without a verified content policy. No account-based age enforcement has been verified. Resolve the Terms' age threshold versus Privacy wording, explicit-content access controls and the current Apple age-rating questionnaire before selecting a rating. No gambling, user chat or physiological sleep diagnosis is implemented.

Privacy label inputs for review: pseudonymous installation identifier, linked usage/listening evidence, follows, referral relationships, user-submitted support notes; podcast content sent to OpenAI for authorised intelligence/transcription; AWS storage/logs/backups. Local playback/history/sleep data stay on device except the separate server listening reports. Identify collection purpose, linkage, retention and processor contracts accurately. “No data collected” is not supported. No advertising tracking or social sign-in was found in the inspected code; final SDK/native privacy-manifest review remains a signed-build gate.

Based on the current first-party anonymous installation model, Apple's Login Services rule does not itself require adding social login. Reassess if an external identity provider is introduced. A durable account/recovery design is needed before offering cross-device paid restore; current transaction ownership is deliberately bound to the same listener installation, not transferable by presenting somebody else's receipt. [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/#login-services).

## Review notes draft

Private beta requires a one-time invitation, then a revocable device credential stored in iOS SecureStore. No Mac backend is needed; the app connects to the dedicated AWS HTTPS endpoint. Supply a fresh review invitation privately through App Store Connect, with adequate expiry and approved use count. Do not place it in this repository.

Discovery and playback use publisher feeds/audio. AI results and captions depend on documented rights; default is restricted. The current approved internal corpus is synthetic test material, not an App Store promotional podcast. Never represent it as a real publisher episode. Ad Skip remains off. Subscriptions remain unavailable pending product and server configuration. Profile contains privacy/terms/support links and profile deletion. Deleting a profile does not cancel an Apple subscription.

## Screenshots — BLOCKED awaiting native build/device

Do not upload browser-rendered QA captures. They are not native iOS screenshots. This workstation has Command Line Tools but no usable Xcode Simulator, and no physical-device capture was supplied.

Capture the actual signed app: Listen; Search; player; authorised Episode Brief; Explore Episode with genuine source evidence; AI Sleep; referrals with honest pending status. Do not include secrets, invitation codes, fake purchase prices or fabricated AI evidence. If rights-approved public content is unavailable, omit the AI marketing screenshot until permission exists.

Apple's current page (checked 16 October 2026) requires an iPhone Dynamic Island medium-display screenshot: accepted portrait sizes include **1179 × 2556** and **1206 × 2622**. Supply 1–10 JPEG/PNG screenshots per device size without transparency. This app declares supportsTablet=false; iPad screenshots would be required if that changes. Recheck the live specification at upload time. [Apple screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/).

## StoreKit activation contract — not enabled

Dependencies: expo-iap (native StoreKit bridge) and Apple's official server library. No RevenueCat or other paid provider introduced. [Expo IAP guidance](https://docs.expo.dev/guides/in-app-purchases/), [Apple server library](https://github.com/apple/app-store-server-library-node).

Required backend settings, through a reviewed secret/file provisioning change (not public Expo variables):

- STARCAST_STOREKIT_ENABLED=enabled only after sandbox acceptance and approved entitlement benefits.
- STARCAST_APPLE_PRODUCT_IDS: existing approved auto-renewable product IDs, comma separated; no prices in source.
- STARCAST_APPLE_ENVIRONMENT: Sandbox for TestFlight or Production for public release; never mix environments.
- STARCAST_APPLE_APP_ID: verified numeric production app ID.
- STARCAST_APPLE_ROOT_CA_FILES: locally provisioned official Apple root certificate files.
- STARCAST_APPLE_PRIVATE_KEY_FILE, STARCAST_APPLE_KEY_ID, STARCAST_APPLE_ISSUER_ID: owner-provisioned Apple In-App Purchase server credentials. Current cloud bootstrap does not provision these files; keep disabled until that controlled step is complete.
- App Store Server Notifications V2 URL: dedicated API origin + /api/apple/notifications. Signed notifications only, with bundle/environment validation and current-status refresh.

Purchase/restore is verified against Apple's current status before finishing the transaction. Revocations and billing failures remove access; verified grace can retain it. Cached entitlement becomes inactive after one hour without fresh verification. No paid benefit has been invented or wired into the free/referral allowance calculation. Approve paid capabilities and a recovery model before enabling purchases. Run sandbox purchase, cancel, pending approval, retry, restore, renewal, refund, revoke and missed-notification tests on the signed build. Real Apple integration is unverified.

## Physical iPhone acceptance

Record build number, device/iOS version, tester, date and pass/fail evidence for each step:

1. Install signed build; turn off the Mac backend; test on cellular as well as Wi-Fi.
2. Enrol with a private invitation; relaunch; expire/revoke a dedicated test device and verify re-enrolment UI. Never revoke another listener for testing.
3. Search a real podcast; open feed; play, pause, seek, change speed; relaunch and check position.
4. Lock screen, background 15+ minutes, switch Bluetooth/headphones, unplug and interrupt with a call. Confirm single audio engine and reliable resume.
5. Open an authorised episode; confirm real brief/chapters/moments and playable timestamps. Confirm restricted content never exposes captions or analysis.
6. Play authorised captions; pause, seek while paused, resume, change episodes, dismiss player. No stale text or full-transcript browsing.
7. Activate AI Sleep; extend +5/+15/+30; confirm fade/pause and morning recovery in foreground and background. It must make no cloud AI calls.
8. Follow/unfollow, save, history, every tab/back button; verify empty/offline/loading/error states and player/nav overlap.
9. Day/night, reduced motion, VoiceOver, largest text size, small device and keyboard; verify every tap target and label.
10. Share a referral, attribute on a separate test installation; pending usage must not award credit. Trusted verification must exist before qualifying a real reward; check month rollover in controlled tests.
11. Disable intelligence; verify server follows stop requesting new automatic processing for that listener. Audio analysis requires separate consent.
12. Clear local history and sleep learning. Confirm policy/terms/support links work before and after enrolment.
13. Delete a dedicated test profile; verify active server/local removal, token revocation, no late-write resurrection and preserved other-user rewards. Test a failed request without losing local data.
14. Run the StoreKit sandbox matrix only once credentials, approved products/benefits and restore recovery are configured.
15. Capture actual native screenshots after acceptance. Obtain explicit authorization before any Apple submission, including TestFlight upload.

## Legal/operational decisions still required

Review explicit third-party AI permission and onboarding disclosures against the actual default-on publisher-transcript workflow before public release. The audio-transcription consent is separate; a general Terms acceptance is not a substitute for any required AI-data-sharing permission. Do not claim this policy gate is resolved merely because a Profile toggle exists.

Approve primary-record/transcript/revocation-marker retention and deletion-backup restoration procedures; processor agreements and international-transfer arrangements; age/content policy; publisher permissions; consumer ADR information where required; support webpage; final subscription disclosures. Live Privacy currently says in-app deletion is unfinished and transcript expiry is not operational. Review the implemented deletion scope before updating legal text. No legal clauses were invented or silently rewritten in this mission.

Restore safeguard: never expose a restored database until recent deleted/revoked installation markers have been reconciled from the latest authoritative data and support deletion register. Restoring an older backup alone can resurrect deleted profiles. A catastrophic-loss-safe independent deletion ledger and restore drill remain operational launch gates; existing S3 backups are not immediate erasure.
