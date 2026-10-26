import { episodeIdentity } from "../../episode-identity.mjs";
import { useEffect, useRef } from "react";
import { AppState, Linking } from "react-native";
import * as Crypto from "expo-crypto";
import { usePlayback } from "./PlaybackProvider";
import { attributeInvite, listenerRequest } from "./listenerApi";
import { readLocalDocument, writeLocalDocument } from "./localStorage";

// Deferred offline evidence is retained but never billed or used to qualify a referral by itself.
export function ListenerSync({ onboarded, intelligenceEnabled }: { onboarded: boolean; intelligenceEnabled: boolean }) {
  const { snapshot, source } = usePlayback();
  const latest = useRef(snapshot);
  latest.current = snapshot;
  const onboardRef = useRef(onboarded);
  onboardRef.current = onboarded;
  const ready = useRef(false);
  useEffect(() => {
    void listenerRequest("/api/listener/privacy", { intelligenceEnabled }).catch(() => {});
  }, [intelligenceEnabled]);
  useEffect(() => {
    let alive = true;
    const invite = async (url: string | null) => {
      const match = url?.match(
        /^starcast:\/\/invite\/([A-Za-z0-9_-]{12})(?:[?#]|$)/,
      );
      if (!match) return;
      try {
        await attributeInvite(match[1]);
        await writeLocalDocument(
          "star-cast-invite-message",
          "Your invite is linked. Complete onboarding and listen to begin qualification.",
        );
      } catch (e) {
        await writeLocalDocument(
          "star-cast-invite-message",
          e instanceof Error ? e.message : "This invite could not be linked.",
        );
      }
    };
    void Linking.getInitialURL()
      .then(invite)
      .catch(() => {})
      .finally(() => {
        ready.current = true;
        if (alive && onboardRef.current)
          void listenerRequest("/api/listener/onboard", {}).catch(() => {});
      });
    const sub = Linking.addEventListener("url", (e) => {
      void invite(e.url).catch(() => {});
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  useEffect(() => {
    if (onboarded && ready.current)
      void listenerRequest("/api/listener/onboard", {}).catch(() => {});
  }, [onboarded]);
  useEffect(() => {
    let stopped = false,
      sending = false,
      episode = "",
      session = Crypto.randomUUID();
    const report = async () => {
      if (sending || stopped || !latest.current.episodeId) return;
      sending = true;
      const current = latest.current;
      if (episode !== episodeIdentity(source?.feedUrl, current.episodeId)) {
        episode = episodeIdentity(source?.feedUrl, current.episodeId);
        session = Crypto.randomUUID();
      }
      try {
        if (onboardRef.current && ready.current)
          await listenerRequest("/api/listener/onboard", {});
        // Paused transitions reach the server immediately. Idle app polling is unnecessary.
        const pending = await readLocalDocument("star-cast-offline-reports");
        if (pending) {
          const batch = JSON.parse(pending);
          await listenerRequest("/api/listener/offline", batch);
          await writeLocalDocument("star-cast-offline-reports", "");
        }
        await listenerRequest("/api/listener/heartbeat", {
          eventId: Crypto.randomUUID(),
          sessionId: session,
          episodeId: current.episodeId,
          feedUrl: source?.feedUrl,
          positionMs: current.positionMs,
          playing: current.playing && !current.buffered,
          speed: current.speed,
        });
      } catch {
        try {
          const raw = await readLocalDocument("star-cast-offline-reports");
          const old = raw
            ? JSON.parse(raw)
            : { eventId: Crypto.randomUUID(), reports: [] };
          await writeLocalDocument(
            "star-cast-offline-reports",
            JSON.stringify({
              eventId: Crypto.randomUUID(),
              reports: [
                ...old.reports,
                {
                  at: Date.now(),
                  positionMs: current.positionMs,
                  playing: current.playing,
                },
              ].slice(-100),
            }),
          );
        } catch {
          /* Playback is independent of reconciliation. */
        }
      } finally {
        sending = false;
      }
    };
    const timer = setInterval(() => {
      if (latest.current.playing) void report();
    }, 15000);
    const sub = AppState.addEventListener("change", () => {
      void report();
    });
    void report();
    return () => {
      stopped = true;
      clearInterval(timer);
      sub.remove();
    };
  }, [snapshot.playing, snapshot.episodeId, source?.feedUrl, snapshot.playing ? null : snapshot.positionMs]);
  return null;
}
