import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  AppState,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
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
import { getIdentity, setIdentity } from "./src/localStorage";
import * as Crypto from "expo-crypto";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import {
  PlaybackProvider,
  usePlayback,
  type Source,
} from "./src/PlaybackProvider";
import {
  enrollPrivatePilot,
  hasPilotAccess,
  onSessionEnded,
  loadFeed,
  searchCatalogue,
  type CatalogueEpisode,
  type CatalogueShow,
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
import {
  NativeAiSleepBridge,
  NativeSleepTimer,
  resetSleepLearning,
} from "./src/sleepBridge";
import { feedback } from "./src/feedback";
import { motion, themes, type StarTheme } from "./src/design";
import { useEpisodeIntelligence } from "./src/useEpisodeIntelligence";
import { EpisodeIntelligenceView } from "./src/EpisodeIntelligenceView";
import { SearchScreen } from "./src/SearchScreen";
import { ReferralPanel, InviteEntry } from "./src/ReferralPanel";
import { ListenerSync } from "./src/ListenerSync";
import { updateFollow, deleteListenerProfile, resetListenerConnection, listenerRequest } from "./src/listenerApi";
import { LoadingState } from "./src/LoadingState";
import { PodcastArtwork } from "./src/PodcastArtwork";
import { ProblemReport } from "./src/ProblemReport";
import { CaptionWindow } from "./src/CaptionWindow";
import { SubscriptionPanel } from "./src/SubscriptionPanel";
import { TranslationPanel } from "./src/TranslationPanel";

type Page = "Listen" | "Following" | "Search" | "Library" | "Profile" | "Show";
type Theme = StarTheme;
const dark = themes.night;
const light = themes.day;
const launchHistoryKey = "radio-star-launch-v1";
const appearancePreferenceKey = "radio-star-appearance-v1";
const format = (ms: number) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const episodeDurationMs = (value?: string) =>
  value
    ? value
        .split(":")
        .map(Number)
        .reduce((n, x) => n * 60 + x, 0) * 1000
    : 0;
const durationLabel = (value?: string) => {
  if (!value) return "Publisher episode";
  const seconds = value
    .split(":")
    .map(Number)
    .reduce((n, x) => n * 60 + x, 0);
  return Number.isFinite(seconds) ? `${Math.round(seconds / 60)} min` : value;
};
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
    <PodcastArtwork
      uri={url}
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
  const [linkingInvite, setLinkingInvite] = useState(false);
  let cards = [
    [
      "◌",
      "Your podcasts",
      "Follow favourite shows to keep their newest episodes close.",
    ],
    [
      "⌕",
      "Conversational Search",
      "Ask about ideas and jump to real, sourced moments where available.",
    ],
    [
      "☾",
      "Episode intelligence",
      "Briefs and chapters prepare automatically when the publisher allows it.",
    ],
    [
      "⌁",
      "Ad Skip, carefully",
      "Only verified intervals can be skipped. It is off while evidence is limited.",
    ],
  ];
  return (
    <Modal visible transparent animationType="fade">
      <SafeAreaView style={styles.onboardingShade}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              styles.onboarding,
              { backgroundColor: p.bg, borderColor: p.line },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              disabled={linkingInvite}
              accessibilityState={{ disabled: linkingInvite }}
              onPress={onDone}
              style={styles.onboardingSkip}
            >
              <Text style={[styles.link, { color: p.muted }]}>Skip</Text>
            </Pressable>
            <Text style={[styles.eyebrow, { color: p.accent }]}>
              WELCOME TO RADIO STAR
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
                    <Text
                      style={[styles.onboardingCardTitle, { color: p.text }]}
                    >
                      {title}
                    </Text>
                    <Text
                      style={[styles.onboardingCardCopy, { color: p.muted }]}
                    >
                      {copy}
                    </Text>
                  </View>
                </Glass>
              ))}
            </View>
            <InviteEntry p={p} onBusyChange={setLinkingInvite} />
            <Pressable
              accessibilityRole="button"
              disabled={linkingInvite}
              accessibilityState={{ disabled: linkingInvite }}
              onPress={onDone}
              style={[styles.primary, { backgroundColor: p.accent2 }]}
            >
              <Text style={[styles.primaryText, { color: p.onAccent }]}>
                Start listening
              </Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
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
        <LoadingState
          p={p}
          label={`Finding ${category.toLowerCase()} shows…`}
        />
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
                  const next = !following;
                  setState({
                    ...state,
                    following: toggleById(state.following, show),
                  });
                  if (show.feedUrl) void updateFollow(show.feedUrl, next)
                    .then((result) => setState({ ...state, followIntelligence: {
                      ...state.followIntelligence,
                      [show.feedUrl!]: result.processing || { state: "DISABLED" },
                    } }))
                    .catch(() => {});
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

