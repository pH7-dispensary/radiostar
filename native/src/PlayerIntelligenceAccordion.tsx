import { useEffect, useRef, useState } from "react";
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AdSkipPanel } from "./AdSkipPanel";
import {
  findEpisodeMoment,
  isProcessing,
  type EpisodeMoment,
} from "./api";
import type { StarTheme } from "./design";
import { feedback } from "./feedback";
import { IntelligencePreparation } from "./IntelligencePreparation";
import {
  listenerRequest,
  loadListenerSummary,
  updateAdSkipPreferences,
  type SkipStatus,
} from "./listenerApi";
import { LoadingState, useReducedMotion } from "./LoadingState";
import type { Source } from "./PlaybackProvider";
import type { useEpisodeIntelligence } from "./useEpisodeIntelligence";

type Panel = "brief" | "explore" | "ads";
type Accordion = Panel | null;

const stamp = (ms: number) =>
  `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1_000) % 60).padStart(2, "0")}`;

function unavailableCopy(
  state: ReturnType<typeof useEpisodeIntelligence>,
  enabled: boolean,
) {
  if (!enabled)
    return "Turn on episode intelligence to prepare authorised conversations while you listen.";
  if (state.status?.code === "RIGHTS_RESTRICTED")
    return "AI notes aren’t available for this episode. You can keep listening or try another episode.";
  if (state.status?.state === "BUDGET_PAUSED")
    return "AI insights are paused for this episode while the listening service reaches its allowance.";
  if (state.status?.state === "FAILED")
    return "We couldn’t prepare this episode. You can try again without interrupting playback.";
  if (state.error)
    return "We couldn’t check episode intelligence right now. Your listening is unaffected.";
  return "AI insights aren’t available for this episode.";
}

function useAdSkip(source: Source) {
  const alive = useRef(true);
  const revision = useRef(0);
  const [status, setStatus] = useState<SkipStatus | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const currentRevision = ++revision.current;
    alive.current = true;
    setStatus(null);
    setMessage("");
    Promise.all([
      listenerRequest("/api/skips/status", {
        feedUrl: source.feedUrl,
        episodeId: source.episodeId,
        audioUrl: source.url,
      }),
      loadListenerSummary(),
    ])
      .then(([nextStatus, listener]) => {
        if (!alive.current || currentRevision !== revision.current) return;
        setStatus(nextStatus);
        setEnabled(listener.preferences.adSkipEnabled === true);
      })
      .catch(() => {
        if (alive.current && currentRevision === revision.current)
          setMessage("Ad Skip preferences are unavailable right now.");
      });
    return () => {
      alive.current = false;
    };
  }, [source.episodeId, source.feedUrl, source.url]);

  const update = (next: boolean) => {
    if (busy) return;
    const currentRevision = revision.current;
    setBusy(true);
    setMessage("");
    void updateAdSkipPreferences({ adSkipEnabled: next })
      .then((result) => {
        if (!alive.current || currentRevision !== revision.current) return;
        setEnabled(result.preferences.adSkipEnabled === true);
        setMessage(
          next
            ? "Ad Skip is on for future verified intervals."
            : "Ad Skip is off.",
        );
        feedback.selection();
      })
      .catch(() => {
        if (alive.current && currentRevision === revision.current)
          setMessage("Could not save Ad Skip. Please try again.");
      })
      .finally(() => {
        if (alive.current && currentRevision === revision.current) setBusy(false);
      });
  };

  return { status, enabled, busy, message, update };
}

