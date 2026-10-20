import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import * as Crypto from "expo-crypto";
import { listenerRequest, onAdSkipPreferenceChange, type SkipStatus } from "./listenerApi";
import { usePlayback } from "./PlaybackProvider";

export type AdSkipNotice = {
  id: string;
  durationMs: number;
  undo: () => Promise<void>;
};

const paddingMs = 300;
const manualSuppressionMs = 10_000;

/**
 * This is a player adapter, not an Ad Skip decision engine.  The server has
 * already applied rights, rollout, preferences, acoustic evidence, boundary
 * verification and exact-source matching before it sends activeIntervals.
 */
export function AdSkipRuntime({
  onNotice,
}: {
  onNotice: Dispatch<SetStateAction<AdSkipNotice | null>>;
}) {
  const { source, snapshot, seekAutomatically, manualSeekRevision } =
    usePlayback();
  const [status, setStatus] = useState<SkipStatus | null>(null);
  const alive = useRef(true);
  const latest = useRef<SkipStatus | null>(null);
  const manualUntil = useRef(0);
  const lastPosition = useRef<number | null>(null);
  const automaticTarget = useRef<number | null>(null);
  const consumed = useRef(new Set<string>());
  const priorSkip = useRef<{
    intervalId: string;
    positionMs: number;
    sourceKey: string;
  } | null>(null);
  const sourceKey = source ? `${source.feedUrl || ""}:${source.episodeId}:${source.url}` : "";

  const refresh = async () => {
    if (!source?.feedUrl) return;
    try {
      const next = (await listenerRequest("/api/skips/status", {
        feedUrl: source.feedUrl,
        episodeId: source.episodeId,
        audioUrl: source.url,
      })) as SkipStatus;
      if (!alive.current) return;
      latest.current = next;
      setStatus(next);
    } catch {
      // Playback must never be held up by an optional server intelligence call.
      if (alive.current) {
        latest.current = null;
        setStatus(null);
      }
    }
  };

  useEffect(() => {
    alive.current = true;
    consumed.current = new Set();
    priorSkip.current = null;
    onNotice(null);
    void refresh();
    return () => {
      alive.current = false;
    };
  }, [sourceKey]);

  useEffect(() => onAdSkipPreferenceChange(() => void refresh()), [sourceKey]);

  useEffect(() => {
    manualUntil.current = Date.now() + manualSuppressionMs;
  }, [manualSeekRevision]);

  useEffect(() => {
    const previous = lastPosition.current;
    lastPosition.current = snapshot.positionMs;
    if (previous === null || Math.abs(snapshot.positionMs - previous) < 5_000)
      return;
    if (
      automaticTarget.current !== null &&
      Math.abs(snapshot.positionMs - automaticTarget.current) < 1_500
    ) {
      automaticTarget.current = null;
      return;
    }
    // Lock-screen and system transport controls do not call the in-app seek
    // method. A discontinuity is conservative listener intent, so pause
    // automatic execution for the same short window as a visible seek.
    manualUntil.current = Date.now() + manualSuppressionMs;
  }, [snapshot.positionMs]);

  useEffect(() => {
    if (!source?.feedUrl || status?.state !== "VERIFYING") return;
    const poll = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(poll);
  }, [sourceKey, status?.state]);

  useEffect(() => {
    if (!source?.feedUrl || !snapshot.playing || !latest.current?.automaticSkipping)
      return;
    if (Date.now() < manualUntil.current) return;
    const interval = latest.current.activeIntervals?.find(
      (item) =>
        !consumed.current.has(item.id) &&
        snapshot.positionMs >= item.startMs &&
        snapshot.positionMs < item.endMs,
    );
    if (!interval) return;
    consumed.current.add(interval.id);
    const positionMs = snapshot.positionMs;
    priorSkip.current = { intervalId: interval.id, positionMs, sourceKey };
    const undo = async () => {
      const previous = priorSkip.current;
      if (!previous || previous.intervalId !== interval.id || previous.sourceKey !== sourceKey)
        return;
      manualUntil.current = Date.now() + manualSuppressionMs;
      automaticTarget.current = previous.positionMs;
      await seekAutomatically(previous.positionMs);
      onNotice(null);
      void listenerRequest("/api/skips/events", {
        feedUrl: source.feedUrl,
        episodeId: source.episodeId,
        eventId: Crypto.randomUUID(),
        intervalId: interval.id,
        kind: "undo",
        positionMs: previous.positionMs,
      }).catch(() => {});
    };
    const target = interval.endMs + paddingMs;
    automaticTarget.current = target;
    void seekAutomatically(target)
      .then(() => {
        onNotice({
          id: interval.id,
          durationMs: Math.max(0, interval.endMs - interval.startMs),
          undo,
        });
        setTimeout(() => {
          onNotice((current) => current?.id === interval.id ? null : current);
        }, 6_000);
        void listenerRequest("/api/skips/events", {
          feedUrl: source.feedUrl,
          episodeId: source.episodeId,
          eventId: Crypto.randomUUID(),
          intervalId: interval.id,
          kind: "automatic_skip",
          positionMs,
        }).catch(() => {});
      })
      .catch(() => {
        consumed.current.delete(interval.id);
      });
  }, [sourceKey, snapshot.positionMs, snapshot.playing, status?.automaticSkipping]);

  return null;
}
