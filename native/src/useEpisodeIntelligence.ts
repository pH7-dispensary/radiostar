import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { episodeIntelligenceApi } from "./api";
import {
  createIntelligenceSession,
  type IntelligenceSession,
  type SessionSnapshot,
} from "./intelligenceSession.mjs";

const sessions = new Map<string, IntelligenceSession>();
export function useEpisodeIntelligence(
  feed: string | undefined,
  id: string | undefined,
  visible: boolean,
  enabled: boolean,
) {
  const session = useMemo(() => {
    if (!feed || !id) return null;
    const key = JSON.stringify([feed, id]);
    if (!sessions.has(key)) {
      if (sessions.size >= 50) sessions.delete(sessions.keys().next().value!);
      sessions.set(
        key,
        createIntelligenceSession(episodeIntelligenceApi, feed, id),
      );
    }
    return sessions.get(key)!;
  }, [feed, id]);
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(
    () =>
      session?.getSnapshot() || {
        status: null,
        busy: false,
        error: "",
        paused: false,
      },
  );
  useEffect(() => {
    setSnapshot(
      session?.getSnapshot() || {
        status: null,
        busy: false,
        error: "",
        paused: false,
      },
    );
    return session?.subscribe(setSnapshot);
  }, [session]);
  useEffect(() => {
    if (!visible || !session) return;
    let stop = session.watch(enabled);
    const listener = AppState.addEventListener("change", (state) => {
      stop();
      if (state === "active") stop = session.watch(enabled);
    });
    return () => {
      stop();
      listener.remove();
    };
  }, [session, visible, enabled]);
  // Do not flash the previous episode during an episode switch.
  return {
    ...snapshot,
    ...(session ? session.getSnapshot() : { status: null }),
    session,
  };
}
