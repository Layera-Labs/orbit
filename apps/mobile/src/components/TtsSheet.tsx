/**
 * Full-screen text-to-speech composer. Voice and speed are sent to the render
 * service, then the generated voiceover is inserted at the current playhead.
 */
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { font, vela } from "../constants";
import { VIcon, type VIconName } from "./VIcon";
import { VSlider } from "./VSlider";
import { useEditor } from "../store/editorStore";
import { useAuth } from "../store/authStore";
import { generateTts, GenError } from "../net/genClient";

const COST = 5;
const MAX_CHARS = 3000;

const VOICES = [
  {
    id: "21m00Tcm4TlvDq8ikWAM",
    label: "Warm",
    hint: "Natural",
    icon: "profile",
    tint: "#e9e6ff",
  },
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    label: "Youthful",
    hint: "Bright",
    icon: "effects",
    tint: "#e3f1ff",
  },
  {
    id: "ErXwobaYiN019PkySvjV",
    label: "Confident",
    hint: "Clear",
    icon: "audio",
    tint: "#fff0dc",
  },
  {
    id: "MF3mGyEYCl7XYWbV9V6O",
    label: "Gentle",
    hint: "Soft",
    icon: "motion",
    tint: "#e0f6ef",
  },
  {
    id: "pNInz6obpgDQGcFmaJgB",
    label: "Deep",
    hint: "Bold",
    icon: "crown",
    tint: "#eee7ff",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  hint: string;
  icon: VIconName;
  tint: string;
}>;

function errText(e: unknown): string {
  if (e instanceof GenError) {
    if (e.kind === "out-of-credits") return "You’re out of credits.";
    if (e.kind === "unauthenticated")
      return "Your session expired. Sign in again.";
    if (e.kind === "not-configured")
      return "Voiceover isn’t set up on the render server.";
    if (e.kind === "no-server")
      return "Can’t reach the render server. Check the render server in Profile.";
    return e.message;
  }
  return e instanceof Error ? e.message : "Generation failed.";
}

