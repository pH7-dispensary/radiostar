import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { processingLabel, type IntelligenceStatus } from "./api";
import type { StarTheme } from "./design";
import { useReducedMotion } from "./LoadingState";

const activeStates = new Set([
  "CHECKING",
  "QUEUED",
  "ACQUIRING_TRANSCRIPT",
  "TRANSCRIBING",
  "ANALYSING",
  "INDEXING",
  // Kept for an installed client that receives a pre-Phase-4 response while
  // the backend rolls forward.
  "PROCESSING",
  "DISCOVERING",
  "UNDERSTANDING",
  "ORGANISING",
]);

function stageKind(status: IntelligenceStatus | null) {
  const state = status?.state;
  if (state === "TRANSCRIBING") return "waveform";
  if (state === "ANALYSING" || state === "UNDERSTANDING") return "constellation";
  if (state === "INDEXING" || state === "ORGANISING") return "settling";
  return "rings";
}

/**
 * Shared, state-backed preparation surface. It intentionally has no progress
 * percentage: each visual change reflects the server's recorded job stage.
 */
export function IntelligencePreparation({
  p,
  status,
  compact = false,
}: {
  p: StarTheme;
  status: IntelligenceStatus | null;
  compact?: boolean;
}) {
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(0)).current;
  const orbit = useRef(new Animated.Value(0)).current;
  const wave = useRef(new Animated.Value(0)).current;
  const state = status?.state || "CHECKING";
  const active = activeStates.has(state) && status?.processing !== false;
  const kind = stageKind(status);
  const label = processingLabel(status);
  const detail = status?.estimatedCompletion?.label || "Preparation continues even if you close Radio Star.";
  const accessibilityLabel = `${label} ${status?.estimatedCompletion?.label || ""}`.trim();

  useEffect(() => {
    pulse.setValue(0);
    orbit.setValue(0);
    wave.setValue(0);
    if (reduced || !active) return;
    const breathing = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    const orbiting = Animated.loop(
      Animated.timing(orbit, { toValue: 1, duration: kind === "constellation" ? 4800 : 6800, easing: Easing.linear, useNativeDriver: true }),
    );
    const waving = Animated.loop(
      Animated.sequence([
        Animated.timing(wave, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(wave, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    breathing.start();
    if (kind === "constellation") orbiting.start();
    if (kind === "waveform") waving.start();
    return () => {
      breathing.stop();
      orbiting.stop();
      waving.stop();
    };
  }, [active, kind, orbit, pulse, reduced, wave]);

  const ringStyle = useMemo(() => ({
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.32, 0.78] }),
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.05] }) }],
  }), [pulse]);
  const constellationStyle = useMemo(() => ({
    transform: [{ rotate: orbit.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }],
  }), [orbit]);

  return (
    <LinearGradient
      colors={[p.wash, p.surfaceStrong]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      style={[styles.surface, compact && styles.compact, { borderColor: p.line }]}
    >
      <View style={styles.visual} accessible={false}>
        {kind === "waveform" ? (
          <View style={styles.waveform}>
            {[0.48, 0.8, 1, 0.68, 0.42].map((height, index) => (
              <Animated.View
                key={height}
                style={[
                  styles.wave,
                  {
                    backgroundColor: p.accent2,
                    transform: [{ scaleY: wave.interpolate({ inputRange: [0, 1], outputRange: [Math.max(0.35, height - 0.28), height] }) }],
                    opacity: 0.62 + index * 0.06,
                  },
                ]}
              />
            ))}
          </View>
        ) : (
          <>
            <Animated.View style={[styles.ring, styles.outerRing, ringStyle, { borderColor: p.accent2 }]} />
            <Animated.View style={[styles.ring, styles.innerRing, ringStyle, { borderColor: p.accent }]} />
            {kind === "constellation" && (
              <Animated.View style={[styles.constellation, constellationStyle]}>
                <View style={[styles.dot, styles.dotOne, { backgroundColor: p.accent2 }]} />
                <View style={[styles.dot, styles.dotTwo, { backgroundColor: p.accent }]} />
                <View style={[styles.dot, styles.dotThree, { backgroundColor: p.accent2 }]} />
              </Animated.View>
            )}
            <View style={[styles.star, { backgroundColor: p.surfaceStrong, borderColor: p.line }]}>
              <Ionicons name="sparkles" size={compact ? 20 : 26} color={p.accent2} />
            </View>
          </>
        )}
      </View>
      <View style={styles.copy}>
        <Text accessibilityLiveRegion="polite" style={[styles.label, { color: p.text }]}>{label}</Text>
        {!compact && <Text style={[styles.detail, { color: p.muted }]}>{detail}</Text>}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  surface: { borderWidth: 1, borderRadius: 22, minHeight: 148, padding: 18, flexDirection: "row", alignItems: "center", gap: 16, overflow: "hidden" },
  compact: { minHeight: 72, borderRadius: 16, paddingVertical: 12 },
  visual: { width: 88, height: 88, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  ring: { position: "absolute", borderWidth: 1.5, borderRadius: 999 },
  outerRing: { width: 80, height: 80 },
  innerRing: { width: 58, height: 58 },
  star: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, minWidth: 0, gap: 5 },
  label: { fontSize: 16, fontWeight: "700", lineHeight: 22 },
  detail: { fontSize: 13, lineHeight: 19 },
  waveform: { height: 48, width: 76, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  wave: { width: 6, height: 38, borderRadius: 999 },
  constellation: { position: "absolute", width: 88, height: 88 },
  dot: { position: "absolute", width: 7, height: 7, borderRadius: 99 },
  dotOne: { top: 5, left: 41 },
  dotTwo: { right: 7, bottom: 20 },
  dotThree: { left: 10, bottom: 16 },
});
