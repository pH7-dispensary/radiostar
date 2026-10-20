import { useEffect, useRef, useState } from "react";
import {
  Animated,
  LayoutAnimation,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import {
  findEpisodeMoment,
  isProcessing,
  preflightEpisode,
  processingLabel,
  type AnalysisPreflight,
  type EpisodeMoment,
} from "./api";
import type { Source } from "./PlaybackProvider";
import type { StarTheme } from "./design";
import type { useEpisodeIntelligence } from "./useEpisodeIntelligence";
import { feedback } from "./feedback";
import { LoadingState, useReducedMotion } from "./LoadingState";
import { IntelligencePreparation } from "./IntelligencePreparation";
import { usePlayback } from "./PlaybackProvider";
import { AdSkipPanel } from "./AdSkipPanel";

type Panel = "brief" | "explore" | "ads";
const stamp = (ms: number) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

export function EpisodeIntelligenceView({
  panel,
  source,
  p,
  enabled,
  onEnable,
  onBack,
  onPlay,
  intelligence,
}: {
  panel: Panel;
  source: Source;
  p: StarTheme;
  enabled: boolean;
  onEnable(): void;
  onBack(): void;
  onPlay(ms: number): Promise<unknown>;
  intelligence: ReturnType<typeof useEpisodeIntelligence>;
}) {
  const { status, session, busy, error, paused } = intelligence;
  const [tab, setTab] = useState("Chapters");
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [moments, setMoments] = useState<EpisodeMoment[]>([]);
  const tabsRef = useRef<ScrollView>(null);
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const [tabsWidth, setTabsWidth] = useState(Math.min(windowWidth, 720) - 40);
  const visibleTabs = Math.max(
    1,
    Math.min(4, Math.floor(tabsWidth / (84 * fontScale))),
  );
  const { snapshot } = usePlayback();
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [consent, setConsent] = useState<AnalysisPreflight | null>(null);
  const alive = useRef(true);
  const revision = useRef(0);
  const reduced = useReducedMotion();
  const reveal = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      revision.current++;
    };
  }, []);
  useEffect(() => {
    if (!status?.brief || reduced) return;
    reveal.setValue(0);
    const animation = Animated.timing(reveal, {
      toValue: 1,
      duration: 240,
      useNativeDriver: true,
    });
    animation.start();
    feedback.success();
    return () => animation.stop();
  }, [status?.brief, reduced, reveal]);
  const action = (label: string, onPress: () => void, secondary = false) => (
    <Pressable
      accessibilityRole="button"
      disabled={working || busy}
      onPress={() => {
        feedback.light();
        onPress();
      }}
      style={[
        s.button,
        {
          backgroundColor: secondary ? p.wash : p.accent2,
          opacity: working || busy ? 0.55 : 1,
        },
      ]}
    >
      <Text style={[s.buttonText, { color: secondary ? p.text : p.onAccent }]}>
        {label}
      </Text>
    </Pressable>
  );
  const playAt = (ms: number) => {
    if (!Number.isFinite(ms) || ms < 0) return;
    feedback.light();
    void onPlay(ms).catch(
      () =>
        alive.current &&
        setMessage("This audio could not be played. Please try again."),
    );
  };
  const lookup = async (question = query) => {
    if (!source.feedUrl || question.trim().length < 2 || working) return;
    const version = ++revision.current;
    setWorking(true);
    setMessage("");
    setQuery(question);
    setTab("Find a Moment");
    try {
      const result = await findEpisodeMoment(
        source.feedUrl,
        source.episodeId,
        question.trim(),
      );
      if (!alive.current || version !== revision.current) return;
      setMoments(result.moments);
      setMessage(
        result.moments.length
          ? "Matched passages from this episode’s transcript."
          : "No verified moment matches that question in this transcript.",
      );
    } catch {
      if (alive.current)
        setMessage("Could not search this transcript. Please try again.");
    } finally {
      if (alive.current) setWorking(false);
    }
  };
  const prepareConsent = async () => {
    if (!source.feedUrl || working) return;
    setWorking(true);
    setMessage("");
    try {
      const check = await preflightEpisode(source.feedUrl, source.episodeId);
      if (!alive.current) return;
      if (!check.withinLimit)
        setMessage("Choose an episode under the two-hour analysis limit.");
      else if (!check.analysisEnabled || !check.audioEnabled)
        setMessage(
          "Audio analysis is not available on your listening server. You can keep listening.",
        );
      else if (!check.durationMs)
        setMessage(
          "The publisher has not supplied a duration, so audio analysis cannot start safely.",
        );
      else setConsent(check);
    } catch {
      if (alive.current)
        setMessage("Could not check the analysis allowance. Please try again.");
    } finally {
      if (alive.current) setWorking(false);
    }
  };
  const processing = isProcessing(status) && !paused;
  const availabilityCode = status?.availabilityCode || status?.code || "";
  const rightsRestricted = [
    "RIGHTS_RESTRICTED",
    "LEGAL_BASIS_NOT_ESTABLISHED",
  ].includes(availabilityCode);
  const terminalMessage = processingLabel(status);
  const terminalHeading: Record<string, string> = {
    DURATION_LIMIT: "This episode needs a transcript.",
    TRANSCRIPT_UNAVAILABLE: "No usable transcript found.",
    AUDIO_TRANSCRIPTION_NOT_AUTHORISED:
      "Audio transcription isn’t available.",
    BUDGET_LIMIT: "Preparation is paused.",
    PROCESSING_TIMEOUT: "Preparation was interrupted.",
  };
  const emptyHeading = !source.feedUrl
    ? "Open this from its podcast."
    : rightsRestricted
      ? "Intelligence isn’t available for this episode."
      : terminalHeading[availabilityCode]
        ? terminalHeading[availabilityCode]
        : status?.requiresAudioConsent
        ? "Listen a little deeper."
        : status?.state === "BUDGET_PAUSED"
          ? "AI insights are paused for this episode."
        : status?.state === "UNAVAILABLE"
          ? "AI insights aren't available for this episode."
          : status?.state === "FAILED"
            ? "This episode could not be prepared."
            : "Preparing this episode.";
  const emptyCopy = !source.feedUrl
    ? "Open this episode from its podcast in Search so Radio Star can find its publisher feed."
    : rightsRestricted
      ? terminalMessage
      : availabilityCode
        ? terminalMessage
        : status?.reason || "This episode has not been prepared yet.";
  const scrollSelectedTab = () => {
    const index = ["Chapters", "Topics", "Find a Moment"].indexOf(
      tab,
    );
    tabsRef.current?.scrollTo({
      x:
        index >= visibleTabs
          ? ((index - visibleTabs + 1) * tabsWidth) / visibleTabs
          : 0,
      animated: !reduced,
    });
  };
  useEffect(scrollSelectedTab, [tab, reduced, tabsWidth, visibleTabs]);
  const headerContent = (
    <>
      <View style={s.episode}>
        {source.artworkUrl ? (
          <Image
            source={{ uri: source.artworkUrl }}
            style={s.art}
            accessibilityLabel="Episode artwork"
          />
        ) : null}
        <View style={{ flex: 1, gap: 3 }}>
          <Text numberOfLines={1} style={[s.caption, { color: p.muted }]}>
            {source.show}
          </Text>
          <Text numberOfLines={2} style={[s.episodeTitle, { color: p.text }]}>
            {source.title}
          </Text>
        </View>
      </View>
      <Text
        accessibilityRole="header"
        style={[s.eyebrow, { color: p.accent2, marginTop: 8 }]}
      >
        {panel === "brief"
          ? "THE BRIEF"
          : panel === "explore"
            ? "EXPLORE EPISODE"
            : "AD SKIP"}
      </Text>
      {panel === "explore" && (
        <ScrollView
          ref={tabsRef}
          horizontal
          onLayout={(e) => setTabsWidth(e.nativeEvent.layout.width)}
          onContentSizeChange={scrollSelectedTab}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.tabs}
        >
          {["Chapters", "Topics", "Find a Moment"].map(
            (label) => (
              <Pressable
                key={label}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === label }}
                onPress={() => {
                  setTab(label);
                  setMessage("");
                  feedback.selection();
                }}
                style={[
                  s.tab,
                  {
                    width: tabsWidth / visibleTabs,
                    backgroundColor: tab === label ? p.wash : "transparent",
                    borderColor: tab === label ? p.accent2 : "transparent",
                  },
                ]}
              >
                <Text
                  style={{
                    color: tab === label ? p.text : p.muted,
                    fontWeight: "600",
                    fontSize: 14,
                  }}
                >
                  {label === "Find a Moment" ? "Moments" : label}
                </Text>
              </Pressable>
            ),
          )}
        </ScrollView>
      )}
    </>
  );
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={s.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to player"
          onPress={onBack}
          style={[s.back, { borderColor: p.line }]}
        >
          <Ionicons name="chevron-back" size={22} color={p.text} />
        </Pressable>
        <Text style={[s.eyebrow, { color: p.accent2 }]}>RADIO STAR</Text>
        <View style={{ width: 44, height: 44 }} />
      </View>
      <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.content}
        >
          {headerContent}
          {panel === "ads" ? (
            <AdSkipPanel source={source} p={p} onPlay={onPlay} />
          ) : !enabled ? (
            <LinearGradient
              colors={[p.wash, p.surfaceStrong]}
              style={[s.card, { borderColor: p.line }]}
            >
              <Ionicons name="sparkles" size={28} color={p.accent2} />
              <Text style={[s.heading, { color: p.text }]}>
                More from every listen.
              </Text>
              <Text style={[s.copy, { color: p.muted }]}>
                Briefs, chapters and moments, together. Episodes you open can
                use publisher transcripts within your server’s allowance. Audio
                transcription always asks first. Ad Skip stays independent.
              </Text>
              {action("Enable Radio Star Intelligence", onEnable)}
              <Text style={[s.caption, { color: p.muted }]}>
                Remembered on this device.
              </Text>
            </LinearGradient>
          ) : (
            <>
              {processing && !status?.brief && !paused && (
                <IntelligencePreparation p={p} status={status} />
              )}
              {busy && !processing && !status?.brief && !paused && (
                <LoadingState p={p} label="Checking this conversation." />
              )}
              {error ? (
                <View style={[s.card, { borderColor: p.line }]}>
                  <Text
                    accessibilityLiveRegion="polite"
                    style={[s.copy, { color: p.muted }]}
                  >
                    {error}
                  </Text>
                  {action("Check again", () => void session?.refresh(), true)}
                </View>
              ) : null}
              {processing && <Text style={[s.processingNote, { color: p.muted }]}>Listening stays available while preparation continues in the background.</Text>}
              {!processing && !busy && !error && !status?.brief && (
                <View
                  style={[
                    s.card,
                    { borderColor: p.line, backgroundColor: p.surface },
                  ]}
                >
                  <Text style={[s.heading, { color: p.text }]}>
                    {emptyHeading}
                  </Text>
                  <Text
                    accessibilityLiveRegion="polite"
                    style={[s.copy, { color: p.muted }]}
                  >
                    {emptyCopy}
                  </Text>
                  {!source.feedUrl
                    ? action("Back to player", onBack, true)
                    : rightsRestricted
                      ? action("Back to player", onBack, true)
                    : status?.requiresAudioConsent
                      ? action(
                          "Use audio analysis",
                          () => void prepareConsent(),
                        )
                      : status?.retryable ||
                          status?.state === "NOT_REQUESTED" ||
                          status?.code === "SERVER_UNAVAILABLE"
                        ? action("Try again", () => void session?.request())
                        : action(
                            "Check again",
                            () => void session?.refresh(),
                            true,
                          )}
                </View>
              )}
              {consent && (
                <View
                  style={[
                    s.card,
                    { borderColor: p.accent2, backgroundColor: p.wash },
                  ]}
                >
                  <Text style={[s.heading, { color: p.text }]}>
                    Analyse this episode’s audio?
                  </Text>
                  <Text style={[s.copy, { color: p.muted }]}>
                    No usable publisher transcript was found. Transcribing{" "}
                    {Math.ceil((consent.durationMs || 0) / 60000)} minutes is
                    estimated at ${consent.estimatedAudioCost?.toFixed(2)} plus
                    a small text-analysis cost. Your server’s daily, monthly and
                    duration limits still apply. Inserted ads can make the
                    delivered audio longer; usage is based on its measured
                    duration. It may take several minutes.
                  </Text>
                  {action("Confirm audio analysis", () => {
                    setConsent(null);
                    void session?.request({ allowAudio: true });
                  })}
                  {action("Not now", () => setConsent(null), true)}
                </View>
              )}
              {panel === "brief" && status?.brief && (
                <Animated.View
                  style={[
                    s.card,
                    {
                      opacity: reveal,
                      backgroundColor: p.surfaceStrong,
                      borderColor: p.line,
                    },
                  ]}
                >
                  {status.qualityNote && (
                    <Text style={[s.copy, { color: p.muted }]}>
                      {status.qualityNote}
                    </Text>
                  )}
                  <Text style={[s.overview, { color: p.text }]}>
                    {status.brief.overview}
                  </Text>
                  {!!status.brief.themes.length && (
                    <Text style={[s.eyebrow, { color: p.accent2 }]}>
                      KEY IDEAS
                    </Text>
                  )}
                  <View style={s.themes}>
                    {status.brief.themes.slice(0, 6).map((theme) => (
                      <View
                        key={theme}
                        style={[s.theme, { backgroundColor: p.wash }]}
                      >
                        <Text style={[s.copy, { color: p.text }]}>{theme}</Text>
                      </View>
                    ))}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    onPress={() => {
                      if (!reduced)
                        LayoutAnimation.configureNext(
                          LayoutAnimation.Presets.easeInEaseOut,
                        );
                      setExpanded(!expanded);
                      feedback.selection();
                    }}
                    style={s.quietButton}
                  >
                    <Text style={{ color: p.accent2, fontWeight: "600" }}>
                      {expanded
                        ? "Less detail −"
                        : status.brief.mode === "extractive"
                          ? "Read source excerpts +"
                          : "EXPLORE FURTHER +"}
                    </Text>
                  </Pressable>
                  {expanded && (
                    <Text style={[s.copy, { color: p.text }]}>
                      {status.brief.detail.replace(
                        /\s*Coverage is based on segments?[\s\d,–—.\-]+$/i,
                        "",
                      )}
                    </Text>
                  )}
                </Animated.View>
              )}
              {panel === "explore" && (
                <>
                  {status?.qualityNote && (
                    <Text style={[s.copy, { color: p.muted }]}>
                      Some generated content could not be verified. Available
                      chapters and transcript passages are shown below.
                    </Text>
                  )}
                  {tab === "Topics" &&
                    status?.brief &&
                    !status.brief.themes.length && (
                      <Text style={[s.copy, { color: p.muted }]}>
                        No verified topic summary is available. Search the
                        transcript in Find a Moment instead.
                      </Text>
                    )}
                  {tab === "Chapters" &&
                    status?.chapters?.map((chapter, index) => (
                      <Pressable
                        key={`${chapter.startMs}-${chapter.title}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Play chapter: ${chapter.title}`}
                        onPress={() => playAt(chapter.startMs)}
                        style={[
                          s.row,
                          { borderColor: p.line, backgroundColor: p.surface },
                        ]}
                      >
                        <Text style={[s.number, { color: p.accent2 }]}>
                          {String(index + 1).padStart(2, "0")}
                        </Text>
                        <View style={{ flex: 1, gap: 6 }}>
                          <Text style={[s.heading, { color: p.text }]}>
                            {chapter.title}
                          </Text>
                          <Text
                            numberOfLines={2}
                            style={[s.copy, { color: p.muted }]}
                          >
                            {chapter.description}
                          </Text>
                          <Text style={[s.caption, { color: p.accent2 }]}>
                            Play from {stamp(chapter.startMs)}
                          </Text>
                        </View>
                        <Ionicons name="play" size={16} color={p.accent2} />
                      </Pressable>
                    ))}
                  {tab === "Chapters" &&
                    status?.brief &&
                    !status.chapters?.length && (
                      <Text style={[s.copy, { color: p.muted }]}>
                        This transcript does not support verified chapters. You
                        can still read the brief and explore its text.
                      </Text>
                    )}
                  {tab === "Topics" &&
                    status?.brief?.themes.map((theme) => (
                      <Pressable
                        accessibilityRole="button"
                        key={theme}
                        onPress={() => void lookup(theme)}
                        style={[
                          s.row,
                          { backgroundColor: p.surface, borderColor: p.line },
                        ]}
                      >
                        <Ionicons
                          name="sparkles-outline"
                          size={20}
                          color={p.accent2}
                        />
                        <Text style={[s.heading, { color: p.text, flex: 1 }]}>
                          {theme}
                        </Text>
                        <Ionicons
                          name="arrow-forward"
                          size={18}
                          color={p.muted}
                        />
                      </Pressable>
                    ))}
                  {tab === "Find a Moment" && (
                    <>
                      <View
                        style={[
                          s.inputRow,
                          { backgroundColor: p.surface, borderColor: p.line },
                        ]}
                      >
                        <TextInput
                          accessibilityLabel="Find a moment in this episode"
                          value={query}
                          onChangeText={setQuery}
                          onSubmitEditing={() => void lookup()}
                          placeholder="Where did they discuss…"
                          placeholderTextColor={p.muted}
                          style={[s.input, { color: p.text }]}
                          maxLength={600}
                          returnKeyType="search"
                        />
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Find moment"
                          disabled={working || !status?.transcriptAvailable}
                          onPress={() => void lookup()}
                          style={s.back}
                        >
                          <Ionicons
                            name="arrow-forward"
                            color={p.accent2}
                            size={22}
                          />
                        </Pressable>
                      </View>
                      {!status?.transcriptAvailable && (
                        <Text style={[s.copy, { color: p.muted }]}>
                          Search becomes available as soon as the transcript
                          arrives.
                        </Text>
                      )}
                      {!query &&
                        status?.brief?.themes.slice(0, 3).map((theme) => (
                          <Pressable
                            key={theme}
                            accessibilityRole="button"
                            onPress={() => void lookup(theme)}
                            style={s.quietButton}
                          >
                            <Text style={[s.copy, { color: p.accent2 }]}>
                              Where did they discuss {theme.toLowerCase()}?
                            </Text>
                          </Pressable>
                        ))}
                      {moments.map((moment) => (
                        <Pressable
                          key={moment.segmentId}
                          accessibilityRole="button"
                          accessibilityLabel={`Play from ${stamp(moment.startMs)}`}
                          onPress={() => playAt(moment.startMs)}
                          style={[
                            s.card,
                            { backgroundColor: p.surface, borderColor: p.line },
                          ]}
                        >
                          <Text style={[s.copy, { color: p.text }]}>
                            {moment.context}
                          </Text>
                          <Text style={[s.caption, { color: p.accent2 }]}>
                            Play from {stamp(moment.startMs)}
                          </Text>
                          {moment.relatedChapters?.map((chapter) => (
                            <Text
                              key={chapter.startMs}
                              style={[s.caption, { color: p.muted }]}
                            >
                              In chapter: {chapter.title}
                            </Text>
                          ))}
                        </Pressable>
                      ))}
                    </>
                  )}
                </>
              )}
              {working && (
                <LoadingState compact p={p} label="Finding your moment…" />
              )}
              {message ? (
                <Text
                  accessibilityLiveRegion="polite"
                  style={[s.copy, { color: p.muted }]}
                >
                  {message}
                </Text>
              ) : null}
              {status?.provenance && (
                <Text style={[s.caption, { color: p.muted }]}>
                  {status.provenance.sourceType === "publisher_rss"
                    ? "Grounded in the publisher transcript"
                    : "Grounded in transcribed episode audio"}
                  {status.readiness === "TEXT_ONLY"
                    ? " · text only, no verified seek positions"
                    : status.readiness === "PARTIAL"
                      ? " · partial transcript coverage"
                      : ""}
                  .
                </Text>
              )}
            </>
          )}
        </ScrollView>
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  header: {
    paddingHorizontal: 22,
    paddingTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  back: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
  },
  content: {
    padding: 20,
    paddingBottom: 48,
    gap: 12,
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
  episode: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 2,
  },
  art: { width: 44, height: 44, borderRadius: 12 },
  episodeTitle: { fontSize: 15, lineHeight: 21, fontWeight: "600" },
  eyebrow: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  title: {
    fontSize: 32,
    lineHeight: 37,
    fontWeight: "700",
    letterSpacing: -1.1,
  },
  heading: { fontSize: 17, lineHeight: 24, fontWeight: "600" },
  overview: {
    fontSize: 17,
    lineHeight: 26,
    letterSpacing: -0.4,
    fontWeight: "500",
  },
  copy: { fontSize: 15, lineHeight: 22 },
  caption: { fontSize: 12, lineHeight: 19 },
  card: {
    padding: 16,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  loading: { paddingVertical: 20, gap: 22 },
  button: {
    minHeight: 48,
    borderRadius: 16,
    padding: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: { fontSize: 15, fontWeight: "600", textAlign: "center" },
  quietButton: { minHeight: 44, justifyContent: "center" },
  processingNote: { fontSize: 13, lineHeight: 19, paddingHorizontal: 4 },
  tabs: { gap: 0, paddingVertical: 4 },
  tab: {
    minHeight: 44,
    justifyContent: "center",
    borderRadius: 22,
    paddingHorizontal: 6,
    alignItems: "center",
    borderWidth: 1,
  },
  themes: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  theme: {
    maxWidth: "100%",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  number: {
    fontSize: 12,
    fontWeight: "600",
    alignSelf: "flex-start",
    paddingTop: 5,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 18,
    padding: 6,
  },
  input: { flex: 1, minHeight: 44, paddingHorizontal: 10, fontSize: 15 },
  transcriptRow: {
    flexDirection: "row",
    gap: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  timestamp: { minWidth: 48, minHeight: 44, justifyContent: "center" },
});
