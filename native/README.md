# Native iOS foundation

This is an Expo/React Native project boundary, not a WebView. It uses `expo-audio` for the single native playback engine and `expo-secure-store` for the opaque anonymous credential. Install dependencies in this directory and run `npx expo prebuild --platform ios`, then test background/lock-screen behaviour in an iOS simulator or physical device.

The TestFlight profile targets the dedicated AWS CloudFront API and does not embed a shared pilot token or OpenAI credential. A tester enters an owner-issued private-beta code once; the resulting revocable per-install token stays in SecureStore. Configure the Expo/EAS account and Apple App Store Connect record before submitting a signed build.

From the repository root, an administrator can create a one-use tester code without printing it to the terminal: `node scripts/cloud/admin.mjs pilot issue pilot-invite.template.json`. The code is saved owner-only under `.starcast/latest-pilot-invite.json`; distribute it privately, then revoke the corresponding installation with the administrator CLI if needed.
