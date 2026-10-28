import { createHash } from "node:crypto";
import { transcriptFingerprint } from "./intelligence-delivery.mjs";
import { rankMoments, lexicalRank } from "./retrieval.mjs";
export const SEMANTIC_VERSION = "embedding-3-small-512-v2",
  EMBEDDING_MODEL = "text-embedding-3-small",
  DIMENSIONS = 512;
const hash = (s) => createHash("sha256").update(s).digest("hex");
export function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) return 0;
    dot += a[i] * b[i];
    aa += a[i] ** 2;
    bb += b[i] ** 2;
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
export class SemanticSearch {
  constructor({ requests, store }) {
    Object.assign(this, { requests, store });
    this.inflight = new Map();
  }
  async embed(texts, { sourceKey = null } = {}) {
    if (
      !texts.length ||
      texts.length > 32 ||
      texts.some((s) => !s.trim() || Buffer.byteLength(s) > 8000)
    )
      throw Error("EMBEDDING_INPUT_LIMIT");
    const key = `${sourceKey || "query"}:${SEMANTIC_VERSION}:${hash(JSON.stringify(texts))}`,
      bytes = texts.reduce((n, s) => n + Buffer.byteLength(s), 0);
    const response = await this.requests.request({
      key,
      sourceKey,
      kind: "embedding",
      ceiling: Math.max(0.000001, bytes * 0.00000002),
      invoke: (client) =>
        client.embeddings.create(
          {
            model: EMBEDDING_MODEL,
            dimensions: DIMENSIONS,
            input: texts,
            encoding_format: "float",
          },
          { signal: AbortSignal.timeout(15000) },
        ),
      actualCost: (r) => r.usage.total_tokens * 0.00000002,
    });
    if (response.data?.length !== texts.length)
      throw Error("INVALID_EMBEDDING_RESPONSE");
    return response.data.map((row, i) => {
      if (
        row.index !== i ||
        row.embedding?.length !== DIMENSIONS ||
        row.embedding.some((v) => !Number.isFinite(v)) ||
        !row.embedding.some((v) => v !== 0)
      )
        throw Error("INVALID_EMBEDDING_VECTOR");
      return row.embedding;
    });
  }
  async build(index, options = {}) {
    const id = options.key;
    if (this.inflight.has(id)) return this.inflight.get(id);
    const work = this.buildStage(index, options).finally(() =>
      this.inflight.delete(id),
    );
    this.inflight.set(id, work);
    return work;
  }
  async buildStage(index, { key, maxBatches = 8 } = {}) {
    if (!this.requests.canPersist(key)) throw Error("RIGHTS_REVOKED");
    const previous = this.store.get("semantic-index", key);
    if (
      previous?.version === SEMANTIC_VERSION &&
      previous.fingerprint === index.fingerprint &&
      previous.state === "READY" &&
      validSemanticIndex(previous, index)
    )
      return previous;
    // Split unusually long canonical segments into bounded embedding inputs;
    // every chunk retains the same original source ID/timestamps.
    const inputs = [];
    for (const s of index.segments.filter(
      (s) => (s.contentType || "conversation") === "conversation",
    )) {
      let text = "",
        bytes = 0;
      for (const char of s.speaker && !/^SPEAKER[_\s-]?\d+$/i.test(s.speaker)
        ? s.speaker + ": " + s.text
        : s.text) {
        const size = Buffer.byteLength(char);
        if (bytes + size > 7500) {
          inputs.push({ id: s.id, text });
          text = "";
          bytes = 0;
        }
        text += char;
        bytes += size;
      }
      if (text.trim()) inputs.push({ id: s.id, text });
    }
    const resumable =
      previous?.version === SEMANTIC_VERSION &&
      previous.fingerprint === index.fingerprint &&
      previous.state === "BUILDING" &&
      previous.total === inputs.length &&
      validRows(previous, index) &&
      previous.checksum === semanticChecksum(previous);
    const rows = resumable ? [...previous.rows] : [];
    let cursor = resumable ? previous.cursor : 0;
    // Persist intent before the first paid batch. If it fails or the worker
    // restarts, automatic follow recovery can find this index and resume it.
    // The provider request ledger still controls retries and unknown outcomes.
    if (!resumable && inputs.length) {
      const initial = { version: SEMANTIC_VERSION, fingerprint: index.fingerprint,
        cursor: 0, total: inputs.length, rows: [], state: "BUILDING", builtAt: new Date().toISOString() };
      initial.checksum = semanticChecksum(initial);
      this.store.set("semantic-index", key, initial);
    }
    for (let batch = 0; cursor < inputs.length && batch < maxBatches; batch++) {
      const chunk = inputs.slice(cursor, cursor + 32),
        vectors = await this.embed(
          chunk.map((s) => s.text),
          { sourceKey: key },
        );
      if (!this.requests.canPersist(key)) throw Error("RIGHTS_REVOKED");
      const current = this.store.get("search-index", key);
      const canonical = this.store.get("intelligence", key)?.transcript;
      if ((current?.version === index.version && current.fingerprint !== index.fingerprint) || (canonical && transcriptFingerprint(canonical) !== index.fingerprint))
        throw Error("SOURCE_CHANGED");
      rows.push(
        ...chunk.map((s, i) => ({ segmentId: s.id, vector: vectors[i] })),
      );
      cursor += chunk.length;
      const next = {
        version: SEMANTIC_VERSION,
        fingerprint: index.fingerprint,
        cursor,
        total: inputs.length,
        rows,
        state: cursor === inputs.length ? "READY" : "BUILDING",
        builtAt: new Date().toISOString(),
      };
      next.checksum = semanticChecksum(next);
      this.store.set("semantic-index", key, next);
    }
    return this.store.get("semantic-index", key);
  }
  async query(text) {
    return (await this.embed([text]))[0];
  }
}
export const semanticChecksum = (x) =>
  hash(JSON.stringify([x.version, x.fingerprint, x.cursor, x.total, x.rows]));
