import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, AppState, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { IntelligenceStatus } from "./api";
import type { StarTheme } from "./design";
import { intelligencePresentation } from "./intelligencePresentation.mjs";
import { useReducedMotion } from "./LoadingState";
import { readLocalDocument, writeLocalDocument } from "./localStorage";

const introductionKey = "star-cast-intelligence-introduction-v1";

export function ProcessingMark({ p, stage, active, ready }: {
  p: StarTheme; stage: string; active: boolean; ready: boolean;
}) {
  const reduced = useReducedMotion();
  const value = useRef(new Animated.Value(0)).current;
  const previousReady = useRef(ready);
  const [foreground, setForeground] = useState(AppState.currentState !== "background" && AppState.currentState !== "inactive");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setForeground(state === "active"));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    value.setValue(0);
    const justReady = ready && !previousReady.current;
    previousReady.current = ready;
    if (reduced || !foreground || (!active && !justReady)) return;
    const duration = justReady ? 180 : stage === "QUEUED" ? 2200 : stage === "TRANSCRIBING" ? 650 : stage === "INDEXING" ? 850 : 1300;
    const cycle = Animated.sequence([
      Animated.timing(value, { toValue: 1, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true, isInteraction: false }),
      Animated.timing(value, { toValue: 0, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true, isInteraction: false }),
    ]);
    const animation = justReady || stage === "INDEXING" ? cycle : Animated.loop(cycle);
    animation.start();
    return () => animation.stop();
  }, [active, foreground, ready, reduced, stage, value]);
  return (
    <View style={styles.mark} accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Animated.View style={[styles.ring, { borderColor: p.accent2, opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.58] }), transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.05] }) }] }]} />
      <View style={[styles.innerRing, { borderColor: p.line, backgroundColor: p.surfaceStrong }]}>
        <Animated.View style={{ opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }), transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [1, stage === "ANALYSING" ? 1.12 : 1.04] }) }] }}>
          <Ionicons name={ready ? "checkmark" : "sparkles"} size={19} color={p.accent2} />
        </Animated.View>
      </View>
      {stage === "TRANSCRIBING" && active && <View style={styles.waveform}>
        {[0.5, 0.85, 1, 0.65, 0.4].map((height) => <Animated.View key={height} style={{ width: 3, height: 12, borderRadius: 2, backgroundColor: p.accent2, transform: [{ scaleY: value.interpolate({ inputRange: [0, 1], outputRange: [height * 0.5, height] }) }] }} />)}
      </View>}
    </View>
  );
}

export function EpisodeIntelligenceStatus({ p, status, enabled = true, error = "", paused = false, busy = false, onAction, onDiscover, introduction = false, sourceAvailable = true }: {
  p: StarTheme; status: IntelligenceStatus | null; enabled?: boolean; error?: string; paused?: boolean; busy?: boolean;
  onAction?: (action: "enable" | "refresh" | "prepare" | "retry" | "audio") => void; introduction?: boolean;
  sourceAvailable?: boolean;
  onDiscover?: () => void;
}) {
  const model = intelligencePresentation(status, { enabled, error, paused, sourceAvailable });
  const [expanded, setExpanded] = useState(false);
  const [showIntroduction, setShowIntroduction] = useState(false);
  const previous = useRef(model.state);
  useEffect(() => {
    if (previous.current !== model.state && Platform.OS === "ios")
      AccessibilityInfo.announceForAccessibility(model.label);
    previous.current = model.state;
  }, [model.state, model.label]);
  useEffect(() => {
    if (!introduction || !enabled) return;
    let alive = true;
    void readLocalDocument(introductionKey).then((saved) => {
      if (alive && !saved) setShowIntroduction(true);
    }).catch(() => {});
    return () => { alive = false; };
  }, [introduction, enabled]);
  const actionLabels = { enable: "Turn on intelligence", refresh: "Check status", prepare: "Prepare episode", retry: "Try again", audio: "Review audio preparation" };
  return (
    <View testID="episode-intelligence-status" style={[styles.card, { backgroundColor: p.wash, borderColor: p.line }]}>
      <View style={styles.row}>
        <ProcessingMark p={p} stage={model.state} active={model.processing} ready={model.ready} />
        <View style={styles.copy}>
          <Text accessibilityLiveRegion="polite" style={[styles.title, { color: p.text }]}>{model.label}</Text>
          {model.progress && <Text style={[styles.detail, { color: p.muted }]}>{model.progress}</Text>}
          {(model.processing || model.state === "WAITING") && <Text style={[styles.detail, { color: p.muted }]}>{model.eta || (model.state === "QUEUED" ? "Waiting to begin preparation." : model.processing ? "Preparing your conversation." : model.explanation)}</Text>}
        </View>
      </View>
      {!model.processing && !model.ready && model.state !== "WAITING" && (
        <>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={styles.link}>
            <Text style={[styles.linkText, { color: p.accent2 }]}>What’s happening?</Text>
            <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={p.accent2} />
          </Pressable>
          {expanded && <Text style={[styles.detail, { color: p.muted }]}>{model.explanation}</Text>}
        </>
      )}
      {model.action && onAction && <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => onAction(model.action!)} style={[styles.action, { borderColor: p.line, opacity: busy ? 0.55 : 1 }]}>
        <Text style={[styles.linkText, { color: p.accent2 }]}>{busy ? "Checking…" : actionLabels[model.action]}</Text>
      </Pressable>}
      {!model.processing && !model.ready && onDiscover && <Pressable accessibilityRole="button" accessibilityLabel="Explore AI-ready episodes" onPress={onDiscover} style={styles.link}>
        <Text style={[styles.linkText, { color: p.accent2 }]}>Explore AI-ready episodes</Text>
        <Ionicons name="arrow-forward" size={16} color={p.accent2} />
      </Pressable>}
      {showIntroduction && <View style={[styles.introduction, { borderTopColor: p.line }]}>
        <Text style={[styles.detail, { color: p.muted }]}>Radio Star prepares AI insights for eligible conversations. Your podcast keeps playing while intelligence is prepared.</Text>
        <Pressable accessibilityRole="button" onPress={() => {
          setShowIntroduction(false);
          void writeLocalDocument(introductionKey, "seen").catch(() => {});
        }} style={styles.link}><Text style={[styles.linkText, { color: p.accent2 }]}>Got it</Text></Pressable>
      </View>}
    </View>
  );
}
const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 4, marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  mark: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", width: 46, height: 46, borderRadius: 23, borderWidth: 1 },
  innerRing: { width: 33, height: 33, borderWidth: 1, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  waveform: { position: "absolute", bottom: -3, flexDirection: "row", alignItems: "center", gap: 2 },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 15, lineHeight: 21, fontWeight: "700" },
  detail: { fontSize: 13, lineHeight: 19 },
  link: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  linkText: { fontSize: 13, fontWeight: "700", flexShrink: 1 },
  action: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 44, justifyContent: "center", alignSelf: "flex-start", marginTop: 4 },
  introduction: { borderTopWidth: 1, paddingTop: 10, marginTop: 6 },
});
