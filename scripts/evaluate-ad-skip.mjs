import { readFile } from "node:fs/promises";
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
