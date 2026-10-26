// Derived text work shares the existing authoritative ledger and unknown-outcome
// rules. No retry loop, separate allowance or transcript acquisition is added.
export class DerivedRequests {
  constructor({
    store,
    ledger,
    client,
    beforePaid = () => {},
    canPersist = () => true,
    maxRunUsd = Infinity,
  }) {
    Object.assign(this, {
      store,
      ledger,
      client,
      beforePaid,
      canPersist,
      maxRunUsd,
    });
    this.inflight = new Map();
    this.reservedRunUsd = 0;
  }
  async request({ key, ceiling, kind, sourceKey = null, invoke, actualCost }) {
    if (this.inflight.has(key)) return this.inflight.get(key);
    const work = this.perform({
      key,
      ceiling,
      kind,
      sourceKey,
      invoke,
      actualCost,
    }).finally(() => this.inflight.delete(key));
    this.inflight.set(key, work);
    return work;
  }
  async perform({ key, ceiling, kind, sourceKey, invoke, actualCost }) {
    const saved = this.store.get("derived-provider", key);
    if (saved?.state === "READY") {
      if (!this.canPersist(sourceKey)) throw Error("RIGHTS_REVOKED");
      return saved.response;
    }
    if (
      !sourceKey &&
      this.store.all("derived-provider").filter(([, r]) => !r.sourceKey)
        .length >= 500
    )
      throw Error("QUERY_CACHE_CAPACITY");
    if (saved)
      throw Object.assign(
        Error(
          "Derived provider outcome requires review; automatic replay is blocked.",
        ),
        { code: "PROVIDER_OUTCOME_UNKNOWN" },
      );
    if (
      !Number.isFinite(ceiling) ||
      ceiling <= 0 ||
      ceiling > 0.04 ||
      this.reservedRunUsd + ceiling > this.maxRunUsd
    )
      throw Error("DERIVED_RUN_BUDGET_EXHAUSTED");
    this.beforePaid(sourceKey);
    if (!this.canPersist(sourceKey)) throw Error("RIGHTS_REVOKED");
    const id = `derived:${key}`;
    this.store.transaction(() => {
      if (this.store.get("derived-provider", key))
        throw Error("DUPLICATE_DERIVED_REQUEST");
      this.ledger.reserve({ id, usd: ceiling, kind, episodeKey: sourceKey });
      this.store.set("derived-provider", key, {
        state: "SENDING",
        sourceKey,
        at: new Date().toISOString(),
      });
    });
    this.reservedRunUsd += ceiling;
    let accounted = false;
    try {
      const response = await invoke(this.client),
        usd = actualCost(response);
      if (!Number.isFinite(usd) || usd < 0 || usd > ceiling)
        throw Error("INVALID_PROVIDER_USAGE");
      this.store.transaction(() => {
        this.ledger.reconcile(id, {
          usd,
          inputTokens:
            response.usage?.input_tokens || response.usage?.total_tokens || 0,
          outputTokens: response.usage?.output_tokens || 0,
        });
        if (this.canPersist(sourceKey))
          this.store.set("derived-provider", key, {
            state: "READY",
            sourceKey,
            response,
            at: new Date().toISOString(),
          });
        else this.store.delete("derived-provider", key);
      });
      accounted = true;
      this.reservedRunUsd -= ceiling - usd;
      if (!this.canPersist(sourceKey)) throw Error("RIGHTS_REVOKED");
      return response;
    } catch (error) {
      if (!accounted)
        this.ledger.reconcile(id, {
          usd: ceiling,
          failed: true,
          uncertain: true,
        });
      throw error;
    }
  }
}
