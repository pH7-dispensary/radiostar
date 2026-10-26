import assert from "node:assert/strict";
import { LocalStore } from "./persistence.mjs";
import { corpus, queries } from "./evals/recovery-batch5.mjs";
import { hybridRetrieve, searchTerms } from "./intelligence.mjs";
import {
  buildSearchIndex,
  validSearchIndex,
  deliveryValidation,
} from "./intelligence-delivery.mjs";
import { groundResult } from "./grounded-result.mjs";
import { validateClaims, reviewClaims } from "./claim-grounding.mjs";
import { DerivedRequests } from "./paid-derived.mjs";
import { BudgetLedger } from "./openai-intelligence.mjs";
import { composeGroundedAnswer } from "./grounded-answer.mjs";
import {
  SemanticSearch,
  DIMENSIONS,
  validSemanticIndex,
} from "./semantic-search.mjs";
const zh = corpus.find((t) => t.language === "zh"),
  pt = corpus.find((t) => t.language === "pt-PT");
for (const q of queries.filter((q) => q.category === "zh"))
  assert(
    hybridRetrieve(zh, q.query, 5).some((m) =>
      q.relevant.includes(`${zh.episodeId}:${m.segmentId}`),
    ),
  );
assert.equal(hybridRetrieve(pt, "inteligencia artificial")[0].segmentId, "pt1");
assert(searchTerms("AI café 研究").has("ai"));
assert(
  hybridRetrieve(
    corpus.find((t) => t.episodeId === "owned-long"),
    "reversible deployment",
  )[0].startMs > 7200000,
);
const index = buildSearchIndex(zh, {
  feedUrl: "fixture://owned",
  episodeId: zh.episodeId,
  processingVersion: "2.0.0",
});
assert(validSearchIndex(index, zh, index));
assert(
  !validSearchIndex(
    { ...index, segments: [{ ...index.segments[0], text: "corrupted" }] },
    zh,
    index,
  ),
);
assert(!validSearchIndex(index, { ...zh, audioVariant: "changed" }, index));
const source = {
  episodeId: "garden",
  transcriptVersion: "v1",
  segments: [
    {
      id: "s1",
      text: "The gardening class planted tomatoes in May.",
      startMs: 0,
      endMs: 10000,
    },
  ],
};
const fake = {
  episodeId: "garden",
  processingVersion: "2.0.0",
  brief: {
    episodeId: "garden",
    processingVersion: "2.0.0",
    transcriptVersion: "v1",
    overview: "Gardening cures cancer in 100 percent of patients.",
    detail: "All patients were cured by gardening.",
    themes: ["Cancer cure"],
    sourceSegmentIds: ["s1"],
  },
  chapters: [
    {
      title: "A cancer cure",
      description: "The treatment cures cancer.",
      sourceSegmentIds: ["s1"],
      startMs: 0,
      endMs: 10000,
    },
  ],
  topics: [{ sourceSegmentIds: ["s1"] }],
};
assert.equal(
  deliveryValidation(
    fake,
    buildSearchIndex(source, { ...fake, feedUrl: "fixture://owned" }),
  ).complete,
  false,
);
const guarded = groundResult(fake, source);
assert.equal(guarded.brief.mode, "extractive");
assert(!guarded.brief.overview.includes("cancer"));
assert.equal(guarded.chapters[0].mode, "extractive");
assert(!guarded.chapters[0].title.includes("cancer"));
for (const [text, claim] of [
  ["Alice paid Bob 20 euros.", "Bob paid Alice 20 euros."],
  [
    "The proposal does not reduce accidents.",
    "The proposal reduces accidents.",
  ],
  ["The policy might help.", "The policy will help."],
  ["The podcast started in 2016.", "The podcast started in 2026."],
])
  assert.equal(
    validateClaims(
      { brief: { overview: claim, sourceSegmentIds: ["s"] } },
      { segments: [{ id: "s", text }] },
    ).complete,
    false,
  );
const debate = corpus.find((t) => t.episodeId === "owned-debate"),
  matches = debate.segments.slice(0, 2).map((s) => ({
    segmentId: s.id,
    context: s.text,
    speaker: s.speaker,
    startMs: s.startMs,
    endMs: s.endMs,
    episode: { id: debate.episodeId, feedUrl: "fixture://owned" },
  }));
const answer = composeGroundedAnswer(
  "Compare arguments for and against the regulation proposal",
  matches,
);
assert.equal(answer.synthesisType, "source_comparison");
assert(
  answer.claims.every((c) =>
    debate.segments.some(
      (s) => s.id === c.sourceSegmentIds[0] && s.text.includes(c.text),
    ),
  ),
);
assert.equal(composeGroundedAnswer("missing", []).answerState, "NO_EVIDENCE");
assert(
  composeGroundedAnswer("Who said this?", [{ ...matches[0], speaker: null }], {
    partialEpisodes: 1,
  }).limitations.length === 2,
);
const store = new LocalStore(":memory:"),
  ledger = new BudgetLedger(
    { enabled: true, dailyUsd: 0.05, monthlyUsd: 0.05 },
    store,
  );
