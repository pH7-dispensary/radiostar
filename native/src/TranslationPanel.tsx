import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { listenerRequest } from "./listenerApi";
import type { StarTheme } from "./design";

type Language = { tag: string; label: string };
type TranslationConfig = {
  controls: { state: string; providerAvailable: boolean; languages: Language[] };
  preference: { listeningLanguage: string | null; listenInMyLanguage: boolean; naturalVoices: boolean };
  entitlement: { active: boolean };
  availability: "AVAILABLE" | "PREPARING" | "UNAVAILABLE";
};

const deviceLanguage = () => {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale || "en";
  if (locale.toLowerCase().startsWith("zh")) return "zh-Hans";
  return locale.split("-")[0];
};

export function TranslationPanel({ p }: { p: StarTheme }) {
  const [config, setConfig] = useState<TranslationConfig | null>(null);
  const [message, setMessage] = useState("Loading language preferences…");
  const [saving, setSaving] = useState(false);
  const update = (patch: Record<string, unknown>) => {
    setSaving(true);
    void listenerRequest("/api/listener/translation", patch)
      .then((value) => { setConfig(value as TranslationConfig); setMessage(""); })
      .catch(() => setMessage("Language preferences could not be saved. Reconnect and try again."))
      .finally(() => setSaving(false));
  };
  useEffect(() => {
    let alive = true;
    void listenerRequest("/api/listener/translation")
      .then((value) => {
        if (!alive) return;
        const next = value as TranslationConfig;
        setConfig(next); setMessage("");
        // Save a proposal once, never enable translated playback automatically.
        if (!next.preference.listeningLanguage && next.controls.languages.some((language) => language.tag === deviceLanguage()))
          update({ listeningLanguage: deviceLanguage() });
      })
      .catch(() => { if (alive) setMessage("Language preferences are unavailable while offline."); });
    return () => { alive = false; };
  }, []);
  const preference = config?.preference;
  const ready = config?.availability === "AVAILABLE";
  return <View style={{ gap: 10 }}>
    <View style={{ gap: 3 }}>
      <Text style={{ color: p.text, fontSize: 16, fontWeight: "700" }}>Radio Star Translate</Text>
      <Text style={{ color: p.muted, fontSize: 14, lineHeight: 20 }}>Hear podcasts naturally in your language.</Text>
    </View>
    {!!message && <Text accessibilityLiveRegion="polite" style={{ color: p.muted, fontSize: 13, lineHeight: 18 }}>{message}</Text>}
    {config && <>
      <Text style={{ color: p.muted, fontSize: 13, fontWeight: "700" }}>PREFERRED LISTENING LANGUAGE</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
        {config.controls.languages.map((language) => {
          const selected = preference?.listeningLanguage === language.tag;
          return <Pressable key={language.tag} accessibilityRole="button" accessibilityState={{ selected, disabled: saving }}
            disabled={saving} onPress={() => update({ listeningLanguage: language.tag })}
            style={{ minHeight: 38, justifyContent: "center", paddingHorizontal: 13, borderRadius: 19, borderWidth: 1,
              borderColor: selected ? p.accent2 : p.line, backgroundColor: selected ? p.wash : "transparent" }}>
            <Text style={{ color: selected ? p.text : p.muted, fontSize: 13, fontWeight: "700" }}>{language.label}</Text>
          </Pressable>;
        })}
      </ScrollView>
      <Pressable accessibilityRole="switch" accessibilityLabel="Listen in my language"
        accessibilityState={{ checked: preference?.listenInMyLanguage === true, disabled: !ready || saving }}
        disabled={!ready || saving} onPress={() => update({ listenInMyLanguage: !preference?.listenInMyLanguage })}
        style={{ minHeight: 52, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: p.line }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ color: p.text, fontSize: 16, fontWeight: "700" }}>Listen in my language</Text>
          <Text style={{ color: p.muted, fontSize: 13, lineHeight: 18 }}>Use translated audio when it is available.</Text>
        </View>
        <Text style={{ color: ready && preference?.listenInMyLanguage ? p.accent2 : p.muted, fontSize: 13, fontWeight: "700" }}>{ready && preference?.listenInMyLanguage ? "On" : "Off"}</Text>
      </Pressable>
      <Text style={{ color: p.muted, fontSize: 13, lineHeight: 19 }}>
        {config.availability === "UNAVAILABLE" ? "Translation is not available in this beta. Original audio always stays available."
          : config.availability === "PREPARING" ? "Preparing your language. Original audio remains available while translation is being tested."
          : config.entitlement.active ? "Your translated listening preference is ready." : "A verified Radio Star Translate subscription is required."}
      </Text>
    </>}
  </View>;
}
