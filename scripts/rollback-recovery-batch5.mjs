// Run with the API/worker stopped. Restores only compatible derived projections;
// canonical transcripts, listener records, rights and spending ledgers stay put.
import { pathToFileURL } from "node:url";
import { LocalStore } from "../persistence.mjs";
import { transcriptFingerprint } from "../intelligence-delivery.mjs";
import { GROUNDING_VERSION } from "../claim-grounding.mjs";
export function rollbackDerived(store, { apply = false } = {}) {
  const eligible = [],
    skipped = [];
  for (const [key, original] of store.all("grounding-original")) {
    const current = store.get("intelligence", key);
    if (
      !current?.transcript ||
      current.groundingVersion !== GROUNDING_VERSION ||
      original.fingerprint !== transcriptFingerprint(current.transcript)
    ) {
      skipped.push(key);
      continue;
    }
    eligible.push(key);
  }
  if (apply)
    store.transaction(() => {
      for (const key of eligible) {
        const original = store.get("grounding-original", key),
          value = { ...store.get("intelligence", key) };
        for (const field of [
          "brief",
          "chapters",
          "state",
        "completedAt",
          "partialResult",
          "qualityNote",
          "claimReview",
          "groundingVersion",
        ]) {
          if (original[field] === undefined) delete value[field];
          else value[field] = original[field];
        }
        for (const field of [
          "topics",
          "claimGrounding",
          "featureStatus",
          "deliveryValidation",
          "searchIndex",
        ])
          delete value[field];
        store.set("intelligence", key, value);
        const previous = store.get("search-index-previous", key);
        if (previous) store.set("search-index", key, previous);
      }
    });
  return {
    apply,
    eligible: eligible.length,
    skippedChangedSources: skipped.length,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const path = process.env.STARCAST_DB;
  if (!path)
    throw Error("Set STARCAST_DB explicitly; stop the service before --apply.");
  const store = new LocalStore(path);
  try {
    console.log(
      JSON.stringify(
        rollbackDerived(store, { apply: process.argv.includes("--apply") }),
      ),
    );
  } finally {
    store.close();
  }
}
