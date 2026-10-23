import type { IntelligenceStatus } from "./api";
export function intelligenceCapabilities(status: IntelligenceStatus | null): {brief:boolean;explore:boolean;moments:boolean};
export type IntelligencePresentation = {
  state: string; label: string; explanation: string; processing: boolean;
  progress?: string | null;
  eta: string | null; action: "enable" | "refresh" | "prepare" | "retry" | "audio" | null; ready: boolean;
};
export function intelligencePresentation(status: IntelligenceStatus | null, options?: {
  enabled?: boolean; error?: string; paused?: boolean; sourceAvailable?: boolean; now?: number;
}): IntelligencePresentation;
