import type { IntelligenceStatus } from "./api";
export type SessionSnapshot = {
  status: IntelligenceStatus | null;
  busy: boolean;
  error: string;
  paused: boolean;
};
export type IntelligenceSession = {
  getSnapshot(): SessionSnapshot;
  subscribe(fn: (snapshot: SessionSnapshot) => void): () => void;
  watch(automatic: boolean): () => void;
  refresh(): Promise<void>;
  request(options?: { allowAudio?: boolean }): Promise<void>;
  stopWaiting(): void;
};
export function createIntelligenceSession(
  api: {
    status(feed: string, id: string): Promise<IntelligenceStatus>;
    request(
      feed: string,
      id: string,
      options: {
        trigger: "automatic" | "manual";
        allowAudio: boolean;
        retry?: boolean;
      },
    ): Promise<IntelligenceStatus>;
  },
  feed: string,
  id: string,
  options?: { pollMs?: number; maxWaitMs?: number },
): IntelligenceSession;
