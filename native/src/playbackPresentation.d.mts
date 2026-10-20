export type AudioFeedback = { state: "CONNECTING" | "BUFFERING" | "PLAYING" | "PAUSED" | "FAILED"; waiting: boolean; label: string };
export function playbackPresentation(status: { error?: string | null; playbackState?: string; timeControlStatus?: string; isBuffering?: boolean; playing?: boolean }, options?: { connecting?: boolean; error?: string | null; hasSource?: boolean }): AudioFeedback;
