const cloudOrigin = "https://d3ri12f40b85i3.cloudfront.net";
if (process.env.EAS_BUILD_PROFILE === "testflight") {
  if (process.env.EXPO_PUBLIC_DEV_INTELLIGENCE_TOKEN)
    throw Error("TestFlight builds must not embed the shared development pilot token.");
  if (process.env.EXPO_PUBLIC_ALLOW_LEGACY_TOKEN)
    throw Error("TestFlight builds must not enable legacy local pilot authentication.");
  if (process.env.EXPO_PUBLIC_ALLOW_INSECURE_LOCAL_API)
    throw Error("TestFlight builds must not enable insecure local API overrides.");
  if (process.env.EXPO_PUBLIC_API_BASE_URL && process.env.EXPO_PUBLIC_API_BASE_URL !== cloudOrigin)
    throw Error("TestFlight builds must use the dedicated Star Cast HTTPS API.");
}
