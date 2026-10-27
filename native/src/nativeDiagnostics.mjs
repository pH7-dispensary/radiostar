// Opt-in, memory-only engineering evidence. Never collect URLs, titles, tokens,
// transcript text or raw error messages; a restart intentionally ends capture.
const events = new Set([
  "capture_started",
  "play_requested",
  "engine_position_advanced",
  "playback_state",
  "playback_error",
  "source_changed",
  "pause_requested",
  "manual_seek",
  "automatic_seek_confirmed",
  "speed_changed",
  "app_state",
  "skip_requested",
  "seek_attempted",
  "seek_failed",
  "automatic_skip",
  "undo_requested",
  "undo",
  "undo_failed",
]);
const numeric = new Set([
  "positionMs",
  "targetMs",
  "originMs",
  "elapsedMs",
  "speed",
  "operation",
  "durationMs",
]);
const states = new Set([
  "active",
  "background",
  "inactive",
  "unknown",
  "extension",
]);
export function createDiagnosticCapture({ now = Date.now, limit = 200 } = {}) {
  const subscribers = new Set();
  let enabled = false,
    rows = [],
    startedAt = null;
  return {
    enabled: () => enabled,
    subscribe(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    start() {
      enabled = true;
      rows = [];
      startedAt = now();
      this.record("capture_started");
      for (const listener of subscribers) listener();
    },
    clear() {
      enabled = false;
      rows = [];
      startedAt = null;
      for (const listener of subscribers) listener();
    },
    record(event, data = {}) {
      if (!enabled || !events.has(event)) return;
      const fields = {};
      for (const [key, value] of Object.entries(data)) {
        if (numeric.has(key) && Number.isFinite(value)) fields[key] = value;
        if (
          ["playing", "buffering"].includes(key) &&
          typeof value === "boolean"
        )
          fields[key] = value;
        if (key === "state" && states.has(value)) fields[key] = value;
      }
      rows.push({ at: now(), event, ...fields });
      if (rows.length > limit) rows.splice(0, rows.length - limit);
    },
    snapshot() {
      return {
        version: 1,
        enabled,
        startedAt,
        exportedAt: now(),
        retention: "Memory only; cleared on stop or process restart",
        audiblePlayback: "NOT_MEASURED",
        events: rows.map((r) => ({ ...r })),
      };
    },
  };
}
export const nativeDiagnostics = createDiagnosticCapture();
export function safeSleepDiagnostics(value) {
  if (!value || typeof value !== "object") return null;
  const out = {};
  for (const key of [
    "deadlineAt",
    "fadeMs",
    "positionMs",
    "recoveryMs",
    "completedAt",
    "armedAt",
    "fadeStartedAt",
    "pauseConfirmedAt",
    "deadlineDriftMs",
  ])
    if (Number.isFinite(value[key])) out[key] = value[key];
  if (
    ["ARMED", "FADING", "PAUSED", "CANCELLED", "INTERRUPTED"].includes(
      value.state,
    )
  )
    out.state = value.state;
  if (["ai", "manual", "end"].includes(value.kind)) out.kind = value.kind;
  return out;
}
