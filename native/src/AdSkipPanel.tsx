import { useEffect, useRef, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import * as Crypto from "expo-crypto";
import {
  listenerRequest,
  loadListenerSummary,
  type SkipCategory,
  type SkipStatus,
} from "./listenerApi";
import { usePlayback, type Source } from "./PlaybackProvider";
import { LoadingState } from "./LoadingState";
import type { StarTheme } from "./design";
import { feedback } from "./feedback";
const labels: Record<SkipCategory, string> = {
  advert: "Advertisements",
  intro: "Introductions",
  title_sequence: "Title sequences",
  preview: "Previews",
  outro: "Outros",
};
const stamp = (ms: number) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
export function AdSkipPanel({
  source,
  p,
  onPlay,
}: {
  source: Source;
  p: StarTheme;
  onPlay(ms: number): Promise<unknown>;
}) {
  const { snapshot, seek } = usePlayback();
  const [status, setStatus] = useState<SkipStatus | null>(null),
    [preferences, setPreferences] = useState<
      Partial<Record<SkipCategory, boolean>>
    >({}),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [returnTo, setReturnTo] = useState<number | null>(null);
  const alive = useRef(true);
  const episode = { feedUrl: source.feedUrl, episodeId: source.episodeId };
  const refresh = async () => {
    setBusy(true);
    setMessage("");
    try {
      const [result, listener] = await Promise.all([
        listenerRequest("/api/skips/status", episode),
        loadListenerSummary(),
      ]);
      if (alive.current) {
        setStatus(result);
        setPreferences(listener.preferences);
      }
    } catch {
      if (alive.current)
        setMessage("Could not load skip preferences. Reconnect and try again.");
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
    };
  }, [source.feedUrl, source.episodeId]);
  const report = async (kind: string, intervalId?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await listenerRequest("/api/skips/feedback", {
        ...episode,
        eventId: Crypto.randomUUID(),
        intervalId,
        kind,
        positionMs: snapshot.positionMs,
      });
      if (alive.current) {
        setStatus(result);
        setMessage(
          kind === "skipped_conversation"
            ? "Reported. This interval is disputed and cannot be skipped automatically."
            : "Thanks. Your feedback is saved for review.",
        );
        feedback.success();
      }
    } catch {
      if (alive.current)
        setMessage("Feedback could not be saved. Please try again.");
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const copy = { color: p.muted, fontSize: 14, lineHeight: 21 };
  return (
    <View style={{ gap: 14 }}>
      <Text style={{ color: p.text, fontSize: 22, fontWeight: "600" }}>
        Skip verified adverts
      </Text>
      <Text style={copy}>Keep conversations uninterrupted.</Text>
      <Text style={copy}>
        Choose what you’d like to skip. Automatic skipping is not yet available:
        real-world precision and matching audio must be verified first.
      </Text>
      {busy && (
        <LoadingState compact p={p} label="Updating your skip preferences…" />
      )}
      {(Object.keys(labels) as SkipCategory[]).map((category) => (
        <View
          key={category}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            minHeight: 52,
            borderBottomWidth: 0.5,
            borderColor: p.line,
          }}
        >
          <Text style={{ color: p.text, fontSize: 16, flex: 1 }}>
            {labels[category]}
          </Text>
          <Switch
            accessibilityLabel={`${labels[category]} preference`}
            disabled={busy || !status}
            value={preferences[category] === true}
            trackColor={{ true: p.accent2 }}
            onValueChange={(value) => {
              setBusy(true);
              void listenerRequest("/api/listener/preferences", {
                [category]: value,
              })
                .then((result) => {
                  if (alive.current) {
                    setPreferences(result.preferences);
                    setMessage(
                      "Preference saved. Automatic skipping remains off.",
                    );
                    feedback.selection();
                  }
                })
                .catch(() => {
                  if (alive.current)
                    setMessage(
                      "Could not save this preference. Please try again.",
                    );
                })
                .finally(() => {
                  if (alive.current) setBusy(false);
                });
            }}
          />
        </View>
      ))}
      <Text style={copy}>
        {status?.verifiedCount ?? 0} verified intervals ·{" "}
        {status?.intervals.filter((i) => i.verificationState === "CANDIDATE")
          .length ?? 0}{" "}
        candidates awaiting review
      </Text>
      {!status?.transcriptAvailable && (
        <Text style={copy}>
          No transcript evidence is available yet. Brief and Explore can prepare
          this episode; audio analysis still asks first.
        </Text>
      )}
      {status?.intervals.map((interval) => (
        <View
          key={interval.id}
          style={{
            padding: 14,
            backgroundColor: p.surface,
            borderRadius: 16,
            gap: 10,
          }}
        >
          <Text style={{ color: p.text, fontWeight: "600" }}>
            {labels[interval.type]} · {stamp(interval.startMs)}–
            {stamp(interval.endMs)}
          </Text>
          <Text style={copy}>
            {interval.verificationState === "VERIFIED"
              ? "Verified for review"
              : interval.verificationState === "DISPUTED"
                ? "Disputed · never skipped"
                : "Awaiting boundary verification"}
          </Text>
          <Text numberOfLines={3} style={copy}>
            {interval.excerpt}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              const previous = snapshot.positionMs;
              void onPlay(interval.startMs)
                .then(() => {
                  if (alive.current) setReturnTo(previous);
                })
                .catch(() =>
                  setMessage("Audio could not play. Please try again."),
                );
            }}
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Text style={{ color: p.accent2 }}>
              Listen to check · {stamp(interval.startMs)}
            </Text>
          </Pressable>
          <View style={{ flexDirection: "row", gap: 20 }}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void report("good", interval.id)}
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <Text style={{ color: p.accent2 }}>
                {interval.type === "advert"
                  ? "Correct advert"
                  : "Correct label"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void report("skipped_conversation", interval.id)}
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <Text style={{ color: p.accent2 }}>This is conversation</Text>
            </Pressable>
          </View>
        </View>
      ))}
      {returnTo != null && (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void seek(returnTo)
              .then(() => setReturnTo(null))
              .catch(() =>
                setMessage("Could not return to your position. Try again."),
              );
          }}
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Text style={{ color: p.accent2 }}>
            Undo preview · return to {stamp(returnTo)}
          </Text>
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => void report("missed")}
        style={{ minHeight: 44, justifyContent: "center" }}
      >
        <Text style={{ color: p.accent2 }}>
          Report an advert at {stamp(snapshot.positionMs)}
        </Text>
      </Pressable>
      {!!message && (
        <Text accessibilityLiveRegion="polite" style={copy}>
          {message}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => void refresh()}
        style={{ minHeight: 44, justifyContent: "center" }}
      >
        <Text style={{ color: p.accent2 }}>Refresh evidence</Text>
      </Pressable>
    </View>
  );
}
