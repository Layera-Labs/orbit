/**
 * Generate a spoken voiceover from text (ElevenLabs on the render server) and
 * drop it on the audio track at the playhead. Self-contained so it sits above the
 * keyboard while typing. Costs 5 credits; gated behind auth like AI Generate.
 */
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { font, vela } from '../constants';
import { VIcon } from './VIcon';
import { useSheetMotion } from './sheetMotion';
import { useEditor } from '../store/editorStore';
import { useAuth } from '../store/authStore';
import { generateTts, GenError } from '../net/genClient';

const COST = 5;

function errText(e: unknown): string {
  if (e instanceof GenError) {
    if (e.kind === 'out-of-credits') return 'You’re out of credits.';
    if (e.kind === 'unauthenticated') return 'Your session expired. Sign in again.';
    if (e.kind === 'not-configured') return 'Voiceover isn’t set up on the render server.';
    if (e.kind === 'no-server') return 'Can’t reach the render server. Set its URL in Profile › Render server.';
    return e.message;
  }
  return e instanceof Error ? e.message : 'Generation failed.';
}

export function TtsSheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const serverUrl = useEditor((s) => s.serverUrl);
  const credits = useEditor((s) => s.credits);
  const insertVoiceoverFromUrl = useEditor((s) => s.insertVoiceoverFromUrl);

  const abortRef = useRef<AbortController | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { translateY, backdrop, close: animateClose } = useSheetMotion(() => setPanel(null));
  // Abort any in-flight generation immediately, then let the sheet glide out.
  const close = useCallback(() => {
    abortRef.current?.abort();
    animateClose();
  }, [animateClose]);

  const canRun = !!text.trim() && !busy;

  const run = async () => {
    if (!canRun) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setErr(null);
    try {
      const { url, balance } = await generateTts(serverUrl, text.trim(), undefined, ac.signal);
      useEditor.setState({ credits: balance });
      await insertVoiceoverFromUrl(url);
      close();
    } catch (e) {
      if (e instanceof GenError && e.kind === 'cancelled') return;
      if (e instanceof GenError && e.kind === 'unauthenticated') void useAuth.getState().logout();
      if (e instanceof GenError && typeof e.balance === 'number') useEditor.setState({ credits: e.balance });
      setErr(errText(e));
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={close}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#0009', opacity: backdrop }]} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.head}>
            <Text style={styles.title}>AI Voiceover</Text>
            <View style={styles.creditPill}>
              <VIcon name="bolt" size={12} color={vela.accent} strokeWidth={2.2} />
              <Text style={styles.creditText}>{credits == null ? '—' : credits}</Text>
            </View>
          </View>

          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="What should the voice say?"
            placeholderTextColor={vela.muted3}
            multiline
            autoFocus
            editable={!busy}
          />

          {err ? <Text style={styles.err}>{err}</Text> : null}

          <Pressable onPress={run} disabled={!canRun} style={[styles.primary, !canRun && { opacity: 0.5 }]}>
            {busy ? <ActivityIndicator color={vela.onAccent} /> : <VIcon name="audio" size={18} color={vela.onAccent} strokeWidth={2} />}
            <Text style={styles.primaryText}>{busy ? 'Generating…' : `Generate voiceover · ${COST} credits`}</Text>
          </Pressable>
          <Pressable onPress={close} hitSlop={8} style={styles.cancel}>
            <Text style={styles.cancelText}>{busy ? 'Cancel' : 'Close'}</Text>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: vela.sheet, padding: 18, paddingBottom: 34, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#fff', fontFamily: font.extrabold, fontSize: 19 },
  creditPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, backgroundColor: vela.accentSoft },
  creditText: { color: vela.accent, fontFamily: font.semibold, fontSize: 12.5 },
  input: { minHeight: 96, backgroundColor: vela.card2, borderRadius: 12, padding: 14, color: '#fff', fontFamily: font.medium, fontSize: 16, textAlignVertical: 'top' },
  err: { color: vela.danger, fontFamily: font.medium, fontSize: 13.5 },
  primary: { height: 54, borderRadius: 14, backgroundColor: vela.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 2 },
  primaryText: { color: vela.onAccent, fontFamily: font.bold, fontSize: 16.5 },
  cancel: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16 },
  cancelText: { color: vela.textLight2, fontFamily: font.semibold, fontSize: 15 },
});
