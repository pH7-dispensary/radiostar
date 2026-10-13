const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");
const config = getDefaultConfig(__dirname);
// Reuse the existing deterministic domain module from the parent repository.
config.watchFolders = [path.resolve(__dirname, "..")];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.resolve(__dirname, "../node_modules"),
];
config.resolver.sourceExts = [
  ...new Set([...config.resolver.sourceExts, "mjs"]),
];
config.resolver.blockList =
  /(?:^|\/)(?:continue|\.env(?:\.[^/]*)?|\.starcast\/.*|\.git\/.*)$/;
module.exports = config;
