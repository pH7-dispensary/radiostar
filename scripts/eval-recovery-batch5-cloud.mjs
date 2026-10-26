// One-time authorised evaluation. Run on the existing AWS host, with its real
// shared budget ledger. Fixtures never enter the listener catalogue.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { LocalStore } from "../persistence.mjs";
import { BudgetLedger, createOpenAIClient } from "../openai-intelligence.mjs";
import { RightsRegistry } from "../rights-registry.mjs";
import { episodeIdentity } from "../episode-identity.mjs";
import { DerivedRequests } from "../paid-derived.mjs";
import { SemanticSearch, hybridSemanticRetrieve } from "../semantic-search.mjs";
import {
  buildSearchIndex,
  transcriptFingerprint,
} from "../intelligence-delivery.mjs";
import { corpus, queries, provenance } from "../evals/recovery-batch5.mjs";
import { evaluate } from "./eval-recovery-batch5.mjs";
import { rankMoments } from "../retrieval.mjs";
import { groundResult } from "../grounded-result.mjs";
import { reviewClaims, validateClaims } from "../claim-grounding.mjs";
if (process.env.STARCAST_EVALUATION_AUTHORISED !== "0.05")
  throw Error("Explicit $0.05 evaluation cap required");
const aws = (args) =>
  JSON.parse(
    execFileSync(
      "aws",
      [...args, "--region", "eu-west-2", "--output", "json", "--no-cli-pager"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  );
assert.equal(aws(["sts", "get-caller-identity"]).Account, "208096650030");
const secret = JSON.parse(
  aws([
    "secretsmanager",
    "get-secret-value",
    "--secret-id",
    process.env.STARCAST_SECRET_ARN,
  ]).SecretString,
);
assert(secret.paidEnabled === true && secret.OPENAI_API_KEY);
process.env.OPENAI_API_KEY = secret.OPENAI_API_KEY;
const store = new LocalStore("/var/lib/starcast/backend.sqlite"),
  ledger = new BudgetLedger({ enabled: true }, store),
  rights = new RightsRegistry(store);
const priorDerivedUsd = ledger.usage
    .filter((x) => x.id.startsWith("derived:"))
    .reduce((n, x) => n + x.usd, 0),
  before = ledger.usage.reduce((n, x) => n + x.usd, 0) - priorDerivedUsd,
  admitted = new Map(),
  real = [];
for (const [, v] of store.all("intelligence"))
  if (
    [
      "b866917c-0245-4bcf-a06a-83f55ea44ca6",
      "d04532a8-4020-449e-acd6-98fa8a1b6159",
    ].includes(v.episode?.id)
  ) {
    const allowed = () =>
      [
        "intelligence-processing",
        "intelligence-display",
        "conversation-search",
      ].every(
        (feature) =>
          rights.evaluate({
            feature,
            feedUrl: v.episode.feedUrl,
            episodeId: v.episode.id,
          }).allowed,
      );
    if (allowed()) {
      const legacyKey = episodeIdentity(v.episode.feedUrl, v.episode.id),
        key = createHash("sha256").update(legacyKey).digest("hex");
      // The initial benchmark used the identity tuple as its private cache key.
      // Move only those authorised derived caches; financial usage IDs stay intact.
      store.transaction(() => {
        const legacy = store.get("semantic-index", legacyKey),
          current = store.get("semantic-index", key);
        if (legacy) {
          assert(
            !current || current.checksum === legacy.checksum,
            "Conflicting semantic index",
          );
          if (!current) store.set("semantic-index", key, legacy);
          store.delete("semantic-index", legacyKey);
        }
        for (const [oldId, row] of store.all("derived-provider"))
          if (row.sourceKey === legacyKey) {
            assert(
              row.state === "READY" && oldId.startsWith(legacyKey + ":"),
              "Unresolved legacy evaluation request",
            );
            const newId = key + oldId.slice(legacyKey.length),
              existing = store.get("derived-provider", newId);
            assert(
              !existing ||
                JSON.stringify(existing.response) ===
                  JSON.stringify(row.response),
              "Conflicting derived cache",
            );
            if (!existing)
              store.set("derived-provider", newId, {
                ...row,
                sourceKey: key,
                billingKey: oldId,
              });
            store.delete("derived-provider", oldId);
          }
      });
      admitted.set(key, allowed);
      real.push({ transcript: v.transcript, metadata: v, key });
    }
  }
assert(
  real.length === 2,
  "Both real evaluation episodes must still be authorised",
);
const requests = new DerivedRequests({
    store,
    ledger,
    client: createOpenAIClient(),
    maxRunUsd:
      0.05 -
      priorDerivedUsd -
      [...ledger.reservations.values()].reduce(
        (n, x) => n + (x.id.startsWith("derived:") ? x.usd : 0),
        0,
      ),
    canPersist: (key) =>
      !key || key.startsWith("batch5-owned:") || admitted.get(key)?.() === true,
    beforePaid: () => assert(ledger.controls.enabled),
  }),
  semantic = new SemanticSearch({ store, requests });
const indexes = new Map(),
  vectors = new Map(),
  all = [...corpus, ...real.map((r) => r.transcript)];
for (const t of all) {
  const r = real.find((r) => r.transcript === t),
    key = r?.key || `batch5-owned:${t.episodeId}`,
    index = buildSearchIndex(t, {
      feedUrl: r?.metadata.episode.feedUrl || "fixture://owned",
      episodeId: t.episodeId,
      processingVersion: "2.0.0",
    });
  const built = await semantic.build(index, { key, maxBatches: 16 });
  assert.equal(built.state, "READY");
  indexes.set(t.episodeId, { index, built });
}
const realQueries = [
  {
    id: "real1",
    category: "exact",
    query: "safety is not security",
    relevant: ["b866917c-0245-4bcf-a06a-83f55ea44ca6:seg-29"],
  },
  {
    id: "real2",
    category: "definition",
    query: "absence of loss events",
    relevant: ["b866917c-0245-4bcf-a06a-83f55ea44ca6:seg-35"],
  },
  {
    id: "real3",
    category: "paraphrase",
    query: "How does the guest define being safe in terms of avoiding losses?",
    relevant: ["b866917c-0245-4bcf-a06a-83f55ea44ca6:seg-35"],
  },
  {
    id: "real4",
    category: "date",
    query: "When did the open source security podcast start?",
    relevant: ["d04532a8-4020-449e-acd6-98fa8a1b6159:seg-39"],
  },
  {
    id: "real5",
    category: "paraphrase",
    query: "Different people mean different things by safety",
    relevant: ["b866917c-0245-4bcf-a06a-83f55ea44ca6:seg-31"],
  },
  {
    id: "real6",
    category: "absent",
    query: "Which cancer treatment achieved a guaranteed cure?",
    relevant: [],
  },
];
const labelled = [...queries, ...realQueries];
for (let i = 0; i < labelled.length; i += 32) {
  const chunk = labelled.slice(i, i + 32),
    v = await semantic.embed(chunk.map((q) => q.query));
  chunk.forEach((q, j) => vectors.set(q.query, v[j]));
}
const compact = (r) => ({ ...r, details: undefined });
const comparisons = [];
for (const threshold of [0.35, 0.4, 0.45, 0.5])
  for (const mode of ["semantic", "hybrid"]) {
    const retrieve = (t, q, n) => {
      const x = indexes.get(t.episodeId);
      return hybridSemanticRetrieve(x.index, q, vectors.get(q), x.built, {
        limit: n,
        threshold,
        mode,
      });
    };
    comparisons.push({
      threshold,
      mode,
      train: compact(
        evaluate(
          retrieve,
          labelled.filter((_, i) => i % 2 === 0),
          all,
        ),
      ),
      heldOut: compact(
        evaluate(
          retrieve,
          labelled.filter((_, i) => i % 2 === 1),
          all,
        ),
      ),
      all: evaluate(retrieve, labelled, all),
    });
  }
const claimCases = [
  ["swapped", "Alice paid Bob 20 euros.", "Bob paid Alice 20 euros.", false],
  [
    "negated",
    "The proposal does not reduce accidents.",
    "The proposal reduces accidents.",
    false,
  ],
  [
    "qualified",
    "The proposal might reduce accidents; trials are incomplete.",
    "Trials prove the proposal reduces accidents.",
    false,
  ],
  [
    "numeric",
    "The study enrolled 20 people.",
    "The study enrolled 200 people.",
    false,
  ],
  [
    "cure",
    "The gardening class planted tomatoes.",
    "Gardening cures cancer.",
    false,
  ],
  [
    "uncertain-speaker",
    "We discussed the regulation proposal.",
    "Bruno supported the regulation proposal.",
    false,
  ],
  [
    "paraphrase",
    "Independent audits can reveal hidden risks in the proposal.",
    "Auditing the proposal independently can expose hidden risks.",
    true,
  ],
  [
    "paraphrase2",
    "Compliance costs could exclude small teams.",
    "Smaller teams could be excluded by compliance costs.",
    true,
  ],
  [
    "negation-preserved",
    "There is no evidence that the treatment works.",
    "Evidence does not establish that the treatment works.",
    true,
  ],
  [
    "causal",
    "Safety incidents fell after the policy changed.",
    "The policy change caused safety incidents to fall.",
    false,
  ],
  [
    "date",
    "The podcast started in 2016.",
    "The podcast started in 2026.",
    false,
  ],
  [
    "opinion",
    "Ada supports regulation. Bruno opposes regulation.",
    "Ada and Bruno agree that regulation is necessary.",
    false,
  ],
];
const claimResults = [];
for (const [id, text, claim, expected] of claimCases) {
  const t = { segments: [{ id: "s", text }] },
    v = {
      brief: {
        overview: claim,
        detail: claim,
        themes: [],
        sourceSegmentIds: ["s"],
      },
    };
  const checked = await reviewClaims(v, t, requests, {
    sourceKey: `batch5-owned:${id}`,
  });
  const got = validateClaims(checked, t).complete;
  claimResults.push({ id, expected, accepted: got, correct: got === expected });
}
const realClaimResults = [];
for (const r of real) {
  try {
    const checked = await reviewClaims(r.metadata, r.transcript, requests, {
        sourceKey: r.key,
      }),
      assessment = validateClaims(checked, r.transcript),
      projected = groundResult(checked, r.transcript);
    if (checked.claimReview && admitted.get(r.key)())
      store.set("grounding-review", r.key, {
        fingerprint: transcriptFingerprint(r.transcript),
        claimReview: checked.claimReview,
        at: new Date().toISOString(),
      });
    realClaimResults.push({
      episodeId: r.transcript.episodeId,
      claims: assessment.claims.length,
      supported: assessment.claims.filter((c) => c.supported).length,
      briefMode: projected.brief?.mode || "generated",
      chapters: projected.chapters?.length,
      generatedChapters: projected.chapters?.filter(
        (c) => c.mode !== "extractive",
      ).length,
    });
  } catch (error) {
    realClaimResults.push({
      episodeId: r.transcript.episodeId,
      code: error.code || error.message,
    });
  }
}
ledger.refresh();
const report = {
  at: new Date().toISOString(),
  capUsd: 0.05,
  actualUsd: ledger.usage.reduce((n, x) => n + x.usd, 0) - before,
  reservedCeilingsUsd: requests.reservedRunUsd,
  lexical: evaluate(rankMoments, labelled, all),
  comparisons,
  claimResults,
  realClaimResults,
  provenance: {
    ...provenance,
    realEpisodes: real.map((r) => ({
      id: r.transcript.episodeId,
      title: r.metadata.episode.title,
    })),
    realLabels:
      "Source-reference labels inspected by the engineering agent; no independent human review.",
  },
};
assert(report.actualUsd <= 0.05);
writeFileSync(
  "/var/lib/starcast/batch5-evaluation.json",
  JSON.stringify(report, null, 2),
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    actualUsd: report.actualUsd,
    reservedCeilingsUsd: report.reservedCeilingsUsd,
    lexical: compact(report.lexical),
    comparisons: comparisons.map((c) => ({ ...c, all: compact(c.all) })),
    claimResults,
    realClaimResults,
  }),
);
store.close();
