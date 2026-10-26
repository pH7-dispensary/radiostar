import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { resolve, dirname } from "node:path";
import { evaluateSkipCases, acceptance } from "../skip-evaluation.mjs";
import { syntheticSkipFixtures as fixture } from "../ad-skip.mjs";
// No network, provider calls, production mutations, or feature flag writes.
// Real cohorts must be manually annotated, lawfully acquired and explicitly passed by path.
const path = process.argv[2];
const cases = path
  ? JSON.parse(await readFile(path, "utf8"))
  : [
      {
        episodeId: "synthetic-ad",
        interval: fixture.clearAdvert,
        variantFingerprint: fixture.variantA,
        positionMs: 700000,
        expectedSkip: true,
        expectedEndMs: 774000,
      },
      {
        episodeId: "synthetic-conversation",
        interval: fixture.brandConversation,
        variantFingerprint: fixture.variantA,
        positionMs: 780000,
        expectedSkip: false,
      },
      {
        episodeId: "synthetic-mismatch",
        interval: fixture.clearAdvert,
        variantFingerprint: fixture.variantB,
        positionMs: 700000,
        expectedSkip: false,
      },
    ];
if (!Array.isArray(cases) || cases.length > 100000)
  throw Error("Supply a bounded JSON array of annotated cases.");
if (path) {
  const checked = new Map();
  for (const item of cases) {
    if (typeof item.audioPath !== 'string') throw Error('Real-world evaluation requires the actual labelled audio file.');
    const audioPath = resolve(dirname(path), item.audioPath);
    if (!checked.has(audioPath)) {
      const hash = createHash('sha256');
      for await (const bytes of createReadStream(audioPath)) hash.update(bytes);
      checked.set(audioPath, hash.digest('hex'));
    }
    if (checked.get(audioPath) !== item.audioContentHash) throw Error('Audio changed: historical labels cannot evaluate this variant.');
  }
}
console.log(
  JSON.stringify(
    {
      proposedAcceptance: acceptance,
      ...evaluateSkipCases(cases, { realWorld: !!path }),
      note: "Synthetic results are not real-world precision. Acceptance never changes production settings. Complaint rate requires actual listener feedback.",
    },
    null,
    2,
  ),
);
