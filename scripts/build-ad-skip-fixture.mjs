// Original, deliberately synthetic evaluation audio. No publisher content or
// cloned voice. macOS system speech, an inserted break tone and authored text.
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import ffmpeg from "ffmpeg-static";
const scratch = mkdtempSync(join(tmpdir(), "radiostar-ad-fixture-"));
mkdirSync("fixtures", { recursive: true });
const speech = [
  "This is an original Radio Star evaluation recording, not a commercial podcast. Our conversation is about keeping evidence and playback aligned.",
  "This fictional break is sponsored by Example Orchard. Use code STAR for a free trial. This is synthetic advertising created only to test safe skipping.",
  "Now the conversation resumes. Discussing a product is not always an advertisement. We compare notebooks as an ordinary example, without an offer or sponsor.",
];
for (const [i, text] of speech.entries()) {
  execFileSync("say", ["-v", i === 2 ? "Samantha" : "Daniel", "-r", "155", "-o", join(scratch, `${i}.aiff`), text]);
  execFileSync(ffmpeg, ["-y", "-v", "error", "-i", join(scratch, `${i}.aiff`), "-af", "adelay=600,apad", "-t", i === 1 ? "20" : "15", "-ar", "22050", "-ac", "1", join(scratch, `${i}.wav`)]);
}
execFileSync(ffmpeg, ["-y", "-v", "error", ...[0, 1, 2].flatMap(i => ["-i", join(scratch, `${i}.wav`)]), "-f", "lavfi", "-i", "sine=frequency=880:duration=0.1:sample_rate=22050", "-filter_complex", "[0:a][1:a][2:a]concat=n=3:v=0:a=1[voice];[3:a]asplit=2[t1][t2];[t1]adelay=15200[a];[t2]adelay=34400[b];[voice][a][b]amix=inputs=3:duration=first:normalize=0[out]", "-map", "[out]", "-c:a", "libmp3lame", "-b:a", "64k", "fixtures/ad-skip-owned-v1.mp3"]);
const bytes = readFileSync("fixtures/ad-skip-owned-v1.mp3");
writeFileSync("fixtures/ad-skip-owned-v1.json", JSON.stringify({ schema: 1, synthetic: true, source: "Original Radio Star fixture; system speech, not a cloned voice", audioContentHash: createHash("sha256").update(bytes).digest("hex"), contentLength: bytes.length, durationMs: 50000, advert: { startMs: 15000, endMs: 35000 }, segments: speech.map((text, index) => ({ startMs: [0, 15000, 35000][index], endMs: [15000, 35000, 50000][index], text })) }, null, 2) + "\n");
console.log("Authored 50-second synthetic speech fixture and ground-truth manifest; no paid provider used.");
