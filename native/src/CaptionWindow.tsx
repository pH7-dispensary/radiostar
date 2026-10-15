import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { listenerRequest } from "./listenerApi";
import { usePlayback } from "./PlaybackProvider";
import type { StarTheme } from "./design";

type Caption = { id: string; startMs: number; endMs: number; speaker?: string; text: string };
type CaptionResponse = { available: boolean; reason?: string; segments?: Caption[] };

/** Playback-bound caption surface. It deliberately has neither scrolling nor text export. */
export function CaptionWindow({ p }: { p: StarTheme }) {
  const { source, snapshot } = usePlayback();
  const [result, setResult] = useState<CaptionResponse | null>(null);
  const bucket = useMemo(() => Math.floor(snapshot.positionMs / 8_000), [snapshot.positionMs]);
  useEffect(() => {
    let alive = true;
    if (!source?.feedUrl || !snapshot.episodeId || !snapshot.playing) return;
    void listenerRequest("/api/captions/window", {
      feedUrl: source.feedUrl,
      episodeId: source.episodeId,
      positionMs: snapshot.positionMs,
    })
      .then((value) => {
        if (alive) setResult(value as CaptionResponse);
      })
      .catch(() => {
        if (alive) setResult(null);
      });
    return () => {
      alive = false;
    };
  }, [bucket, snapshot.episodeId, snapshot.playing, source?.feedUrl]);
  if (!result?.available || !result.segments?.length) return null;
  const active = result.segments.find(
    (caption) => snapshot.positionMs >= caption.startMs && snapshot.positionMs < caption.endMs,
  );
  return (
    <View
      accessibilityLabel="Playback-synchronised captions"
      style={[s.surface, { backgroundColor: p.surface, borderColor: p.line }]}
    >
      <Text style={[s.label, { color: p.accent2 }]}>NOW HEARING</Text>
      {active?.speaker ? <Text style={[s.speaker, { color: p.muted }]}>{active.speaker}</Text> : null}
      <Text style={[s.copy, { color: p.text }]}>
        {(active || result.segments[0]).text}
      </Text>
      <Text style={[s.context, { color: p.muted }]}>Captions follow playback when authorised.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  surface: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14, gap: 5 },
  label: { fontSize: 10, letterSpacing: 1.1, fontWeight: "800" },
  speaker: { fontSize: 12, fontWeight: "700" },
  copy: { fontSize: 16, lineHeight: 23, fontWeight: "600" },
  context: { fontSize: 11, lineHeight: 16, marginTop: 2 },
});
