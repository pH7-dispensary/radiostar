// One device session per canonical episode, shared by Brief and Explore.
// The server remains authoritative; this cache only makes navigation instant.
export function createIntelligenceSession(
  api,
  feed,
  id,
  { pollMs = 2500, maxWaitMs = 15 * 60 * 1000 } = {},
) {
  let snapshot = { status: null, busy: false, error: "", paused: false };
  let pending = null,
    timer = null,
    failures = 0,
    pollCount = 0,
    watching = false,
    deadline = 0,
    enabled = false;
  const listeners = new Set();
  const active = () =>
    snapshot.status?.processing !== false &&
    [
      "QUEUED",
      "CHECKING",
      "ACQUIRING_TRANSCRIPT",
      "ANALYSING",
      "INDEXING",
      "PROCESSING",
      "PARTIAL_READY",
      "DISCOVERING",
      "TRANSCRIBING",
      "UNDERSTANDING",
      "ORGANISING",
    ].includes(snapshot.status?.state);
  const emit = (patch) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((fn) => fn(snapshot));
  };
  const schedule = () => {
    clearTimeout(timer);
    if (!watching || snapshot.paused || !active()) return;
    const serverDeadline = Date.parse(snapshot.status?.deadlineAt || "");
    if (!deadline)
      deadline = Number.isFinite(serverDeadline)
        ? serverDeadline
        : Date.now() + maxWaitMs;
    if (Date.now() >= deadline) {
      emit({
        paused: true,
        error:
          "This is taking longer than expected. Check the server result before starting again.",
      });
      return;
    }
    // Poll more slowly for long-running jobs while retaining a quick first
    // update. This is status delivery, not a cosmetic real-time animation.
    const wait = Math.min(15_000, pollMs * Math.pow(1.45, Math.floor(pollCount / 4)));
    timer = setTimeout(() => void refresh(false), wait);
  };
  const run = (operation) => {
    if (pending) return pending;
    emit({ busy: true, error: "" });
    pending = Promise.resolve()
      .then(operation)
      .then((status) => {
        failures = 0;
        pollCount = ["QUEUED", "CHECKING", "ACQUIRING_TRANSCRIPT", "TRANSCRIBING", "ANALYSING", "INDEXING", "PROCESSING", "PARTIAL_READY", "DISCOVERING", "UNDERSTANDING", "ORGANISING"].includes(status?.state) && status?.processing !== false
          ? pollCount + 1
          : 0;
        emit({ status, busy: false });
      })
      .catch((error) => {
        failures++;
        emit({
          busy: false,
          error: error?.userFacing
            ? error.message
            : "Could not reach your listening server. Your audio is unaffected.",
          paused: failures >= 3 || !active(),
        });
      })
      .finally(() => {
        pending = null;
        schedule();
      });
    return pending;
  };
  const refresh = (automatic = false) =>
    run(async () => {
      const status = await api.status(feed, id);
      if ((automatic || enabled) && status.state === "NOT_REQUESTED")
        return api.request(feed, id, {
          trigger: "automatic",
          allowAudio: false,
        });
      return status;
    });
  return {
    getSnapshot: () => snapshot,
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    watch(automatic) {
      enabled = automatic;
      watching = true;
      failures = 0;
      pollCount = 0;
      deadline = 0;
      emit({ paused: false });
      void refresh(automatic);
      return () => {
        watching = false;
        clearTimeout(timer);
      };
    },
    refresh() {
      failures = 0;
      pollCount = 0;
      deadline = 0;
      emit({ paused: false });
      return refresh(false);
    },
    request({ allowAudio = false } = {}) {
      if (
        active() ||
        snapshot.status?.state === "READY" ||
        snapshot.status?.brief
      )
        return Promise.resolve();
      deadline = 0;
      failures = 0;
      emit({ paused: false });
      return run(() =>
        api.request(feed, id, {
          allowAudio,
          retry: snapshot.status?.state === "FAILED",
          trigger: "manual",
        }),
      );
    },
    stopWaiting() {
      clearTimeout(timer);
      emit({
        paused: true,
        error:
          "You can keep listening. Analysis continues on the server; check back for its result.",
      });
    },
  };
}