let calls = 0,
  allow = true;
const client = {
  embeddings: {
    create: async (p) => {
      calls++;
      return {
        data: p.input.map((_, index) => ({
          index,
          embedding: Array.from({ length: DIMENSIONS }, (_, i) =>
            i === 0 ? 1 : 0,
          ),
        })),
        usage: { total_tokens: 20 },
      };
    },
  },
};
const requests = new DerivedRequests({
    store,
    ledger,
    client,
    canPersist: () => allow,
    maxRunUsd: 0.01,
  }),
  semantic = new SemanticSearch({ store, requests });
await Promise.all([semantic.query("same query"), semantic.query("same query")]);
assert.equal(calls, 1);
await semantic.query("same query");
assert.equal(calls, 1);
const vectorIndex = await semantic.build(index, {
  key: "owned",
  maxBatches: 1,
});
assert(validSemanticIndex(vectorIndex, index));
assert(!validSemanticIndex({ ...vectorIndex, rows: [] }, index));
allow = false;
await assert.rejects(semantic.query("same query"), /RIGHTS/);
allow = true;
const tight = new DerivedRequests({
  store,
  ledger,
  client,
  maxRunUsd: 0.0000001,
});
await assert.rejects(
  tight.request({
    key: "over",
    ceiling: 0.01,
    kind: "embedding",
    invoke: () => {
      throw Error("must not call");
    },
    actualCost: () => 0,
  }),
  /BUDGET/,
);
let invoked = 0;
await assert.rejects(
  requests.request({
    key: "unknown",
    ceiling: 0.001,
    kind: "embedding",
    invoke: async () => {
      invoked++;
      throw Error("connection lost");
    },
    actualCost: () => 0,
  }),
);
await assert.rejects(
  requests.request({
    key: "unknown",
    ceiling: 0.001,
    kind: "embedding",
    invoke: async () => {
      invoked++;
    },
    actualCost: () => 0,
  }),
  /replay/,
);
assert.equal(invoked, 1);
assert(ledger.usage.some((r) => r.uncertain));
store.close();
console.log(
  "Batch 5 multilingual retrieval, grounded claims, comparisons, index corruption, cache deduplication, rights revocation and budget/unknown-outcome checks passed.",
);