function validRows(value, index) {
  const ids = new Set((index.segments || []).map(s => s.id));
  return (
    Array.isArray(value?.rows) &&
    Number.isInteger(value.cursor) &&
    Number.isInteger(value.total) &&
    value.total > 0 &&
    value.cursor >= 0 &&
    value.cursor <= value.total &&
    value.rows.length === value.cursor &&
    value.rows.every(
      (r) =>
        ids.has(r.segmentId) &&
        r.vector?.length === DIMENSIONS &&
        r.vector.every(Number.isFinite) &&
        r.vector.some((v) => v !== 0),
    )
  );
}
export function validSemanticIndex(value, index) {
  return Boolean(
    value?.state === "READY" &&
      value.version === SEMANTIC_VERSION &&
      value.fingerprint === index.fingerprint &&
      validRows(value, index) &&
      value.cursor === value.total &&
      value.checksum === semanticChecksum(value),
  );
}
export function hybridSemanticRetrieve(
  index,
  query,
  vector,
  semantic,
  { limit = 5, threshold = 0.35, mode = "semantic" } = {},
) {
  if (!validSemanticIndex(semantic, index))
    return rankMoments(index, query, limit);
  const lexical = lexicalRank(index, query),
    lex = new Map(lexical.map((r) => [r.id, r])),
    similarity = new Map();
  for (const r of semantic.rows)
    similarity.set(
      r.segmentId,
      Math.max(similarity.get(r.segmentId) || 0, cosine(vector, r.vector)),
    );
  const rows = index.segments
    .map((s) => {
      const c = similarity.get(s.id) || 0,
        l = lex.get(s.id);
      return {
        ...s,
        semantic: c,
        score:
          mode === "semantic" ? c : c * 0.7 + Math.min(1, l?.score || 0) * 0.3,
        lexical: l?.score || 0,
      };
    })
    .filter(
      (r) =>
        r.semantic >= threshold &&
        (mode === "semantic" || r.semantic >= 0.45 || r.lexical > 0),
    )
    .sort((a, b) => b.score - a.score);
  return rows.slice(0, limit).map((s, i) => ({
    rank: i + 1,
    label: i ? "RELATED MOMENT" : "MOST LIKELY",
    segmentId: s.id,
    startMs: s.startMs ?? null,
    endMs: s.endMs ?? null,
    context: s.text,
    score: s.score,
    confidence: s.score,
    sourceTranscriptVersion: index.transcriptVersion,
    retrievalVersion: SEMANTIC_VERSION,
  }));
}
