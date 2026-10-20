import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(file, "utf8");
const api = read("native/src/api.ts");
const player = read("native/src/PlayerIntelligenceAccordion.tsx");
const app = read("native/App.tsx");
const adSkip = read("native/src/AdSkipPanel.tsx");
const adSkipRuntime = read("native/src/AdSkipRuntime.tsx");

assert.match(api, /"ANALYSING",\s*\n\s*"INDEXING",\s*\n\s*"PROCESSING"/);
assert.match(api, /availabilityCode/);
assert.match(api, /This episode exceeds the current audio transcription limit\./);
assert.match(api, /We couldn't find a usable transcript for this episode\./);
assert.match(api, /Preparation was interrupted\./);
assert.match(player, /EpisodeIntelligenceStatus/);
assert.match(player, /findEpisodeMoment/);
assert.match(player, /Play from \{stamp\(moment\.startMs\)\}/);
assert.match(player, /disabled for production release until measured safety criteria/);
assert.match(player, /showMasterToggle=\{false\}/);
assert.match(player, /LayoutAnimation\.configureNext/);
assert.match(player, /accessibilityLabel="Turn Ad Skip on or off"/);
assert.match(app, /PlayerIntelligenceAccordion/);
assert.match(app, /numberOfLines=\{titleExpanded \? undefined : 2\}/);
assert.match(app, /accessibilityRole="adjustable"/);
assert.match(adSkip, /showMasterToggle = true/);
assert.match(adSkipRuntime, /rights, rollout, preferences, acoustic evidence, boundary/);
assert.match(adSkipRuntime, /manualSuppressionMs = 10_000/);
assert.match(adSkipRuntime, /kind: "automatic_skip"/);
assert.match(app, /Verified advert skipped/);

console.log("native player intelligence, verified seeking, and accessible controls are wired");
