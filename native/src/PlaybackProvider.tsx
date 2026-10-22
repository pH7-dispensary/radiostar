import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { readLocalDocument, writeLocalDocument } from "./localStorage";
import {
  createAudioPlayer,
  setAudioModeAsync,
  useAudioPlayerStatus,
} from "expo-audio";
import type { PlaybackSnapshot } from "./contracts";
import { playbackPresentation, type AudioFeedback } from "./playbackPresentation.mjs";
import { verifiedPlaybackCopy } from "./verifiedAudio";

export type Source = {
  episodeId: string;
  url: string;
  title: string;
  show: string;
  artworkUrl?: string;
  feedUrl?: string;
  hasPublisherTranscript?: boolean;
  startPositionMs?: number;
};
type Persisted = {
  source: Source;
  snapshot: Pick<PlaybackSnapshot, "positionMs" | "speed">;
};
type PlaybackContextValue = {
  snapshot: PlaybackSnapshot;
  source: Source | null;
  audio: AudioFeedback;
  retry: () => Promise<void>;
  play: (source: Source) => Promise<void>;
  pause: () => Promise<void>;
  seek: (ms: number) => Promise<void>;
  seekAutomatically: (ms: number) => Promise<number>;
  audioVariantFingerprint: string | null;
  manualSeekRevision: number;
  setSpeed: (speed: number) => Promise<void>;
  fadeAndPause: (durationMs: number) => Promise<number>;
  cancelFade: () => void;
};
const KEY = "star-cast-native-playback-v1";
const PlaybackContext = createContext<PlaybackContextValue | null>(null);