export function PlayerIntelligenceAccordion({
  source,
  p,
  enabled,
  onEnable,
  intelligence,
  onPlay,
  onOpenPanel,
}: {
  source: Source;
  p: StarTheme;
  enabled: boolean;
  onEnable(): void;
  intelligence: ReturnType<typeof useEpisodeIntelligence>;
  onPlay(ms: number): Promise<unknown>;
  onOpenPanel(panel: Panel): void;
}) {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState<Accordion>(null);
  const [adSettingsOpen, setAdSettingsOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [moments, setMoments] = useState<EpisodeMoment[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const lookupVersion = useRef(0);
  const skip = useAdSkip(source);
  const { status, session, busy, paused } = intelligence;
  const processing = isProcessing(status) && !paused;
  const ready = status?.state === "READY" || status?.state === "PARTIAL_READY";
  const hasVerifiedMoments =
    ready && status?.availableFeatures?.moments !== false && status?.transcriptAvailable !== false;
  const unavailable = unavailableCopy(intelligence, enabled);

  useEffect(() => {
    setOpen(null);
    setDetailOpen(false);
    setQuery("");
    setMoments([]);
    setSearchMessage("");
    lookupVersion.current++;
  }, [source.episodeId, source.feedUrl]);

  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental)
      UIManager.setLayoutAnimationEnabledExperimental(true);
  }, []);

  const toggle = (target: Exclude<Accordion, null>) => {
    if (!reduced)
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    feedback.light();
    setOpen((current) => (current === target ? null : target));
  };

  const prepare = () => {
    if (!enabled) {
      onEnable();
      return;
    }
    void session?.request();
  };

  const lookup = (nextQuery = query) => {
    const question = nextQuery.trim();
    if (!source.feedUrl || !hasVerifiedMoments || question.length < 2 || searching)
      return;
    const revision = ++lookupVersion.current;
    setSearching(true);
    setSearchMessage("");
    setQuery(question);
    void findEpisodeMoment(source.feedUrl, source.episodeId, question)
      .then((result) => {
        if (revision !== lookupVersion.current) return;
        setMoments(result.moments);
        setSearchMessage(
          result.moments.length
            ? "Matched passages from this episode’s transcript."
            : "No verified moment matches that question in this episode.",
        );
      })
      .catch(() => {
        if (revision === lookupVersion.current)
          setSearchMessage("We couldn’t search this episode right now. Please try again.");
      })
      .finally(() => {
        if (revision === lookupVersion.current) setSearching(false);
      });
  };

  const content = (target: Exclude<Accordion, null>) => {
    if (!enabled)
      return (
        <View style={styles.empty}>
          <Text style={[styles.emptyCopy, { color: p.muted }]}>{unavailable}</Text>
          <Action p={p} label="Turn on intelligence" onPress={prepare} />
        </View>
      );
    if (processing || (!status && !intelligence.error))
      return (
        <View style={styles.preparing}>
          <IntelligencePreparation p={p} status={status} compact />
          <Text style={[styles.emptyCopy, { color: p.muted }]}>Listening continues while this prepares.</Text>
        </View>
      );
    if (!ready)
      return (
        <View style={styles.empty}>
          <Text style={[styles.emptyCopy, { color: p.muted }]}>{unavailable}</Text>
          {(status?.retryEligible || status?.retryable || status?.state === "NOT_REQUESTED") && (
            <Action p={p} label={status?.state === "FAILED" ? "Try again" : "Prepare episode"} onPress={prepare} />
          )}
        </View>
      );
    if (target === "brief")
      return (
        <View style={styles.body}>
          {status?.brief?.overview ? (
            <Text style={[styles.overview, { color: p.text }]}>{status.brief.overview}</Text>
          ) : (
            <Text style={[styles.emptyCopy, { color: p.muted }]}>A grounded overview is not available yet for this episode.</Text>
          )}
          {!!status?.brief?.themes?.length && (
            <View style={styles.themeRow}>
              {status.brief.themes.slice(0, 4).map((theme) => (
                <View key={theme} style={[styles.theme, { backgroundColor: p.wash, borderColor: p.line }]}>
                  <Text numberOfLines={1} style={[styles.themeText, { color: p.text }]}>{theme}</Text>
                </View>
              ))}
            </View>
          )}
          {!!status?.brief?.detail && (
            <>
              {detailOpen && <Text style={[styles.detail, { color: p.muted }]}>{status.brief.detail}</Text>}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={detailOpen ? "Hide episode brief detail" : "Read more episode brief detail"}
                onPress={() => {
                  if (!reduced) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  feedback.selection();
                  setDetailOpen((current) => !current);
                }}
                style={styles.link}
              >
                <Text style={{ color: p.accent2, fontSize: 14, fontWeight: "700" }}>{detailOpen ? "Show less" : "Read more"}</Text>
              </Pressable>
            </>
          )}
          <Text style={[styles.sourceNote, { color: p.muted }]}>Grounded in authorised episode transcript evidence.</Text>
          <Action p={p} label="Open full brief" onPress={() => onOpenPanel("brief")} secondary />
        </View>
      );
    if (target === "explore")
      return (
        <View style={styles.body}>
          <Text style={[styles.sectionLabel, { color: p.muted }]}>CHAPTERS</Text>
          {status?.chapters?.slice(0, 2).map((chapter) => (
            <Pressable
              key={`${chapter.startMs}-${chapter.title}`}
              accessibilityRole="button"
              accessibilityLabel={`Play ${chapter.title} from ${stamp(chapter.startMs)}`}
              onPress={() => void onPlay(chapter.startMs)}
              style={[styles.chapter, { borderColor: p.line }]}
            >
              <Text style={[styles.chapterTime, { color: p.accent2 }]}>{stamp(chapter.startMs)}</Text>
              <View style={styles.chapterCopy}>
                <Text numberOfLines={1} style={[styles.chapterTitle, { color: p.text }]}>{chapter.title}</Text>
                {!!chapter.description && <Text numberOfLines={2} style={[styles.chapterDescription, { color: p.muted }]}>{chapter.description}</Text>}
              </View>
              <Ionicons name="play" size={15} color={p.accent2} />
            </Pressable>
          ))}
          {!status?.chapters?.length && <Text style={[styles.emptyCopy, { color: p.muted }]}>Chapters are not available for this episode yet.</Text>}
          <Text style={[styles.sectionLabel, { color: p.muted }]}>FIND A MOMENT</Text>
          {hasVerifiedMoments ? (
            <>
              <View style={styles.searchRow}>
                <TextInput
                  accessibilityLabel="Ask about this episode"
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Where did they discuss…"
                  placeholderTextColor={p.muted}
                  returnKeyType="search"
                  onSubmitEditing={() => lookup()}
                  style={[styles.input, { borderColor: p.line, color: p.text, backgroundColor: p.surfaceStrong }]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Find a moment"
                  disabled={searching || query.trim().length < 2}
                  onPress={() => lookup()}
                  style={[styles.searchButton, { backgroundColor: p.accent2, opacity: searching || query.trim().length < 2 ? 0.5 : 1 }]}
                >
                  <Ionicons name="arrow-up" size={18} color={p.onAccent} />
                </Pressable>
              </View>
              {!!status?.brief?.themes?.length && (
                <View style={styles.topicRow}>
                  {status.brief.themes.slice(0, 3).map((theme) => (
                    <Pressable key={theme} accessibilityRole="button" onPress={() => lookup(theme)} style={[styles.topic, { borderColor: p.line }]}>
                      <Text numberOfLines={1} style={{ color: p.accent2, fontSize: 13, fontWeight: "700" }}>{theme}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              {searching && <LoadingState compact p={p} label="Finding a verified moment…" />}
              {!!searchMessage && <Text accessibilityLiveRegion="polite" style={[styles.searchMessage, { color: p.muted }]}>{searchMessage}</Text>}
              {moments.slice(0, 2).map((moment) => (
                <Pressable key={moment.segmentId} accessibilityRole="button" onPress={() => void onPlay(moment.startMs)} style={[styles.moment, { backgroundColor: p.wash, borderColor: p.line }]}>
                  <Text style={[styles.momentLabel, { color: p.text }]}>{moment.label}</Text>
                  <Text numberOfLines={3} style={[styles.momentContext, { color: p.muted }]}>{moment.context}</Text>
                  <Text style={{ color: p.accent2, fontSize: 13, fontWeight: "800" }}>Play from {stamp(moment.startMs)}</Text>
                </Pressable>
              ))}
            </>
          ) : (
            <Text style={[styles.emptyCopy, { color: p.muted }]}>Find a Moment is available only when this episode has verified transcript timestamps.</Text>
          )}
          <Action p={p} label="Explore everything" onPress={() => onOpenPanel("explore")} secondary />
        </View>
      );
    return (
      <View style={styles.body}>
        <Text style={[styles.emptyCopy, { color: p.muted }]}>Only independently verified, audio-matched intervals can be skipped. Candidate evidence never interrupts playback.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Ad Skip advanced settings"
          accessibilityState={{ expanded: adSettingsOpen }}
          onPress={() => {
            if (!reduced) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setAdSettingsOpen((value) => !value);
            feedback.selection();
          }}
          style={styles.link}
        >
          <Text style={{ color: p.accent2, fontSize: 14, fontWeight: "700" }}>{adSettingsOpen ? "Hide advanced settings" : "Advanced settings"}</Text>
        </Pressable>
        {adSettingsOpen ? <AdSkipPanel source={source} p={p} onPlay={onPlay} showMasterToggle={false} /> : null}
      </View>
    );
  };

  const adSkipDetail = skip.status
    ? skip.status.state === "NO_ADVERTS_DETECTED"
      ? "No adverts detected after analysis"
      : skip.status.state === "VERIFYING"
        ? "Checking verified boundaries"
        : skip.status.state === "UNAVAILABLE"
          ? skip.status.reason || "Not available for this episode"
          : skip.status.verifiedCount
            ? `${skip.status.verifiedCount} verified interval${skip.status.verifiedCount === 1 ? "" : "s"} available`
            : "No verified intervals in this episode"
    : skip.message || "Checking verified intervals";

  return (
    <View style={[styles.container, { borderColor: p.line, backgroundColor: p.surfaceStrong }]}>
      <Text style={[styles.eyebrow, { color: p.accent }]}>EPISODE INTELLIGENCE</Text>
      <Text style={[styles.intro, { color: p.muted }]}>Grounded features appear here when this episode is ready.</Text>
      <Row
        p={p}
        title="AI Episode Brief"
        detail={processing ? "Preparing an evidence-backed overview" : ready ? "A grounded overview from this episode" : unavailable}
        icon="sparkles"
        open={open === "brief"}
        onPress={() => toggle("brief")}
      />
      {open === "brief" && content("brief")}
      <Row
        p={p}
        title="Explore Episode"
        detail={processing ? "Chapters, topics and moments are preparing" : ready ? "Chapters, topics and verified moments" : unavailable}
        icon="compass-outline"
        open={open === "explore"}
        onPress={() => toggle("explore")}
      />
      {open === "explore" && content("explore")}
      <View style={[styles.adRow, { borderTopColor: p.line }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ad Skip details"
          accessibilityState={{ expanded: open === "ads" }}
          onPress={() => toggle("ads")}
          style={styles.adCopy}
        >
          <Ionicons name="shield-checkmark-outline" size={19} color={p.accent2} />
          <View style={styles.rowCopy}>
            <Text style={[styles.rowTitle, { color: p.text }]}>Ad Skip</Text>
            <Text numberOfLines={2} style={[styles.rowDetail, { color: p.muted }]}>{adSkipDetail}</Text>
          </View>
          <Ionicons name={open === "ads" ? "chevron-up" : "chevron-down"} size={18} color={p.muted} />
        </Pressable>
        <View style={styles.switchWrap}>
          <Text style={[styles.switchLabel, { color: skip.enabled ? p.accent2 : p.muted }]}>{skip.enabled ? "ON" : "OFF"}</Text>
          <Switch
            accessibilityLabel="Turn Ad Skip on or off"
            accessibilityHint="Only independently verified, matching intervals are eligible."
            disabled={skip.busy || !skip.status}
            value={skip.enabled}
            trackColor={{ true: p.accent2 }}
            onValueChange={skip.update}
          />
        </View>
      </View>
      <Text style={[styles.safety, { color: p.muted }]}>Only independently verified, audio-matched intervals are ever eligible. Automatic skipping is limited to controlled rollouts and remains disabled for production release until measured safety criteria are met.</Text>
      {open === "ads" && content("ads")}
    </View>
  );
}

function Row({
  p,
  title,
  detail,
  icon,
  open,
  onPress,
}: {
  p: StarTheme;
  title: string;
  detail: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  open: boolean;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      style={[styles.row, { borderTopColor: p.line }]}
    >
      <Ionicons name={icon} size={19} color={p.accent2} />
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, { color: p.text }]}>{title}</Text>
        <Text numberOfLines={2} style={[styles.rowDetail, { color: p.muted }]}>{detail}</Text>
      </View>
      <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={p.muted} />
    </Pressable>
  );
}

function Action({
  p,
  label,
  onPress,
  secondary = false,
}: {
  p: StarTheme;
  label: string;
  onPress(): void;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        feedback.light();
        onPress();
      }}
      style={[styles.action, { backgroundColor: secondary ? p.wash : p.accent2, borderColor: p.line }]}
    >
      <Text style={{ color: secondary ? p.text : p.onAccent, fontSize: 14, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 22, borderWidth: StyleSheet.hairlineWidth, borderRadius: 22, overflow: "hidden", paddingTop: 16 },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.4, paddingHorizontal: 16 },
  intro: { fontSize: 13, lineHeight: 18, paddingHorizontal: 16, paddingTop: 5, paddingBottom: 10 },
  row: { minHeight: 70, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 11 },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: 16, lineHeight: 21, fontWeight: "800" },
  rowDetail: { fontSize: 12, lineHeight: 17 },
  body: { gap: 12, paddingHorizontal: 16, paddingBottom: 16 },
  empty: { gap: 12, paddingHorizontal: 16, paddingBottom: 16 },
  preparing: { gap: 9, paddingHorizontal: 16, paddingBottom: 16 },
  emptyCopy: { fontSize: 13, lineHeight: 19 },
  overview: { fontSize: 16, lineHeight: 23, fontWeight: "700" },
  themeRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  theme: { maxWidth: "100%", borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  themeText: { fontSize: 12, fontWeight: "700" },
  detail: { fontSize: 14, lineHeight: 21 },
  link: { minHeight: 40, alignSelf: "flex-start", justifyContent: "center" },
  sourceNote: { fontSize: 12, lineHeight: 17 },
  action: { minHeight: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.1, marginTop: 2 },
  chapter: { minHeight: 54, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  chapterTime: { width: 40, fontSize: 12, fontWeight: "800" },
  chapterCopy: { flex: 1, minWidth: 0, gap: 2 },
  chapterTitle: { fontSize: 14, fontWeight: "800" },
  chapterDescription: { fontSize: 12, lineHeight: 16 },
  searchRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: { flex: 1, minHeight: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 12, fontSize: 14 },
  searchButton: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  topicRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  topic: { maxWidth: "100%", minHeight: 34, justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 10 },
  searchMessage: { fontSize: 12, lineHeight: 17 },
  moment: { gap: 6, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 12 },
  momentLabel: { fontSize: 14, fontWeight: "800" },
  momentContext: { fontSize: 13, lineHeight: 19 },
  adRow: { minHeight: 70, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 10, gap: 8 },
  adCopy: { flex: 1, minWidth: 0, minHeight: 70, flexDirection: "row", alignItems: "center", gap: 11 },
  switchWrap: { alignItems: "center", gap: 1 },
  switchLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 0.7 },
  safety: { fontSize: 11, lineHeight: 16, paddingHorizontal: 16, paddingBottom: 14 },
});
