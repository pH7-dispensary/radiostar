import { sameShow } from "../../episode-identity.mjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { LoadingState } from "./LoadingState";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { feedback } from "./feedback";
import {
  searchCatalogue,
  searchConversations,
  type CatalogueShow,
  type ConversationResults,
} from "./api";
import {
  toggleById,
  type ListenerState,
  type StoredEpisode,
} from "./listenerState";
import type { StarTheme } from "./design";
import { updateFollow } from "./listenerApi";
import { PodcastArtwork } from "./PodcastArtwork";
import { ReadyEpisodes } from "./ReadyEpisodes";
import {
  catalogueCategories,
  recentFollowedEpisodes,
  rememberSearch,
} from "./discoverData.mjs";

function Segments({
  items,
  value,
  onChange,
  p,
  reduced,
}: {
  items: string[];
  value: string;
  onChange: (v: string) => void;
  p: StarTheme;
  reduced: boolean;
}) {
  const [width, setWidth] = useState(0),
    offset = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(offset, {
      toValue: (items.indexOf(value) * width) / items.length,
      duration: reduced ? 0 : 220,
      useNativeDriver: true,
    }).start();
  }, [value, width, reduced]);
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[s.segment, { backgroundColor: p.surface, borderColor: p.line }]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          s.selection,
          {
            width: Math.max(0, width / items.length - 8),
            backgroundColor: p.wash,
            borderColor: p.line,
            transform: [{ translateX: offset }],
          },
        ]}
      />
      {items.map((item) => (
        <Pressable
          key={item}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === item }}
          aria-selected={value === item}
          onPress={() => {
            feedback.selection();
            onChange(item);
          }}
          style={s.segmentItem}
        >
          <Text
            style={[
              s.segmentText,
              { color: value === item ? p.text : p.muted },
            ]}
          >
            {item}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
const prompts: Record<string, string[]> = {
  Ideas: [
    "How is AI changing scientific discovery?",
    "What do founders believe about building enduring companies?",
    "What are the biggest constraints on AI progress?",
  ],
  Opinions: [
    "Where do researchers disagree about AI scaling?",
    "What are the strongest arguments against AI regulation?",
    "What makes a good company worth building?",
  ],
  Recommendations: [
    "What books did the guests recommend?",
    "What advice did founders give to first-time builders?",
    "Which products changed the way people work?",
  ],
  Moments: [
    "Where did they discuss AI becoming dangerous?",
    "Find the moment they explained their biggest mistake.",
    "When did they talk about consciousness?",
  ],
};
export function SearchScreen({
  state,
  setState,
  onOpen,
  onPlay,
  p,
  active,
}: {
  state: ListenerState;
  setState: (
    next: ListenerState | ((v: ListenerState) => ListenerState),
  ) => void;
  onOpen: (show: CatalogueShow) => void;
  onPlay: (episode: StoredEpisode) => void;
  p: StarTheme;
  active: boolean;
}) {
  const [query, setQuery] = useState(""),
    [mode, setMode] = useState("Conversations"),
    [scope, setScope] = useState("All Podcasts"),
    [topic, setTopic] = useState("Ideas");
  const [shows, setShows] = useState<CatalogueShow[]>([]),
    [discovery, setDiscovery] = useState<CatalogueShow[]>([]),
    [answer, setAnswer] = useState<ConversationResults | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [submitted, setSubmitted] = useState(false),
    [focused, setFocused] = useState(false),
    [reduced, setReduced] = useState(true);
  const [category, setCategory] = useState<string | null>(null);
  const allDiscovery = useMemo(
    () => [
      ...new Map(
        [...state.following, ...discovery].map((show) => [show.id, show]),
      ).values(),
    ],
    [state.following, discovery],
  );
  const categories = catalogueCategories(allDiscovery);
  useEffect(() => {
    if (category && !categories.includes(category)) setCategory(null);
  }, [category, categories.join("|")]);
  const recentEpisodes = useMemo(
    () => recentFollowedEpisodes(state),
    [state.following, state.feedEpisodes],
  );
  const episodeMatches =
    mode === "Podcasts" && submitted
      ? recentEpisodes.filter((episode) =>
          `${episode.title} ${episode.showName}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
      : [];
  const requestId = useRef(0),
    input = useRef<TextInput>(null),
    reveal = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!active || discovery.length) return;
    let live = true;
    void Promise.allSettled(
      ["Hard Fork", "Lex Fridman Podcast", "Acquired"].map(searchCatalogue),
    ).then((results) => {
      if (live)
        setDiscovery(
          results.flatMap((r) =>
            r.status === "fulfilled" ? r.value.results.slice(0, 1) : [],
          ),
        );
    });
    return () => {
      live = false;
    };
  }, [active, discovery.length]);
  useEffect(() => {
    if (!active) return;
    reveal.setValue(reduced ? 1 : 0.6);
    Animated.timing(reveal, {
      toValue: 1,
      duration: reduced ? 0 : 200,
      useNativeDriver: true,
    }).start();
  }, [topic, active, reduced]);
  const changeMode = (value: string) => {
    requestId.current++;
    setMode(value);
    setSubmitted(false);
    setBusy(false);
    setAnswer(null);
    setError("");
  };
  useEffect(() => {
    if (!active || !focused || mode !== "Podcasts" || query.trim().length < 2)
      return;
    const timeout = setTimeout(
      () => void submit(query, "Podcasts", false),
      400,
    );
    return () => clearTimeout(timeout);
  }, [query, mode, active, scope, focused]);
  useEffect(() => {
    if (!state.historyEnabled && state.recentSearches?.length)
      setState((current) => ({ ...current, recentSearches: [] }));
  }, [state.historyEnabled, state.recentSearches?.length]);
  const submit = async (text = query, nextMode = mode, explicit = true) => {
    if (text.trim().length < 2) return;
    const id = ++requestId.current;
    setQuery(text);
    setMode(nextMode);
    setBusy(true);
    setError("");
    setSubmitted(true);
    setAnswer(null);
    setShows([]);
    if (explicit) {
      input.current?.blur();
      setState((current) => ({
        ...current,
        recentSearches: rememberSearch(
          current.recentSearches || [],
          text,
          current.historyEnabled,
        ),
      }));
    }
    try {
      if (nextMode === "Podcasts") {
        const result =
          scope === "My Podcasts"
            ? state.following.filter((x) =>
                (x.name + " " + x.publisher + " " + x.topic)
                  .toLowerCase()
                  .includes(text.toLowerCase()),
              )
            : (await searchCatalogue(text)).results;
        if (id === requestId.current) setShows(result.slice(0, 20));
      } else {
        const result = await searchConversations(
          text,
          scope === "My Podcasts"
            ? state.following.flatMap((x) => (x.feedUrl ? [x.feedUrl] : []))
            : undefined,
          nextMode,
        );
        if (id === requestId.current) setAnswer(result);
      }
    } catch {
      if (id === requestId.current)
        setError(
          "Search is temporarily unavailable. Check your connection and try again.",
        );
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  };
  const people = [...state.following, ...discovery]
    .slice(0, 3)
    .map((show) => `What ideas were discussed on ${show.name}?`);
  const questions =
    topic === "People"
      ? people.length
        ? people
        : ["Which guests discussed scientific discovery?"]
      : prompts[topic];
  const showCard = (show: CatalogueShow) => (
    <View
      key={show.id}
      style={[s.showCard, { backgroundColor: p.surface, borderColor: p.line }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${show.name}`}
        onPress={() => onOpen(show)}
      >
        <PodcastArtwork
          uri={show.art}
          label={`${show.name} artwork`}
          style={s.art}
        />
        <Text numberOfLines={2} style={[s.showTitle, { color: p.text }]}>
          {show.name}
        </Text>
        <Text numberOfLines={1} style={[s.caption, { color: p.muted }]}>
          {show.publisher}
        </Text>
        <Text numberOfLines={1} style={[s.category, { color: p.accent2 }]}>
          {show.topic}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${state.following.some((x) => sameShow(x, show)) ? "Unfollow" : "Follow"} ${show.name}`}
        onPress={() => {
          feedback.selection();
          const following = state.following.some((item) => sameShow(item, show));
          setState((v) => ({ ...v, following: toggleById(v.following, show) }));
          if (show.feedUrl)
            void updateFollow(show.feedUrl, !following, show)
              .then((result) =>
                setState((v) => ({
                  ...v,
                  followIntelligence: {
                    ...v.followIntelligence,
                    [show.feedUrl!]: result.processing || { state: "DISABLED" },
                  },
                })),
              )
              .catch(() => {});
        }}
        style={[s.follow, { borderColor: p.line }]}
      >
        <Text style={[s.followText, { color: p.text }]}>
          {state.following.some((x) => sameShow(x, show))
            ? "Following ✓"
            : "+ Follow"}
        </Text>
      </Pressable>
    </View>
  );
  return (
    <View style={s.container}>
      <View style={s.hero}>
        <Text style={[s.eyebrow, { color: p.accent2 }]}>
          YOUR NEXT GOOD LISTEN
        </Text>
        <Text
          accessibilityRole="header"
          style={[s.heroTitle, { color: p.text }]}
        >
          Discover
        </Text>
        <Text style={[s.heroCopy, { color: p.muted }]}>
          Find a new favourite. Follow an idea.
        </Text>
      </View>
      <View
        style={[
          s.inputFrame,
          {
            borderColor: focused ? p.accent2 : p.line,
            shadowColor: p.accent2,
            shadowOpacity: focused ? 0.15 : 0,
          },
        ]}
      >
        <LinearGradient
          colors={[p.surfaceStrong, p.surface]}
          style={s.inputRow}
        >
          <Ionicons name="sparkles" size={22} color={p.accent2} />
          <TextInput
            ref={input}
            accessibilityLabel={
              mode === "Podcasts"
                ? "Search podcasts"
                : "Ask about your podcasts"
            }
            value={query}
            onChangeText={(text) => {
              requestId.current++;
              setQuery(text);
              setBusy(false);
              setSubmitted(false);
              setAnswer(null);
              setError("");
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSubmitEditing={() => void submit()}
            returnKeyType="search"
            placeholder={
              mode === "Podcasts"
                ? "Shows, hosts and topics…"
                : "Ask about your podcasts..."
            }
            placeholderTextColor={p.muted}
            style={[s.input, { color: p.text }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Submit search"
            disabled={busy || query.trim().length < 2}
            onPress={() => void submit()}
            style={[
              s.submit,
              {
                backgroundColor: p.accent2,
                opacity: query.trim().length < 2 ? 0.5 : 1,
              },
            ]}
          >
            {busy ? (
              <ActivityIndicator color={p.onAccent} />
            ) : (
              <Ionicons name="arrow-up" size={20} color={p.onAccent} />
            )}
          </Pressable>
        </LinearGradient>
      </View>
      <Segments
        items={["My Podcasts", "All Podcasts"]}
        value={scope}
        onChange={(value) => {
          requestId.current++;
          setScope(value);
          setSubmitted(false);
          setAnswer(null);
          setBusy(false);
          setError("");
        }}
        p={p}
        reduced={reduced}
      />
      <Segments
        items={["Conversations", "Podcasts", "Moments"]}
        value={mode}
        onChange={changeMode}
        p={p}
        reduced={reduced}
      />
      {mode !== "Podcasts" && (
        <Text style={[s.coverage, { color: p.muted }]}>
          Conversation search covers analysed episodes only. Catalogue discovery
          reaches beyond this collection.
        </Text>
      )}
      {busy && (
        <View
          accessibilityLiveRegion="polite"
          style={[
            s.result,
            { backgroundColor: p.surface, borderColor: p.line },
          ]}
        >
          <LoadingState
            p={p}
            label={
              mode === "Podcasts"
                ? "Discovering podcasts…"
                : "Exploring processed conversations…"
            }
          />
          <Text style={[s.body, { color: p.muted }]}>{query}</Text>
        </View>
      )}
      {!!error && (
        <View style={s.result}>
          <Text
            accessibilityLiveRegion="polite"
            style={[s.body, { color: p.text }]}
          >
            {error}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void submit()}
            style={s.retry}
          >
            <Text style={{ color: p.accent2 }}>Try again</Text>
          </Pressable>
        </View>
      )}
      {!busy && answer && (
        <View style={s.results}>
          <Text style={[s.eyebrow, { color: p.accent2 }]}>YOUR QUESTION</Text>
          <Text style={[s.question, { color: p.text }]}>{answer.query}</Text>
          <View
            style={[
              s.result,
              { backgroundColor: p.surface, borderColor: p.line },
            ]}
          >
            <Text style={[s.resultTitle, { color: p.text }]}>
              {answer.answerState === "PARTIAL"
                ? "From the available evidence"
                : answer.matches.length
                ? "From the conversations"
                : "A little more listening to explore"}
            </Text>
            <Text style={[s.body, { color: p.text }]}>{answer.synthesis}</Text>
            <Text style={[s.caption, { color: p.muted }]}>
              {answer.coverage.processedEpisodes} analysed episodes ·{" "}
              {answer.coverage.matchedEpisodes} matching episodes ·{" "}
              {answer.coverage.scope}
            </Text>
          </View>
          {answer.matches.map((match, citationIndex) => (
            <View
              key={match.episode.id + match.segmentId}
              style={[
                s.result,
                { borderColor: p.line, backgroundColor: p.surface },
              ]}
            >
              <View style={s.sourceHeading}>
                {match.episode.artworkUrl && (
                  <Image
                    source={{ uri: match.episode.artworkUrl }}
                    accessibilityLabel={`${match.episode.showName} artwork`}
                    style={s.sourceArt}
                  />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[s.showTitle, { color: p.text }]}>
                    [{citationIndex + 1}] {match.episode.showName}
                  </Text>
                  <Text
                    numberOfLines={2}
                    style={[s.caption, { color: p.muted }]}
                  >
                    {match.episode.title}
                  </Text>
                </View>
              </View>
              {!!match.speaker && !/^SPEAKER[_\s-]?\d+$/i.test(match.speaker) && (
                <Text style={[s.eyebrow, { color: p.accent2 }]}>
                  {match.speaker}
                </Text>
              )}
              <Text style={[s.body, { color: p.text }]}>“{match.context}”</Text>
              {Number.isFinite(match.startMs) ? (
                <View style={{ gap: 8 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Play from ${Math.floor(match.startMs / 60000)}:${String(Math.floor(match.startMs / 1000) % 60).padStart(2, "0")}`}
                    onPress={() =>
                      onPlay({
                        ...match.episode,
                        showId: match.episode.feedUrl,
                        positionMs: match.startMs,
                      })
                    }
                    style={[s.play, { backgroundColor: p.wash }]}
                  >
                    <Ionicons name="play" size={15} color={p.accent2} />
                    <Text style={[s.followText, { color: p.text }]}>
                      Play from {Math.floor(match.startMs / 60000)}:
                      {String(Math.floor(match.startMs / 1000) % 60).padStart(
                        2,
                        "0",
                      )}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Save this moment"
                    onPress={() =>
                      setState((v) => ({
                        ...v,
                        moments: [
                          {
                            ...match.episode,
                            showId: match.episode.feedUrl,
                            positionMs: match.startMs,
                          },
                          ...v.moments.filter(
                            (m) =>
                              m.id !== match.episode.id ||
                              m.positionMs !== match.startMs,
                          ),
                        ],
                      }))
                    }
                    style={s.play}
                  >
                    <Ionicons
                      name="bookmark-outline"
                      size={16}
                      color={p.accent2}
                    />
                    <Text style={{ color: p.accent2 }}>
                      {state.moments.some(
                        (m) =>
                          m.id === match.episode.id &&
                          m.positionMs === match.startMs,
                      )
                        ? "Moment saved"
                        : "Save moment"}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <Text style={[s.caption, { color: p.muted }]}>
                  Publisher text · no verified playback position
                </Text>
              )}
            </View>
          ))}
          {answer.followUps.map((q) => (
            <Pressable key={q} onPress={() => void submit(q)} style={s.prompt}>
              <Text style={[s.body, { color: p.text }]}>{q}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {!busy && submitted && mode === "Podcasts" && !error && (
        <View style={s.results}>
          <Text style={[s.resultTitle, { color: p.text }]}>
            {shows.length ? "Podcasts to explore" : "No matching podcasts"}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.showStrip}
          >
            {shows.map(showCard)}
          </ScrollView>
          {episodeMatches.length > 0 && (
            <View style={{ gap: 12 }}>
              <Text style={[s.sectionTitle, { color: p.text }]}>
                Episodes from followed shows
              </Text>
              {episodeMatches.map((episode) => (
                <Pressable
                  key={`${episode.feedUrl}:${episode.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Play ${episode.title}`}
                  onPress={() => onPlay(episode)}
                  style={[s.episode, { borderColor: p.line }]}
                >
                  <PodcastArtwork
                    uri={episode.artworkUrl}
                    style={s.sourceArt}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.showTitle, { color: p.text }]}>
                      {episode.title}
                    </Text>
                    <Text style={[s.caption, { color: p.muted }]}>
                      {episode.showName}
                    </Text>
                  </View>
                  <Ionicons
                    name="play-circle-outline"
                    size={28}
                    color={p.accent2}
                  />
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}
      {!busy && !submitted && (
        <>
          <ReadyEpisodes active={active} p={p} onPlay={onPlay} />
          {state.historyEnabled && Boolean(state.recentSearches?.length) && (
            <View style={{ gap: 8 }}>
              <View style={s.historyHeading}>
                <Text style={[s.sectionTitle, { color: p.text, flex: 1 }]}>
                  Continue exploring
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear recent searches"
                  onPress={() =>
                    setState((current) => ({ ...current, recentSearches: [] }))
                  }
                  style={[s.retry, { minWidth: 44 }]}
                >
                  <Text style={{ color: p.accent2 }}>Clear</Text>
                </Pressable>
              </View>
              {state.recentSearches!.slice(0, 3).map((text) => (
                <Pressable
                  key={text}
                  accessibilityRole="button"
                  onPress={() => void submit(text)}
                  style={[s.episode, { borderColor: p.line }]}
                >
                  <Ionicons name="time-outline" size={18} color={p.muted} />
                  <Text style={[s.body, { color: p.text, flex: 1 }]}>
                    {text}
                  </Text>
                  <Ionicons
                    name="arrow-up-outline"
                    size={16}
                    color={p.accent2}
                  />
                </Pressable>
              ))}
            </View>
          )}
          {categories.length > 0 && (
            <View style={{ gap: 12 }}>
              <Text style={[s.sectionTitle, { color: p.text }]}>
                Categories in this collection
              </Text>
              <View style={s.categoryGrid}>
                {categories.map((item) => (
                  <Pressable
                    key={item}
                    accessibilityRole="button"
                    accessibilityState={{ selected: category === item }}
                    onPress={() => setCategory(category === item ? null : item)}
                    style={[
                      s.categoryChip,
                      {
                        backgroundColor: category === item ? p.wash : p.surface,
                        borderColor: p.line,
                      },
                    ]}
                  >
                    <Text style={[s.followText, { color: p.text }]}>
                      {item}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          {allDiscovery.length > 0 && (
            <>
              <View style={s.sectionHeading}>
                <Text style={[s.sectionTitle, { color: p.text }]}>
                  {category || "Explore podcasts"}
                </Text>
                <Text style={[s.caption, { color: p.muted }]}>
                  From the catalogue · not a popularity ranking
                </Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.showStrip}
              >
                {(category
                  ? allDiscovery.filter(
                      (show) => show.topic?.trim() === category,
                    )
                  : allDiscovery
                )
                  .slice(0, 12)
                  .map(showCard)}
              </ScrollView>
            </>
          )}
          {!allDiscovery.length && (
            <Text style={[s.coverage, { color: p.muted }]}>
              Search for a favourite show to start exploring.
            </Text>
          )}
          {recentEpisodes.length > 0 && (
            <View style={{ gap: 12 }}>
              <Text style={[s.sectionTitle, { color: p.text }]}>
                New from your follows
              </Text>
              {recentEpisodes.slice(0, 5).map((episode) => (
                <Pressable
                  key={`${episode.feedUrl}:${episode.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Play ${episode.title}`}
                  onPress={() => onPlay(episode)}
                  style={[s.episode, { borderColor: p.line }]}
                >
                  <PodcastArtwork
                    uri={episode.artworkUrl}
                    label={`${episode.showName} artwork`}
                    style={s.sourceArt}
                  />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text
                      numberOfLines={2}
                      style={[s.showTitle, { color: p.text }]}
                    >
                      {episode.title}
                    </Text>
                    <Text style={[s.caption, { color: p.muted }]}>
                      {episode.showName} ·{" "}
                      {new Date(episode.publishedAt!).toLocaleDateString(
                        undefined,
                        { month: "short", day: "numeric" },
                      )}
                    </Text>
                  </View>
                  <Ionicons
                    name="play-circle-outline"
                    size={28}
                    color={p.accent2}
                  />
                </Pressable>
              ))}
            </View>
          )}
          <Text style={[s.sectionTitle, { color: p.text }]}>
            Explore conversations
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.topics}
          >
            {["Ideas", "People", "Opinions", "Recommendations", "Moments"].map(
              (item) => (
                <Pressable
                  key={item}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: topic === item }}
                  onPress={() => {
                    feedback.selection();
                    setTopic(item);
                  }}
                  style={[
                    s.topic,
                    {
                      backgroundColor: topic === item ? p.wash : "transparent",
                      borderColor: topic === item ? p.accent2 : p.line,
                    },
                  ]}
                >
                  <Text
                    style={[
                      s.followText,
                      { color: topic === item ? p.text : p.muted },
                    ]}
                  >
                    {item}
                  </Text>
                </Pressable>
              ),
            )}
          </ScrollView>
          <View style={s.sectionHeading}>
            <Text style={[s.sectionTitle, { color: p.text }]}>Try asking</Text>
            <Text style={[s.caption, { color: p.muted }]}>
              Go beyond keywords
            </Text>
          </View>
          <Animated.View style={{ opacity: reveal, gap: 10 }}>
            {questions.map((question, i) => (
              <Pressable
                accessibilityRole="button"
                key={question}
                onPress={() =>
                  void submit(
                    question,
                    topic === "Moments" ? "Moments" : "Conversations",
                  )
                }
                style={[
                  s.prompt,
                  { borderColor: p.line, backgroundColor: p.surface },
                ]}
              >
                <Text style={[s.promptNumber, { color: p.accent2 }]}>
                  0{i + 1}
                </Text>
                <Text style={[s.promptText, { color: p.text }]}>
                  {question}
                </Text>
                <Ionicons
                  name="arrow-up-outline"
                  size={18}
                  color={p.accent2}
                  style={{ transform: [{ rotate: "45deg" }] }}
                />
              </Pressable>
            ))}
          </Animated.View>
        </>
      )}
      {submitted && !busy && (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setSubmitted(false);
            setQuery("");
            setAnswer(null);
            setError("");
          }}
          style={s.retry}
        >
          <Text style={{ color: p.accent2 }}>Back to discovery</Text>
        </Pressable>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  container: { gap: 14 },
  hero: { paddingTop: 8, paddingBottom: 8 },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  heroTitle: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "700",
    letterSpacing: -1,
    marginTop: 8,
  },
  heroCopy: { fontSize: 14, lineHeight: 21, marginTop: 6, maxWidth: 335 },
  episode: {
    minHeight: 60,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
  },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  categoryChip: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  segment: {
    flexDirection: "row",
    position: "relative",
    borderWidth: 1,
    borderRadius: 18,
    minHeight: 48,
    overflow: "hidden",
  },
  selection: {
    position: "absolute",
    left: 4,
    top: 4,
    bottom: 4,
    borderWidth: 1,
    borderRadius: 14,
  },
  segmentItem: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  segmentText: { fontSize: 12, fontWeight: "700" },
  inputFrame: {
    borderWidth: 1,
    borderRadius: 23,
    overflow: "hidden",
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 3 },
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    paddingLeft: 16,
    minHeight: 70,
  },
  input: { flex: 1, minWidth: 0, fontSize: 15, paddingVertical: 10 },
  submit: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  promises: { flexDirection: "row", gap: 12, marginTop: 3 },
  promise: { flex: 1, borderTopWidth: 2, paddingTop: 12, minHeight: 78 },
  promiseCopy: { fontSize: 11, lineHeight: 16, marginTop: 7 },
  coverage: { fontSize: 11, lineHeight: 17 },
  sectionHeading: { gap: 5, marginTop: 17 },
  historyHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  sectionTitle: { fontSize: 19, fontWeight: "700", letterSpacing: -0.4 },
  caption: { fontSize: 11, lineHeight: 17 },
  showStrip: { gap: 12, paddingVertical: 3, paddingRight: 12 },
  showCard: { width: 150, borderRadius: 19, borderWidth: 1, padding: 10 },
  art: { width: 128, height: 128, borderRadius: 13, marginBottom: 10 },
  showTitle: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 19,
    marginBottom: 4,
  },
  category: { fontSize: 10, marginTop: 4 },
  follow: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  followText: { fontSize: 12, fontWeight: "700" },
  topics: { gap: 8, paddingTop: 14 },
  topic: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: "center",
  },
  prompt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    borderRadius: 19,
    borderWidth: 1,
    padding: 18,
    minHeight: 84,
  },
  promptNumber: { fontSize: 11, fontWeight: "700" },
  promptText: { fontSize: 15, lineHeight: 21, fontWeight: "600", flex: 1 },
  results: { gap: 15, marginTop: 16 },
  result: { borderWidth: 1, borderRadius: 22, padding: 20, gap: 12 },
  resultTitle: { fontSize: 18, fontWeight: "700", lineHeight: 24 },
  body: { fontSize: 14, lineHeight: 22 },
  question: {
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 31,
    letterSpacing: -0.5,
  },
  sourceHeading: { flexDirection: "row", gap: 12, alignItems: "center" },
  sourceArt: { width: 44, height: 44, borderRadius: 10 },
  play: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    padding: 13,
    minHeight: 44,
    alignSelf: "flex-start",
  },
  retry: { minHeight: 48, justifyContent: "center", alignItems: "center" },
});
