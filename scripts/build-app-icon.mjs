import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const [sourcePath, targetPath] = process.argv.slice(2);
if (!sourcePath || !targetPath)
  throw Error("Use: node scripts/build-app-icon.mjs SOURCE.png TARGET.png");

const source = PNG.sync.read(readFileSync(sourcePath));
if (source.width !== 1024 || source.height !== 1024)
  throw Error("The approved app-icon master must be 1024 × 1024.");
const output = new PNG({ width: source.width, height: source.height });
const pixel = (x, y) => (y * source.width + x) * 4;
const background = new Uint8Array(source.width * source.height * 3);
const known = new Uint8Array(source.width * source.height);

// Extend the master artwork's own edge colours into transparent corner pixels.
// Every originally opaque pixel is copied exactly; this merely removes the
// transparent matte that Xcode otherwise flattens to white before icon masking.
for (let y = 0; y < source.height; y++) {
  let first = -1, last = -1;
  for (let x = 0; x < source.width; x++) {
    if (source.data[pixel(x, y) + 3] === 255) {
      if (first < 0) first = x;
      last = x;
    }
  }
  if (first < 0) continue;
  for (let x = 0; x < source.width; x++) {
    const sourceX = x < first ? first : x > last ? last : x;
    const sourceIndex = pixel(sourceX, y), targetIndex = (y * source.width + x) * 3;
    background[targetIndex] = source.data[sourceIndex];
    background[targetIndex + 1] = source.data[sourceIndex + 1];
    background[targetIndex + 2] = source.data[sourceIndex + 2];
    known[y * source.width + x] = 1;
  }
}
for (let x = 0; x < source.width; x++) {
  let first = -1, last = -1;
  for (let y = 0; y < source.height; y++) {
    if (known[y * source.width + x]) {
      if (first < 0) first = y;
      last = y;
    }
  }
  if (first < 0) throw Error("The icon master contains an empty column.");
  for (let y = 0; y < source.height; y++) {
    const sourceY = y < first ? first : y > last ? last : y;
    const from = (sourceY * source.width + x) * 3, to = (y * source.width + x) * 3;
    if (!known[y * source.width + x]) {
      background[to] = background[from];
      background[to + 1] = background[from + 1];
      background[to + 2] = background[from + 2];
    }
  }
}
for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
  const i = pixel(x, y), backgroundIndex = (y * source.width + x) * 3, alpha = source.data[i + 3] / 255;
  output.data[i] = Math.round(source.data[i] * alpha + background[backgroundIndex] * (1 - alpha));
  output.data[i + 1] = Math.round(source.data[i + 1] * alpha + background[backgroundIndex + 1] * (1 - alpha));
  output.data[i + 2] = Math.round(source.data[i + 2] * alpha + background[backgroundIndex + 2] * (1 - alpha));
  output.data[i + 3] = 255;
}
writeFileSync(targetPath, PNG.sync.write(output));
console.log(JSON.stringify({ sourcePath, targetPath, width: output.width, height: output.height, alpha: "opaque" }));