export function TtsSheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const serverUrl = useEditor((s) => s.serverUrl);
  const credits = useEditor((s) => s.credits);
  const insertVoiceoverFromUrl = useEditor((s) => s.insertVoiceoverFromUrl);
  const abortRef = useRef<AbortController | null>(null);
  const [text, setText] = useState("");
  const [voiceId, setVoiceId] = useState<string>(VOICES[0].id);
  const [speed, setSpeed] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const close = useCallback(() => {
    abortRef.current?.abort();
    setPanel(null);
  }, [setPanel]);

  const canRun = !!text.trim() && !busy;
  const run = async () => {
    if (!canRun) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setErr(null);
    try {
      const result = await generateTts(
        serverUrl,
        text.trim(),
        voiceId,
        speed,
        ac.signal,
      );
      useEditor.setState({ credits: result.balance });
      await insertVoiceoverFromUrl(result.url);
      close();
    } catch (e) {
      if (e instanceof GenError && e.kind === "cancelled") return;
      if (e instanceof GenError && e.kind === "unauthenticated") {
        void useAuth.getState().logout();
      }
      if (e instanceof GenError && typeof e.balance === "number") {
        useEditor.setState({ credits: e.balance });
      }
      setErr(errText(e));
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setBusy(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={close}>
      <StatusBar style="auto" />
      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
        style={styles.root}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Close text to speech"
            onPress={close}
            style={styles.close}
          >
            <VIcon name="close" size={21} color={vela.ink} />
          </Pressable>
          <Text style={styles.title}>Text to Speech</Text>
          <View style={styles.creditPill}>
            <VIcon name="bolt" size={13} color={vela.accent} />
            <Text style={styles.creditText}>
              {credits == null ? "—" : credits}
            </Text>
          </View>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={(value) => setText(value.slice(0, MAX_CHARS))}
              placeholder="Enter or paste your script here…"
              placeholderTextColor={vela.lightMuted2}
              multiline
              autoFocus
              editable={!busy}
            />
            <Text style={styles.counter}>
              {text.length}/{MAX_CHARS}
            </Text>
          </View>

          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Voice</Text>
            <Text style={styles.sectionHint}>Choose a personality</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.voiceRow}
          >
            {VOICES.map((voice) => {
              const selected = voiceId === voice.id;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={voice.id}
                  onPress={() => setVoiceId(voice.id)}
                  style={styles.voice}
                >
                  <View
                    style={[
                      styles.voiceAvatar,
                      { backgroundColor: voice.tint },
                      selected && styles.voiceAvatarOn,
                    ]}
                  >
                    <VIcon name={voice.icon} size={29} color={vela.accent} />
                    {selected ? (
                      <View style={styles.voiceCheck}>
                        <VIcon name="check" size={11} color="#fff" />
                      </View>
                    ) : null}
                  </View>
                  <Text
                    style={[styles.voiceLabel, selected && styles.voiceLabelOn]}
                  >
                    {voice.label}
                  </Text>
                  <Text style={styles.voiceHint}>{voice.hint}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.speedCard}>
            <View style={styles.speedHead}>
              <Text style={styles.speedTitle}>Speaking speed</Text>
              <Text style={styles.speedValue}>{speed.toFixed(1)}×</Text>
            </View>
            <VSlider
              value={speed}
              min={0.7}
              max={1.2}
              onChange={(value) => setSpeed(Math.round(value * 10) / 10)}
            />
            <View style={styles.speedLabels}>
              <Text style={styles.speedLabel}>Relaxed</Text>
              <Text style={styles.speedLabel}>Natural</Text>
              <Text style={styles.speedLabel}>Fast</Text>
            </View>
          </View>

          {err ? <Text style={styles.err}>{err}</Text> : null}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.costRow}>
            <View style={styles.costLabel}>
              <VIcon name="bolt" size={14} color={vela.ink2} />
              <Text style={styles.cost}>{COST} credits</Text>
            </View>
            <Text style={styles.balance}>
              Balance {credits == null ? "—" : credits}
            </Text>
          </View>
          <Pressable
            onPress={run}
            disabled={!canRun}
            style={[styles.primary, !canRun && styles.primaryDisabled]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <VIcon name="audio" size={19} color="#fff" />
            )}
            <Text style={styles.primaryText}>
              {busy ? "Generating voice…" : "Generate and add to timeline"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: vela.homeBg },
  header: {
    minHeight: 104,
    paddingTop: 48,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: vela.lightBorder,
    backgroundColor: vela.lightCard,
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: vela.lightSurface,
  },
  title: { color: vela.ink, fontFamily: font.extrabold, fontSize: 20 },
  creditPill: {
    minWidth: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: vela.accentSoft,
  },
  creditText: { color: vela.accent, fontFamily: font.bold, fontSize: 13 },
  content: { padding: 18, paddingBottom: 24, gap: 18 },
  composer: {
    minHeight: 210,
    borderRadius: 20,
    padding: 16,
    backgroundColor: vela.lightCard,
    borderWidth: 1,
    borderColor: vela.lightBorder,
  },
  input: {
    flex: 1,
    minHeight: 165,
    color: vela.ink,
    fontFamily: font.medium,
    fontSize: 17,
    lineHeight: 24,
    textAlignVertical: "top",
  },
  counter: {
    alignSelf: "flex-end",
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  sectionHead: { gap: 2 },
  sectionTitle: { color: vela.ink, fontFamily: font.bold, fontSize: 17 },
  sectionHint: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 12.5,
  },
  voiceRow: { gap: 12, paddingRight: 18 },
  voice: { width: 76, alignItems: "center", gap: 3 },
  voiceAvatar: {
    width: 70,
    height: 70,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  voiceAvatarOn: { borderColor: vela.accent },
  voiceCheck: {
    position: "absolute",
    right: -4,
    top: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: vela.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  voiceLabel: { color: vela.ink3, fontFamily: font.semibold, fontSize: 12.5 },
  voiceLabelOn: { color: vela.accent },
  voiceHint: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 10.5,
  },
  speedCard: {
    borderRadius: 18,
    padding: 16,
    gap: 12,
    backgroundColor: vela.lightCard,
    borderWidth: 1,
    borderColor: vela.lightBorder,
  },
  speedHead: { flexDirection: "row", justifyContent: "space-between" },
  speedTitle: { color: vela.ink2, fontFamily: font.semibold, fontSize: 15 },
  speedValue: {
    color: vela.accent,
    fontFamily: font.bold,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
  },
  speedLabels: { flexDirection: "row", justifyContent: "space-between" },
  speedLabel: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 10.5,
  },
  err: { color: vela.danger, fontFamily: font.medium, fontSize: 13.5 },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: vela.lightBorder,
    backgroundColor: vela.lightCard,
  },
  costRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  costLabel: { flexDirection: "row", alignItems: "center", gap: 5 },
  cost: { color: vela.ink2, fontFamily: font.semibold, fontSize: 13 },
  balance: { color: vela.lightMuted, fontFamily: font.medium, fontSize: 12.5 },
  primary: {
    height: 54,
    borderRadius: 16,
    backgroundColor: vela.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  primaryDisabled: { opacity: 0.42 },
  primaryText: { color: "#fff", fontFamily: font.bold, fontSize: 16 },
});
