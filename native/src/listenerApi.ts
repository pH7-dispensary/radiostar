import * as Crypto from "expo-crypto";
import { request, developmentHeaders, endPilotSession } from "./api";
import { getIdentity, setIdentity, eraseLocalListenerData } from "./localStorage";
export type SkipCategory =
  "advert" | "intro" | "title_sequence" | "preview" | "outro";
export type ListenerSummary = {
  monthlyMinutes: number;
  earnedMinutes: number;
  consumedMinutes: number;
  remainingMinutes: number;
  pendingMinutes: number;
  resetAt: string;
  qualifiedReferrals: number;
  pendingReferrals: number;
  code: string;
  inviteUrl: string;
  webInviteAvailable: boolean;
  referralProgressMinutes: number;
  referralStatus: string | null;
  qualificationMinutes: number;
  preferences: Record<SkipCategory, boolean>;
  friendBonusMinutes: number;
  enforcement: boolean;
  verificationAvailable: boolean;
};
let connection: Promise<string> | null = null;
let deleting = false;
export function resetListenerConnection() { connection = null; deleting = false; }
export async function deleteListenerProfile() {
  if (!deleting) await listenerRequest("/api/listener/delete", { confirm: true });
  deleting = true;
  connection = null;
  await eraseLocalListenerData();
  await endPilotSession();
}
async function credential() {
  if (!connection)
    connection = (async () => {
      let value = await getIdentity("star-cast-installation-credential");
      if (!value) {
        value = Crypto.randomUUID() + Crypto.randomUUID();
        await setIdentity("star-cast-installation-credential", value);
      }
      await request("/api/listener/register", {
        method: "POST",
        headers: developmentHeaders(),
        body: JSON.stringify({ credential: value }),
      });
      return value;
    })().catch((error) => {
      connection = null;
      throw error;
    });
  return connection;
}
export async function listenerRequest(path: string, payload?: unknown) {
  if (deleting) throw Error("This profile has been deleted. Restart Radio Star before joining again.");
  const token = await credential();
  return request(path, {
    method: payload === undefined ? "GET" : "POST",
    headers: { ...developmentHeaders(), authorization: `Bearer ${token}` },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
}
export const loadListenerSummary = (): Promise<ListenerSummary> =>
  listenerRequest("/api/listener/summary");
export const attributeInvite = (code: string) =>
  listenerRequest("/api/listener/attribute", { code: code.trim() });
export const updateFollow = (feedUrl: string, following: boolean) =>
  listenerRequest("/api/listener/follow", { feedUrl, following });
export const reportProblem = (input: Record<string, unknown>) =>
  listenerRequest("/api/reports", input);
export type SkipStatus = {
  automaticSkipping: false;
  transcriptAvailable: boolean;
  verifiedCount: number;
  intervals: {
    id: string;
    type: SkipCategory;
    startMs: number;
    endMs: number;
    verificationState: string;
    excerpt?: string;
  }[];
};
