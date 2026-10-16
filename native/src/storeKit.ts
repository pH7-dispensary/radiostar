import { Platform } from "react-native";
import type { Purchase } from "expo-iap";
import { listenerRequest } from "./listenerApi";

type Configuration = { enabled: boolean; productIds: string[]; appAccountToken: string; reason?: string };
/** No shared billing provider. Apple signs transactions; our server verifies current Apple status. */
export async function connectStoreKit(onVerified: () => void, onError: (message: string) => void) {
  const config: Configuration = await listenerRequest("/api/listener/subscriptions");
  if (!config.enabled || Platform.OS !== "ios")
    throw Error(config.reason || "Purchases require the signed iOS app.");
  const iap = await import("expo-iap");
  const verifying = new Set<string>();
  const verify = async (purchase: Purchase) => {
    if (verifying.has(purchase.id)) return;
    verifying.add(purchase.id);
    try {
      if (!config.productIds.includes(purchase.productId)) return;
      const signedTransaction = await iap.getTransactionJwsIOS(purchase.productId);
      if (!signedTransaction) throw Error("Apple transaction verification is pending. Try Restore Purchases again.");
      await listenerRequest("/api/listener/subscriptions/verify", { signedTransaction });
      await iap.finishTransaction({ purchase, isConsumable: false });
      onVerified();
    } finally { verifying.delete(purchase.id); }
  };
  const updated = iap.purchaseUpdatedListener(purchase => {
    void verify(purchase).catch(() => onError("Purchase verification could not finish. Restore Purchases to retry; you will not be charged again."));
  });
  const failed = iap.purchaseErrorListener(error => {
    if (!iap.isUserCancelledError(error)) onError(iap.getUserFriendlyErrorMessage(error));
  });
  try {
    await iap.initConnection();
    const products = await iap.fetchProducts({ skus: config.productIds, type: "subs" });
    return {
      products: products || [],
      purchase: async (sku: string) => {
        if (!config.productIds.includes(sku)) throw Error("This subscription is unavailable.");
        await iap.requestPurchase({ type: "subs", request: { apple: { sku, appAccountToken: config.appAccountToken } } });
      },
      restore: async () => {
        await iap.restorePurchases();
        for (const purchase of await iap.getAvailablePurchases()) await verify(purchase);
      },
      manage: () => iap.showManageSubscriptionsIOS(),
      close: async () => { updated.remove(); failed.remove(); await iap.endConnection(); },
    };
  } catch (error) {
    updated.remove(); failed.remove();
    await iap.endConnection().catch(() => {});
    throw error;
  }
}
