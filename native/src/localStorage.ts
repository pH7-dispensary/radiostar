import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system/legacy";

let pending: Promise<unknown> = Promise.resolve();
let writesPaused = false;
export function resumeLocalWrites() { writesPaused = false; }
export const removeIdentity = (key: string): Promise<void> =>
  Platform.OS === "web" ? Promise.resolve(globalThis.localStorage?.removeItem(key)) : SecureStore.deleteItemAsync(key);
export async function eraseLocalListenerData() {
  writesPaused = true;
  await pending;
  const documents = ["star-cast-listener-state-v1", "star-cast-native-playback-v1",
    "star-cast-native-playback-v1-positions", "star-cast-offline-reports",
    "star-cast-invite-message", "star-cast-listener-summary", "star-cast-sleep-learning-v1",
    "star-cast-intelligence-introduction-v1"];
  for (const key of documents) {
    if (Platform.OS === "web") globalThis.localStorage?.removeItem(key);
    else {
      await FileSystem.deleteAsync(FileSystem.documentDirectory + key + ".json", { idempotent: true });
      await FileSystem.deleteAsync(FileSystem.documentDirectory + key + ".json.tmp", { idempotent: true });
      await removeIdentity(key);
    }
  }
  await removeIdentity("star-cast-installation-credential");
  await removeIdentity("star-cast-pilot-token");
}
/** Small identity values stay in Keychain; large listener documents use app-private files. */
export const getIdentity = (key: string): Promise<string | null> =>
  Platform.OS === "web"
    ? Promise.resolve(globalThis.localStorage?.getItem(key) ?? null)
    : SecureStore.getItemAsync(key);
export const setIdentity = (key: string, value: string): Promise<void> =>
  Platform.OS === "web"
    ? Promise.resolve(globalThis.localStorage?.setItem(key, value))
    : SecureStore.setItemAsync(key, value);
export async function readLocalDocument(key: string): Promise<string | null> {
  if (Platform.OS === "web")
    return globalThis.localStorage?.getItem(key) ?? null;
  try {
    return await FileSystem.readAsStringAsync(
      FileSystem.documentDirectory + key + ".json",
    );
  } catch {
    try {
      return await FileSystem.readAsStringAsync(
        FileSystem.documentDirectory + key + ".json.tmp",
      );
    } catch {
      return SecureStore.getItemAsync(key);
    }
  }
}
export function writeLocalDocument(key: string, value: string): Promise<void> {
  const write = async () => {
    if (writesPaused) return;
    if (Platform.OS === "web") {
      globalThis.localStorage?.setItem(key, value);
      return;
    }
    const path = FileSystem.documentDirectory + key + ".json",
      temporary = path + ".tmp";
    await FileSystem.writeAsStringAsync(temporary, value);
    await FileSystem.moveAsync({ from: temporary, to: path });
  };
  const next = pending.then(write, write);
  pending = next.catch(() => {});
  return next;
}