function LaunchRestoring({ p }: { p: Theme }) {
  return (
    <SafeAreaView
      accessibilityLabel="Opening Radio Star"
      style={[styles.launchSurface, { backgroundColor: p.bg }]}
    >
      <LinearGradient
        colors={[p.bg, p.wash, p.bg]}
        locations={[0, 0.48, 1]}
        style={styles.launchGradient}
      >
        <View style={styles.launchRestoringContent}>
          <Image
            accessible={false}
            source={require("./assets/radio-star-icon.png")}
            style={styles.launchRestoringMark}
          />
          <ActivityIndicator color={p.accent2} size="small" />
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

function LaunchExperience({
  p,
  full,
  onComplete,
}: {
  p: Theme;
  full: boolean;
  onComplete: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;
  const exit = useRef(new Animated.Value(1)).current;
  const starOpacity = useRef(new Animated.Value(full ? 0 : 1)).current;
  const starScale = useRef(new Animated.Value(full ? 0.76 : 1)).current;
  const ringOneOpacity = useRef(new Animated.Value(full ? 0 : 0.22)).current;
  const ringTwoOpacity = useRef(new Animated.Value(full ? 0 : 0.18)).current;
  const ringThreeOpacity = useRef(new Animated.Value(full ? 0 : 0.14)).current;
  const ringOneScale = useRef(new Animated.Value(full ? 0.7 : 1)).current;
  const ringTwoScale = useRef(new Animated.Value(full ? 0.7 : 1)).current;
  const ringThreeScale = useRef(new Animated.Value(full ? 0.7 : 1)).current;
  const wordOpacity = useRef(new Animated.Value(full ? 0 : 1)).current;
  const wordOffset = useRef(new Animated.Value(full ? 12 : 0)).current;
  const statusOpacity = useRef(new Animated.Value(full ? 0 : 1)).current;

  useEffect(() => {
    const finish = () => {
      Animated.timing(exit, {
        toValue: 0,
        duration: reducedMotion ? 120 : full ? 420 : 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) completeRef.current();
      });
    };
    if (reducedMotion) {
      [
        starOpacity,
        ringOneOpacity,
        ringTwoOpacity,
        ringThreeOpacity,
        wordOpacity,
        statusOpacity,
      ].forEach((value) => value.setValue(1));
      [starScale, ringOneScale, ringTwoScale, ringThreeScale].forEach(
        (value) => value.setValue(1),
      );
      wordOffset.setValue(0);
      const timeout = setTimeout(finish, 80);
      return () => clearTimeout(timeout);
    }
    if (!full) {
      const timeout = setTimeout(finish, 180);
      return () => clearTimeout(timeout);
    }
    const softOut = Easing.bezier(0.16, 1, 0.3, 1);
    const ring = (
      opacity: Animated.Value,
      scale: Animated.Value,
      delay: number,
      targetOpacity: number,
    ) =>
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: targetOpacity,
          duration: 1260,
          delay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 1260,
          delay,
          easing: softOut,
          useNativeDriver: true,
        }),
      ]);
    const animation = Animated.parallel([
      Animated.parallel([
        Animated.timing(starOpacity, {
          toValue: 1,
          duration: 520,
          delay: 60,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(starScale, {
          toValue: 1,
          duration: 680,
          delay: 60,
          easing: softOut,
          useNativeDriver: true,
        }),
      ]),
      ring(ringOneOpacity, ringOneScale, 460, 0.26),
      ring(ringTwoOpacity, ringTwoScale, 610, 0.21),
      ring(ringThreeOpacity, ringThreeScale, 760, 0.16),
      Animated.parallel([
        Animated.timing(wordOpacity, {
          toValue: 1,
          duration: 720,
          delay: 1480,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(wordOffset, {
          toValue: 0,
          duration: 840,
          delay: 1480,
          easing: softOut,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(statusOpacity, {
        toValue: 1,
        duration: 520,
        delay: 1880,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    const timeout = setTimeout(finish, 2_800);
    return () => {
      animation.stop();
      clearTimeout(timeout);
    };
  }, [
    exit,
    full,
    reducedMotion,
    ringOneOpacity,
    ringOneScale,
    ringThreeOpacity,
    ringThreeScale,
    ringTwoOpacity,
    ringTwoScale,
    starOpacity,
    starScale,
    statusOpacity,
    wordOffset,
    wordOpacity,
  ]);

  return (
    <Animated.View
      accessibilityViewIsModal
      style={[styles.launchOverlay, { opacity: exit, backgroundColor: p.bg }]}
    >
      <LinearGradient
        colors={[p.bg, p.wash, p.bg]}
        locations={[0, 0.48, 1]}
        style={styles.launchGradient}
      >
        <View style={styles.launchHalo}>
          <View style={[styles.launchAura, { backgroundColor: p.accent2 }]} />
          <Animated.View
            style={[
              styles.launchRing,
              styles.launchRingThree,
              { borderColor: p.accent2, opacity: ringThreeOpacity, transform: [{ scale: ringThreeScale }] },
            ]}
          />
          <Animated.View
            style={[
              styles.launchRing,
              styles.launchRingTwo,
              { borderColor: p.accent2, opacity: ringTwoOpacity, transform: [{ scale: ringTwoScale }] },
            ]}
          />
          <Animated.View
            style={[
              styles.launchRing,
              styles.launchRingOne,
              { borderColor: p.accent2, opacity: ringOneOpacity, transform: [{ scale: ringOneScale }] },
            ]}
          />
          <Animated.View
            style={{ opacity: starOpacity, transform: [{ scale: starScale }] }}
          >
            <Image
              accessibilityLabel="Radio Star"
              source={require("./assets/radio-star-icon.png")}
              style={styles.launchMark}
            />
          </Animated.View>
        </View>
        <Animated.View
          style={{ opacity: wordOpacity, transform: [{ translateY: wordOffset }] }}
        >
          <Text style={[styles.launchWordmark, { color: p.text }]}>radio star</Text>
          <Text style={[styles.launchTagline, { color: p.muted }]}>NOISE INTO SIGNAL</Text>
        </Animated.View>
        <Animated.View style={[styles.launchStatus, { opacity: statusOpacity }]}>
          <View style={[styles.launchStatusLine, { backgroundColor: p.line }]}>
            <View style={[styles.launchStatusAccent, { backgroundColor: p.accent2 }]} />
          </View>
          <Text style={[styles.launchStatusText, { color: p.muted }]}>Finding your signal</Text>
        </Animated.View>
      </LinearGradient>
    </Animated.View>
  );
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
    <View style={[styles.episode, { borderBottomColor: p.line }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Play ${episode.title}`}
        onPress={onPress}
        style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }}
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
            {episode.positionMs !== undefined
              ? `From ${format(episode.positionMs)}`
              : durationLabel(episode.duration)}
          </Text>
        </View>
      </Pressable>
      {onSave ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={saved ? "Remove saved episode" : "Save episode"}
          hitSlop={8}
          onPress={(event) => {
            event.stopPropagation();
            onSave();
          }}
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
    </View>
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
  let points = Array.from({ length: 48 }, (_, i) => {
    let a = i * 2.39996,
      r = 15 + Math.sqrt(i / 48) * 80;
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
      style={[styles.organism, { backgroundColor: "transparent" }]}
    >
      {Array.from({ length: 13 }, (_, i) => (
        <Animated.View
          key={`trace-${i}`}
          style={{
            position: "absolute",
            height: 1,
            width: 28 + (i % 4) * 9,
            backgroundColor: p.accent2,
            opacity: 0.18,
            transform: [
              { translateX: Math.sin(i * 2.3) * 55 },
              { translateY: Math.cos(i * 1.7) * 64 },
              { rotate: `${i * 37}deg` },
            ],
          }}
        />
      ))}
      {points}
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
          <LivingSleep p={p} active={active && visible} />
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
              <Text style={[styles.primaryText, { color: p.onAccent }]}>
                Start AI Sleep
              </Text>
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
  enabled,
  onEnable,
  p,
}: {
  visible: boolean;
  onClose: () => void;
  p: Theme;
  enabled: boolean;
  onEnable: () => void;
}) {
  let {
      source,
      snapshot,
      play,
      pause,
      seek,
      setSpeed,
      fadeAndPause,
      cancelFade,
    } = usePlayback(),
    timer = useRef<NativeSleepTimer | null>(null),
    ai = useRef<NativeAiSleepBridge | null>(null),
    [timerOpen, setTimerOpen] = useState(false),
    [aiScreenOpen, setAiScreenOpen] = useState(false),
    [aiActive, setAiActive] = useState(false),
    [earliestPauseAt, setEarliestPauseAt] = useState<number | null>(null),
    [notice, setNotice] = useState(""),
    [panel, setPanel] = useState<"brief" | "explore" | "ads" | null>(null),
    [intelligenceOpen, setIntelligenceOpen] = useState(false),
    [progressWidth, setProgressWidth] = useState(1);
  const intelligence = useEpisodeIntelligence(
    source?.feedUrl,
    source?.episodeId,
    visible,
    enabled,
  );
  useEffect(() => {
    setPanel(null);
    setNotice("");
  }, [source?.episodeId, source?.feedUrl]);
  useEffect(() => {
    if (!visible) setPanel(null);
  }, [visible]);
  const [sleepRecovery, setSleepRecovery] = useState<{
    lastHeard: number;
    pausedAt: number;
  } | null>(null);
  const latestSnapshot = useRef(snapshot);
  latestSnapshot.current = snapshot;
  const playbackActions = useRef({ pause, fadeAndPause });
  playbackActions.current = { pause, fadeAndPause };
  useEffect(() => {
    timer.current = new NativeSleepTimer(() => playbackActions.current.pause());
    ai.current = new NativeAiSleepBridge((ms) =>
      playbackActions.current.fadeAndPause(ms),
    );
    return () => timer.current?.cancel();
  }, []);
  useEffect(() => {
    if (!aiActive) return;
    const interval = setInterval(() => {
      const current = latestSnapshot.current;
      if (AppState.currentState !== "active") {
        ai.current?.interact(current.positionMs, current.playing);
        return;
      }
      void ai.current
        ?.tick(current.positionMs, current.playing)
        .then((state) => {
          if (state === "PAUSED") {
            setAiActive(false);
            setSleepRecovery({
              lastHeard: ai.current?.session?.recoveryPositionMs || 0,
              pausedAt: latestSnapshot.current.positionMs,
            });
          }
          if (state === "OFF") setAiActive(false);
        });
    }, 15000);
    return () => clearInterval(interval);
  }, [aiActive]);
  useEffect(() => {
    if (
      snapshot.durationMs &&
      snapshot.positionMs >= snapshot.durationMs - 1000 &&
      !snapshot.playing
    )
      timer.current?.onEpisodeEnd();
  }, [snapshot.durationMs, snapshot.positionMs, snapshot.playing]);
  if (!source) return null;
  let percent = snapshot.durationMs
    ? Math.min(100, (snapshot.positionMs / snapshot.durationMs) * 100)
    : 0;
  const intelligenceLabel = (() => {
    switch (intelligence.status?.state) {
      case "READY": return "Ready";
      case "PARTIAL_READY": return "Partly ready";
      case "QUEUED": return "Queued";
      case "PROCESSING": case "DISCOVERING": case "TRANSCRIBING": case "UNDERSTANDING": case "ORGANISING": return "Preparing";
      case "UNAVAILABLE": case "BLOCKED": return "Unavailable";
      case "FAILED": return "Needs attention";
      default: return enabled ? "Preparing" : "Available when enabled";
    }
  })();
  let setTimer = (minutes: number) => {
    timer.current?.start({ kind: "minutes", minutes });
    setNotice(`Sleep Timer set for ${minutes} minutes.`);
  };
  let extend = (minutes: number) => {
    try {
      cancelFade();
      let session = ai.current?.extend(minutes);
      setEarliestPauseAt(session?.earliestPauseAt || null);
      setNotice(`AI Sleep will not pause for another ${minutes} minutes.`);
      feedback.success();
    } catch {
      setNotice("Start AI Sleep first.");
    }
  };
  let startAi = () => {
    if (!snapshot.playing) {
      setNotice("Start playback before activating AI Sleep.");
      return;
    }
    let session;
    try {
      session = ai.current?.start(snapshot.positionMs);
    } catch {
      setNotice("Sleep preferences are loading. Please try again.");
      return;
    }
    setAiActive(true);
    setEarliestPauseAt(session?.earliestPauseAt || null);
    setNotice("AI Sleep active. Listening continues.");
    feedback.success();
  };
  let stopAi = () => {
    cancelFade();
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
      onRequestClose={() => (panel ? setPanel(null) : onClose())}
    >
      <SafeAreaView style={[styles.modalSafe, { backgroundColor: p.bg }]}>
        {panel ? (
          <EpisodeIntelligenceView
            key={`${source.feedUrl}-${source.episodeId}-${panel}`}
            panel={panel}
            source={source}
            p={p}
            enabled={enabled}
            onEnable={onEnable}
            onBack={() => setPanel(null)}
            intelligence={intelligence}
            onPlay={(ms) => play({ ...source, startPositionMs: ms })}
          />
        ) : (
          <>
            {visible && source.artworkUrl && (
              <View
                pointerEvents="none"
                style={{ position: "absolute", width: "100%", height: 400 }}
              >
                <Image
                  accessible={false}
                  source={{ uri: source.artworkUrl }}
                  blurRadius={45}
                  style={{
                    width: "100%",
                    height: 400,
                    opacity: p.blurTint === "dark" ? 0.12 : 0.08,
                  }}
                />
              </View>
            )}
            <View
              style={[
                styles.sheetHeader,
                { paddingHorizontal: 24, paddingTop: 10 },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close player"
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
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.playerSheet}
            >
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
                onLayout={(event) =>
                  setProgressWidth(event.nativeEvent.layout.width)
                }
                accessibilityValue={{
                  min: 0,
                  max: snapshot.durationMs || 0,
                  now: snapshot.positionMs,
                }}
                accessibilityActions={[
                  { name: "increment", label: "Forward 15 seconds" },
                  { name: "decrement", label: "Back 15 seconds" },
                ]}
                onAccessibilityAction={(event) =>
                  void seek(
                    snapshot.positionMs +
                      (event.nativeEvent.actionName === "increment"
                        ? 15000
                        : -15000),
                  )
                }
                onPress={(event) =>
                  seek(
                    snapshot.durationMs
                      ? snapshot.durationMs *
                          Math.max(
                            0,
                            Math.min(
                              1,
                              event.nativeEvent.locationX / progressWidth,
                            ),
                          )
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
                  {snapshot.durationMs
                    ? `−${format(Math.max(0, snapshot.durationMs - snapshot.positionMs))}`
                    : "--:--"}
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
              <CaptionWindow p={p} />
              <View style={[styles.playerTools, { borderColor: p.line }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Episode intelligence"
                  accessibilityState={{ expanded: intelligenceOpen }}
                  onPress={() => { feedback.light(); setIntelligenceOpen((open) => !open); }}
                  style={styles.intelligenceHeader}
                >
                  <View style={styles.intelligenceHeaderCopy}>
                    <Text style={[styles.eyebrow, { color: p.accent, marginTop: 0 }]}>EPISODE INTELLIGENCE</Text>
                    <Text style={[styles.intelligenceStatus, { color: p.text }]}>{intelligenceLabel}</Text>
                  </View>
                  <Ionicons name={intelligenceOpen ? "chevron-up" : "chevron-down"} size={20} color={p.muted} />
                </Pressable>
                {intelligenceOpen && (
                  <>
                    <Text style={[styles.intelligenceCopy, { color: p.muted }]}>Getting this conversation ready never interrupts your listening.</Text>
                    {(
                      [
                        ["AI Episode Brief", "A grounded overview from authorised transcript evidence.", "brief", "sparkles"],
                        ["Explore Episode", "Chapters, topics and verified moments.", "explore", "compass-outline"],
                        ["Ad Skip", "Only verified, audio-matched intervals are eligible.", "ads", "shield-checkmark-outline"],
                      ] as const
                    ).map(([label, detail, target, icon]) => (
                      <Pressable
                        key={target}
                        accessibilityRole="button"
                        accessibilityLabel={label}
                        onPress={() => { feedback.light(); setPanel(target); }}
                        style={[styles.intelligenceRow, { borderColor: p.line }]}
                      >
                        <Ionicons name={icon} size={19} color={p.accent2} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.toolText, { color: p.text }]}>{label}</Text>
                          <Text numberOfLines={1} style={[styles.intelligenceDetail, { color: p.muted }]}>{detail}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={17} color={p.muted} />
                      </Pressable>
                    ))}
                  </>
                )}
              </View>
              <ProblemReport p={p} compact />
              <Pressable
                accessibilityRole="button"
                onPress={() => setTimerOpen(true)}
                style={[
                  styles.sleepEntry,
                  { backgroundColor: p.wash, borderColor: p.line },
                ]}
              >
                <Text style={[styles.sleepEntryTitle, { color: p.text }]}>
                  <Ionicons name="moon-outline" size={18} color={p.text} />{" "}
                  Sleep Timer
                </Text>
                <Text style={[styles.small, { color: p.muted }]}>
                  Set a pause
                </Text>
              </Pressable>
              {sleepRecovery && (
                <Glass p={p} style={styles.briefCard}>
                  <Text style={[styles.briefOverview, { color: p.text }]}>
                    Welcome back.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void seek(sleepRecovery.lastHeard)}
                    style={{ minHeight: 44, justifyContent: "center" }}
                  >
                    <Text style={{ color: p.accent2 }}>
                      Continue from estimated last-heard position
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void seek(sleepRecovery.pausedAt)}
                    style={{ minHeight: 44, justifyContent: "center" }}
                  >
                    <Text style={{ color: p.accent2 }}>
                      Continue from pause position
                    </Text>
                  </Pressable>
                  <Text style={[styles.small, { color: p.muted }]}>
                    How was the timing? Early or late adjusts your next
                    listening window by five minutes.
                  </Text>
                  <View style={styles.speedRow}>
                    {(
                      [
                        ["Too early", "early"],
                        ["About right", "correct"],
                        ["Too late", "late"],
                      ] as const
                    ).map(([label, kind]) => (
                      <Chip
                        key={kind}
                        label={label}
                        p={p}
                        onPress={() => {
                          ai.current?.feedback(kind);
                          setNotice(
                            "Your timing preference is saved on this device.",
                          );
                          setSleepRecovery(null);
                        }}
                      />
                    ))}
                  </View>
                </Glass>
              )}
              <Pressable
                accessibilityRole="button"
                onPress={() => setAiScreenOpen(true)}
                style={[styles.aiSleepEntry, { backgroundColor: p.accent2 }]}
              >
                <Text style={[styles.aiSleepEntryTitle, { color: p.onAccent }]}>
                  <Ionicons name="sparkles" size={17} color={p.onAccent} />{" "}
                  {aiActive ? "AI Sleep active" : "AI Sleep"}
                </Text>
                <Text style={[styles.aiSleepEntryCopy, { color: p.onAccent }]}>
                  {aiActive
                    ? "Keep listening"
                    : "Fall asleep. We’ll take care of the rest."}
                </Text>
              </Pressable>
              {notice ? (
                <Text style={[styles.notice, { color: p.muted }]}>
                  {notice}
                </Text>
              ) : null}
            </ScrollView>
          </>
        )}
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
      <View style={styles.miniInner}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open now playing"
          onPress={onOpen}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Art url={source.artworkUrl} size={42} radius={12} />
          <View style={styles.miniCopy}>
            <Text
              numberOfLines={1}
              style={[styles.miniTitle, { color: p.text }]}
            >
              {source.title}
            </Text>
            <Text numberOfLines={1} style={[styles.small, { color: p.muted }]}>
              {source.show}
            </Text>
          </View>
        </Pressable>
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
      </View>
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
    publisherEpisodes = state.following.flatMap(
      (show) => state.feedEpisodes[show.id] || [],
    ),
    uniqueEpisodes = publisherEpisodes.filter(
      (episode, index, list) =>
        list.findIndex((item) => item.id === episode.id) === index,
    ),
    episodes = [...uniqueEpisodes].sort(
      (a, b) =>
        Date.parse(b.publishedAt || "") - Date.parse(a.publishedAt || ""),
    );
  if (filter === "Popular")
    episodes = [...uniqueEpisodes]
      .filter(
        (e) =>
          Date.parse(e.publishedAt || "") >=
          Date.now() - (popular === "Week" ? 7 : 30) * 86400000,
      )
      .sort(
        (a, b) =>
          (state.history.find((item) => item.id === b.id)?.playCount || 0) -
          (state.history.find((item) => item.id === a.id)?.playCount || 0),
      );
  if (filter === "Best Rated")
    episodes = [...episodes].sort(
      (a, b) =>
        Number(state.saved.some((e) => e.id === b.id)) -
        Number(state.saved.some((e) => e.id === a.id)),
    );
  let forYou = uniqueEpisodes
    .filter((episode) => !state.history.some((item) => item.id === episode.id))
    .slice(0, 3);
  const continuing = state.history.find(
    (episode) =>
      !episodeDurationMs(episode.duration) ||
      (episode.listenedMs || 0) < episodeDurationMs(episode.duration) - 30000,
  );
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
      {continuing ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Resume ${continuing.title}`}
          onPress={() => onPlay(continuing)}
          style={[styles.continueCard, { borderColor: p.line }]}
        >
          <LinearGradient
            colors={[p.wash, p.surfaceStrong]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.continueCardInner}
          >
            <Art url={continuing.artworkUrl} size={88} radius={21} />
            <View style={styles.continueBody}>
              <Text style={[styles.eyebrow, { color: p.accent }]}>
                CONTINUE LISTENING
              </Text>
              <Text
                numberOfLines={2}
                style={[styles.continueTitle, { color: p.text }]}
              >
                {continuing.title}
              </Text>
              <Text
                numberOfLines={1}
                style={[styles.small, { color: p.muted }]}
              >
                {continuing.showName}
              </Text>
              <Text style={[styles.tiny, { color: p.muted }]}>
                {episodeDurationMs(continuing.duration)
                  ? `${format(Math.max(0, episodeDurationMs(continuing.duration) - (continuing.listenedMs || 0)))} remaining`
                  : "Resume listening"}
              </Text>
              <View
                style={{ height: 3, backgroundColor: p.line, marginTop: 8 }}
              >
                <View
                  style={{
                    height: 3,
                    backgroundColor: p.accent2,
                    width: `${Math.min(100, (100 * (continuing.listenedMs || 0)) / (episodeDurationMs(continuing.duration) || 1))}%`,
                  }}
                />
              </View>
            </View>
            <Ionicons name="play" size={19} color={p.text} />
          </LinearGradient>
        </Pressable>
      ) : !state.following.length ? (
        <Discovery state={state} setState={setState} onOpen={onOpen} p={p} />
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
        {filter !== "Recent" && (
          <Text style={[styles.feedCaption, { color: p.muted }]}>
            {filter === "Popular"
              ? "Your most-played recent releases · no global popularity ranking"
              : "Ratings unavailable · saved episodes first, then newest"}
          </Text>
        )}
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
            Follow shows in Search to make this personal. Radio Star does not
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
  if (order === "Latest")
    shows.sort(
      (a, b) =>
        (Date.parse(state.feedEpisodes[b.id]?.[0]?.publishedAt || "") || 0) -
        (Date.parse(state.feedEpisodes[a.id]?.[0]?.publishedAt || "") || 0),
    );
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
                    ? state.feedEpisodes[show.id][0].title
                    : "Open to see the latest episodes"}
                </Text>
                {show.feedUrl && state.followIntelligence[show.feedUrl] && (
                  <Text numberOfLines={1} style={[styles.tiny, { color: p.muted }]}>
                    {state.followIntelligence[show.feedUrl].code === "RIGHTS_RESTRICTED"
                      ? "Intelligence unavailable for this show’s latest episode"
                      : state.followIntelligence[show.feedUrl].state === "READY" || state.followIntelligence[show.feedUrl].state === "PARTIAL_READY"
                        ? "Latest eligible episode is ready"
                        : state.followIntelligence[show.feedUrl].state === "QUEUED" || state.followIntelligence[show.feedUrl].state === "PROCESSING"
                          ? "Preparing the latest eligible episode"
                          : "Intelligence is currently unavailable"}
                  </Text>
                )}
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
      "Saved Moments": state.moments,
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
              accessibilityRole="tab"
              accessibilityState={{ selected: section === item }}
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
            key={`${episode.id}:${episode.positionMs ?? "episode"}`}
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
  setState: React.Dispatch<React.SetStateAction<ListenerState>>;
  installation?: string;
  onBack: () => void;
  p: Theme;
}) {
  const [deletingProfile, setDeletingProfile] = useState(false);
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [translationVisible, setTranslationVisible] = useState(false);
  useEffect(() => {
    let active = true;
    void listenerRequest("/api/listener/translation").then(() => { if (active) setTranslationVisible(true); }).catch(() => {});
    return () => { active = false; };
  }, []);
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
          accessibilityRole="switch"
          accessibilityLabel="Night mode"
          accessibilityState={{ checked: state.nightMode }}
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
      <Section title="Your listening allowance" p={p}>
        <ReferralPanel p={p} />
      </Section>
      <Section title="Subscriptions" p={p}>
        <SubscriptionPanel p={p} />
      </Section>
      {translationVisible && <Section title="Language & Translation" p={p}><TranslationPanel p={p} /></Section>}
      <Section title="Episode intelligence" p={p}>
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Episode intelligence"
          accessibilityState={{ checked: state.intelligenceEnabled, disabled: savingPrivacy }}
          disabled={savingPrivacy}
          onPress={() => {
            feedback.selection();
            setSavingPrivacy(true);
            void listenerRequest("/api/listener/privacy", { intelligenceEnabled: !state.intelligenceEnabled })
              .then(() => setState(current => ({ ...current, intelligenceEnabled: !state.intelligenceEnabled, intelligencePreferenceVersion: 2 })))
              .catch(() => Alert.alert("Preference not saved", "Connect to the internet and try again. Your previous setting is unchanged."))
              .finally(() => setSavingPrivacy(false));
          }}
          style={[styles.setting, { borderBottomColor: p.line }]}
        >
          <Text style={[styles.settingTitle, { color: p.text }]}>
            Briefs, chapters and moments
          </Text>
          <Text style={[styles.small, { color: p.muted }]}>
            {state.intelligenceEnabled ? "On" : "Off"}
          </Text>
        </Pressable>
        <Text style={[styles.emptyCopy, { color: p.muted }]}>
          Uses authorised publisher transcripts for episodes you open and shows you follow. Turning this off stops future automatic requests for your profile; shared or already-running jobs may finish. Audio analysis asks first. Provider details are in the Privacy Policy.
        </Text>
      </Section>
      <Section title="AI Sleep" p={p}>
        <Text style={[styles.emptyCopy, { color: p.muted }]}>
          AI Sleep learns from extensions and morning feedback on this device.
          It uses no physiological detection and does not upload motion streams.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            Alert.alert(
              "Reset sleep learning?",
              "This removes timing preferences stored on this device. Restart AI Sleep to use the default window.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Reset learning",
                  style: "destructive",
                  onPress: () => void resetSleepLearning(),
                },
              ],
            )
          }
          style={[styles.setting, { borderBottomColor: p.line }]}
        >
          <Text style={[styles.settingTitle, { color: p.text }]}>
            Reset sleep learning
          </Text>
        </Pressable>
        <Text style={[styles.tiny, { color: p.muted }]}>
          Automatic pause in the background still needs physical-device
          validation. Use a manual sleep timer when you need a fixed stopping
          time.
        </Text>
      </Section>
      <Section title="Privacy" p={p}>
        <Pressable accessibilityRole="switch" accessibilityLabel="Remember local listening history"
          accessibilityState={{ checked: state.historyEnabled }}
          style={[styles.setting, { borderBottomColor: p.line }]}
          onPress={() => setState({ ...state, historyEnabled: !state.historyEnabled })}>
          <Text style={[styles.settingTitle, { color: p.text }]}>Remember local listening history</Text>
          <Text style={[styles.small, { color: p.muted }]}>{state.historyEnabled ? "On" : "Off"}</Text>
        </Pressable>
        <Text style={[styles.emptyCopy, { color: p.muted }]}>Turn off to stop adding episodes to local history. Clear existing history below to remove history-based suggestions. Playback position and server allowance reports are separate.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            Alert.alert(
              "Clear listening history?",
              "Clears the history shown on this device. Server listening records used for allowance verification are not removed. Your followed shows and saved episodes stay here.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Clear history",
                  style: "destructive",
                  onPress: () => setState({ ...state, history: [] }),
                },
              ],
            )
          }
          style={[styles.setting, { borderBottomColor: p.line }]}
        >
          <Text style={[styles.settingTitle, { color: p.text }]}>
            Clear history on this device
          </Text>
        </Pressable>
        <LegalLinks p={p} />
        <Pressable accessibilityRole="button" disabled={deletingProfile}
          accessibilityState={{ disabled: deletingProfile }}
          style={[styles.setting, { borderBottomColor: p.line }]}
          onPress={() => Alert.alert("Delete listener profile?",
            "Removes your active server profile, listening records, follows, referrals and local listening data. Beta access ends. Minimal security revocation records and existing backups may remain. Apple subscriptions, if any, must be cancelled separately in Settings. This cannot be undone.",
            [{ text: "Cancel", style: "cancel" }, { text: "Delete profile", style: "destructive", onPress: () => {
              setDeletingProfile(true);
              void deleteListenerProfile().catch((error) => {
                setDeletingProfile(false);
                Alert.alert("Deletion could not finish", error instanceof Error ? error.message : "Please try again, or contact info@getradiostar.com.");
              });
            } }])}>
          <Text style={[styles.settingTitle, { color: p.text }]}>{deletingProfile ? "Deleting profile…" : "Delete listener profile"}</Text>
        </Pressable>
        <ProblemReport p={p} />
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
  setState: React.Dispatch<React.SetStateAction<ListenerState>>;
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
          setState((current) => ({
            ...current,
            feedEpisodes: {
              ...current.feedEpisodes,
              [show.id]: streamable.map((episode) => asStored(episode, show)),
            },
          }));
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
          const next = !following;
          setState({
            ...state,
            following: toggleById(state.following, show),
          });
          if (show.feedUrl) void updateFollow(show.feedUrl, next)
            .then((result) => setState((current) => ({ ...current, followIntelligence: {
              ...current.followIntelligence,
              [show.feedUrl!]: result.processing || { state: "DISABLED" },
            } })))
            .catch(() => {});
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
          style={[
            styles.primaryText,
            { color: following ? p.text : p.onAccent },
          ]}
        >
          {following ? "✓ Following" : "＋ Follow show"}
        </Text>
      </Pressable>
      <Text style={[styles.emptyCopy, { color: p.muted, marginTop: 12 }]}>
        Live publisher feed · real streamable episodes
      </Text>
      {following && show.feedUrl && state.followIntelligence[show.feedUrl] && (
        <Text accessibilityLiveRegion="polite" style={[styles.feedCaption, { color: p.muted }]}>
          {state.followIntelligence[show.feedUrl].code === "RIGHTS_RESTRICTED"
            ? "Intelligence is not available for this show’s latest episode because the publisher has not authorised displayed AI notes. Listening is unchanged."
            : state.followIntelligence[show.feedUrl].state === "READY" || state.followIntelligence[show.feedUrl].state === "PARTIAL_READY"
              ? "Latest eligible episode is ready for intelligence."
              : state.followIntelligence[show.feedUrl].state === "QUEUED" || state.followIntelligence[show.feedUrl].state === "PROCESSING"
                ? "Preparing the latest eligible episode. You can listen while this continues."
                : "Intelligence is currently unavailable for the latest episode."}
        </Text>
      )}
      <Section title="Episodes" p={p}>
        {busy ? (
          <LoadingState p={p} label="Loading publisher episodes…" />
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
    [launchMode, setLaunchMode] = useState<"full" | "warm" | "complete" | null>(null),
    [launchTheme, setLaunchTheme] = useState<Theme>(light),
    [playerOpen, setPlayerOpen] = useState(false);
  let p = state.nightMode ? dark : light;
  useEffect(() => {
    void (async () => {
      let value = await getIdentity("star-cast-installation-credential");
      if (!value) {
        value = Crypto.randomUUID();
        await setIdentity("star-cast-installation-credential", value);
      }
      const [listenerState, launchHistory, appearance] = await Promise.all([
        loadListenerState(),
        getIdentity(launchHistoryKey),
        getIdentity(appearancePreferenceKey),
      ]);
      setInstallation(value);
      setLaunchTheme(
        appearance === "night" || (!appearance && listenerState.nightMode)
          ? dark
          : light,
      );
      setState(listenerState);
      setLaunchMode(launchHistory ? "warm" : "full");
      setHydrated(true);
    })();
  }, []);
  useEffect(() => {
    if (hydrated) void saveListenerState(state);
  }, [hydrated, state]);
  useEffect(() => {
    if (hydrated)
      void setIdentity(
        appearancePreferenceKey,
        state.nightMode ? "night" : "day",
      );
  }, [hydrated, state.nightMode]);
  useEffect(() => {
    if (!hydrated) return;
    let live = true;
    void Promise.allSettled(
      state.following
        .filter((show) => show.feedUrl)
        .slice(0, 30)
        .map(async (show) => ({ show, feed: await loadFeed(show.feedUrl!) })),
    ).then((results) => {
      if (!live) return;
      setState((current) => ({
        ...current,
        feedEpisodes: {
          ...current.feedEpisodes,
          ...Object.fromEntries(
            results.flatMap((result) =>
              result.status === "fulfilled"
                ? [
                    [
                      result.value.show.id,
                      result.value.feed.episodes
                        .filter((e) => e.audioUrl)
                        .map((e) => asStored(e, result.value.show)),
                    ],
                  ]
                : [],
            ),
          ),
        },
      }));
    });
    return () => {
      live = false;
    };
  }, [hydrated, state.following]);
  let playStored = (episode: StoredEpisode) => {
    let source: Source = {
      episodeId: episode.id,
      url: episode.audioUrl,
      title: episode.title,
      show: episode.showName,
      artworkUrl: episode.artworkUrl,
      feedUrl: episode.feedUrl,
      hasPublisherTranscript: episode.hasPublisherTranscript,
      startPositionMs: episode.positionMs,
    };
    setState((current) => ({
      ...current,
      history: current.historyEnabled ? recordHistory(current.history, episode) : current.history,
    }));
    setPlayerOpen(true);
    return source;
  };
  if (!hydrated || launchMode === null) return <LaunchRestoring p={launchTheme} />;
  return (
    <View style={styles.launchHost}>
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
      {launchMode !== "complete" ? (
        <LaunchExperience
          p={p}
          full={launchMode === "full"}
          onComplete={() => {
            void setIdentity(launchHistoryKey, "seen");
            setLaunchMode("complete");
          }}
        />
      ) : null}
    </View>
  );
}

function LegalLinks({ p }: { p: Theme }) {
  return <View style={{ gap: 8 }}>
    {[ ["Privacy Policy", "https://www.getradiostar.com/privacy"], ["Terms of Service", "https://www.getradiostar.com/terms"], ["Contact support", "mailto:info@getradiostar.com"] ].map(([label, url]) =>
      <Pressable key={url} accessibilityRole="link" style={{ minHeight: 44, justifyContent: "center" }}
        onPress={() => { void Linking.openURL(url).catch(() => Alert.alert("Could not open link", url)); }}>
        <Text style={[styles.link, { color: p.accent2 }]}>{label} ↗</Text>
      </Pressable>)}
  </View>;
}

function PilotEnrollment({ onEnrolled }: { onEnrolled: () => void }) {
  const [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: light.bg }]}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      <LinearGradient
        colors={[light.bg, "#EEE9FF", light.bg]}
        style={[styles.pilotEnrollment, { backgroundColor: light.bg, paddingVertical: 24 }]}
      >
        <Text style={[styles.wordmark, { color: light.text }]}>RADIO <Text style={{ color: light.accent }}>✦</Text> STAR</Text>
        <View style={[styles.pilotCard, { backgroundColor: light.surface, borderColor: light.line }]}>
          <Text style={[styles.eyebrow, { color: light.accent }]}>PRIVATE BETA</Text>
          <Text style={[styles.pilotTitle, { color: light.text }]}>Your listening space is ready.</Text>
          <Text style={[styles.emptyCopy, { color: light.muted }]}>Enter the private-beta access code supplied with your TestFlight invitation. It securely connects this installation to Radio Star.</Text>
          <TextInput
            accessibilityLabel="Private-beta access code"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            maxLength={80}
            onChangeText={(value) => { setCode(value); setMessage(""); }}
            placeholder="Private-beta access code"
            placeholderTextColor={light.muted}
            value={code}
            style={[styles.pilotInput, { borderColor: light.line, color: light.text, backgroundColor: light.surfaceStrong }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy || !code.trim() }}
            disabled={busy || !code.trim()}
            onPress={() => {
              setBusy(true);
              void enrollPrivatePilot(code)
                .then(() => { feedback.success(); onEnrolled(); })
                .catch((error) => setMessage(error instanceof Error ? error.message : "This access code could not be accepted."))
                .finally(() => setBusy(false));
            }}
            style={[styles.primary, { backgroundColor: light.accent2, opacity: busy || !code.trim() ? 0.55 : 1 }]}
          >
            <Text style={[styles.primaryText, { color: light.onAccent }]}>{busy ? "Connecting securely…" : "Connect Radio Star"}</Text>
          </Pressable>
          {!!message && <Text accessibilityLiveRegion="polite" style={{ color: "#E78FA9", textAlign: "center" }}>{message}</Text>}
        </View>
        <Text style={[styles.pilotFootnote, { color: light.muted }]}>No OpenAI credential or shared server secret is stored in this app.</Text>
        <LegalLinks p={light} />
      </LinearGradient>
      </ScrollView>
    </SafeAreaView>
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
  let { play, snapshot } = usePlayback();
  const progressBucket = Math.floor(snapshot.positionMs / 5000);
  useEffect(() => {
    if (!hydrated || !snapshot.episodeId) return;
    setState((current) =>
      current.historyEnabled && current.history.some((e) => e.id === snapshot.episodeId)
        ? {
            ...current,
            history: current.history.map((e) =>
              e.id === snapshot.episodeId
                ? { ...e, listenedMs: snapshot.positionMs }
                : e,
            ),
          }
        : current,
    );
  }, [hydrated, snapshot.episodeId, progressBucket, snapshot.playing]);
  const profileReturn = useRef<Page>("Listen");
  let run = (episode: StoredEpisode) => {
    void play(playStored(episode)).catch(() =>
      Alert.alert(
        "Playback unavailable",
        "This episode could not load. Check your connection and try again.",
      ),
    );
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
    page === "Profile" ? (
      <Profile
        state={state}
        setState={setState}
        installation={installation}
        onBack={() => setPage(profileReturn.current)}
        p={p}
      />
    ) : page === "Show" && selectedShow ? (
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
      {hydrated && <ListenerSync onboarded={state.onboardingComplete} intelligenceEnabled={state.intelligenceEnabled} />}
      <AmbientBackdrop p={p} />
      <View style={styles.root}>
        <View style={styles.topbar}>
          <Pressable
            onPress={() => selectTab("Listen")}
            accessibilityRole="button"
          >
            <Text style={[styles.wordmark, { color: p.text }]}>
              RADIO <Text style={{ color: p.accent }}>✦</Text> STAR
            </Text>
          </Pressable>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel="Toggle day and night appearance"
              accessibilityState={{ checked: state.nightMode }}
              onPress={() => {
                feedback.selection();
                setState((current) => ({ ...current, nightMode: !current.nightMode }));
              }}
              style={[styles.appearanceButton, { backgroundColor: p.wash, borderColor: p.line }]}
            >
              <Ionicons name={state.nightMode ? "sunny-outline" : "moon-outline"} size={19} color={p.text} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open profile"
              onPress={() => {
                profileReturn.current =
                  page === "Profile" ? profileReturn.current : page;
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
        </View>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            <View style={{ display: page === "Listen" ? "flex" : "none" }}>
              <Listen
                state={state}
                setState={setState}
                onPlay={run}
                onOpen={openShow}
                p={p}
              />
            </View>
            <View style={{ display: page === "Following" ? "flex" : "none" }}>
              <Following
                state={state}
                onOpen={openShow}
                onDiscover={() => selectTab("Search")}
                p={p}
              />
            </View>
            <View style={{ display: page === "Library" ? "flex" : "none" }}>
              <Library state={state} onPlay={run} p={p} />
            </View>
            <View style={{ display: page === "Search" ? "flex" : "none" }}>
              <SearchScreen
                state={state}
                setState={setState}
                onOpen={openShow}
                onPlay={run}
                p={p}
                active={page === "Search"}
              />
            </View>
            {page === "Show" || page === "Profile" ? (
              <SwipeBack
                onBack={() =>
                  page === "Profile"
                    ? setPage(profileReturn.current)
                    : selectTab(backPage)
                }
              >
                {content}
              </SwipeBack>
            ) : (
              content
            )}
          </ScrollView>
        </KeyboardAvoidingView>
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
        enabled={hydrated && state.intelligenceEnabled}
        onEnable={() =>
          setState((current) => ({ ...current, intelligenceEnabled: true }))
        }
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
  const [checkingPilot, setCheckingPilot] = useState(true),
    [enrolled, setEnrolled] = useState(false);
  useEffect(() => {
    void hasPilotAccess().then(setEnrolled).finally(() => setCheckingPilot(false));
    return onSessionEnded(() => setEnrolled(false));
  }, []);
  return (
    <PlaybackProvider key={enrolled ? "listener" : "enrollment"}>
      {checkingPilot ? (
        <LaunchRestoring p={light} />
      ) : enrolled ? <AppShell /> : <PilotEnrollment onEnrolled={() => { resetListenerConnection(); setEnrolled(true); }} />}
    </PlaybackProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  launchHost: { flex: 1 },
  launchSurface: { flex: 1 },
  launchOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 20,
  },
  launchGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  launchRestoringContent: {
    alignItems: "center",
    gap: 24,
  },
  launchRestoringMark: {
    width: 92,
    height: 92,
    borderRadius: 25,
  },
  launchHalo: {
    width: 280,
    height: 280,
    alignItems: "center",
    justifyContent: "center",
  },
  launchAura: {
    position: "absolute",
    width: 238,
    height: 238,
    borderRadius: 119,
    opacity: 0.15,
  },
  launchRing: {
    position: "absolute",
    borderWidth: 1.5,
    borderRadius: 999,
  },
  launchRingOne: { width: 164, height: 164 },
  launchRingTwo: { width: 222, height: 222 },
  launchRingThree: { width: 275, height: 275 },
  launchMark: {
    width: 104,
    height: 104,
    borderRadius: 29,
  },
  launchWordmark: {
    fontSize: 31,
    lineHeight: 36,
    letterSpacing: -2,
    fontWeight: "800",
    textAlign: "center",
  },
  launchTagline: {
    marginTop: 9,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 2.2,
    fontWeight: "700",
    textAlign: "center",
  },
  launchStatus: {
    position: "absolute",
    bottom: 54,
    alignItems: "center",
    gap: 15,
  },
  launchStatusLine: {
    width: 70,
    height: 2,
    borderRadius: 99,
    overflow: "hidden",
  },
  launchStatusAccent: { width: 31, height: 2, borderRadius: 99 },
  launchStatusText: { fontSize: 11, letterSpacing: 0.35 },
  root: { flex: 1, maxWidth: 760, width: "100%", alignSelf: "center" },
  pilotEnrollment: { flex: 1, paddingHorizontal: 25, justifyContent: "center", gap: 26 },
  pilotCard: { borderWidth: 1, borderRadius: 28, padding: 24, gap: 16 },
  pilotTitle: { fontSize: 31, lineHeight: 37, letterSpacing: -1.1, fontWeight: "700" },
  pilotInput: { minHeight: 54, borderWidth: 1, borderRadius: 15, paddingHorizontal: 15, fontSize: 16 },
  pilotFootnote: { textAlign: "center", fontSize: 12, lineHeight: 18, paddingHorizontal: 14 },
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
  headerActions: { flexDirection: "row", alignItems: "center", gap: 9 },
  appearanceButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
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
  settingTitle: { fontSize: 16, fontWeight: "700", flexShrink: 1, paddingRight: 8 },
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
    bottom: 87,
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
    width: 44,
    height: 44,
    borderRadius: 22,
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
  },
  intelligenceHeader: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  intelligenceHeaderCopy: { flex: 1, minWidth: 0 },
  intelligenceStatus: { fontSize: 16, fontWeight: "700", marginTop: 3 },
  intelligenceCopy: { fontSize: 13, lineHeight: 18, paddingBottom: 8 },
  intelligenceRow: {
    minHeight: 64,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  intelligenceDetail: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  tool: {
    minHeight: 59,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  briefCard: { marginTop: 14, gap: 8 },
  briefOverview: { fontSize: 16, lineHeight: 22, fontWeight: "700" },
  chapterRow: {
    minHeight: 48,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  momentSearchRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  momentInput: {
    flex: 1,
    minHeight: 42,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  momentButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
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
