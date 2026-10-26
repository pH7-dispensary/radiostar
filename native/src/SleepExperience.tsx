import { useEffect, useRef, useState } from "react";
import {
  Animated,
  AppState,
  Easing,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { themes, type StarTheme } from "./design";
import { useReducedMotion } from "./LoadingState";
import { nativeSleepAvailable } from "./nativeSleep";
import type { AiSleepSession } from "./sleepBridge";

export type SleepViewState =
  "READY" | "SETTLING" | "LIKELY_ASLEEP" | "FADING" | "PAUSED" | "STOPPED" | "ERROR";
export const manualTimerMinutes = [5, 10, 15, 20, 30, 45, 60, 90];
const clock = (ms: number) =>
  `${Math.floor(Math.max(0, ms) / 60000)}:${String(Math.floor(Math.max(0, ms) / 1000) % 60).padStart(2, "0")}`;

function SleepSignal({
  active,
  visible,
  session,
}: {
  active: boolean;
  visible: boolean;
  session: AiSleepSession | null;
}) {
  const phase = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) =>
      setForeground(next === "active"),
    );
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!active || !visible || !foreground || reduced) {
      phase.stopAnimation();
      phase.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(phase, {
          toValue: 1,
          duration: 4200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(phase, {
          toValue: 0,
          duration: 4200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, visible, foreground, reduced, phase]);
  const settled = session
    ? Math.min(
        1,
        Math.max(
          0,
          (Date.now() - session.startedAt) /
            Math.max(1, session.earliestPauseAt - session.startedAt),
        ),
      )
    : 0;
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={s.signal}
      testID="sleep-signal"
    >
      {[0, 1, 2].map((ring) => (
        <Animated.View
          key={ring}
          style={[
            s.ring,
            {
              width: 174 + ring * 30,
              height: 174 + ring * 30,
              borderRadius: 120,
              opacity: phase.interpolate({
                inputRange: [0, 1],
                outputRange: [
                  0.15 - ring * 0.035,
                  (0.35 - ring * 0.07) * (1 - settled * 0.4),
                ],
              }),
              transform: [
                {
                  scale: phase.interpolate({
                    inputRange: [0, 1],
                    outputRange: [
                      1,
                      1 + (0.025 + ring * 0.01) * (1 - settled * 0.6),
                    ],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
      <Animated.View
        style={{
          opacity: phase.interpolate({
            inputRange: [0, 1],
            outputRange: [0.83, 1 - settled * 0.08],
          }),
          transform: [
            {
              scale: phase.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.025 - settled * 0.015],
              }),
            },
          ],
        }}
      >
        <Image
          source={require("../assets/radio-star-icon.png")}
          style={s.brand}
          accessibilityIgnoresInvertColors
        />
      </Animated.View>
    </View>
  );
}

export function AiSleepScreen({
  visible,
  onClose,
  state,
  session,
  message,
  onStart,
  onStop,
  onExtend,
  onResume,
  onInteraction,
  p,
}: {
  visible: boolean;
  onClose: () => void;
  state: SleepViewState;
  session: AiSleepSession | null;
  message: string;
  onStart: () => void;
  onStop: () => void;
  onExtend: (minutes: number) => void;
  onResume: () => void;
  onInteraction?: () => void;
  p: StarTheme;
}) {
  const active = ["SETTLING","LIKELY_ASLEEP","FADING"].includes(state),
    paused = state === "PAUSED";
  const colors = active || paused ? themes.night : p;
  const reduced = useReducedMotion();
  const [now, setNow] = useState(Date.now()),
    [info, setInfo] = useState(false);
  useEffect(() => {
    if (!visible || !active) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [visible, active]);
  const title = active
    ? "Settle into listening."
    : paused
      ? "Audio paused."
      : state === "STOPPED"
        ? "Your session has ended."
        : state === "ERROR"
          ? "Let’s get you settled."
          : "A quieter kind of listening.";
  return (
    <Modal
      visible={visible}
      animationType={reduced ? "none" : "slide"}
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[s.safe, { backgroundColor: colors.bg }]}>
        <View style={s.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close AI Sleep"
            onPress={onClose}
            style={[s.icon, { borderColor: colors.line }]}
          >
            <Ionicons name="chevron-down" size={24} color={colors.text} />
          </Pressable>
          <Text style={[s.kicker, { color: colors.muted }]}>AI SLEEP</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="AI Sleep session information"
            accessibilityState={{ expanded: info }}
            onPress={() => setInfo(!info)}
            style={[s.icon, { borderColor: colors.line }]}
          >
            <Ionicons
              name="information-outline"
              size={22}
              color={colors.text}
            />
          </Pressable>
        </View>
        <ScrollView onTouchStart={onInteraction}
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
        >
          <Text
            accessibilityLiveRegion="polite"
            style={[s.status, { color: colors.accent2 }]}
          >
            {active ? state.replaceAll("_"," ") : paused ? "PAUSE TRIGGERED" : state}
          </Text>
          <Text
            accessibilityRole="header"
            style={[s.title, { color: colors.text }]}
          >
            {title}
          </Text>
          <Text style={[s.copy, { color: colors.muted }]}>
            {active
              ? "Keep listening. Add a little time whenever you need it."
              : paused
                ? "Your place is saved. Resume when you’re ready."
                : "A gentle, private wind-down, tuned by your listening preferences."}
          </Text>
          <SleepSignal active={active} visible={visible} session={session} />
          {active && session && (
            <View style={[s.session, { borderColor: colors.line }]}>
              <Text style={[s.sessionTime, { color: colors.text }]}>
                Session running · {clock(now - session.startedAt)}
              </Text>
              <Text style={[s.copy, { color: colors.muted }]}>
                {session.fallbackDeadlineAt ? `Fade and pause by ${new Date(session.fallbackDeadlineAt).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}.` : now < session.earliestPauseAt
                  ? `Pause protection until ${new Date(session.earliestPauseAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
                  : "AI Sleep is monitoring your session."}
              </Text>
              <Text style={[s.small, { color: colors.muted }]}>
                A minimum listening window, not a prediction of when you fall
                asleep.
              </Text>
            </View>
          )}
          {message && state === "ERROR" ? (
            <Text
              accessibilityRole="alert"
              style={[s.copy, { color: colors.text }]}
            >
              {message}
            </Text>
          ) : null}
          {active && (
            <View style={s.extensions}>
              {[5, 15, 30].map((minutes) => (
                <Pressable
                  key={minutes}
                  accessibilityRole="button"
                  accessibilityLabel={`Extend AI Sleep by ${minutes} minutes`}
                  onPress={() => onExtend(minutes)}
                  style={[
                    s.extension,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.line,
                    },
                  ]}
                >
                  <Text style={[s.extensionText, { color: colors.text }]}>
                    +{minutes}
                  </Text>
                  <Text style={[s.small, { color: colors.muted }]}>
                    minutes
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              active
                ? "Stop AI Sleep"
                : paused
                  ? "Resume playback"
                  : "Start AI Sleep"
            }
            onPress={active ? onStop : paused ? onResume : onStart}
            style={s.primary}
          >
            <LinearGradient
              colors={[colors.accent2, colors.accent2]}
              style={s.primaryFill}
            >
              <Ionicons
                name={
                  active ? "stop-outline" : paused ? "play" : "moon-outline"
                }
                size={20}
                color={colors.onAccent}
              />
              <Text style={[s.primaryText, { color: colors.onAccent }]}>
                {active
                  ? "Stop AI Sleep"
                  : paused
                    ? "Resume playback"
                    : "Start AI Sleep"}
              </Text>
            </LinearGradient>
          </Pressable>
          {info && (
            <View
              style={[
                s.info,
                { backgroundColor: colors.surface, borderColor: colors.line },
              ]}
            >
              <Text style={[s.sessionTime, { color: colors.text }]}>
                How this session works
              </Text>
              <Text style={[s.copy, { color: colors.muted }]}>
                Timing preferences stay on this device. Extensions and morning
                feedback adjust the minimum listening window. There is no
                physiological sleep detection or sensitivity sensor.
              </Text>
              <Text style={[s.copy, { color: colors.muted }]}>
                {nativeSleepAvailable ? "The local model observes while active. A native adaptive deadline fades and pauses the same player while background audio runs. Interruptions cancel the session; force-quitting stops playback. Physical-device validation is still pending." : "This build supports foreground sleep only. Locked-screen deadlines require the next native release; Expo Go cannot load the custom native module."} A restarted app never silently resumes an old sleep session.
              </Text>
              <Text style={[s.copy, { color: colors.muted }]}>
                If a pause is triggered, audio fades for 45 seconds. You can
                return to five minutes before the pause from the player.
              </Text>
            </View>
          )}
          <Text style={[s.small, { color: colors.muted, textAlign: "center" }]}>
            On-device preferences. Your global appearance stays unchanged.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  kicker: { fontSize: 12, fontWeight: "700", letterSpacing: 2 },
  content: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 16,
    alignItems: "center",
  },
  status: { fontSize: 11, fontWeight: "800", letterSpacing: 2 },
  title: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "700",
    letterSpacing: -1,
    textAlign: "center",
    maxWidth: 360,
  },
  copy: { fontSize: 15, lineHeight: 22, textAlign: "center" },
  small: { fontSize: 12, lineHeight: 18 },
  signal: {
    width: 246,
    height: 246,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: { position: "absolute", borderWidth: 1, borderColor: "#A99AFF" },
  brand: { width: 116, height: 116, borderRadius: 26 },
  session: {
    width: "100%",
    borderTopWidth: 1,
    paddingTop: 16,
    gap: 8,
    alignItems: "center",
  },
  sessionTime: { fontSize: 16, fontWeight: "600" },
  extensions: { width: "100%", flexDirection: "row", gap: 10 },
  extension: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  extensionText: { fontSize: 20, fontWeight: "600" },
  primary: { width: "100%", borderRadius: 22, overflow: "hidden" },
  primaryFill: {
    minHeight: 56,
    padding: 16,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
  },
  primaryText: { fontSize: 16, fontWeight: "700" },
  info: { borderRadius: 20, borderWidth: 1, padding: 18, gap: 12 },
});
