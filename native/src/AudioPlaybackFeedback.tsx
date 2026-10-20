import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { StarTheme } from "./design";
import type { AudioFeedback } from "./playbackPresentation.mjs";
import { useReducedMotion } from "./LoadingState";

export function AudioWaitingRing({ p, waiting }: { p: StarTheme; waiting: boolean }) {
  const reduced = useReducedMotion();
  if (!waiting) return null;
  return <View pointerEvents="none" accessible={false} style={{ position: "absolute", inset: -6, borderRadius: 999, borderWidth: 2, borderColor: p.accent2, alignItems: "center", justifyContent: "center" }}>
    {!reduced && <ActivityIndicator color={p.accent2} size="large" />}
  </View>;
}
export function AudioPlaybackFeedback({ p, audio, onRetry }: { p: StarTheme; audio: AudioFeedback; onRetry: () => void }) {
  if (!audio.label) return null;
  return <View style={{ alignItems: "center", marginTop: 8, gap: 4 }}>
    <Text accessibilityLiveRegion="polite" style={{ color: p.muted, fontSize: 13, lineHeight: 19, textAlign: "center" }}>{audio.label}</Text>
    {audio.state === "FAILED" && <Pressable accessibilityRole="button" onPress={onRetry} style={{ minHeight: 44, paddingHorizontal: 18, justifyContent: "center" }}>
      <Text style={{ color: p.accent2, fontWeight: "700" }}>Retry audio</Text>
    </Pressable>}
  </View>;
}
