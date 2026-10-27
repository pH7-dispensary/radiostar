export type DiagnosticCapture = {
  enabled(): boolean;
  subscribe(listener: () => void): () => void;
  start(): void;
  clear(): void;
  record(event: string, data?: Record<string, unknown>): void;
  snapshot(): Record<string, unknown>;
};
export function createDiagnosticCapture(options?: {
  now?: () => number;
  limit?: number;
}): DiagnosticCapture;
export const nativeDiagnostics: DiagnosticCapture;
export function safeSleepDiagnostics(
  value: unknown,
): Record<string, unknown> | null;
