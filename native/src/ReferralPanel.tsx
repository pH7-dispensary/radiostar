import { useEffect, useRef, useState } from "react";
import {
  Animated,
  AppState,
  Pressable,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import {
  loadListenerSummary,
  attributeInvite,
  type ListenerSummary,
} from "./listenerApi";
import { readLocalDocument, writeLocalDocument } from "./localStorage";
import { LoadingState, useReducedMotion } from "./LoadingState";
import { feedback } from "./feedback";
import type { StarTheme } from "./design";

export function InviteEntry({
  p,
  onBusyChange,
}: {
  p: StarTheme;
  onBusyChange: (busy: boolean) => void;
}) {
  const [code, setCode] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <TextInput
        accessibilityLabel="Optional invite code"
        placeholder="Have an invite code? Optional"
        placeholderTextColor={p.muted}
        value={code}
        onChangeText={setCode}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={40}
        style={{
          minHeight: 48,
          paddingHorizontal: 12,
          color: p.text,
          backgroundColor: p.surface,
          borderRadius: 14,
        }}
      />
      {code ? (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => {
            setBusy(true);
            onBusyChange(true);
            void attributeInvite(code)
              .then(() => {
                setMessage("Invite linked. You’re ready to listen.");
                feedback.success();
              })
              .catch((e) => setMessage(e.message))
              .finally(() => {
                setBusy(false);
                onBusyChange(false);
              });
          }}
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Text style={{ color: p.accent2 }}>Use invite</Text>
        </Pressable>
      ) : null}
      {busy && <LoadingState compact p={p} label="Linking your invite…" />}
      {!!message && (
        <Text accessibilityLiveRegion="polite" style={{ color: p.muted }}>
          {message}
        </Text>
      )}
    </View>
  );
}

