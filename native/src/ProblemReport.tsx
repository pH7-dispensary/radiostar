import { useState } from "react";
import { Modal, SafeAreaView, ScrollView, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as Crypto from "expo-crypto";
import { reportProblem } from "./listenerApi";
import { usePlayback } from "./PlaybackProvider";
import type { StarTheme } from "./design";
import { DiagnosticControls } from './DiagnosticControls';

const categories = [
  ["incorrect_skip", "Incorrect skip"], ["missed_advert", "Missed advert"], ["playback", "Playback"],
  ["episode_information", "Episode info"], ["ai_answer", "AI answer"], ["caption", "Captions"], ["other", "Other"],
] as const;

export function ProblemReport({ p, compact = false }: { p: StarTheme; compact?: boolean }) {
  const { source, snapshot } = usePlayback();
  const [open, setOpen] = useState(false), [category, setCategory] = useState<(typeof categories)[number][0]>("other"), [note, setNote] = useState(""), [message, setMessage] = useState("");
  const submit = async () => {
    try {
      await reportProblem({ eventId: Crypto.randomUUID(), category, note, feedUrl: source?.feedUrl, episodeId: source?.episodeId, positionMs: snapshot.positionMs, feature: "native_player" });
      setMessage("Thanks — your report was sent.");
      setNote("");
    } catch {
      setMessage("Could not send this report. Please try again.");
    }
  };
  return <>
    <Pressable accessibilityRole="button" onPress={() => { setMessage(""); setOpen(true); }} style={[s.trigger, compact ? null : { borderColor: p.line }, { backgroundColor: compact ? "transparent" : p.surface }]}>
      <Text style={{ color: p.accent2, fontWeight: "700" }}>Report a problem</Text>
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={s.scrim}><ScrollView style={{maxHeight:"90%", backgroundColor:p.bg, borderTopLeftRadius:26, borderTopRightRadius:26}} contentContainerStyle={[s.sheet, { borderColor:p.line, paddingBottom:22 }]} keyboardShouldPersistTaps="handled">
        <Text style={[s.title, { color: p.text }]}>Tell us what happened</Text>
        <View style={s.choices}>{categories.map(([value, label]) => <Pressable key={value} onPress={() => setCategory(value)} style={[s.choice, { borderColor: category === value ? p.accent2 : p.line, backgroundColor: category === value ? p.wash : p.surface }]}><Text style={{ color: p.text, fontSize: 12, fontWeight: "700" }}>{label}</Text></Pressable>)}</View>
        <TextInput value={note} onChangeText={setNote} maxLength={1000} multiline placeholder="Optional details" placeholderTextColor={p.muted} style={[s.input, { color: p.text, borderColor: p.line, backgroundColor: p.surface }]} />
        {message ? <Text style={{ color: p.muted }}>{message}</Text> : null}
        <View style={s.actions}><Pressable onPress={() => setOpen(false)} style={s.action}><Text style={{ color: p.muted }}>Close</Text></Pressable><Pressable onPress={() => void submit()} style={[s.action, { backgroundColor: p.accent2 }]}><Text style={{ color: p.onAccent, fontWeight: "800" }}>Send report</Text></Pressable></View>
        <SafeAreaView><DiagnosticControls p={p} /></SafeAreaView>
      </ScrollView></View>
    </Modal>
  </>;
}
const s = StyleSheet.create({ trigger: { minHeight: 44, justifyContent: "center", alignItems: "center", borderWidth: 1, borderRadius: 14, paddingHorizontal: 14 }, scrim: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,.45)" }, sheet: { borderTopWidth: 1, padding: 22, gap: 14, borderTopLeftRadius: 26, borderTopRightRadius: 26 }, title: { fontSize: 20, fontWeight: "800" }, choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, choice: { borderWidth: 1, borderRadius: 999, minHeight: 36, justifyContent: "center", paddingHorizontal: 11 }, input: { borderWidth: 1, borderRadius: 14, minHeight: 92, padding: 12, textAlignVertical: "top" }, actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 }, action: { minHeight: 44, borderRadius: 14, justifyContent: "center", alignItems: "center", paddingHorizontal: 16 } });
