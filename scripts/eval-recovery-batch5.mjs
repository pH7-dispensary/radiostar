import { writeFile } from "node:fs/promises";
import { corpus, queries, provenance } from "../evals/recovery-batch5.mjs";
import { hybridRetrieve } from "../intelligence.mjs";
export function evaluate(retrieve, rows = queries, transcripts = corpus) {
  const details = rows.map((q) => {
    const started = performance.now();
    const found = transcripts
        .flatMap((t) =>
          retrieve(t, q.query, 5).map((m) => ({
            ...m,
            key: `${t.episodeId}:${m.segmentId}`,
          })),
        )
        .sort((a, b) => (b.score ?? b.confidence) - (a.score ?? a.confidence))
        .slice(0, 5),
      keys = found.map((m) => m.key),
      hit = q.relevant.filter((k) => keys.includes(k));
    return {
      ...q,
      returned: keys,
      recall: q.relevant.length ? hit.length / q.relevant.length : null,
      reciprocalRank: q.relevant.length
        ? keys.findIndex((k) => q.relevant.includes(k)) < 0
          ? 0
          : 1 / (keys.findIndex((k) => q.relevant.includes(k)) + 1)
        : null,
      abstained: keys.length === 0,
      latencyMs: performance.now() - started,
    };
  });
  const supported = details.filter((x) => x.relevant.length),
    absent = details.filter((x) => !x.relevant.length),
    mean = (xs) =>
      xs.length ? xs.reduce((n, x) => n + x, 0) / xs.length : null;
  return {
    samples: details.length,
    supportedSamples: supported.length,
    absentSamples: absent.length,
    recallAt5: mean(supported.map((x) => x.recall)),
    mrr: mean(supported.map((x) => x.reciprocalRank)),
    abstentionAccuracy: mean(absent.map((x) => Number(x.abstained))),
    multilingualRecallAt5: mean(
      details
        .filter((x) => ["zh", "pt"].includes(x.category))
        .map((x) => x.recall),
    ),
    meanLatencyMs: mean(details.map((x) => x.latencyMs)),
    queryProviderCostUsd: 0,
    provenance,
    details,
  };
}
if (process.argv[1]?.endsWith("eval-recovery-batch5.mjs")) {
  const result = evaluate(hybridRetrieve);
  if (process.argv[2])
    await writeFile(process.argv[2], JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ ...result, details: undefined }));
}
