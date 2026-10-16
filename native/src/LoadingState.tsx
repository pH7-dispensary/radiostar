import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { StarTheme } from "./design";

export function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => live && setReduced(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduced;
}
/** Feedback, never a fabricated progress percentage. Stops when hidden or backgrounded. */
export function LoadingState({
  p,
  label = "Finding the ideas worth keeping.",
  compact = false,
  active = true,
}: {
  p: StarTheme;
  label?: string;
  compact?: boolean;
  active?: boolean;
}) {
  const opacity = useRef(new Animated.Value(0.7)).current;
  const reduced = useReducedMotion();
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) =>
      setForeground(s === "active"),
    );
    return () => sub.remove();
  }, []);
  useEffect(() => {
    opacity.setValue(0.7);
    if (reduced || !foreground || !active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.55,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, foreground, active, opacity]);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={{ paddingVertical: compact ? 8 : 18, gap: 12 }}
    >
      <Animated.View
        style={{
          opacity,
          gap: 10,
          flexDirection: compact ? "row" : "column",
          alignItems: compact ? "center" : "stretch",
        }}
      >
        <Ionicons name="sparkles" size={20} color={p.accent2} />
        {!compact &&
          [0.92, 1, 0.64].map((width) => (
            <View
              key={width}
              style={{
                width: `${width * 100}%`,
                height: 9,
                borderRadius: 5,
                backgroundColor: p.wash,
              }}
            />
          ))}
        {compact && (
          <Text style={{ color: p.muted, fontSize: 14, flexShrink: 1 }}>
            {label}
          </Text>
        )}
      </Animated.View>
      {!compact && (
        <Text style={{ color: p.muted, fontSize: 15, lineHeight: 22 }}>
          {label}
        </Text>
      )}
    </View>
  );
}
