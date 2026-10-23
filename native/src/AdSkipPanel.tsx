import { useEffect, useRef, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import * as Crypto from "expo-crypto";
import {
  listenerRequest,
  loadListenerSummary,
  updateAdSkipPreferences,
  type SkipCategory,
  type SkipStatus,
} from "./listenerApi";
import { usePlayback, type Source } from "./PlaybackProvider";
import { LoadingState } from "./LoadingState";
import type { StarTheme } from "./design";
import { feedback } from "./feedback";
import { adSkipStatusText } from "./adSkipStatus.mjs";
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
  showMasterToggle = true,
}: {
  source: Source;
  p: StarTheme;
  onPlay(ms: number): Promise<unknown>;
  showMasterToggle?: boolean;
}) {
  const { snapshot, seek, audioVariantFingerprint } = usePlayback();
  const [status, setStatus] = useState<SkipStatus | null>(null),
    [preferences, setPreferences] = useState<
      Partial<Record<SkipCategory, boolean> & { adSkipEnabled: boolean }>
    >({}),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [returnTo, setReturnTo] = useState<number | null>(null);
  const alive = useRef(true);
  const reading = useRef(false);
  const revision = useRef(0);
  const episode = { feedUrl: source.feedUrl, episodeId: source.episodeId, audioUrl: source.url, audioVariantFingerprint };
  const refresh = async (silent = false) => {
    if (reading.current) return;
    reading.current = true;
    const requestRevision = revision.current;
    if (!silent) { setBusy(true); setMessage(""); }
    try {
      const [result, listener] = await Promise.all([
        listenerRequest("/api/skips/status", episode),
        loadListenerSummary(),
      ]);
      if (alive.current && requestRevision === revision.current) {
        setStatus(result);
        setPreferences(listener.preferences);
      }
    } catch {
      if (alive.current && requestRevision === revision.current)
        setMessage("Could not load skip preferences. Reconnect and try again.");
    } finally {
      reading.current = false;
      if (!silent && alive.current && requestRevision === revision.current) setBusy(false);
    }
  };
  useEffect(() => {
    alive.current = true;
    revision.current++;
    setBusy(false);
    setStatus(null);
    void refresh();
    const timer = setInterval(() => void refresh(true), 10000);
    return () => {
      alive.current = false;
      revision.current++;
      clearInterval(timer);
    };
  }, [source.feedUrl, source.episodeId, source.url, audioVariantFingerprint]);
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
      <Text accessibilityLiveRegion="polite" style={copy}>{adSkipStatusText(status, preferences.adSkipEnabled === true)}</Text>
      {showMasterToggle && (
        <View
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 56, borderBottomWidth: 0.5, borderColor: p.line }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ color: p.text, fontSize: 16, fontWeight: "600" }}>Ad Skip</Text>
            <Text style={[copy, { fontSize: 12, lineHeight: 17 }]}>Only independently verified, audio-matched intervals can ever be skipped.</Text>
          </View>
          <Switch
            accessibilityLabel="Enable Ad Skip"
            disabled={busy || !status}
            value={preferences.adSkipEnabled === true}
            trackColor={{ true: p.accent2 }}
            onValueChange={(value) => {
              setBusy(true);
              void updateAdSkipPreferences({ adSkipEnabled: value })
                .then((result) => {
                  if (alive.current) {
                    setPreferences(result.preferences);
                    setMessage(value ? "Ad Skip is armed for future verified intervals." : "Ad Skip is turned off.");
                    feedback.selection();
                  }
                })
                .catch(() => alive.current && setMessage("Could not save Ad Skip. Please try again."))
                .finally(() => alive.current && setBusy(false));
            }}
          />
        </View>
      )}
      <Text style={copy}>Choose which verified segment categories you would want to skip. No interval is skipped until independent evidence and a matching audio variant are available.</Text>
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
              void updateAdSkipPreferences({
                [category]: value,
              })
                .then((result) => {
                  if (alive.current) {
                    setPreferences(result.preferences);
                    setMessage(
                      "Preference saved. It applies only after independent verification.",
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
          No transcript evidence is available yet. Eligible episodes prepare
          automatically for enrolled internal testers.
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
