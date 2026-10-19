import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";

const config = JSON.parse(readFileSync("native/app.json", "utf8")).expo;
assert.equal(config.icon, "./assets/radio-star-icon.png", "Expo must use the verified app-icon source");
assert.equal(config.ios?.icon, undefined, "iOS must not override the verified Expo icon source");
const icon = PNG.sync.read(readFileSync("native/assets/radio-star-icon.png"));
assert.equal(icon.width, 1024, "app icon must be 1024px wide");
assert.equal(icon.height, 1024, "app icon must be 1024px high");
let transparent = 0, whitePerimeter = 0, flatPerimeter = 0, perimeter = 0;
for (let y = 0; y < icon.height; y++) for (let x = 0; x < icon.width; x++) {
  const i = (y * icon.width + x) * 4, [r, g, b, a] = icon.data.slice(i, i + 4);
  if (a !== 255) transparent++;
  if (x >= 4 && y >= 4 && x < icon.width - 4 && y < icon.height - 4) continue;
  perimeter++;
  if (r >= 235 && g >= 235 && b >= 235) whitePerimeter++;
  if (Math.max(r, g, b) - Math.min(r, g, b) < 12) flatPerimeter++;
}
assert.equal(transparent, 0, "app icon must be fully opaque; iOS supplies the mask");
assert.equal(whitePerimeter, 0, "app icon perimeter must not contain a white matte or border");
assert.ok(flatPerimeter / perimeter < 0.02, "app icon perimeter must retain the purple artwork rather than a flat neutral background");
console.log("App icon dimensions, opaque alpha channel and full-bleed perimeter checks passed");
