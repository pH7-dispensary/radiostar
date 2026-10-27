import { useSyncExternalStore } from "react";
import { Alert, Platform, Pressable, Share, Text, View } from "react-native";
import {
  nativeDiagnostics,
  safeSleepDiagnostics,
} from "./nativeDiagnostics.mjs";
import { readNativeSleepRecord, readNativeBuildMetadata } from "./nativeSleep";
import type { StarTheme } from "./design";
export function DiagnosticControls({ p }: { p: StarTheme }) {
  const enabled = useSyncExternalStore(
    nativeDiagnostics.subscribe,
    nativeDiagnostics.enabled,
    () => false,
  );
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: p.muted, fontSize: 12 }}>
        Optional device diagnostics: up to 200 timing events, kept in memory
        until stopped or restarted. No episode names, audio URLs or credentials.
        Export opens the share sheet; nothing is uploaded automatically.
      </Text>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel="Capture device diagnostics"
        accessibilityState={{ checked: enabled }}
        aria-checked={enabled}
        style={{ minHeight: 44, justifyContent: "center" }}
        onPress={() => {
          if (enabled) nativeDiagnostics.clear();
          else nativeDiagnostics.start();
        }}
      >
        <Text style={{ color: p.accent2, fontWeight: "700" }}>
          {enabled ? "Stop and clear capture" : "Start diagnostic capture"}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        style={{ minHeight: 44, justifyContent: "center" }}
        onPress={() => {
          void (async () => {
            const metadata = await readNativeBuildMetadata();
            const sleep = safeSleepDiagnostics(await readNativeSleepRecord());
            await Share.share({
              title: "Radio Star device diagnostics",
              message: JSON.stringify(
                {
                  platform: Platform.OS,
                  osVersion: String(Platform.Version),
                  ...metadata,
                  ...nativeDiagnostics.snapshot(),
                  sleep,
                },
                null,
                2,
              ),
            });
          })().catch(() =>
            Alert.alert(
              "Export unavailable",
              "Please try again. No diagnostic data was sent.",
            ),
          );
        }}
      >
        <Text style={{ color: p.accent2, fontWeight: "700" }}>
          Export device diagnostics
        </Text>
      </Pressable>
    </View>
  );
}
