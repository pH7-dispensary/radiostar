import { readFileSync } from "node:fs";
import { SignedDataVerifier, AppStoreServerAPIClient, Environment } from "@apple/app-store-server-library";
import { ListenerError } from "./listener-service.mjs";

// StoreKit is deliberately independent of the free/referral allowance ledger.
export class SubscriptionService {
  constructor(store, { verifier, client, products = [], environment = "Sandbox", now = Date.now } = {}) {
    Object.assign(this, { store, verifier, client, products, environment, now });
  }
  get enabled() { return Boolean(this.verifier && this.client && this.products.length); }
  config(listener) {
    return { enabled: this.enabled, productIds: this.enabled ? this.products : [], appAccountToken: listener.id,
      entitlement: this.entitlement(listener), reason: this.enabled ? null : "Subscriptions are not available in this beta." };
  }
  entitlement(listener) {
    const records = this.store.all("subscription").map(([, v]) => v).filter(v => v.owner === listener.id);
    const active = records.filter(v => !v.revoked && v.expiresAt > this.now() &&
      [1, 4].includes(v.status) && this.now() - v.checkedAt < 3600_000).sort((a, b) => b.expiresAt - a.expiresAt)[0];
    return { active: Boolean(active), productId: active?.productId || null, expiresAt: active?.expiresAt || null,
      verificationRequired: records.some(v => this.now() - v.checkedAt >= 3600_000) };
  }
  async refresh(listener, signedTransaction) {
    if (!this.enabled) throw new ListenerError("Subscriptions are not configured.", 503);
    if (typeof signedTransaction !== "string" || signedTransaction.length > 50000)
      throw new ListenerError("A signed Apple transaction is required.");
    const transaction = await this.verifier.verifyAndDecodeTransaction(signedTransaction);
    this.validate(transaction, listener.id);
    // Never activate from a replayed client receipt alone: ask Apple for current status.
    const response = await this.client.getAllSubscriptionStatuses(transaction.originalTransactionId);
    let found = false;
    for (const group of response.data || []) for (const item of group.lastTransactions || []) {
      const current = await this.verifier.verifyAndDecodeTransaction(item.signedTransactionInfo);
      if (current.originalTransactionId !== transaction.originalTransactionId) continue;
      this.validate(current, listener.id);
      const renewal = item.signedRenewalInfo ? await this.verifier.verifyAndDecodeRenewalInfo(item.signedRenewalInfo) : null;
      this.save(current, renewal, item.status, listener.id);
      found = true;
    }
    if (!found) throw new ListenerError("Apple could not confirm this subscription.", 409);
    return this.entitlement(listener);
  }
  validate(tx, owner) {
    if (tx.bundleId !== "app.radiostar.ios" || tx.environment !== this.environment ||
      !this.products.includes(tx.productId) || tx.type !== "Auto-Renewable Subscription" ||
      tx.appAccountToken?.toLowerCase() !== owner.toLowerCase() ||
      !tx.originalTransactionId || !Number.isFinite(tx.expiresDate) || !Number.isFinite(tx.signedDate))
      throw new ListenerError("The Apple transaction does not match this listener or app.", 403);
  }
  save(tx, renewal, status, owner) {
    if (renewal && (renewal.originalTransactionId !== tx.originalTransactionId || renewal.environment !== this.environment))
      throw new ListenerError("Apple renewal information does not match.", 403);
    this.store.transaction(() => {
      if (!this.store.all("installation").some(([, value]) => value.id === owner && !value.revokedAt))
        throw new ListenerError("This listener profile is no longer active.", 401);
      const previous = this.store.get("subscription", tx.originalTransactionId);
      if (previous && previous.owner !== owner) throw new ListenerError("This subscription belongs to another profile.", 403);
      if (previous?.signedAt > tx.signedDate) return;
      this.store.set("subscription", tx.originalTransactionId, {
        owner, productId: tx.productId, signedAt: tx.signedDate, checkedAt: this.now(), status,
        expiresAt: status === 4 && Number.isFinite(renewal?.gracePeriodExpiresDate)
          ? renewal.gracePeriodExpiresDate : tx.expiresDate,
        revoked: Boolean(tx.revocationDate || status === 5),
        billingRetry: Boolean(renewal?.isInBillingRetryPeriod), autoRenewStatus: renewal?.autoRenewStatus ?? null,
      });
    });
  }
  async notification(signedPayload) {
    if (!this.enabled) throw new ListenerError("Subscriptions are not configured.", 503);
    if (typeof signedPayload !== "string" || signedPayload.length > 100000)
      throw new ListenerError("A signed Apple notification is required.");
    const notification = await this.verifier.verifyAndDecodeNotification(signedPayload);
    if (!notification.data?.signedTransactionInfo) return { accepted: true };
    const tx = await this.verifier.verifyAndDecodeTransaction(notification.data.signedTransactionInfo);
    const listener = this.store.all("installation").map(([,v]) => v).find(v => v.id === tx.appAccountToken && !v.revokedAt);
    if (!listener) return { accepted: true }; // Deleted profiles must never be resurrected.
    // Fetch current Apple state rather than applying out-of-order webhook events.
    await this.refresh(listener, notification.data.signedTransactionInfo);
    return { accepted: true };
  }
}

export function subscriptionsFromEnv(store, env) {
  if (env.STARCAST_STOREKIT_ENABLED !== "enabled") return new SubscriptionService(store);
  const products = (env.STARCAST_APPLE_PRODUCT_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
  const environment = env.STARCAST_APPLE_ENVIRONMENT;
  if (![Environment.SANDBOX, Environment.PRODUCTION].includes(environment) || !products.length ||
    !env.STARCAST_APPLE_ROOT_CA_FILES || !env.STARCAST_APPLE_PRIVATE_KEY_FILE ||
    !env.STARCAST_APPLE_KEY_ID || !env.STARCAST_APPLE_ISSUER_ID ||
    (environment === Environment.PRODUCTION && (!Number.isSafeInteger(Number(env.STARCAST_APPLE_APP_ID)) || Number(env.STARCAST_APPLE_APP_ID) <= 0)))
    throw Error("Complete verified Apple subscription configuration is required before enabling StoreKit.");
  const verifier = new SignedDataVerifier(env.STARCAST_APPLE_ROOT_CA_FILES.split(",").map(p => readFileSync(p)),
    true, environment, "app.radiostar.ios", environment === Environment.PRODUCTION ? Number(env.STARCAST_APPLE_APP_ID) : undefined);
  const client = new AppStoreServerAPIClient(readFileSync(env.STARCAST_APPLE_PRIVATE_KEY_FILE, "utf8"),
    env.STARCAST_APPLE_KEY_ID, env.STARCAST_APPLE_ISSUER_ID, "app.radiostar.ios", environment);
  return new SubscriptionService(store, { verifier, client, products, environment });
}
