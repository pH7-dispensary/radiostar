import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import * as Crypto from "expo-crypto";
import { AppState } from "react-native";
import { listenerRequest, onAdSkipPreferenceChange, type SkipStatus } from "./listenerApi";
import { usePlayback } from "./PlaybackProvider";
import { executeVerifiedSkip } from "./adSkipExecution.mjs";

export type AdSkipNotice = { id: string; durationMs: number; undo: () => Promise<void> };
export function AdSkipRuntime({ onNotice }: { onNotice: Dispatch<SetStateAction<AdSkipNotice | null>> }) {
  const { source, snapshot, seekAutomatically, manualSeekRevision, audioVariantFingerprint } = usePlayback();
  const [status, setStatus] = useState<SkipStatus | null>(null);
  const live = useRef({ source, snapshot, seekAutomatically, manualSeekRevision, audioVariantFingerprint });
  live.current = { source, snapshot, seekAutomatically, manualSeekRevision, audioVariantFingerprint };
  const consumed = useRef(new Set<string>()), manualUntil = useRef(0), busy = useRef(false);
  const identity = source ? `${source.feedUrl}:${source.episodeId}:${source.url}:${audioVariantFingerprint}` : "";
  const activeIdentity = useRef(identity); activeIdentity.current = identity;
  const refreshRevision = useRef(0);
  const attempts = useRef(new Map<string, { count: number; after: number }>());
  const previousManualRevision = useRef(manualSeekRevision);

  useEffect(() => {
    let stopped = false, loading = false;
    consumed.current = new Set(); attempts.current.clear(); busy.current = false; setStatus(null); onNotice(null);
    const refresh = async () => {
      if (loading || !source?.feedUrl) return;
      loading = true;
      const revision = refreshRevision.current;
      try {
        const next = await listenerRequest("/api/skips/status", { feedUrl: source.feedUrl, episodeId: source.episodeId, audioUrl: source.url, audioVariantFingerprint });
        if (!stopped && revision === refreshRevision.current) setStatus(next);
      } catch { if (!stopped) setStatus(null); } finally { loading = false; }
    };
    void refresh();
    const poll = setInterval(() => void refresh(), 10_000);
    const foreground = AppState.addEventListener("change", state => { if (state === "active") void refresh(); });
    const unsubscribe = onAdSkipPreferenceChange(() => { refreshRevision.current++; setStatus(null); void refresh(); });
    return () => { stopped = true; clearInterval(poll); foreground.remove(); unsubscribe(); };
  }, [identity]);
  useEffect(() => {
    if (previousManualRevision.current !== manualSeekRevision) manualUntil.current = Date.now() + 10_000;
    previousManualRevision.current = manualSeekRevision;
  }, [manualSeekRevision]);

  useEffect(() => {
    if (!source?.feedUrl || !audioVariantFingerprint || !status?.automaticSkipping || !snapshot.playing || busy.current || Date.now() < manualUntil.current) return;
    const interval = status.activeIntervals?.find(item => !consumed.current.has(item.id) && (attempts.current.get(item.id)?.count || 0) < 2 && (attempts.current.get(item.id)?.after || 0) <= Date.now() && snapshot.positionMs >= item.startMs && snapshot.positionMs < item.endMs);
    if (!interval) return;
    const revision = manualSeekRevision, preferenceRevision = refreshRevision.current;
    const current = () => activeIdentity.current === identity && live.current.manualSeekRevision === revision && refreshRevision.current === preferenceRevision;
    const episode = { feedUrl: source.feedUrl, episodeId: source.episodeId, audioUrl: source.url, audioVariantFingerprint };
    attempts.current.set(interval.id, { count: (attempts.current.get(interval.id)?.count || 0) + 1, after: Date.now() + 10_000 }); busy.current = true;
    const report = (kind: string, positionMs: number, authorisationId?: string, code?: string) => listenerRequest("/api/skips/events", { ...episode, eventId: Crypto.randomUUID(), intervalId: interval.id, kind, positionMs, authorisationId, code }).catch(() => null);
    let leaseId: string | undefined;
    void report("skip_requested", snapshot.positionMs);
    void executeVerifiedSkip({ interval, positionMs: snapshot.positionMs, durationMs: snapshot.durationMs || 0,
      current: () => current() && live.current.snapshot.playing,
      getPosition: () => live.current.snapshot.positionMs,
      onStage: (stage, detail) => { leaseId = detail.lease.authorisationId; void report(stage, detail.positionMs, leaseId); },
      authorise: input => listenerRequest("/api/skips/authorise", { ...episode, ...input }),
      seek: ms => live.current.seekAutomatically(ms),
    }).then(result => {
      if (!current()) return;
      consumed.current.add(interval.id);
      const recorded = listenerRequest("/api/skips/events", { ...episode, eventId: Crypto.randomUUID(), intervalId: interval.id, kind: "automatic_skip", positionMs: result.positionMs, authorisationId: result.lease.authorisationId }).catch(() => null);
      let undone = false;
      onNotice({ id: interval.id, durationMs: result.durationMs, undo: async () => {
        if (undone || activeIdentity.current !== identity) return;
        manualUntil.current = Date.now() + 10_000;
        void report("undo_requested", live.current.snapshot.positionMs, result.lease.authorisationId);
        try {
          // Undo is a recovery action, available even after pause or kill switch.
          const restored = await live.current.seekAutomatically(snapshot.positionMs);
          undone = true; onNotice(null); await recorded;
          void listenerRequest("/api/skips/events", { ...episode, eventId: Crypto.randomUUID(), intervalId: interval.id, kind: "undo", positionMs: restored, authorisationId: result.lease.authorisationId }).catch(() => {});
        } catch { void report("undo_failed", live.current.snapshot.positionMs, result.lease.authorisationId, "UNDO_NOT_CONFIRMED"); }
      } });
      setTimeout(() => { if (activeIdentity.current === identity) onNotice(value => value?.id === interval.id ? null : value); }, 8000);
    }).catch(error => { void report("seek_failed", live.current.snapshot.positionMs, leaseId, error?.code || (leaseId ? "SEEK_NOT_CONFIRMED" : "AUTHORISATION_FAILED")); }).finally(() => { if (activeIdentity.current === identity) busy.current = false; });
  }, [identity, snapshot.positionMs, snapshot.playing, status, manualSeekRevision]);
  return null;
}
