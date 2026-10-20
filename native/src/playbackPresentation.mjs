export function playbackPresentation(status, { connecting = false, error = null, hasSource = false } = {}) {
  if (connecting) return { state: "CONNECTING", waiting: true, label: "Connecting to audio." };
  if (error || (hasSource && (status?.error || status?.playbackState === "failed")))
    return { state: "FAILED", waiting: false, label: "Audio couldn't play. Please try again." };
  if (hasSource && (status?.isBuffering || status?.timeControlStatus === "waitingToPlayAtSpecifiedRate"))
    return { state: "BUFFERING", waiting: true, label: "Buffering audio." };
  return { state: status?.playing ? "PLAYING" : "PAUSED", waiting: false, label: "" };
}
