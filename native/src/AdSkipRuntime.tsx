import { nativeDiagnostics } from "./nativeDiagnostics.mjs";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import * as Crypto from "expo-crypto";
import { AppState } from "react-native";
import { listenerRequest, onAdSkipPreferenceChange, type SkipStatus } from "./listenerApi";
import { usePlayback } from "./PlaybackProvider";
import { executeVerifiedSkip } from "./adSkipExecution.mjs";

export type AdSkipNotice = { id: string; durationMs: number; undo: () => Promise<void> };
export function AdSkipRuntime({ onNotice }: { onNotice: Dispatch<SetStateAction<AdSkipNotice | null>> }) {
  const { source, snapshot, seekAutomatically, manualSeekRevision, audioVariantFingerprint, getPositionMs, getPlaybackRevision, attachAudioProof } = usePlayback();
  const [status, setStatus] = useState<SkipStatus | null>(null);
  const eligibility = useRef<SkipStatus | null>(null);
  const live = useRef({ source, snapshot, seekAutomatically, manualSeekRevision, audioVariantFingerprint, getPositionMs, getPlaybackRevision });
  live.current = { source, snapshot, seekAutomatically, manualSeekRevision, audioVariantFingerprint, getPositionMs, getPlaybackRevision };
  const consumedRanges = useRef<{startMs:number;endMs:number}[]>([]);
  const consumed = useRef(new Set<string>()), manualUntil = useRef(0), busy = useRef(false);
  const identity = source ? `${source.feedUrl}:${source.episodeId}:${source.url}` : "";
  const activeIdentity = useRef(identity); activeIdentity.current = identity;
  const refreshRevision = useRef(0);
  const attempts = useRef(new Map<string, { count: number; after: number }>());
  const previousManualRevision = useRef(manualSeekRevision);
  const prefetched = useRef<{ id: string; lease: any; revision: number; preferenceRevision: number } | null>(null);
  const prefetching = useRef<string | null>(null);
  const [boundaryTick, setBoundaryTick] = useState(0);
  const alreadyConsumed = (item:{id:string;startMs:number;endMs:number}) => consumed.current.has(item.id) || consumedRanges.current.some(row=>row.startMs<item.endMs && row.endMs>item.startMs);
  useEffect(()=>{busy.current=false;prefetching.current=null;consumed.current=new Set();consumedRanges.current=[];attempts.current.clear();prefetched.current=null;eligibility.current=null;setStatus(null);onNotice(null);},[identity]);
  const nearBoundary = Boolean(snapshot.playing && status?.automaticSkipping && status.activeIntervals?.some(item =>
    !alreadyConsumed(item) && snapshot.positionMs >= item.startMs-5000 && snapshot.positionMs < item.endMs));
  useEffect(() => {
    if (!nearBoundary) return;
    // Poll only this small runtime near a known break. Do not drive the whole
    // player/UI at 10 Hz. Suspension can delay timers; leases still fail closed.
    const timer = setInterval(() => setBoundaryTick(value => value+1), 100);
    return () => clearInterval(timer);
  }, [nearBoundary, identity]);

  useEffect(() => {
    let stopped = false, loading = false;
    prefetched.current = null; prefetching.current = null; eligibility.current = null; setStatus(null);
    const refresh = async () => {
      if (loading || !source?.feedUrl) return;
      loading = true;
      const revision = refreshRevision.current;
      try {
        const next = await listenerRequest("/api/skips/status", { feedUrl: source.feedUrl, episodeId: source.episodeId, audioUrl: source.url, audioVariantFingerprint, positionMs:getPositionMs(),audioProofVersion:"delivered-chain-v1" });
        if (!stopped && revision === refreshRevision.current && audioVariantFingerprint !== next.variant?.audioVariantFingerprint && next.variant?.windowProof && next.pilotEnabled && next.preferenceEnabled) {
          // Native matching examines bytes delivered through the current item,
          // with source/privacy guards. No seek or restart occurs here.
          if (await attachAudioProof(next.variant)) return;
        }
        if (!stopped && revision === refreshRevision.current) { eligibility.current = next; setStatus(next); }
      } catch { if (!stopped) { eligibility.current = null; setStatus(null); } } finally { loading = false; }
    };
    void refresh();
    const poll = setInterval(() => void refresh(), 10_000);
    const foreground = AppState.addEventListener("change", state => { if (state === "active") void refresh(); });
    const unsubscribe = onAdSkipPreferenceChange(() => { refreshRevision.current++; setStatus(null); void refresh(); });
    return () => { stopped = true; clearInterval(poll); foreground.remove(); unsubscribe(); };
  }, [identity,audioVariantFingerprint]);
  useEffect(() => {
    if (previousManualRevision.current !== manualSeekRevision) manualUntil.current = Date.now() + 10_000;
    previousManualRevision.current = manualSeekRevision;
  }, [manualSeekRevision]);

  useEffect(() => {
    if (!source?.feedUrl || !audioVariantFingerprint || !status?.automaticSkipping || !snapshot.playing || busy.current || Date.now() < manualUntil.current) return;
    const positionMs = getPositionMs();
    const ahead = status.activeIntervals?.find(item => !alreadyConsumed(item) && positionMs < item.startMs && item.startMs - positionMs <= Math.min(5000, 2000 * snapshot.speed));
    if (ahead && !prefetching.current && (attempts.current.get(`prefetch:${ahead.id}`)?.count || 0) < 2 && (attempts.current.get(`prefetch:${ahead.id}`)?.after || 0) <= Date.now() && (!prefetched.current || prefetched.current.id !== ahead.id || prefetched.current.lease.expiresAt <= Date.now() + 1000)) {
      const requestedIdentity = identity, requestedRevision = manualSeekRevision, requestedPreference = refreshRevision.current;
      prefetching.current = ahead.id;
      const attemptKey = `prefetch:${ahead.id}`;
      attempts.current.set(attemptKey, { count: (attempts.current.get(attemptKey)?.count || 0) + 1, after: Date.now() + 3000 });
      void listenerRequest("/api/skips/authorise", { feedUrl: source.feedUrl, episodeId: source.episodeId, audioUrl: source.url, audioVariantFingerprint, intervalId: ahead.id, positionMs, audioProofVersion:"delivered-chain-v1", prefetch: true })
        .then(lease => { if (activeIdentity.current === requestedIdentity && live.current.manualSeekRevision === requestedRevision && refreshRevision.current === requestedPreference) prefetched.current = { id: ahead.id, lease, revision: requestedRevision, preferenceRevision: requestedPreference }; })
        .catch(() => {}).finally(() => { if (activeIdentity.current === requestedIdentity) prefetching.current = null; });
    }
    const interval = status.activeIntervals?.find(item => !alreadyConsumed(item) && (attempts.current.get(item.id)?.count || 0) < 2 && (attempts.current.get(item.id)?.after || 0) <= Date.now() && positionMs >= item.startMs && positionMs < item.endMs);
    if (!interval) return;
    const revision = manualSeekRevision, preferenceRevision = refreshRevision.current, playbackRevision = getPlaybackRevision();
    const current = () => activeIdentity.current === identity && live.current.getPlaybackRevision() === playbackRevision && live.current.manualSeekRevision === revision && refreshRevision.current === preferenceRevision;
    const episode = { feedUrl: source.feedUrl, episodeId: source.episodeId, audioUrl: source.url, audioVariantFingerprint, audioProofVersion:"delivered-chain-v1" };
    attempts.current.set(interval.id, { count: (attempts.current.get(interval.id)?.count || 0) + 1, after: Date.now() + 10_000 }); busy.current = true;
    const report = (kind: string, positionMs: number, authorisationId?: string, code?: string) => { nativeDiagnostics.record(kind, {positionMs}); return listenerRequest("/api/skips/events", { ...episode, eventId: Crypto.randomUUID(), intervalId: interval.id, kind, positionMs, authorisationId, code }).catch(() => null); };
    let leaseId: string | undefined;
    void report("skip_requested", positionMs);
    void executeVerifiedSkip({ interval, positionMs, durationMs: snapshot.durationMs || 0,
      current: () => current() && live.current.snapshot.playing && Boolean(eligibility.current?.automaticSkipping && eligibility.current.activeIntervals?.some(row => row.id === interval.id && row.startMs === interval.startMs && row.endMs === interval.endMs)),
      getPosition: () => live.current.getPositionMs(),
      onStage: (stage, detail) => { leaseId = detail.lease.authorisationId; void report(stage, detail.positionMs, leaseId); },
      authorise: async input => {
        if (status.variant?.windowProof && !(await attachAudioProof(status.variant))) throw Error("Delivered audio proof is no longer current");
        const cached = prefetched.current;
        prefetched.current = null;
        return cached?.id === interval.id && cached.revision === revision && cached.preferenceRevision === preferenceRevision && cached.lease.expiresAt > Date.now() + 500
          ? Promise.resolve(cached.lease) : listenerRequest("/api/skips/authorise", { ...episode, ...input });
      },
      seek: ms => live.current.seekAutomatically(ms),
    }).then(result => {
      if (!current()) return;
      consumed.current.add(interval.id);consumedRanges.current.push({startMs:interval.startMs,endMs:interval.endMs});
      nativeDiagnostics.record("automatic_skip", {positionMs:result.positionMs,originMs:result.originMs,durationMs:result.durationMs});
      const recorded = listenerRequest("/api/skips/events", { ...episode, eventId: Crypto.randomUUID(), intervalId: interval.id, kind: "automatic_skip", positionMs: result.positionMs, originMs: result.originMs, authorisationId: result.lease.authorisationId }).catch(() => null);
      let undone = false, undoing = false;
      onNotice({ id: interval.id, durationMs: result.durationMs, undo: async () => {
        if (undone || undoing || activeIdentity.current !== identity) return;
        undoing = true;
        manualUntil.current = Date.now() + 10_000;
        void report("undo_requested", live.current.snapshot.positionMs, result.lease.authorisationId);
        try {
          // Undo is a recovery action, available even after pause or kill switch.
          const restored = await live.current.seekAutomatically(result.originMs);
          nativeDiagnostics.record("undo", {positionMs:restored});
          undone = true; onNotice(null);
          // Telemetry ordering must not hold the recovery action open offline.
          void recorded.then(() => listenerRequest("/api/skips/events", { ...episode, eventId: Crypto.randomUUID(), intervalId: interval.id, kind: "undo", positionMs: restored, authorisationId: result.lease.authorisationId })).catch(() => {});
        } catch { void report("undo_failed", live.current.snapshot.positionMs, result.lease.authorisationId, "UNDO_NOT_CONFIRMED"); }
        finally { undoing = false; }
      } });
      setTimeout(() => { if (activeIdentity.current === identity) onNotice(value => value?.id === interval.id ? null : value); }, 8000);
    }).catch(error => { void report("seek_failed", live.current.snapshot.positionMs, leaseId, error?.code || (leaseId ? "SEEK_NOT_CONFIRMED" : "AUTHORISATION_FAILED")); }).finally(() => { if (activeIdentity.current === identity) busy.current = false; });
  }, [identity, snapshot.positionMs, snapshot.playing, status, manualSeekRevision, boundaryTick]);
  return null;
}
