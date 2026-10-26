import { useEffect, useState } from "react";
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { loadReadyEpisodes, type ReadyEpisode } from "./api";
import { PodcastArtwork } from "./PodcastArtwork";
import type { StoredEpisode } from "./listenerState";
import type { StarTheme } from "./design";

export function ReadyEpisodes({ active, p, onPlay }: {
  active: boolean; p: StarTheme; onPlay: (episode: StoredEpisode) => void;
}) {
  const [episodes, setEpisodes] = useState<ReadyEpisode[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!active) return;
    let alive = true, pending = false;
    const refresh = async () => {
      if (pending || AppState.currentState === "background") return;
      pending = true;
      try {
        const result = await loadReadyEpisodes();
        if (!Array.isArray(result.episodes)) throw Error("Invalid discovery response");
        if (alive) { setEpisodes(result.episodes); setState("ready"); }
      } catch {
        // Do not advertise stale permissions after a failed refresh/revocation.
        if (alive) { setEpisodes([]); setState("error"); }
      } finally { pending = false; }
    };
    setState("loading");
    void refresh();
    const timer = setInterval(() => void refresh(), 60_000);
    const subscription = AppState.addEventListener("change", value => { if (value === "active") void refresh(); });
    return () => { alive = false; clearInterval(timer); subscription.remove(); };
  }, [active, retry]);
  return <View testID="ai-ready-discovery" style={styles.section}>
    <Text accessibilityRole="header" style={[styles.heading, { color: p.text }]}>Explore AI-Ready Episodes</Text>
    <Text style={[styles.caption, { color: p.muted }]}>Listen now, with insights ready to explore.</Text>
    {state === "loading" && <Text accessibilityLiveRegion="polite" style={[styles.caption, { color: p.muted }]}>Checking available episodes…</Text>}
    {state === "error" && <View>
      <Text style={[styles.caption, { color: p.muted }]}>We couldn’t check available insights. You can still search for a podcast.</Text>
      <Pressable accessibilityRole="button" onPress={() => setRetry(value => value + 1)} style={styles.retry}>
        <Text style={{ color: p.accent2, fontWeight: "700" }}>Try AI-ready episodes again</Text>
      </Pressable>
    </View>}
    {state === "ready" && !episodes.length && <Text style={[styles.caption, { color: p.muted }]}>No AI-ready episodes are available right now. Explore podcasts below to keep listening.</Text>}
    {state === "ready" && episodes.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
      {episodes.map(episode => <Pressable key={`${episode.feedUrl}:${episode.id}`} accessibilityRole="button"
        accessibilityLabel={`Listen with AI insights: ${episode.title}`}
        onPress={() => onPlay({ ...episode, showId: episode.feedUrl })}
        style={[styles.card, { borderColor: p.line, backgroundColor: p.surface }]}>
        <View style={styles.row}>
          <PodcastArtwork uri={episode.artworkUrl} style={styles.art} />
          <View style={{ flex: 1, gap: 5 }}>
            <Text numberOfLines={2} style={[styles.show, { color: p.muted }]}>{episode.showName}</Text>
            {!!episode.publishedAt && Number.isFinite(Date.parse(episode.publishedAt)) && <Text style={[styles.caption, { color: p.muted }]}>{new Date(episode.publishedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</Text>}
          </View>
        </View>
        <Text numberOfLines={3} style={[styles.title, { color: p.text }]}>{episode.title}</Text>
        <Text style={[styles.caption, { color: p.muted }]}>{[
          episode.availableFeatures.brief && "Brief", episode.availableFeatures.chapters && "Chapters",
          episode.availableFeatures.topics && "Topics", episode.availableFeatures.moments && "Moments",
          episode.availableFeatures.search && "Search",
        ].filter(Boolean).join(" · ")}</Text>
        <View style={[styles.row, { marginTop: "auto", paddingTop: 8 }]}>
          <Ionicons name="play-circle" color={p.accent2} size={26} />
          <Text style={[styles.show, { color: p.accent2 }]}>Listen & explore</Text>
        </View>
      </Pressable>)}
    </ScrollView>}
  </View>;
}
const styles = StyleSheet.create({
  section: { gap: 8, marginBottom: 18 }, heading: { fontSize: 21, lineHeight: 28, fontWeight: "700" },
  caption: { fontSize: 13, lineHeight: 19 }, strip: { gap: 12, paddingVertical: 4 },
  card: { width: 252, borderRadius: 18, borderWidth: 1, padding: 14, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 }, art: { width: 52, height: 52, borderRadius: 10 },
  show: { fontSize: 13, lineHeight: 18, fontWeight: "600" }, title: { fontSize: 16, lineHeight: 22, fontWeight: "700" },
  retry: { minHeight: 44, justifyContent: "center" },
});