export function ReferralPanel({ p }: { p: StarTheme }) {
  const [summary, setSummary] = useState<ListenerSummary | null>(null),
    [busy, setBusy] = useState(true),
    [message, setMessage] = useState(""),
    [stale, setStale] = useState(false),
    [details, setDetails] = useState(false);
  const pulse = useRef(new Animated.Value(1)).current,
    reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const alive = useRef(true),
    previous = useRef<number | null>(null),
    refreshing = useRef(false);
  const refresh = async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    setBusy(true);
    try {
      const next = await loadListenerSummary();
      if (!alive.current) return;
      const saved = await readLocalDocument("star-cast-listener-summary");
      if (!alive.current) return;
      const old =
        previous.current ??
        (saved ? (JSON.parse(saved) as ListenerSummary).earnedMinutes : null);
      if (old != null && next.earnedMinutes > old) {
        setMessage(
          `Your listening allowance grew by ${(next.earnedMinutes - old) / 60} hours every month.`,
        );
        feedback.success();
        if (!reducedRef.current)
          Animated.sequence([
            Animated.timing(pulse, {
              toValue: 1.04,
              duration: 160,
              useNativeDriver: true,
            }),
            Animated.timing(pulse, {
              toValue: 1,
              duration: 220,
              useNativeDriver: true,
            }),
          ]).start();
      }
      previous.current = next.earnedMinutes;
      setSummary(next);
      setStale(false);
      await writeLocalDocument(
        "star-cast-listener-summary",
        JSON.stringify(next),
      ).catch(() => {});
    } catch {
      if (alive.current) {
        setStale(true);
        setMessage(
          "Could not refresh your allowance. Reconnect and try again.",
        );
        const saved = await readLocalDocument("star-cast-listener-summary");
        if (saved && alive.current) {
          try {
            setSummary(JSON.parse(saved));
          } catch {
            /* A stale cache must not break Profile. */
          }
        }
      }
    } finally {
      refreshing.current = false;
      if (alive.current) setBusy(false);
    }
  };
  useEffect(() => {
    alive.current = true;
    void refresh();
    void readLocalDocument("star-cast-invite-message").then((value) => {
      if (value && alive.current) setMessage(value);
    });
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void refresh();
    });
    return () => {
      alive.current = false;
      pulse.stopAnimation();
      sub.remove();
    };
  }, []);
  const text = { color: p.muted, fontSize: 14, lineHeight: 21 };
  return (
    <LinearGradient
      colors={[p.wash, p.surfaceStrong]}
      style={{
        borderRadius: 24,
        borderWidth: 1,
        borderColor: p.line,
        padding: 20,
        gap: 14,
      }}
    >
      <Ionicons name="gift-outline" size={25} color={p.accent2} />
      <Text
        accessibilityRole="header"
        style={{
          color: p.text,
          fontSize: 24,
          fontWeight: "600",
          letterSpacing: -0.7,
        }}
      >
        Share the listening.
      </Text>
      <Text style={text}>
        Invite a friend. Each qualified referral adds five extra hours every
        month.
      </Text>
      {busy && !summary && (
        <LoadingState p={p} label="Finding your listening allowance…" />
      )}
      {summary && (
        <>
          <Animated.Text
            accessibilityLiveRegion="polite"
            style={{
              color: p.text,
              fontSize: 38,
              fontWeight: "600",
              letterSpacing: -1,
              transform: [{ scale: pulse }],
            }}
          >
            {summary.monthlyMinutes / 60}
            <Text style={{ fontSize: 17 }}> hours / month</Text>
          </Animated.Text>
          <Text style={text}>
            {(summary.remainingMinutes / 60).toFixed(1)} hours remaining ·
            resets{" "}
            {new Date(summary.resetAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
            {stale ? " · last synced" : ""}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18 }}>
            <Text style={text}>+{summary.earnedMinutes / 60} hours earned</Text>
            <Text style={text}>{summary.qualifiedReferrals} qualified</Text>
            <Text style={text}>{summary.pendingReferrals} pending</Text>
          </View>
          {summary.referralStatus && (
            <Text style={text}>
              Your invite:{" "}
              {summary.referralStatus === "qualified"
                ? "qualified"
                : `${summary.referralProgressMinutes.toFixed(0)} of ${summary.qualificationMinutes} verified minutes · identity review required`}
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            disabled={busy || stale}
            onPress={() => {
              void Share.share({
                message: `Share the listening with me on Radio Star. Invite code: ${summary.code}\n${summary.inviteUrl}`,
                ...(summary.webInviteAvailable
                  ? { url: summary.inviteUrl }
                  : {}),
              }).catch(() =>
                setMessage(
                  "Your invite could not be shared. Please try again.",
                ),
              );
            }}
            style={{
              backgroundColor: p.accent2,
              minHeight: 50,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 16,
              opacity: stale ? 0.5 : 1,
            }}
          >
            <Text style={{ color: p.onAccent, fontWeight: "700" }}>
              Invite a friend
            </Text>
          </Pressable>
          <Text selectable style={text}>
            {summary.webInviteAvailable ? "Invite code" : "Development invite"}{" "}
            · {summary.code}
          </Text>
          {!summary.verificationAvailable && (
            <Text style={text}>
              Rewards await verification. No unverified listening is deducted.
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: details }}
            onPress={() => setDetails(!details)}
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Text style={{ color: p.accent2 }}>
              {details ? "Less detail −" : "How invites work +"}
            </Text>
          </Pressable>
          {details && (
            <Text style={text}>
              A new listener links your code before onboarding, listens for 30
              verified minutes, and completes identity checks. Each qualified
              referral adds five hours every month, with no referral cap.{" "}
              {summary.webInviteAvailable
                ? "Your invite includes a web fallback."
                : "Development invites open an installed Radio Star build; no public download is available yet."}{" "}
              {!summary.friendBonusMinutes
                ? "The friend’s bonus has not been configured."
                : "The friend’s bonus expires at the next monthly reset."}{" "}
              No listening limit is enforced in this development build.
            </Text>
          )}
          {summary.pendingMinutes > 0 && (
            <Text style={text}>
              {summary.pendingMinutes.toFixed(1)} listening minutes awaiting
              verification
            </Text>
          )}
          {summary.friendBonusMinutes > 0 && (
            <Text style={text}>
              Your friend receives {summary.friendBonusMinutes} bonus minutes
              after qualification.
            </Text>
          )}
        </>
      )}
      {!!message && (
        <Text accessibilityLiveRegion="polite" style={text}>
          {message}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => void refresh()}
        style={{ minHeight: 44, justifyContent: "center" }}
      >
        <Text style={{ color: p.accent2 }}>
          {busy ? "Refreshing…" : "Refresh allowance"}
        </Text>
      </Pressable>
    </LinearGradient>
  );
}
