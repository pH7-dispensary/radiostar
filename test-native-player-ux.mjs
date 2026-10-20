import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(file, "utf8");
const api = read("native/src/api.ts");
const player = read("native/src/PlayerIntelligenceAccordion.tsx");
const app = read("native/App.tsx");
const adSkip = read("native/src/AdSkipPanel.tsx");

assert.match(api, /"ANALYSING",\s*\n\s*"INDEXING",\s*\n\s*"PROCESSING"/);
assert.match(player, /IntelligencePreparation/);
assert.match(player, /findEpisodeMoment/);
assert.match(player, /Play from \{stamp\(moment\.startMs\)\}/);
assert.match(player, /Automatic skipping remains off in production/);
assert.match(player, /showMasterToggle=\{false\}/);
assert.match(player, /LayoutAnimation\.configureNext/);
assert.match(player, /accessibilityLabel="Turn Ad Skip on or off"/);
assert.match(app, /PlayerIntelligenceAccordion/);
assert.match(app, /numberOfLines=\{titleExpanded \? undefined : 2\}/);
assert.match(app, /accessibilityRole="adjustable"/);
assert.match(adSkip, /showMasterToggle = true/);

console.log("native player intelligence, verified seeking, and accessible controls are wired");
