import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system/legacy";

let pending: Promise<unknown> = Promise.resolve();
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