export function usePlayback() {
  let value = useContext(PlaybackContext);
  if (!value) throw Error("PlaybackProvider is required");
  return value;
}
export function PlaybackProvider({ children }: { children: React.ReactNode }) {
  const [audioVariantFingerprint, setAudioVariantFingerprint] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const waitingSince = useRef<number | null>(null);
  const lastWaitingMs = useRef(0);
  let [snapshot, setSnapshot] = useState<PlaybackSnapshot>({
      episodeId: "",
      positionMs: 0,
      durationMs: null,
      speed: 1,
      playing: false,
      buffered: false,
      updatedAt: Date.now(),
    }),
    [source, setSource] = useState<Source | null>(null),
    player = useMemo(() => createAudioPlayer(null), []),
    status = useAudioPlayerStatus(player),
    lastWrite = useRef(0),
    operation = useRef(0),
    fadeOperation = useRef(0),
    [manualSeekRevision, setManualSeekRevision] = useState(0);
  const positions = useRef<Record<string, number>>({});
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const audio = playbackPresentation(status, { connecting, error: playbackError, hasSource: !!source });
  useEffect(() => {
    if (audio.waiting && waitingSince.current === null) waitingSince.current = Date.now();
    if (!audio.waiting && waitingSince.current !== null) {
      lastWaitingMs.current = Date.now() - waitingSince.current;
      waitingSince.current = null;
    }
  }, [audio.waiting]);
  const persistPosition = async (positionMs: number) => {
    const currentSource = sourceRef.current;
    if (!currentSource) return;
    positions.current[currentSource.episodeId] = positionMs;
    await writeLocalDocument(
      KEY + "-positions",
      JSON.stringify(positions.current),
    );
    await writeLocalDocument(
      KEY,
      JSON.stringify({
        source: currentSource,
        snapshot: { positionMs, speed: snapshot.speed },
      }),
    );
  };
  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
    });
    let cancelled = false;
    void (async () => {
      try {
        const savedPositions = await readLocalDocument(KEY + "-positions");
        if (savedPositions) positions.current = JSON.parse(savedPositions);
        let raw = await readLocalDocument(KEY);
        if (!raw || cancelled) return;
        let stored = JSON.parse(raw) as Persisted;
        if (!stored.source?.url || operation.current > 0) return;
        sourceRef.current = { ...stored.source, startPositionMs: undefined };
        setSource(sourceRef.current);
        setConnecting(true);
        setSnapshot((previous) => ({ ...previous, episodeId: stored.source.episodeId,
          positionMs: stored.snapshot.positionMs || 0, speed: stored.snapshot.speed || 1 }));
        player.replace(stored.source.url);
        player.setPlaybackRate(stored.snapshot.speed || 1);
        const started = Date.now();
        while (
          !player.isLoaded &&
          !cancelled &&
          operation.current === 0 &&
          Date.now() - started < 15000
        )
          await new Promise((resolve) => setTimeout(resolve, 100));
        if (cancelled || operation.current > 0) return;
        if (!player.isLoaded) throw Error("Audio restore failed");
        await player.seekTo((stored.snapshot.positionMs || 0) / 1000);
        if (!cancelled) {
          setSource({ ...stored.source, startPositionMs: undefined });
          setSnapshot((s) => ({
            ...s,
            episodeId: stored.source.episodeId,
            positionMs: stored.snapshot.positionMs || 0,
            speed: stored.snapshot.speed || 1,
          }));
        }
      } catch {
        if (!cancelled && operation.current === 0 && sourceRef.current)
          setPlaybackError("Audio couldn't play. Please try again.");
      } finally {
        if (!cancelled && operation.current === 0) setConnecting(false);
      }
    })();
    return () => {
      cancelled = true;
      player.remove();
    };
  }, [player]);
  useEffect(() => {
    if (connecting || playbackError || status.error) return;
    setSnapshot((previous) => ({
      ...previous,
      positionMs: Math.round((status.currentTime || 0) * 1000),
      durationMs: Number.isFinite(status.duration)
        ? Math.round(status.duration * 1000)
        : previous.durationMs,
      playing: !!status.playing,
      buffered: !!status.isBuffering,
      updatedAt: Date.now(),
    }));
  }, [connecting, playbackError, status.error, status.currentTime, status.duration, status.playing, status.isBuffering]);
  useEffect(() => {
    if (!source || Date.now() - lastWrite.current < 5_000) return;
    lastWrite.current = Date.now();
    positions.current[source.episodeId] = snapshot.positionMs;
    void writeLocalDocument(
      KEY + "-positions",
      JSON.stringify(positions.current),
    ).catch(() => {});
    void writeLocalDocument(
      KEY,
      JSON.stringify({
        source,
        snapshot: { positionMs: snapshot.positionMs, speed: snapshot.speed },
      } satisfies Persisted),
    );
  }, [source, snapshot.positionMs, snapshot.speed]);
  let value: PlaybackContextValue = {
    snapshot,
    source,
    audio,
    retry: async () => {
      if (sourceRef.current) await value.play({ ...sourceRef.current, startPositionMs: snapshot.positionMs });
    },
    play: async (next) => {
      const currentOperation = ++operation.current;
      try {
      setPlaybackError(null);
      fadeOperation.current++;
      player.volume = 1;
      const switching = sourceRef.current?.url !== next.url;
      const reload = switching || !player.isLoaded || audio.state === "FAILED" || (!audioVariantFingerprint && !player.playing);
      if (reload) {
        setConnecting(true);
        sourceRef.current = { ...next, startPositionMs: undefined };
        setSource({ ...next, startPositionMs: undefined });
        setAudioVariantFingerprint(null);
        const verified = await verifiedPlaybackCopy(next);
        if (currentOperation !== operation.current) return;
        player.replace(verified ? { uri: verified.uri, headers: verified.headers } : next.url);
        setAudioVariantFingerprint(verified?.fingerprint || null);
        setSnapshot((s) => ({
          ...s,
          episodeId: next.episodeId,
          positionMs: switching ? 0 : s.positionMs,
          durationMs: switching ? null : s.durationMs,
          playing: false,
        }));
        const started = Date.now();
        while (
          !player.isLoaded &&
          Date.now() - started < 20000 &&
          currentOperation === operation.current
        )
          await new Promise((resolve) => setTimeout(resolve, 100));
        if (currentOperation !== operation.current) return;
        if (!player.isLoaded)
          throw Error("Audio could not load. Please try again.");
      }
      const target =
        next.startPositionMs ??
        (switching ? positions.current[next.episodeId] : reload ? snapshot.positionMs : undefined);
      if (target !== undefined) await player.seekTo(Math.max(0, target) / 1000);
      if (next.startPositionMs !== undefined)
        setManualSeekRevision((revision) => revision + 1);
      if (currentOperation !== operation.current) return;
      player.setActiveForLockScreen(
        true,
        { title: next.title, artist: next.show, artworkUrl: next.artworkUrl },
        { showSeekBackward: true, showSeekForward: true },
      );
      player.setPlaybackRate(snapshot.speed);
      player.play();
      } catch (error) {
        if (currentOperation === operation.current) {
          setPlaybackError("Audio couldn't play. Please try again.");
          setSnapshot((previous) => ({ ...previous, playing: false }));
        }
        throw error;
      } finally {
        if (currentOperation === operation.current) setConnecting(false);
      }
    },
    pause: async () => {
      operation.current++;
      setConnecting(false);
      fadeOperation.current++;
      player.pause();
      player.volume = 1;
      if (sourceRef.current) {
        positions.current[sourceRef.current.episodeId] =
          player.currentTime * 1000;
        await writeLocalDocument(
          KEY + "-positions",
          JSON.stringify(positions.current),
        );
        await writeLocalDocument(
          KEY,
          JSON.stringify({
            source: sourceRef.current,
            snapshot: {
              positionMs: player.currentTime * 1000,
              speed: snapshot.speed,
            },
          }),
        );
      }
    },
    seek: async (ms) => {
      setManualSeekRevision((revision) => revision + 1);
      fadeOperation.current++;
      player.volume = 1;
      const target = Math.max(
        0,
        Math.min(ms, player.duration > 0 ? player.duration * 1000 : ms),
      );
      await player.seekTo(target / 1000);
      await persistPosition(target);
    },
    seekAutomatically: async (ms) => {
      fadeOperation.current++;
      player.volume = 1;
      const target = Math.max(
        0,
        Math.min(ms, player.duration > 0 ? player.duration * 1000 : ms),
      );
      const generation = operation.current;
      await player.seekTo(target / 1000, 0, 0);
      const observed = player.currentTime * 1000;
      if (generation !== operation.current || !player.isLoaded || Math.abs(observed - target) > 350) throw Error("Playback seek was not confirmed.");
      await persistPosition(observed);
      return observed;
    },
    audioVariantFingerprint,
    manualSeekRevision,
    setSpeed: async (speed) => {
      player.setPlaybackRate(speed);
      setSnapshot((s) => ({ ...s, speed }));
    },
    cancelFade: () => {
      fadeOperation.current++;
      player.volume = 1;
    },
    fadeAndPause: async (durationMs) => {
      const token = ++fadeOperation.current;
      const steps = Math.max(1, Math.min(20, Math.round(durationMs / 2_250)));
      for (let step = steps; step > 0; step--) {
        if (token !== fadeOperation.current) {
          player.volume = 1;
          throw Object.assign(Error("Sleep fade was interrupted."), { code: "SLEEP_FADE_CANCELLED" });
        }
        player.volume = step / steps;
        await new Promise<void>((resolve) =>
          setTimeout(resolve, durationMs / steps),
        );
      }
      if (token !== fadeOperation.current) {
        player.volume = 1;
        throw Object.assign(Error("Sleep fade was interrupted."), { code: "SLEEP_FADE_CANCELLED" });
      }
      player.pause();
      player.volume = 1;
      const actualPausePosition = player.currentTime * 1000;
      await persistPosition(actualPausePosition);
      return actualPausePosition;
    },
  };
  return (
    <PlaybackContext.Provider value={value}>
      {children}
    </PlaybackContext.Provider>
  );
}
