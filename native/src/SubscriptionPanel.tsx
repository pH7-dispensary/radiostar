import { useEffect, useState } from "react";
import { Alert, Linking, Pressable, Text, View } from "react-native";
import { connectStoreKit } from "./storeKit";
import type { StarTheme } from "./design";

export function SubscriptionPanel({ p }: { p: StarTheme }) {
  const [connection, setConnection] = useState<Awaited<ReturnType<typeof connectStoreKit>> | null>(null);
  const [message, setMessage] = useState("Checking subscription availability…");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true, session: Awaited<ReturnType<typeof connectStoreKit>> | null = null;
    void connectStoreKit(() => { if (alive) { setMessage("Apple purchase verified."); setBusy(false); } },
      error => { if (alive) { setMessage(error); setBusy(false); } })
      .then(async value => { session = value; if (!alive) await value.close(); else { setConnection(value); setMessage(""); } })
      .catch(error => { if (alive) setMessage(error instanceof Error ? error.message : "Subscriptions are temporarily unavailable."); });
    return () => { alive = false; void session?.close(); };
  }, []);
  const action = (task: () => Promise<unknown>) => {
    setBusy(true);
    void task().catch(error => Alert.alert("Purchase could not finish", error instanceof Error ? error.message : "Please try again."))
      .finally(() => setBusy(false));
  };
  return <View style={{ gap: 12 }}>
    {!!message && <Text accessibilityLiveRegion="polite" style={{ color: p.muted, lineHeight: 21 }}>{message}</Text>}
    {connection?.products.map(product => <View key={product.id} style={{ gap: 8 }}>
      <Text style={{ color: p.text, fontWeight: "700" }}>{product.title}</Text>
      <Text style={{ color: p.muted }}>{product.description}</Text>
      <Pressable accessibilityRole="button" disabled={busy} style={{ minHeight: 44, justifyContent: "center" }}
        onPress={() => action(() => connection.purchase(product.id))}>
        <Text style={{ color: p.accent2 }}>Subscribe · {product.displayPrice}{"subscriptionPeriodUnitIOS" in product
          ? ` / ${product.subscriptionPeriodNumberIOS || 1} ${product.subscriptionPeriodUnitIOS || "billing period"}` : ""}</Text>
      </Pressable>
    </View>)}
    {connection && <>
      <Text style={{ color: p.muted, lineHeight: 21 }}>Auto-renews unless cancelled in your Apple account. Your free and earned referral allowances remain separate.</Text>
      <Pressable accessibilityRole="button" disabled={busy} style={{ minHeight: 44, justifyContent: "center" }}
        onPress={() => action(async () => { await connection.restore(); setMessage("Restore checked with Apple. Only verified subscriptions linked to this listener profile can be restored."); })}>
        <Text style={{ color: p.accent2 }}>{busy ? "Checking with Apple…" : "Restore Purchases"}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" style={{ minHeight: 44, justifyContent: "center" }} onPress={() => action(connection.manage)}>
        <Text style={{ color: p.accent2 }}>Manage Apple subscriptions</Text>
      </Pressable>
    </>}
    <Pressable accessibilityRole="link" style={{ minHeight: 44, justifyContent: "center" }}
      onPress={() => { void Linking.openURL("https://www.getradiostar.com/terms").catch(() => Alert.alert("Terms", "https://www.getradiostar.com/terms")); }}>
      <Text style={{ color: p.accent2 }}>Subscription terms ↗</Text>
    </Pressable>
  </View>;
}