// Persisted indexing resumes after a process/store restart, without buying
// completed batches again. Corruption fails closed and canonical text survives.
const { mkdtempSync, rmSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");
const directory = mkdtempSync(join(tmpdir(), "starcast-semantic-")),
  path = join(directory, "db.sqlite");
let disk = new LocalStore(path),
  resumeCalls = 0;
const large = {
  episodeId: "long-index",
  transcriptVersion: "v1",
  segments: Array.from({ length: 70 }, (_, i) => ({
    id: `s${i}`,
    text: `Original owned source passage number ${i} discusses careful research evidence.`,
    startMs: i * 1000,
    endMs: (i + 1) * 1000,
  })),
};
const largeIndex = buildSearchIndex(large, {
  feedUrl: "fixture://owned",
  episodeId: large.episodeId,
  processingVersion: "2.0.0",
});
const resumer = () =>
  new SemanticSearch({
    store: disk,
    requests: new DerivedRequests({
      store: disk,
      ledger: new BudgetLedger({ enabled: true }, disk),
      client: {
        embeddings: {
          create: async (p) => {
            resumeCalls++;
            return client.embeddings.create(p);
          },
        },
      },
    }),
  });
disk.set("search-index", "long", { ...largeIndex, version: "legacy-v1", fingerprint: "legacy-hash" });
let resumed = await resumer().build(largeIndex, { key: "long", maxBatches: 1 });
assert.equal(resumed.cursor, 32);
assert.equal(resumed.state, "BUILDING");
disk.close();
disk = new LocalStore(path);
resumed = await resumer().build(largeIndex, { key: "long", maxBatches: 3 });
assert.equal(resumeCalls, 3);
assert(validSemanticIndex(resumed, largeIndex));
assert.equal(resumed.rows.at(-1).segmentId, "s69");
await resumer().build(largeIndex, { key: "long" });
assert.equal(resumeCalls, 3);
let releaseProvider;
const held = new Promise((r) => (releaseProvider = r));
let sharedCalls = 0;
const options = {
  key: "shared",
  sourceKey: "owned",
  ceiling: 0.001,
  kind: "embedding",
  invoke: async () => {
    sharedCalls++;
    await held;
    return { usage: { total_tokens: 20 } };
  },
  actualCost: () => 0.0000004,
};
const first = new DerivedRequests({
  store: disk,
  ledger: new BudgetLedger({ enabled: true }, disk),
}).request(options);
await assert.rejects(
  new DerivedRequests({
    store: disk,
    ledger: new BudgetLedger({ enabled: true }, disk),
  }).request(options),
  /replay/,
);
releaseProvider();
await first;
assert.equal(sharedCalls, 1);
let permitted = true;
const late = new DerivedRequests({
  store: disk,
  ledger: new BudgetLedger({ enabled: true }, disk),
  canPersist: () => permitted,
});
await assert.rejects(
  late.request({
    ...options,
    key: "late",
    invoke: async () => {
      permitted = false;
      return { usage: { total_tokens: 20 } };
    },
  }),
  /RIGHTS_REVOKED/,
);
assert.equal(disk.get("derived-provider", "late"), null);
disk.close();
rmSync(directory, { recursive: true, force: true });

// Actual HTTP listener routes exercise async retrieval, authentication, source
// positions, rights changes during a provider await, and safe lexical fallback.
const { createStarCastServer } = await import("./server.mjs");
const { episodeKey } = await import("./episode-pipeline.mjs");
let networkCalls = 0,
  onQuery = null;
const api = createStarCastServer({
  store: new LocalStore(":memory:"),
  env: {
    STARCAST_DEV_INTELLIGENCE_TOKEN: "batch5-test-token",
    STARCAST_PAID_INTELLIGENCE: "enabled",
    STARCAST_SEMANTIC_SEARCH: "enabled",
    OPENAI_API_KEY: "mock",
  },
  client: {
    embeddings: {
      create: async (p) => {
        networkCalls++;
        if (onQuery) onQuery();
        return {
          data: p.input.map((_, index) => ({
            index,
            embedding: Array.from({ length: DIMENSIONS }, (_, i) =>
              i === 0 ? 1 : 0,
            ),
          })),
          usage: { total_tokens: 20 },
        };
      },
    },
  },
});
const feed = "https://owned.example/batch5.xml",
  id = "semantic-fixture",
  key = episodeKey(feed, id);
const permission = {
  feedUrl: feed,
  classification: "LICENSED",
  rightsReserved: false,
  explicitAuthorisation: true,
  assessmentStatus: "APPROVED",
  canAcquireTranscript: true,
  canProcessForAi: true,
  canDisplayDerivedIntelligence: true,
  canRetain: true,
  canRegenerate: true,
};
api.rights.set(permission);
const t = { ...large, episodeId: id, segments: large.segments.slice(0, 1) };
api.store.set("intelligence", key, {
  state: "READY",
  completedAt: new Date().toISOString(),
  processingVersion: "2.0.0",
  episode: { feedUrl: feed, id, title: "Owned source" },
  transcript: t,
  brief: {
    episodeId: id,
    processingVersion: "2.0.0",
    transcriptVersion: "v1",
    overview: t.segments[0].text,
    detail: t.segments[0].text,
    themes: ["Research evidence"],
    sourceSegmentIds: ["s0"],
  },
  chapters: [
    {
      title: "Research evidence",
      description: t.segments[0].text,
      sourceSegmentIds: ["s0"],
      startMs: 0,
      endMs: 1000,
    },
  ],
});
api.pipeline.status(feed, id);
await api.pipeline.semanticSearch.build(api.store.get("search-index", key), {
  key,
});
await new Promise((r) => api.server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${api.server.address().port}`;
const post = (route, body, auth = true) =>
  fetch(base + route, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(auth ? { "x-star-cast-dev-token": "batch5-test-token" } : {}),
    },
    body: JSON.stringify(body),
  });
try {
  assert.equal(
    (
      await post(
        "/api/search/conversations",
        { query: "careful research evidence" },
        false,
      )
    ).status,
    403,
  );
  let result = await (
    await post("/api/search/conversations", {
      query: "careful research evidence",
    })
  ).json();
  assert.equal(result.retrieval.mode, "semantic-with-lexical-fallback");
  assert.equal(result.matches[0].startMs, 0);
  assert.equal(result.matches[0].endMs, 1000);
  assert(result.claims[0].sourceSegmentIds.includes("s0"));
  const paid = networkCalls;
  await post("/api/search/conversations", {
    query: "careful research evidence",
  });
  assert.equal(networkCalls, paid);
  const moment = await (
    await post("/api/intelligence/moment", {
      feedUrl: feed,
      episodeId: id,
      query: "careful research evidence",
    })
  ).json();
  assert.equal(moment.moments[0].startMs, 0);
  onQuery = () =>
    api.rights.set({
      ...permission,
      classification: "RESTRICTED",
      rightsReserved: true,
    });
  result = await (
    await post("/api/search/conversations", {
      query: "research context and original sources",
    })
  ).json();
  assert.equal(
    result.matches.length,
    0,
    "revocation while awaiting embeddings must remove the source",
  );
  assert.equal(result.answerState, "NO_EVIDENCE");
  onQuery = null;
  api.rights.set(permission);
  api.pipeline.semanticSearch.query = async () => {
    throw Error("budget exhausted");
  };
  result = await (
    await post("/api/search/conversations", {
      query: "careful research evidence",
    })
  ).json();
  assert.equal(result.retrieval.mode, "unicode-lexical");
  assert.equal(result.matches.length, 1);
  api.pipeline.purgeEpisode(feed, id);
  assert.equal(api.store.get("semantic-index", key), null);
  assert.equal(
    api.store.all("derived-provider").some(([, v]) => v.sourceKey === key),
    false,
  );
} finally {
  await new Promise((r) => api.server.close(r));
  api.store.close();
}
console.log(
  "Batch 5 durable index restart, cross-instance deduplication, HTTP search/moments, rights races, cache reuse and budget fallback passed.",
);

// A migration rollback restores derived presentation, not a whole database.
const { rollbackDerived } = await import(
  "./scripts/rollback-recovery-batch5.mjs"
);
const { transcriptFingerprint } = await import("./intelligence-delivery.mjs");
const rollbackStore = new LocalStore(":memory:");
rollbackStore.set("grounding-original", "one", {
  fingerprint: transcriptFingerprint(source),
  brief: { overview: "Original" },
  state: "READY",
});
rollbackStore.set("intelligence", "one", {
  transcript: source,
  brief: { overview: "Projection" },
  state: "PARTIAL_READY",
  groundingVersion: "claim-evidence-v2",
});
rollbackStore.set("budget", "untouched", { usd: 1 });
assert.equal(rollbackDerived(rollbackStore).eligible, 1);
assert.equal(
  rollbackStore.get("intelligence", "one").brief.overview,
  "Projection",
);
assert.equal(rollbackDerived(rollbackStore, { apply: true }).eligible, 1);
assert.equal(
  rollbackStore.get("intelligence", "one").brief.overview,
  "Original",
);
assert.equal(rollbackStore.get("budget", "untouched").usd, 1);
rollbackStore.set("intelligence", "one", {
  transcript: { ...source, audioVariant: "changed" },
  groundingVersion: "claim-evidence-v2",
});
assert.equal(rollbackDerived(rollbackStore).skippedChangedSources, 1);
rollbackStore.close();
const longSentence='This owned source sentence describes careful research methods and responsible evidence review across several independent teams working on a difficult problem.';
const longSource={...source,segments:[{...source.segments[0],text:longSentence}]};
const clipped=groundResult(fake,longSource);
assert.equal(clipped.chapters[0].mode,'extractive');
assert(clipped.chapters[0].title.includes('…'));
assert(validateClaims(clipped,longSource).complete,'NFKC ellipsis normalization must preserve legitimate visibly quoted excerpts');
const {groundedTopics}=await import('./intelligence-delivery.mjs');
const {claimBinding,claimsForResult,GROUNDING_VERSION}=await import('./claim-grounding.mjs');
const themeSource={...source,segments:[source.segments[0],{id:'s2',text:'Audits can discover hidden hazards.',startMs:10000,endMs:20000}]};
const themeValue={...fake,chapters:[],brief:{...fake.brief,overview:themeSource.segments[1].text,detail:themeSource.segments[1].text,themes:['Risk detection'],sourceSegmentIds:['s1','s2']}};
const themeClaim=claimsForResult(themeValue).find(c=>c.id==='brief.theme.0');
themeValue.claimReview={version:GROUNDING_VERSION,claims:[{id:themeClaim.id,binding:claimBinding(themeClaim,themeSource),entailed:true,quotes:[{segmentId:'s2',text:'Audits can discover hidden hazards.'}]}]};
const themeIndex=buildSearchIndex(themeSource,{...themeValue,feedUrl:'fixture://owned'});
const topics=groundedTopics(themeValue,themeIndex);assert.equal(topics.length,1);assert.equal(topics[0].startMs,10000);assert.deepEqual(topics[0].sourceSegmentIds,['s2']);
assert.equal(deliveryValidation({...themeValue,topics},themeIndex).features.topics.state,'READY');
const preciseStore=new LocalStore(':memory:'),preciseLedger=new BudgetLedger({enabled:true,dailyUsd:.000001,monthlyUsd:.000001},preciseStore);
preciseLedger.reserve({id:'tiny',kind:'embedding',usd:.000001});preciseLedger.reconcile('tiny',{usd:.0000001,inputTokens:5});
assert.equal(preciseLedger.usage[0].usd,.0000001);assert.equal(preciseLedger.totals().day,.0000001);
assert.throws(()=>preciseLedger.reserve({id:'over-tiny',kind:'embedding',usd:.000001}),/budget/);preciseStore.close();
