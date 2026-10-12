import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Modal,
  PanResponder,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  PlaybackProvider,
  usePlayback,
  type Source,
} from "./src/PlaybackProvider";
import {
  loadFeed,
  loadIntelligenceStatus,
  searchCatalogue,
  type CatalogueEpisode,
  type CatalogueShow,
  type IntelligenceStatus,
} from "./src/api";
import {
  emptyListenerState,
  loadListenerState,
  recordHistory,
  saveListenerState,
  toggleById,
  type ListenerState,
  type StoredEpisode,
} from "./src/listenerState";
import { NativeAiSleepBridge, NativeSleepTimer } from "./src/sleepBridge";
import { feedback } from "./src/feedback";
import { motion, themes, type StarTheme } from "./src/design";

type Page = "Listen" | "Following" | "Search" | "Library" | "Profile" | "Show";
type Theme = StarTheme;
const dark = themes.night;
const light = themes.day;
const format = (ms: number) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const asStored = (
  episode: CatalogueEpisode,
  show: CatalogueShow,
): StoredEpisode => ({
  ...episode,
  showId: show.id,
  showName: show.name,
  artworkUrl: show.art,
  feedUrl: show.feedUrl,
});
const artworkFallback =
  "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=400&q=80";

function Art({
  url,
  size = 56,
  radius = 15,
}: {
  url?: string;
  size?: number;
  radius?: number;
}) {
  return (
    <Image
      accessibilityLabel="Podcast artwork"
      source={{ uri: url || artworkFallback }}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: "#4B4655",
      }}
    />
  );
}
function Onboarding({ p, onDone }: { p: Theme; onDone: () => void }) {
  let cards = [
    [
      "◌",
      "Ad Skip",
      "Only activates after real-world audio validation. It stays off until then.",
    ],
    [
      "⌕",
      "Podcast Search",
      "Find live shows and publisher episodes without an account.",
    ],
    [
      "☾",
      "AI Sleep",
      "A private, on-device listening companion. Not physiological sleep detection.",
    ],
  ];
  return (
    <Modal visible transparent animationType="fade">
      <SafeAreaView style={styles.onboardingShade}>
        <View
          style={[
            styles.onboarding,
            { backgroundColor: p.bg, borderColor: p.line },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            onPress={onDone}
            style={styles.onboardingSkip}
          >
            <Text style={[styles.link, { color: p.muted }]}>Skip</Text>
          </Pressable>
          <Text style={[styles.eyebrow, { color: p.accent }]}>
            WELCOME TO STAR CAST
          </Text>
          <Text style={[styles.onboardingTitle, { color: p.text }]}>
            Listen{`\n`}beautifully.
          </Text>
          <Text style={[styles.onboardingCopy, { color: p.muted }]}>
            A private, considered home for podcasts worth your time.
          </Text>
          <View style={styles.onboardingCards}>
            {cards.map(([icon, title, copy]) => (
              <Glass key={title} p={p} style={styles.onboardingCard}>
                <Text style={[styles.onboardingIcon, { color: p.accent2 }]}>
                  {icon}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.onboardingCardTitle, { color: p.text }]}>
                    {title}
                  </Text>
                  <Text style={[styles.onboardingCardCopy, { color: p.muted }]}>
                    {copy}
                  </Text>
                </View>
              </Glass>
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onDone}
            style={[styles.primary, { backgroundColor: p.accent2 }]}
          >
            <Text style={styles.primaryText}>Start listening</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
function Discovery({
  state,
  setState,
  onOpen,
  p,
}: {
  state: ListenerState;
  setState: (next: ListenerState) => void;
  onOpen: (show: CatalogueShow) => void;
  p: Theme;
}) {
  let categories = [
      "Technology",
      "Science",
      "Business",
      "Comedy",
      "News",
      "Health",
      "History",
    ],
    [category, setCategory] = useState(categories[0]),
    [shows, setShows] = useState<CatalogueShow[]>([]),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setBusy(true);
    setError("");
    void searchCatalogue(category)
      .then((data) => {
        if (live) setShows(data.results.slice(0, 4));
      })
      .catch(() => {
        if (live)
          setError("Discovery is temporarily unavailable. Try Search instead.");
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [category]);
  return (
    <View style={styles.discovery}>
      <Text style={[styles.eyebrow, { color: p.accent }]}>
        EXPLORE BY INTEREST
      </Text>
      <Text style={[styles.discoveryTitle, { color: p.text }]}>
        Find your next obsession.
      </Text>
      <Text style={[styles.emptyCopy, { color: p.muted }]}>
        Fresh catalogue results from public podcast providers.
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipScroll}
      >
        {categories.map((item) => (
          <Chip
            key={item}
            label={item}
            active={category === item}
            onPress={() => setCategory(item)}
            p={p}
          />
        ))}
      </ScrollView>
      {busy ? (
        <Text style={[styles.emptyInline, { color: p.muted }]}>
          Finding real {category.toLowerCase()} shows…
        </Text>
      ) : null}
      {error ? <Text style={{ color: "#E78FA9" }}>{error}</Text> : null}
      <View style={styles.discoveryGrid}>
        {shows.map((show) => {
          let following = state.following.some((item) => item.id === show.id);
          return (
            <Glass key={show.id} p={p} style={styles.discoveryCard}>
              <Pressable onPress={() => onOpen(show)}>
                <Art url={show.art} size={112} radius={22} />
                <Text
                  numberOfLines={2}
                  style={[styles.showTitle, { color: p.text }]}
                >
                  {show.name}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[styles.small, { color: p.muted }]}
                >
                  {show.publisher}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  feedback.success();
                  setState({
                    ...state,
                    following: toggleById(state.following, show),
                  });
                }}
                style={[
                  styles.followPill,
                  {
                    borderColor: p.line,
                    backgroundColor: following ? p.wash : "transparent",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.followPillText,
                    { color: following ? p.text : p.accent2 },
                  ]}
                >
                  {following ? "Following" : "Follow"}
                </Text>
              </Pressable>
            </Glass>
          );
        })}
      </View>
      <Text style={[styles.tiny, { color: p.muted }]}>
        Browse a show to load its real publisher episodes before playing.
      </Text>
    </View>
  );
}
function Chip({
  label,
  active,
  onPress,
  disabled = false,
  p,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
  p: Theme;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={() => {
        feedback.selection();
        onPress();
      }}
      style={[
        styles.chip,
        {
          borderColor: p.line,
          backgroundColor: active ? p.accent2 : "transparent",
          opacity: disabled ? 0.45 : 1,
        },
      ]}
    >
      <Text style={[styles.chipText, { color: active ? "#fff" : p.muted }]}>
        {label}
      </Text>
    </Pressable>
  );
}
function Glass({
  children,
  p,
  style,
}: {
  children: React.ReactNode;
  p: Theme;
  style?: object;
}) {
  return (
    <LinearGradient
      colors={[p.surfaceStrong, p.surface]}
      start={{ x: 0.05, y: 0 }}
      end={{ x: 0.95, y: 1 }}
      style={[
        styles.glass,
        { borderColor: p.line, shadowColor: p.shadow },
        style,
      ]}
    >
      {children}
    </LinearGradient>
  );
}

function useReducedMotion() {
  let [reduced, setReduced] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    let subscription = AccessibilityInfo.addEventListener?.(
      "reduceMotionChanged",
      setReduced,
    );
    return () => subscription?.remove();
  }, []);
  return reduced;
}
function SwipeBack({
  onBack,
  children,
}: {
  onBack: () => void;
  children: React.ReactNode;
}) {
  let responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dx > 26 && Math.abs(gesture.dy) < 22,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > 88) onBack();
      },
    }),
  ).current;
  return <View {...responder.panHandlers}>{children}</View>;
}
function Section({
  title,
  action,
  children,
  p,
}: {
  title: string;
  action?: string;
  children: React.ReactNode;
  p: Theme;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: p.text }]}>{title}</Text>
        {action ? (
          <Text style={[styles.small, { color: p.muted }]}>{action}</Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}
function EpisodeRow({
  episode,
  onPress,
  p,
  saved,
  onSave,
}: {
  episode: StoredEpisode;
  onPress: () => void;
  p: Theme;
  saved?: boolean;
  onSave?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Play ${episode.title}`}
      onPress={onPress}
      style={[styles.episode, { borderBottomColor: p.line }]}
    >
      <Art url={episode.artworkUrl} size={55} radius={14} />
      <View style={styles.episodeBody}>
        <Text
          numberOfLines={2}
          style={[styles.episodeTitle, { color: p.text }]}
        >
          {episode.title}
        </Text>
        <Text numberOfLines={1} style={[styles.small, { color: p.muted }]}>
          {episode.showName} ·{" "}
          {episode.duration || episode.publishedAt || "Publisher episode"}
        </Text>
      </View>
      {onSave ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={saved ? "Remove saved episode" : "Save episode"}
          hitSlop={8}
          onPress={onSave}
          style={styles.saveButton}
        >
          <Text
            style={[styles.saveIcon, { color: saved ? p.accent : p.muted }]}
          >
            {saved ? "♥" : "♡"}
          </Text>
        </Pressable>
      ) : (
        <Text style={[styles.playGlyph, { color: p.text }]}>▶</Text>
      )}
    </Pressable>
  );
}

function LivingSleep({ p, active }: { p: Theme; active: boolean }) {
  let phase = useRef(new Animated.Value(0)).current;
  let reducedMotion = useReducedMotion();
  useEffect(() => {
    if (!active || reducedMotion) {
      phase.stopAnimation();
      return;
    }
    let loop = Animated.loop(
      Animated.sequence([
        Animated.timing(phase, {
          toValue: 1,
          duration: motion.major * 6,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(phase, {
          toValue: 0,
          duration: motion.major * 6,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, phase, reducedMotion]);
  let points = Array.from({ length: 28 }, (_, i) => {
    let a = (i / 28) * Math.PI * 2,
      r = 42 + (i % 5) * 9;
    let drift = phase.interpolate({
      inputRange: [0, 1],
      outputRange: [-5 + (i % 3) * 2, 5 - (i % 4)],
    });
    return (
      <Animated.View
        key={i}
        style={[
          styles.sleepPoint,
          {
            backgroundColor: i % 4 === 0 ? p.accent2 : p.text,
            opacity: i % 4 === 0 ? 0.85 : 0.5,
            transform: [
              {
                translateX: Animated.add(
                  new Animated.Value(Math.cos(a) * r),
                  drift,
                ),
              },
              { translateY: new Animated.Value(Math.sin(a) * r) },
            ],
          },
        ]}
      />
    );
  });
  return (
    <View
      accessibilityLabel="AI Sleep animation"
      style={[styles.organism, { backgroundColor: p.wash }]}
    >
      <View style={[styles.orbit, { borderColor: p.accent2 }]} />
      {points}
      <View
        style={[
          styles.core,
          { backgroundColor: p.surfaceStrong, borderColor: p.line },
        ]}
      >
        <Text style={{ color: p.accent2, fontSize: 25 }}>✦</Text>
      </View>
    </View>
  );
}

function AmbientBackdrop({ p }: { p: Theme }) {
  let drift = useRef(new Animated.Value(0)).current;
  let reducedMotion = useReducedMotion();
  useEffect(() => {
    if (reducedMotion) return;
    let animation = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 18000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 18000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [drift, reducedMotion]);
  let x = drift.interpolate({ inputRange: [0, 1], outputRange: [-10, 12] });
  return (
    <View pointerEvents="none" style={styles.ambientLayer}>
      <Animated.View
        style={[
          styles.ambientOne,
          { backgroundColor: p.wash, transform: [{ translateX: x }] },
        ]}
      />
      <Animated.View
        style={[
          styles.ambientTwo,
          { backgroundColor: p.accent2, transform: [{ translateX: x }] },
        ]}
      />
    </View>
  );
}

function TimerSheet({
  visible,
  onClose,
  onSet,
  p,
}: {
  visible: boolean;
  onClose: () => void;
  onSet: (minutes: number | "end") => void;
  p: Theme;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.timerShade}>
        <SafeAreaView
          style={[
            styles.timerSheet,
            { backgroundColor: p.bg, borderColor: p.line },
          ]}
        >
          <View style={styles.timerSheetHeader}>
            <Text style={[styles.sectionTitle, { color: p.text }]}>
              Sleep Timer
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              style={[styles.roundButton, { borderColor: p.line }]}
            >
              <Text style={{ color: p.text, fontSize: 18 }}>×</Text>
            </Pressable>
          </View>
          <Text style={[styles.emptyCopy, { color: p.muted }]}>
            Pause playback when you’re ready.
          </Text>
          <View style={styles.timerOptionGrid}>
            {[10, 15, 20, 30, 45, 60].map((minutes) => (
              <Pressable
                key={minutes}
                onPress={() => {
                  onSet(minutes);
                  onClose();
                }}
                style={[
                  styles.timerOption,
                  { backgroundColor: p.surface, borderColor: p.line },
                ]}
              >
                <Text style={[styles.timerOptionText, { color: p.text }]}>
                  {minutes} min
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={() => {
              onSet("end");
              onClose();
            }}
            style={styles.endEpisode}
          >
            <Text style={[styles.link, { color: p.accent2 }]}>
              End of episode
            </Text>
          </Pressable>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
function AiSleepScreen({
  visible,
  onClose,
  active,
  earliestPauseAt,
  onStart,
  onStop,
  onExtend,
  p,
}: {
  visible: boolean;
  onClose: () => void;
  active: boolean;
  earliestPauseAt: number | null;
  onStart: () => void;
  onStop: () => void;
  onExtend: (minutes: number) => void;
  p: Theme;
}) {
  let earliest = earliestPauseAt
    ? new Date(earliestPauseAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.aiSafe, { backgroundColor: p.bg }]}>
        <View
          pointerEvents="none"
          style={[styles.aiAmbient, { backgroundColor: p.wash }]}
        />
        <View style={styles.aiHeader}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            style={[styles.aiBack, { borderColor: p.line }]}
          >
            <Text style={[styles.link, { color: p.text }]}>‹ Back</Text>
          </Pressable>
          {active ? (
            <Pressable
              onPress={onStop}
              accessibilityRole="button"
              style={[styles.stopButton, { borderColor: p.line }]}
            >
              <Text style={[styles.stopText, { color: p.text }]}>
                Stop AI Sleep
              </Text>
            </Pressable>
          ) : (
            <View style={styles.stopButton} />
          )}
        </View>
        <View style={styles.aiScreenContent}>
          <Text style={[styles.eyebrow, { color: p.accent }]}>AI SLEEP</Text>
          <Text style={[styles.aiScreenTitle, { color: p.text }]}>
            {active ? "AI Sleep active" : "Sleep, beautifully."}
          </Text>
          <Text style={[styles.aiScreenCopy, { color: p.muted }]}>
            {active
              ? "Listening quietly. You can keep adding time whenever you need it."
              : "One tap starts your private listening companion."}
          </Text>
          <LivingSleep p={p} active={active} />
          {active && earliest ? (
            <Glass p={p} style={styles.earliestCard}>
              <Text style={[styles.eyebrow, { color: p.accent }]}>
                EARLIEST PAUSE
              </Text>
              <Text style={[styles.earliestTime, { color: p.text }]}>
                {earliest}
              </Text>
              <Text style={[styles.small, { color: p.muted }]}>
                AI Sleep will never pause before this time.
              </Text>
            </Glass>
          ) : null}
          {active ? (
            <View style={styles.aiExtensions}>
              {[5, 15, 30].map((minutes) => (
                <Pressable
                  key={minutes}
                  accessibilityRole="button"
                  onPress={() => onExtend(minutes)}
                  style={[
                    styles.aiExtension,
                    { backgroundColor: p.surface, borderColor: p.line },
                  ]}
                >
                  <Text style={[styles.aiExtensionText, { color: p.text }]}>
                    +{minutes}
                  </Text>
                  <Text style={[styles.small, { color: p.muted }]}>
                    minutes
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Pressable
              onPress={onStart}
              accessibilityRole="button"
              style={[styles.aiStart, { backgroundColor: p.accent2 }]}
            >
              <Text style={styles.primaryText}>Start AI Sleep</Text>
            </Pressable>
          )}
          <Text style={[styles.aiPrivacy, { color: p.muted }]}>
            Personalised on this device. No physiological sleep detection or
            continuous motion recording.
          </Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function PlayerSheet({
  visible,
  onClose,
  p,
}: {
  visible: boolean;
  onClose: () => void;
  p: Theme;
}) {
  let { source, snapshot, play, pause, seek, setSpeed, fadeAndPause } =
      usePlayback(),
    timer = useRef<NativeSleepTimer | null>(null),
    ai = useRef<NativeAiSleepBridge | null>(null),
    [timerOpen, setTimerOpen] = useState(false),
    [aiScreenOpen, setAiScreenOpen] = useState(false),
    [aiActive, setAiActive] = useState(false),
    [earliestPauseAt, setEarliestPauseAt] = useState<number | null>(null),
    [intelligence, setIntelligence] = useState<IntelligenceStatus | null>(null),
    [notice, setNotice] = useState("");
  useEffect(() => {
    timer.current = new NativeSleepTimer(pause);
    ai.current = new NativeAiSleepBridge(fadeAndPause);
    return () => timer.current?.cancel();
  }, [pause, fadeAndPause]);
  useEffect(() => {
    if (
      snapshot.durationMs &&
      snapshot.positionMs >= snapshot.durationMs - 1000 &&
      !snapshot.playing
    )
      timer.current?.onEpisodeEnd();
  }, [snapshot.durationMs, snapshot.positionMs, snapshot.playing]);
  useEffect(() => {
    let live = true;
    if (!source?.feedUrl) {
      setIntelligence(null);
      return;
    }
    setIntelligence(null);
    void loadIntelligenceStatus(source.feedUrl, source.episodeId)
      .then((status) => live && setIntelligence(status))
      .catch(
        () =>
          live &&
          setIntelligence({
            state: "FAILED",
            reason: "Episode intelligence is temporarily unavailable.",
          }),
      );
    return () => {
      live = false;
    };
  }, [source?.episodeId, source?.feedUrl]);
  if (!source) return null;
  let percent = snapshot.durationMs
    ? Math.min(100, (snapshot.positionMs / snapshot.durationMs) * 100)
    : 0;
  let setTimer = (minutes: number) => {
    timer.current?.start({ kind: "minutes", minutes });
    setNotice(`Sleep Timer set for ${minutes} minutes.`);
  };
  let extend = (minutes: number) => {
    try {
      let session = ai.current?.extend(minutes);
      setEarliestPauseAt(session?.earliestPauseAt || null);
      setNotice(`AI Sleep will not pause for another ${minutes} minutes.`);
      feedback.success();
    } catch {
      setNotice("Start AI Sleep first.");
    }
  };
  let startAi = () => {
    let session = ai.current?.start();
    setAiActive(true);
    setEarliestPauseAt(session?.earliestPauseAt || null);
    setNotice("AI Sleep active. Listening continues.");
    feedback.success();
  };
  let stopAi = () => {
    ai.current?.stop();
    setAiActive(false);
    setEarliestPauseAt(null);
    setNotice("AI Sleep stopped. Playback continues.");
    feedback.light();
  };
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.modalSafe, { backgroundColor: p.bg }]}>
        <ScrollView contentContainerStyle={styles.playerSheet}>
          <View style={styles.sheetHeader}>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={[styles.roundButton, { borderColor: p.line }]}
            >
              <Ionicons name="chevron-down" size={22} color={p.text} />
            </Pressable>
            <Text style={[styles.eyebrow, { color: p.accent }]}>
              NOW PLAYING
            </Text>
            <View style={styles.roundButton} />
          </View>
          <View style={[styles.playerArtwork, { backgroundColor: p.wash }]}>
            <Art url={source.artworkUrl} size={240} radius={28} />
          </View>
          <Text
            numberOfLines={2}
            style={[styles.playerTitle, { color: p.text }]}
          >
            {source.title}
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.playerShow, { color: p.muted }]}
          >
            {source.show}
            {snapshot.buffered ? " · Buffering…" : ""}
          </Text>
          <Pressable
            accessibilityRole="adjustable"
            accessibilityLabel="Playback position"
            onPress={() =>
              seek(
                snapshot.durationMs
                  ? Math.min(snapshot.durationMs, snapshot.positionMs + 15_000)
                  : snapshot.positionMs,
              )
            }
            style={[styles.progressTouch, { backgroundColor: p.line }]}
          >
            <View
              style={[
                styles.progressFill,
                { backgroundColor: p.accent2, width: `${percent}%` },
              ]}
            />
          </Pressable>
          <View style={styles.timeRow}>
            <Text style={[styles.small, { color: p.muted }]}>
              {format(snapshot.positionMs)}
            </Text>
            <Text style={[styles.small, { color: p.muted }]}>
              {snapshot.durationMs ? format(snapshot.durationMs) : "--:--"}
            </Text>
          </View>
          <View style={styles.transport}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back 15 seconds"
              onPress={() => seek(snapshot.positionMs - 15_000)}
              style={styles.transportSide}
            >
              <Text style={{ color: p.text, fontSize: 19 }}>↶ 15</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={snapshot.playing ? "Pause" : "Play"}
              onPress={() => {
                feedback.light();
                snapshot.playing ? pause() : play(source);
              }}
              style={[styles.playButton, { backgroundColor: p.text }]}
            >
              <Ionicons
                name={snapshot.playing ? "pause" : "play"}
                size={22}
                color={p.bg}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Forward 30 seconds"
              onPress={() => seek(snapshot.positionMs + 30_000)}
              style={styles.transportSide}
            >
              <Text style={{ color: p.text, fontSize: 19 }}>30 ↷</Text>
            </Pressable>
          </View>
          <View style={styles.speedRow}>
            {[0.75, 1, 1.25, 1.5, 2].map((speed) => (
              <Chip
                key={speed}
                label={`${speed}×`}
                active={snapshot.speed === speed}
                p={p}
                onPress={() => setSpeed(speed)}
              />
            ))}
          </View>
          <View style={styles.playerTools}>
            {["AI Episode Brief", "Explore Episode", "Ad Skip"].map((label) => (
              <Pressable
                key={label}
                onPress={() =>
                  setNotice(
                    `${label} is available only when this episode has verified processing.`,
                  )
                }
                style={[styles.tool, { borderColor: p.line }]}
              >
                <Ionicons
                  name={
                    label === "Ad Skip"
                      ? "shield-checkmark-outline"
                      : label === "Explore Episode"
                        ? "compass-outline"
                        : "sparkles"
                  }
                  size={18}
                  color={p.accent2}
                />
                <Text style={[styles.toolText, { color: p.text }]}>
                  {label}
                </Text>
                <Text style={[styles.small, { color: p.muted }]}>
                  {label === "AI Episode Brief"
                    ? intelligence?.state === "READY"
                      ? "Ready"
                      : intelligence?.readiness
                        ? "Transcript found"
                        : intelligence?.state === "FAILED"
                          ? "Unavailable"
                          : "Not analysed"
                    : "Unavailable"}
                </Text>
              </Pressable>
            ))}
          </View>
          {intelligence?.brief ? (
            <Glass p={p} style={styles.briefCard}>
              <Text style={[styles.eyebrow, { color: p.accent }]}>
                AI EPISODE BRIEF
              </Text>
              <Text style={[styles.briefOverview, { color: p.text }]}>
                {intelligence.brief.overview}
              </Text>
              <Text style={[styles.small, { color: p.muted }]}>
                {intelligence.brief.themes.join(" · ")}
              </Text>
            </Glass>
          ) : intelligence?.readiness || source.hasPublisherTranscript ? (
            <Text style={[styles.notice, { color: p.muted }]}>
              Publisher transcript available. Analysis remains off until
              authorised on this server.
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => setTimerOpen(true)}
            style={[
              styles.sleepEntry,
              { backgroundColor: p.wash, borderColor: p.line },
            ]}
          >
            <Text style={[styles.sleepEntryTitle, { color: p.text }]}>
              <Ionicons name="moon-outline" size={18} color={p.text} /> Sleep
              Timer
            </Text>
            <Text style={[styles.small, { color: p.muted }]}>Set a pause</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setAiScreenOpen(true)}
            style={[styles.aiSleepEntry, { backgroundColor: p.accent2 }]}
          >
            <Text style={styles.aiSleepEntryTitle}>
              <Ionicons name="sparkles" size={17} color="#fff" />{" "}
              {aiActive ? "AI Sleep active" : "AI Sleep"}
            </Text>
            <Text style={styles.aiSleepEntryCopy}>
              {aiActive
                ? "Keep listening"
                : "Fall asleep. We’ll take care of the rest."}
            </Text>
          </Pressable>
          {notice ? (
            <Text style={[styles.notice, { color: p.muted }]}>{notice}</Text>
          ) : null}
        </ScrollView>
        <TimerSheet
          visible={timerOpen}
          p={p}
          onClose={() => setTimerOpen(false)}
          onSet={(value) => {
            if (value === "end") {
              timer.current?.start({ kind: "end_of_episode" });
              setNotice("Sleep Timer will pause at the end of this episode.");
            } else setTimer(value);
          }}
        />
        <AiSleepScreen
          visible={aiScreenOpen}
          p={p}
          onClose={() => setAiScreenOpen(false)}
          active={aiActive}
          earliestPauseAt={earliestPauseAt}
          onStart={startAi}
          onStop={stopAi}
          onExtend={extend}
        />
      </SafeAreaView>
    </Modal>
  );
}

function MiniPlayer({ onOpen, p }: { onOpen: () => void; p: Theme }) {
  let { source, snapshot, play, pause } = usePlayback();
  if (!source) return null;
  return (
    <BlurView
      intensity={42}
      tint={p.blurTint}
      style={[styles.mini, { borderColor: p.line, shadowColor: p.shadow }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open now playing"
        onPress={onOpen}
        style={styles.miniInner}
      >
        <Art url={source.artworkUrl} size={42} radius={12} />
        <View style={styles.miniCopy}>
          <Text numberOfLines={1} style={[styles.miniTitle, { color: p.text }]}>
            {source.title}
          </Text>
          <Text numberOfLines={1} style={[styles.small, { color: p.muted }]}>
            {source.show}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={snapshot.playing ? "Pause" : "Play"}
          onPress={(event) => {
            event.stopPropagation();
            feedback.light();
            snapshot.playing ? pause() : play(source);
          }}
          style={[styles.miniPlay, { backgroundColor: p.text }]}
        >
          <Ionicons
            name={snapshot.playing ? "pause" : "play"}
            size={16}
            color={p.bg}
          />
        </Pressable>
      </Pressable>
    </BlurView>
  );
}

function Listen({
  state,
  setState,
  onPlay,
  onOpen,
  p,
}: {
  state: ListenerState;
  setState: (next: ListenerState) => void;
  onPlay: (e: StoredEpisode) => void;
  onOpen: (show: CatalogueShow) => void;
  p: Theme;
}) {
  let [filter, setFilter] = useState("Recent"),
    [popular, setPopular] = useState("Week"),
    publisherEpisodes = Object.values(state.feedEpisodes).flat(),
    uniqueEpisodes = publisherEpisodes.filter(
      (episode, index, list) =>
        list.findIndex((item) => item.id === episode.id) === index,
    ),
    episodes = uniqueEpisodes;
  if (filter === "Popular")
    episodes = [...uniqueEpisodes].sort(
      (a, b) =>
        state.history.filter((item) => item.id === b.id).length -
        state.history.filter((item) => item.id === a.id).length,
    );
  if (filter === "Best Rated") episodes = [];
  let forYou = uniqueEpisodes
    .filter((episode) => !state.history.some((item) => item.id === episode.id))
    .slice(0, 3);
  return (
    <>
      <Text style={[styles.eyebrow, { color: p.accent }]}>
        YOUR LISTENING SPACE
      </Text>
      <View style={styles.listenHeading}>
        <View>
          <Text style={[styles.display, { color: p.text }]}>
            Listen{`\n`}beautifully.
          </Text>
        </View>
        <View style={[styles.lighting, { backgroundColor: p.wash }]} />
      </View>
      {!state.following.length ? (
        <Discovery state={state} setState={setState} onOpen={onOpen} p={p} />
      ) : state.history[0] ? (
        <Pressable
          onPress={() => onPlay(state.history[0])}
          style={[styles.continueCard, { borderColor: p.line }]}
        >
          <LinearGradient
            colors={[p.wash, p.surfaceStrong]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.continueCardInner}
          >
            <Art url={state.history[0].artworkUrl} size={88} radius={21} />
            <View style={styles.continueBody}>
              <Text style={[styles.eyebrow, { color: p.accent }]}>
                CONTINUE LISTENING
              </Text>
              <Text
                numberOfLines={2}
                style={[styles.continueTitle, { color: p.text }]}
              >
                {state.history[0].title}
              </Text>
              <Text
                numberOfLines={1}
                style={[styles.small, { color: p.muted }]}
              >
                {state.history[0].showName}
              </Text>
            </View>
            <Ionicons name="play" size={19} color={p.text} />
          </LinearGradient>
        </Pressable>
      ) : (
        <Glass p={p} style={styles.emptyHero}>
          <Text style={[styles.emptyIcon, { color: p.accent2 }]}>◌</Text>
          <Text style={[styles.emptyTitle, { color: p.text }]}>
            Your next great listen is waiting.
          </Text>
          <Text style={[styles.emptyCopy, { color: p.muted }]}>
            Search the live podcast catalogue to begin.
          </Text>
        </Glass>
      )}
      <Section
        title="Your Episodes"
        action={
          state.following.length ? `${state.following.length} shows` : undefined
        }
        p={p}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipScroll}
        >
          {["Recent", "Best Rated", "Popular"].map((item) => (
            <Chip
              key={item}
              label={item}
              active={filter === item}
              onPress={() => setFilter(item)}
              p={p}
            />
          ))}
        </ScrollView>
        {filter === "Popular" ? (
          <View style={styles.subFilters}>
            {["Week", "Month"].map((item) => (
              <Chip
                key={item}
                label={item}
                active={popular === item}
                onPress={() => setPopular(item)}
                p={p}
              />
            ))}
          </View>
        ) : null}
        {episodes.length ? (
          episodes
            .slice(0, 5)
            .map((episode) => (
              <EpisodeRow
                key={episode.id}
                episode={episode}
                onPress={() => onPlay(episode)}
                p={p}
              />
            ))
        ) : (
          <Text style={[styles.emptyInline, { color: p.muted }]}>
            {filter === "Best Rated"
              ? "Verified ratings are not available from your connected publisher feeds."
              : "Open a followed show once to cache its real publisher episodes here."}
          </Text>
        )}
      </Section>
      <Section title="For You" action="From your library" p={p}>
        {forYou.length ? (
          <>
            <Text style={[styles.feedCaption, { color: p.muted }]}>
              Latest from followed publishers
            </Text>
            {forYou.map((episode) => (
              <EpisodeRow
                key={episode.id}
                episode={episode}
                onPress={() => onPlay(episode)}
                p={p}
              />
            ))}
          </>
        ) : (
          <Text style={[styles.emptyInline, { color: p.muted }]}>
            Follow shows in Search to make this personal. Star Cast does not
            invent recommendations.
          </Text>
        )}
      </Section>
    </>
  );
}

function Following({
  state,
  onOpen,
  onDiscover,
  p,
}: {
  state: ListenerState;
  onOpen: (show: CatalogueShow) => void;
  onDiscover: () => void;
  p: Theme;
}) {
  let [order, setOrder] = useState("Latest"),
    [query, setQuery] = useState("");
  let shows = state.following.filter((s) =>
    `${s.name} ${s.publisher}`.toLowerCase().includes(query.toLowerCase()),
  );
  if (order === "A–Z") shows.sort((a, b) => a.name.localeCompare(b.name));
  if (order === "Most listened")
    shows.sort(
      (a, b) =>
        state.history.filter((x) => x.showId === b.id).length -
        state.history.filter((x) => x.showId === a.id).length,
    );
  return (
    <>
      <Text style={[styles.eyebrow, { color: p.accent }]}>YOUR COLLECTION</Text>
      <Text style={[styles.display, { color: p.text }]}>Following</Text>
      <View
        style={[
          styles.searchBox,
          { backgroundColor: p.surface, borderColor: p.line },
        ]}
      >
        <Text style={{ color: p.muted, fontSize: 18 }}>⌕</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search your shows"
          placeholderTextColor={p.muted}
          style={[styles.searchInput, { color: p.text }]}
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipScroll}
      >
        {["Latest", "A–Z", "Most listened"].map((item) => (
          <Chip
            key={item}
            label={item}
            active={order === item}
            onPress={() => setOrder(item)}
            p={p}
          />
        ))}
      </ScrollView>
      {shows.length ? (
        <View style={styles.showList}>
          {shows.map((show) => (
            <Pressable
              key={show.id}
              onPress={() => onOpen(show)}
              style={[
                styles.followCard,
                { backgroundColor: p.surface, borderColor: p.line },
              ]}
            >
              <Art url={show.art} size={74} radius={19} />
              <View style={styles.followBody}>
                <Text
                  numberOfLines={1}
                  style={[styles.followTitle, { color: p.text }]}
                >
                  {show.name}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[styles.small, { color: p.muted }]}
                >
                  {show.publisher}
                </Text>
                <Text style={[styles.newEpisodes, { color: p.accent2 }]}>
                  {state.feedEpisodes[show.id]?.length
                    ? `${state.feedEpisodes[show.id].length} episodes ready to explore`
                    : "Open to see the latest episodes"}
                </Text>
              </View>
              <Text style={[styles.chevron, { color: p.muted }]}>›</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Glass p={p} style={styles.emptyCard}>
          <Text style={[styles.emptyIcon, { color: p.accent2 }]}>◌</Text>
          <Text style={[styles.emptyTitle, { color: p.text }]}>
            Follow the voices you return to.
          </Text>
          <Text style={[styles.emptyCopy, { color: p.muted }]}>
            Shows you follow in Search will live here.
          </Text>
          <Pressable
            onPress={onDiscover}
            style={[
              styles.followDiscovery,
              { borderColor: p.line, backgroundColor: p.wash },
            ]}
          >
            <Text style={[styles.followPillText, { color: p.text }]}>
              Explore podcasts
            </Text>
          </Pressable>
        </Glass>
      )}
    </>
  );
}

function Search({
  state,
  onOpen,
  p,
}: {
  state: ListenerState;
  onOpen: (show: CatalogueShow) => void;
  p: Theme;
}) {
  let [query, setQuery] = useState(""),
    [mode, setMode] = useState("Podcasts"),
    [scope, setScope] = useState("All Podcasts"),
    [results, setResults] = useState<CatalogueShow[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  let suggestions = Array.from(
      new Set([
        ...state.following.map((show) => show.topic),
        "Hard Fork",
        "Technology",
        "Science",
      ]),
    )
      .filter(Boolean)
      .slice(0, 3),
    submit = async () => {
      if (!query.trim() || mode !== "Podcasts") return;
      setBusy(true);
      setError("");
      try {
        let data = await searchCatalogue(query);
        setResults(
          scope === "My Podcasts"
            ? data.results.filter((x) =>
                state.following.some((s) => s.id === x.id),
              )
            : data.results,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search is unavailable.");
      } finally {
        setBusy(false);
      }
    };
  return (
    <>
      <Text style={[styles.eyebrow, { color: p.accent }]}>
        FIND SOMETHING WORTH HEARING
      </Text>
      <Text style={[styles.display, { color: p.text }]}>Search.</Text>
      <View
        style={[
          styles.searchBox,
          { backgroundColor: p.surface, borderColor: p.line },
        ]}
      >
        <Text style={{ color: p.muted, fontSize: 18 }}>⌕</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={submit}
          placeholder="Podcasts, hosts, topics"
          placeholderTextColor={p.muted}
          style={[styles.searchInput, { color: p.text }]}
        />
        {query ? (
          <Pressable onPress={submit}>
            <Text style={[styles.searchAction, { color: p.accent2 }]}>Go</Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipScroll}
      >
        {["Podcasts", "Conversations", "Moments"].map((item) => (
          <Chip
            key={item}
            label={item}
            active={mode === item}
            disabled={item !== "Podcasts"}
            onPress={() => setMode(item)}
            p={p}
          />
        ))}
      </ScrollView>
      <View style={styles.scopeRow}>
        {["My Podcasts", "All Podcasts"].map((item) => (
          <Pressable key={item} onPress={() => setScope(item)}>
            <Text
              style={[
                styles.scopeText,
                {
                  color: scope === item ? p.text : p.muted,
                  textDecorationLine: scope === item ? "underline" : "none",
                },
              ]}
            >
              {item}
            </Text>
          </Pressable>
        ))}
      </View>
      {mode !== "Podcasts" ? (
        <Glass p={p} style={styles.emptyCard}>
          <Text style={[styles.emptyTitle, { color: p.text }]}>
            Transcript search is not ready yet.
          </Text>
          <Text style={[styles.emptyCopy, { color: p.muted }]}>
            Conversation and moment search will appear only for genuinely
            processed episode transcripts.
          </Text>
        </Glass>
      ) : null}
      {error ? <Text style={{ color: "#E78FA9" }}>{error}</Text> : null}
      {busy ? (
        <Text style={[styles.emptyInline, { color: p.muted }]}>
          Searching the live podcast catalogue…
        </Text>
      ) : null}
      {!results.length && !busy && mode === "Podcasts" ? (
        <View style={styles.suggestions}>
          <Text style={[styles.sectionTitle, { color: p.text }]}>
            Try a prompt
          </Text>
          {suggestions.map((item) => (
            <Pressable
              key={item}
              onPress={() => {
                setQuery(item);
                void (async () => {
                  setBusy(true);
                  try {
                    let data = await searchCatalogue(item);
                    setResults(data.results);
                  } catch {
                    setError("Search is temporarily unavailable.");
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
              style={[
                styles.prompt,
                { backgroundColor: p.surface, borderColor: p.line },
              ]}
            >
              <Text style={[styles.promptStar, { color: p.accent2 }]}>✦</Text>
              <Text style={[styles.promptText, { color: p.text }]}>{item}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={styles.resultGrid}>
        {results.map((show) => (
          <Pressable
            key={show.id}
            onPress={() => onOpen(show)}
            style={styles.showTile}
          >
            <Art url={show.art} size={150} radius={22} />
            <Text
              numberOfLines={2}
              style={[styles.showTitle, { color: p.text }]}
            >
              {show.name}
            </Text>
            <Text numberOfLines={1} style={[styles.small, { color: p.muted }]}>
              {show.publisher}
            </Text>
          </Pressable>
        ))}
      </View>
    </>
  );
}

function Library({
  state,
  onPlay,
  p,
}: {
  state: ListenerState;
  onPlay: (e: StoredEpisode) => void;
  p: Theme;
}) {
  let [section, setSection] = useState("Saved Episodes"),
    maps: { [key: string]: StoredEpisode[] } = {
      "Saved Episodes": state.saved,
      "Saved Moments": [],
      Downloads: [],
      History: state.history,
    };
  let items = maps[section];
  let copy =
    section === "Saved Moments"
      ? "Save a verified moment when transcript intelligence is available."
      : section === "Downloads"
        ? "Offline downloads are not enabled in this Expo Go build."
        : section === "History"
          ? "Your played episodes will appear here."
          : "Save an episode to keep it close.";
  return (
    <>
      <Text style={[styles.eyebrow, { color: p.accent }]}>
        KEEP WHAT MATTERS
      </Text>
      <Text style={[styles.display, { color: p.text }]}>Library</Text>
      <View style={styles.libraryTabs}>
        {["Saved Episodes", "Saved Moments", "Downloads", "History"].map(
          (item) => (
            <Pressable
              key={item}
              onPress={() => setSection(item)}
              style={[
                styles.libraryTab,
                {
                  borderBottomColor:
                    section === item ? p.accent2 : "transparent",
                },
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: section === item ? p.text : p.muted },
                ]}
              >
                {item}
              </Text>
            </Pressable>
          ),
        )}
      </View>
      {items.length ? (
        items.map((episode) => (
          <EpisodeRow
            key={episode.id}
            episode={episode}
            onPress={() => onPlay(episode)}
            p={p}
          />
        ))
      ) : (
        <Glass p={p} style={styles.emptyCard}>
          <Text style={[styles.emptyIcon, { color: p.accent2 }]}>
            {section === "Downloads" ? "↓" : "♡"}
          </Text>
          <Text style={[styles.emptyTitle, { color: p.text }]}>{section}</Text>
          <Text style={[styles.emptyCopy, { color: p.muted }]}>{copy}</Text>
        </Glass>
      )}
    </>
  );
}

function Profile({
  state,
  setState,
  installation,
  onBack,
  p,
}: {
  state: ListenerState;
  setState: (state: ListenerState) => void;
  installation?: string;
  onBack: () => void;
  p: Theme;
}) {
  return (
    <>
      <Pressable
        onPress={onBack}
        style={styles.back}
        accessibilityRole="button"
      >
        <Text style={[styles.link, { color: p.accent2 }]}>‹ Back</Text>
      </Pressable>
      <Text style={[styles.eyebrow, { color: p.accent }]}>
        YOUR LISTENING SPACE
      </Text>
      <Text style={[styles.display, { color: p.text }]}>Profile</Text>
      <Glass p={p} style={styles.profileHero}>
        <View style={[styles.avatarLarge, { backgroundColor: p.wash }]}>
          <Text style={{ color: p.accent2, fontSize: 27 }}>✦</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.followTitle, { color: p.text }]}>
            Private by default
          </Text>
          <Text style={[styles.emptyCopy, { color: p.muted }]}>
            Anonymous listener · {installation ? "on this device" : "preparing"}
          </Text>
        </View>
      </Glass>
      <Section title="Appearance" p={p}>
        <Pressable
          onPress={() => {
            feedback.selection();
            setState({ ...state, nightMode: !state.nightMode });
          }}
          style={[styles.setting, { borderBottomColor: p.line }]}
        >
          <Text style={[styles.settingTitle, { color: p.text }]}>
            {state.nightMode ? "Night mode" : "Day mode"}
          </Text>
          <Text style={[styles.small, { color: p.muted }]}>Tap to switch</Text>
        </Pressable>
      </Section>
      <Section title="Listening allowance" p={p}>
        <Glass p={p} style={styles.allowance}>
          <Text style={[styles.allowanceNumber, { color: p.text }]}>
            10 hours
          </Text>
          <Text style={[styles.emptyCopy, { color: p.muted }]}>
            free each month
          </Text>
          <Text style={[styles.tiny, { color: p.muted }]}>
            Referral credits are verified by the server before they are
            displayed or awarded.
          </Text>
        </Glass>
      </Section>
      <Section title="Referrals" p={p}>
        <Glass p={p} style={styles.referral}>
          <Text style={[styles.followTitle, { color: p.text }]}>
            Give listening time.
          </Text>
          <Text style={[styles.emptyCopy, { color: p.muted }]}>
            Each qualified referral permanently adds 5 hours every month.
          </Text>
          <Text style={[styles.tiny, { color: p.muted }]}>
            Pending and earned referral entitlements appear here only after
            server verification.
          </Text>
        </Glass>
      </Section>
      <Section title="AI Sleep" p={p}>
        <Text style={[styles.emptyCopy, { color: p.muted }]}>
          AI Sleep learns from extensions and morning feedback on this device.
          It uses no physiological detection and does not upload motion streams.
        </Text>
      </Section>
    </>
  );
}

function ShowDetail({
  show,
  state,
  setState,
  onPlay,
  onBack,
  p,
}: {
  show: CatalogueShow;
  state: ListenerState;
  setState: (next: ListenerState) => void;
  onPlay: (e: StoredEpisode) => void;
  onBack: () => void;
  p: Theme;
}) {
  let [episodes, setEpisodes] = useState<CatalogueEpisode[]>([]),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let open = true;
    void (async () => {
      if (!show.feedUrl) {
        setBusy(false);
        setError(
          "This catalogue record does not provide a public publisher feed.",
        );
        return;
      }
      try {
        let feed = await loadFeed(show.feedUrl),
          streamable = feed.episodes.filter((x) => x.audioUrl);
        if (open) {
          setEpisodes(streamable);
          setState({
            ...state,
            feedEpisodes: {
              ...state.feedEpisodes,
              [show.id]: streamable.map((episode) => asStored(episode, show)),
            },
          });
        }
      } catch (e) {
        if (open)
          setError(
            e instanceof Error
              ? e.message
              : "Publisher episodes are unavailable.",
          );
      } finally {
        if (open) setBusy(false);
      }
    })();
    return () => {
      open = false;
    };
  }, [show]);
  let following = state.following.some((x) => x.id === show.id);
  return (
    <>
      <Pressable onPress={onBack} style={styles.back}>
        <Text style={[styles.link, { color: p.accent2 }]}>‹ Back</Text>
      </Pressable>
      <View style={styles.showHeader}>
        <Art url={show.art} size={112} radius={27} />
        <View style={styles.showHeaderCopy}>
          <Text
            numberOfLines={3}
            style={[styles.showDetailTitle, { color: p.text }]}
          >
            {show.name}
          </Text>
          <Text
            numberOfLines={2}
            style={[styles.emptyCopy, { color: p.muted }]}
          >
            {show.publisher}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={() => {
          feedback.success();
          setState({
            ...state,
            following: toggleById(state.following, show),
          });
        }}
        style={[
          styles.primary,
          {
            backgroundColor: following ? p.surfaceStrong : p.accent2,
            borderColor: p.line,
            borderWidth: following ? 1 : 0,
          },
        ]}
      >
        <Text
          style={[styles.primaryText, { color: following ? p.text : "#fff" }]}
        >
          {following ? "✓ Following" : "＋ Follow show"}
        </Text>
      </Pressable>
      <Text style={[styles.emptyCopy, { color: p.muted, marginTop: 12 }]}>
        Live publisher feed · real streamable episodes
      </Text>
      <Section title="Episodes" p={p}>
        {busy ? (
          <Text style={[styles.emptyInline, { color: p.muted }]}>
            Loading publisher episodes…
          </Text>
        ) : null}
        {error ? <Text style={{ color: "#E78FA9" }}>{error}</Text> : null}
        {episodes.map((episode) => {
          let stored = asStored(episode, show),
            saved = state.saved.some((x) => x.id === stored.id);
          return (
            <EpisodeRow
              key={episode.id}
              episode={stored}
              p={p}
              saved={saved}
              onPress={() => onPlay(stored)}
              onSave={() => {
                feedback.success();
                setState({
                  ...state,
                  saved: toggleById(state.saved, stored),
                });
              }}
            />
          );
        })}
      </Section>
    </>
  );
}

function AppShell() {
  let [page, setPage] = useState<Page>("Listen"),
    [backPage, setBackPage] =
      useState<Exclude<Page, "Show" | "Profile">>("Listen"),
    [selectedShow, setSelectedShow] = useState<CatalogueShow | null>(null),
    [installation, setInstallation] = useState<string>(),
    [state, setState] = useState<ListenerState>(emptyListenerState()),
    [hydrated, setHydrated] = useState(false),
    [playerOpen, setPlayerOpen] = useState(false);
  let p = state.nightMode ? dark : light;
  useEffect(() => {
    void (async () => {
      let value = await SecureStore.getItemAsync(
        "star-cast-installation-credential",
      );
      if (!value) {
        value = Crypto.randomUUID();
        await SecureStore.setItemAsync(
          "star-cast-installation-credential",
          value,
        );
      }
      setInstallation(value);
      setState(await loadListenerState());
      setHydrated(true);
    })();
  }, []);
  useEffect(() => {
    if (hydrated) void saveListenerState(state);
  }, [hydrated, state]);
  let playStored = (episode: StoredEpisode) => {
    let source: Source = {
      episodeId: episode.id,
      url: episode.audioUrl,
      title: episode.title,
      show: episode.showName,
      artworkUrl: episode.artworkUrl,
      feedUrl: episode.feedUrl,
      hasPublisherTranscript: episode.hasPublisherTranscript,
    };
    setState((current) => ({
      ...current,
      history: recordHistory(current.history, episode),
    }));
    setPlayerOpen(true);
    return source;
  };
  return (
    <AppContent
      page={page}
      setPage={setPage}
      backPage={backPage}
      setBackPage={setBackPage}
      selectedShow={selectedShow}
      setSelectedShow={setSelectedShow}
      state={state}
      setState={setState}
      hydrated={hydrated}
      installation={installation}
      p={p}
      playerOpen={playerOpen}
      setPlayerOpen={setPlayerOpen}
      playStored={playStored}
    />
  );
}

function AppContent({
  page,
  setPage,
  backPage,
  setBackPage,
  selectedShow,
  setSelectedShow,
  state,
  setState,
  hydrated,
  installation,
  p,
  playerOpen,
  setPlayerOpen,
  playStored,
}: {
  page: Page;
  setPage: (p: Page) => void;
  backPage: Exclude<Page, "Show" | "Profile">;
  setBackPage: (p: Exclude<Page, "Show" | "Profile">) => void;
  selectedShow: CatalogueShow | null;
  setSelectedShow: (s: CatalogueShow | null) => void;
  state: ListenerState;
  setState: (s: ListenerState | ((v: ListenerState) => ListenerState)) => void;
  hydrated: boolean;
  installation?: string;
  p: Theme;
  playerOpen: boolean;
  setPlayerOpen: (v: boolean) => void;
  playStored: (e: StoredEpisode) => Source;
}) {
  let { play } = usePlayback();
  let run = (episode: StoredEpisode) => {
    void play(playStored(episode));
  };
  let currentTab: Exclude<Page, "Show" | "Profile"> =
    page === "Show" || page === "Profile" ? backPage : page;
  let selectTab = (tab: Exclude<Page, "Show" | "Profile">) => {
    setSelectedShow(null);
    setPage(tab);
  };
  let openShow = (show: CatalogueShow) => {
    setSelectedShow(show);
    setBackPage(currentTab);
    setPage("Show");
  };
  let content =
    page === "Listen" ? (
      <Listen
        state={state}
        setState={setState}
        onPlay={run}
        onOpen={openShow}
        p={p}
      />
    ) : page === "Following" ? (
      <Following
        state={state}
        onOpen={openShow}
        onDiscover={() => selectTab("Listen")}
        p={p}
      />
    ) : page === "Search" ? (
      <Search state={state} onOpen={openShow} p={p} />
    ) : page === "Library" ? (
      <Library state={state} onPlay={run} p={p} />
    ) : page === "Profile" ? (
      <Profile
        state={state}
        setState={setState}
        installation={installation}
        onBack={() => selectTab(backPage)}
        p={p}
      />
    ) : selectedShow ? (
      <ShowDetail
        show={selectedShow}
        state={state}
        setState={setState}
        onPlay={run}
        onBack={() => selectTab(backPage)}
        p={p}
      />
    ) : null;
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: p.bg }]}>
      <AmbientBackdrop p={p} />
      <View style={styles.root}>
        <View style={styles.topbar}>
          <Pressable
            onPress={() => selectTab("Listen")}
            accessibilityRole="button"
          >
            <Text style={[styles.wordmark, { color: p.text }]}>
              STAR <Text style={{ color: p.accent }}>✦</Text> CAST
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            onPress={() => {
              setBackPage(currentTab);
              setPage("Profile");
            }}
            style={[
              styles.avatar,
              { backgroundColor: p.wash, borderColor: p.line },
            ]}
          >
            <Text style={{ color: p.accent2, fontWeight: "800" }}>O</Text>
          </Pressable>
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          {page === "Show" || page === "Profile" ? (
            <SwipeBack onBack={() => selectTab(backPage)}>{content}</SwipeBack>
          ) : (
            content
          )}
        </ScrollView>
        <MiniPlayer p={p} onOpen={() => setPlayerOpen(true)} />
        <BlurView
          intensity={42}
          tint={p.blurTint}
          style={[
            styles.tabBar,
            { borderColor: p.line, shadowColor: p.shadow },
          ]}
        >
          <LinearGradient
            colors={[p.surfaceStrong, p.surface]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.tabBarInner}
          >
            {(
              [
                { key: "Listen", icon: "headset-outline" },
                { key: "Following", icon: "heart-outline" },
                { key: "Search", icon: "search-outline" },
                { key: "Library", icon: "bookmark-outline" },
              ] as const
            ).map((tab) => (
              <Pressable
                key={tab.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: currentTab === tab.key }}
                onPress={() => {
                  feedback.selection();
                  selectTab(tab.key);
                }}
                style={[
                  styles.tab,
                  currentTab === tab.key && { backgroundColor: p.wash },
                ]}
              >
                <Ionicons
                  name={tab.icon}
                  size={18}
                  color={currentTab === tab.key ? p.text : p.muted}
                />
                <Text
                  style={[
                    styles.tabLabel,
                    { color: currentTab === tab.key ? p.text : p.muted },
                  ]}
                >
                  {tab.key}
                </Text>
              </Pressable>
            ))}
          </LinearGradient>
        </BlurView>
      </View>
      <PlayerSheet
        visible={playerOpen}
        onClose={() => setPlayerOpen(false)}
        p={p}
      />
      {hydrated && !state.onboardingComplete ? (
        <Onboarding
          p={p}
          onDone={() => setState({ ...state, onboardingComplete: true })}
        />
      ) : null}
    </SafeAreaView>
  );
}
export default function App() {
  return (
    <PlaybackProvider>
      <AppShell />
    </PlaybackProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  root: { flex: 1, maxWidth: 760, width: "100%", alignSelf: "center" },
  ambientLayer: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
  },
  ambientOne: {
    position: "absolute",
    width: 330,
    height: 330,
    borderRadius: 180,
    top: -150,
    right: -100,
    opacity: 0.48,
  },
  ambientTwo: {
    position: "absolute",
    width: 190,
    height: 190,
    borderRadius: 130,
    top: 260,
    left: -125,
    opacity: 0.12,
  },
  topbar: {
    height: 62,
    paddingHorizontal: 21,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  wordmark: { fontSize: 18, fontWeight: "800", letterSpacing: -0.8 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { paddingHorizontal: 20, paddingBottom: 142 },
  eyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.45,
    marginTop: 11,
  },
  display: {
    fontSize: 38,
    lineHeight: 40,
    fontWeight: "800",
    letterSpacing: -1.8,
    marginTop: 8,
  },
  listenHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  lighting: {
    width: 46,
    height: 46,
    borderRadius: 23,
    marginTop: 13,
    opacity: 0.8,
  },
  glass: { borderWidth: 1, borderRadius: 22, padding: 17 },
  continueCard: {
    marginTop: 23,
    borderWidth: 1,
    borderRadius: 27,
    overflow: "hidden",
  },
  continueCardInner: {
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 121,
  },
  continueBody: { flex: 1, minWidth: 0 },
  continueTitle: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "700",
    marginTop: 6,
  },
  playGlyph: { fontSize: 19 },
  emptyHero: { marginTop: 23, alignItems: "center", paddingVertical: 28 },
  emptyCard: { alignItems: "center", paddingVertical: 29, marginTop: 22 },
  emptyIcon: { fontSize: 28, marginBottom: 8 },
  emptyTitle: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  emptyCopy: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  section: { marginTop: 29 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 9,
  },
  sectionTitle: { fontSize: 25, fontWeight: "700", letterSpacing: -0.65 },
  small: { fontSize: 13, lineHeight: 18 },
  tiny: { fontSize: 11, lineHeight: 16, marginTop: 10, textAlign: "center" },
  chipScroll: { gap: 8, paddingVertical: 4 },
  chip: {
    minHeight: 38,
    borderRadius: 19,
    borderWidth: 1,
    paddingHorizontal: 13,
    justifyContent: "center",
  },
  chipText: { fontSize: 13, fontWeight: "700" },
  subFilters: { flexDirection: "row", gap: 7, marginTop: 3 },
  episode: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  episodeBody: { flex: 1, minWidth: 0 },
  episodeTitle: { fontSize: 15, lineHeight: 19, fontWeight: "700" },
  saveButton: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  saveIcon: { fontSize: 22 },
  emptyInline: { fontSize: 14, lineHeight: 20, paddingVertical: 15 },
  feedCaption: { fontSize: 13, marginBottom: 4 },
  searchBox: {
    height: 52,
    borderRadius: 17,
    borderWidth: 1,
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    gap: 9,
  },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 10 },
  searchAction: { fontSize: 14, fontWeight: "800" },
  scopeRow: { flexDirection: "row", gap: 19, marginTop: 15 },
  scopeText: { fontSize: 14, fontWeight: "700" },
  suggestions: { marginTop: 29, gap: 9 },
  prompt: {
    borderRadius: 17,
    borderWidth: 1,
    minHeight: 54,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  promptStar: { fontSize: 18 },
  promptText: { fontSize: 14, fontWeight: "600" },
  resultGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 17,
    marginTop: 23,
  },
  showTile: { width: "46%" },
  showTitle: { fontSize: 15, fontWeight: "700", lineHeight: 19, marginTop: 8 },
  showList: { gap: 11, marginTop: 20 },
  followCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  followBody: { flex: 1, minWidth: 0 },
  followTitle: { fontSize: 16, fontWeight: "700" },
  newEpisodes: { fontSize: 12, fontWeight: "700", marginTop: 7 },
  chevron: { fontSize: 28, paddingHorizontal: 5 },
  libraryTabs: { flexDirection: "row", marginTop: 22, marginHorizontal: -4 },
  libraryTab: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 2,
    paddingHorizontal: 4,
  },
  tabText: { fontSize: 11, fontWeight: "700", textAlign: "center" },
  profileHero: {
    marginTop: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatarLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  setting: {
    minHeight: 58,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  settingTitle: { fontSize: 16, fontWeight: "700" },
  allowance: { alignItems: "flex-start" },
  allowanceNumber: { fontSize: 29, fontWeight: "800", letterSpacing: -1 },
  referral: { alignItems: "flex-start" },
  back: { minHeight: 40, justifyContent: "center" },
  link: { fontSize: 15, fontWeight: "700" },
  showHeader: {
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
    marginTop: 10,
  },
  showHeaderCopy: { flex: 1, minWidth: 0 },
  showDetailTitle: {
    fontSize: 27,
    lineHeight: 30,
    fontWeight: "800",
    letterSpacing: -1,
  },
  primary: {
    minHeight: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 22,
  },
  primaryText: { fontSize: 15, fontWeight: "800" },
  mini: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 81,
    minHeight: 53,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 8,
  },
  miniInner: {
    minHeight: 53,
    padding: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  miniCopy: { flex: 1, minWidth: 0 },
  miniTitle: { fontSize: 14, fontWeight: "700" },
  miniPlay: {
    width: 35,
    height: 35,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBar: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 11,
    height: 62,
    borderRadius: 23,
    borderWidth: 1,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 8,
  },
  tabBarInner: {
    flex: 1,
    padding: 5,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  tab: {
    flex: 1,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  tabIcon: { fontSize: 17, lineHeight: 19 },
  tabLabel: { fontSize: 10, fontWeight: "700" },
  modalSafe: { flex: 1 },
  playerSheet: { padding: 21, paddingBottom: 50 },
  sheetHeader: {
    height: 42,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  roundButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  playerArtwork: {
    alignSelf: "center",
    width: 266,
    height: 266,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 13,
  },
  playerTitle: {
    fontSize: 25,
    lineHeight: 30,
    fontWeight: "800",
    letterSpacing: -0.7,
    marginTop: 25,
    textAlign: "center",
  },
  playerShow: { fontSize: 15, marginTop: 5, textAlign: "center" },
  progressTouch: {
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
    marginTop: 28,
  },
  progressFill: { height: "100%", borderRadius: 3 },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  transport: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 19,
  },
  transportSide: {
    minWidth: 72,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  playButton: {
    width: 63,
    height: 63,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  speedRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 7,
    marginTop: 18,
  },
  playerTools: {
    marginTop: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(128,128,128,.25)",
  },
  briefCard: { marginTop: 14, gap: 8 },
  briefOverview: { fontSize: 16, lineHeight: 22, fontWeight: "700" },
  tool: {
    minHeight: 59,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  toolIcon: { fontSize: 18 },
  toolText: { fontSize: 15, fontWeight: "700", flex: 1 },
  sleepEntry: {
    marginTop: 18,
    minHeight: 62,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sleepEntryTitle: { fontSize: 16, fontWeight: "800" },
  sleepPanel: { marginTop: 17 },
  timerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginVertical: 12,
  },
  aiPanel: { alignItems: "center", marginTop: 18, padding: 18 },
  organism: {
    width: 170,
    height: 170,
    borderRadius: 85,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 3,
  },
  orbit: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1,
    opacity: 0.32,
  },
  sleepPoint: { position: "absolute", width: 4, height: 4, borderRadius: 2 },
  core: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  aiHeadline: { fontSize: 20, fontWeight: "800", marginTop: 14 },
  aiCopy: { fontSize: 14, marginTop: 4, textAlign: "center" },
  extensionRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  notice: { fontSize: 13, textAlign: "center", marginTop: 13 },
  aiSleepEntry: {
    minHeight: 70,
    borderRadius: 20,
    marginTop: 10,
    paddingHorizontal: 17,
    justifyContent: "center",
  },
  aiSleepEntryTitle: { color: "#fff", fontSize: 17, fontWeight: "800" },
  aiSleepEntryCopy: {
    color: "rgba(255,255,255,.8)",
    fontSize: 13,
    marginTop: 3,
  },
  timerShade: {
    flex: 1,
    backgroundColor: "rgba(8,8,12,.46)",
    justifyContent: "flex-end",
  },
  timerSheet: {
    borderTopWidth: 1,
    borderRadius: 28,
    padding: 21,
    paddingBottom: 28,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
  },
  timerSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  timerOptionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginTop: 18,
  },
  timerOption: {
    width: "30.5%",
    minHeight: 48,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  timerOptionText: { fontSize: 14, fontWeight: "700" },
  endEpisode: {
    minHeight: 45,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 13,
  },
  aiSafe: { flex: 1 },
  aiAmbient: {
    position: "absolute",
    width: 430,
    height: 430,
    borderRadius: 215,
    top: 85,
    left: -100,
    opacity: 0.56,
  },
  aiHeader: {
    height: 64,
    paddingHorizontal: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  aiBack: {
    minHeight: 44,
    minWidth: 70,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 13,
    justifyContent: "center",
    alignItems: "center",
  },
  stopButton: {
    minHeight: 44,
    minWidth: 108,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 13,
    justifyContent: "center",
    alignItems: "center",
  },
  stopText: { fontSize: 13, fontWeight: "800" },
  aiScreenContent: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 25,
    paddingTop: 16,
  },
  aiScreenTitle: {
    fontSize: 32,
    lineHeight: 36,
    fontWeight: "800",
    letterSpacing: -1.2,
    marginTop: 7,
    textAlign: "center",
  },
  aiScreenCopy: {
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 8,
    maxWidth: 290,
  },
  earliestCard: {
    width: "100%",
    alignItems: "center",
    marginTop: 22,
    paddingVertical: 15,
  },
  earliestTime: { fontSize: 27, fontWeight: "800", marginTop: 3 },
  aiExtensions: {
    width: "100%",
    flexDirection: "row",
    gap: 9,
    justifyContent: "center",
    marginTop: 20,
  },
  aiExtension: {
    flex: 1,
    minHeight: 66,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  aiExtensionText: { fontSize: 19, fontWeight: "800" },
  aiStart: {
    width: "100%",
    minHeight: 55,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 25,
  },
  aiPrivacy: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    maxWidth: 290,
    marginTop: 17,
  },
  onboardingShade: {
    flex: 1,
    backgroundColor: "rgba(10,10,14,.48)",
    justifyContent: "flex-end",
  },
  onboarding: {
    borderTopWidth: 1,
    borderRadius: 31,
    padding: 23,
    paddingBottom: 31,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
  },
  onboardingSkip: {
    alignSelf: "flex-end",
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  onboardingTitle: {
    fontSize: 36,
    lineHeight: 38,
    fontWeight: "800",
    letterSpacing: -1.8,
    marginTop: 8,
  },
  onboardingCopy: { fontSize: 15, lineHeight: 21, marginTop: 9, maxWidth: 300 },
  onboardingCards: { gap: 9, marginTop: 22 },
  onboardingCard: {
    padding: 13,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  onboardingIcon: { fontSize: 21, width: 29, textAlign: "center" },
  onboardingCardTitle: { fontSize: 15, fontWeight: "800" },
  onboardingCardCopy: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  discovery: { marginTop: 23 },
  discoveryTitle: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: "800",
    letterSpacing: -0.8,
    marginTop: 6,
  },
  discoveryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 14,
  },
  discoveryCard: { width: "47%", padding: 10 },
  followPill: {
    borderWidth: 1,
    minHeight: 35,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  followPillText: { fontSize: 12, fontWeight: "800" },
  followDiscovery: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
    marginTop: 15,
  },
});
