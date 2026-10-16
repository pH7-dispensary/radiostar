import assert from "node:assert/strict";
import { LocalStore } from "./persistence.mjs";
import { SubscriptionService, subscriptionsFromEnv } from "./subscriptions.mjs";
const store = new LocalStore(":memory:");
let now = 1000000, status = 1, revoked = false, fails = false;
const listener = { id: "11111111-1111-4111-8111-111111111111" };
store.set("installation", "credential", listener);
const tx = { bundleId: "app.radiostar.ios", environment: "Sandbox", productId: "test-only-product",
  type: "Auto-Renewable Subscription", appAccountToken: listener.id, originalTransactionId: "chain", expiresDate: now + 10000, signedDate: now };
const verifier = {
  verifyAndDecodeTransaction: async value => { if (value !== "valid") throw Error("Invalid signature"); return { ...tx, signedDate: now, revocationDate: revoked ? now : undefined }; },
  verifyAndDecodeRenewalInfo: async () => ({ originalTransactionId: "chain", environment: "Sandbox", gracePeriodExpiresDate: now + 20000, isInBillingRetryPeriod: status === 3 }),
  verifyAndDecodeNotification: async value => { if(value !== "signed-notification") throw Error("Invalid notification"); return { data: { signedTransactionInfo: "valid" } }; },
};
const client = { getAllSubscriptionStatuses: async () => { if(fails) throw Error("Apple unavailable"); return { data: [{lastTransactions:[{ signedTransactionInfo:"valid", signedRenewalInfo:"renewal", status }]}] }; } };
const billing = new SubscriptionService(store, { verifier, client, products: [tx.productId], now: () => now });
assert.equal(subscriptionsFromEnv(store, {}).enabled, false);
await assert.rejects(billing.refresh(listener, "forged"));
await assert.rejects(billing.refresh({id:"different-owner"}, "valid"));
assert.equal((await billing.refresh(listener, "valid")).active, true);
assert.equal(store.all("allowance-ledger").length, 0);
status=3; assert.equal((await billing.refresh(listener, "valid")).active, false, "billing retry without grace grants no access");
status=4; assert.equal((await billing.refresh(listener, "valid")).active, true, "verified grace");
revoked=true; status=5; await billing.notification("signed-notification");
assert.equal(billing.entitlement(listener).active, false);
revoked=false; status=1; await billing.refresh(listener,"valid");
now += 3600001; assert.equal(billing.entitlement(listener).active, false, "stale verification fails closed");
fails=true; await assert.rejects(billing.refresh(listener,"valid"));
await assert.rejects(billing.notification("forged"));
store.delete("installation","credential");
assert.deepEqual(await billing.notification("signed-notification"), {accepted:true});
store.close();
console.log("Mocked Apple verification, ownership, renewal, grace, refund, expiry, restore boundaries and failure checks passed.");
