/**
 * Full-screen AI generation flow. Describe → Generate → PREVIEW the result with
 * Insert / Try again. Image or Video; video adds a duration control and an
 * optional Sound switch (silent 60 / with a generated sound effect 100). The
 * provider key lives on the render server; the app only meters credits.
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { font, mono, vela } from '../constants';
import { VIcon } from './VIcon';
import { useEditor } from '../store/editorStore';
import { generateImage, generateVideo, GenError } from '../net/genClient';

type Mode = 'image' | 'video';
type Result = { kind: Mode; url: string; audioUrl?: string; durationSec?: number };

function errText(e: unknown, mode: Mode): string {
  if (e instanceof GenError) {
    if (e.kind === 'out-of-credits') return 'You’re out of credits.';
    if (e.kind === 'not-configured') return `${mode === 'image' ? 'Image' : 'Video'} generation isn’t set up on the render server.`;
    if (e.kind === 'no-server') return 'Can’t reach the render server — set its URL in Profile › Render server.';
    return e.message;
  }
  return e instanceof Error ? e.message : 'Generation failed.';
}

export function AiGenerateModal() {
  const setPanel = useEditor((s) => s.setPanel);
  const project = useEditor((s) => s.project);
  const credits = useEditor((s) => s.credits);
  const refreshCredits = useEditor((s) => s.refreshCredits);
  const serverUrl = useEditor((s) => s.serverUrl);
  const insertImageFromUrl = useEditor((s) => s.insertImageFromUrl);
  const insertVideoFromUrl = useEditor((s) => s.insertVideoFromUrl);

  const [mode, setMode] = useState<Mode>('image');
  const [prompt, setPrompt] = useState('');
  const [durationSec, setDurationSec] = useState<5 | 10>(5);
  const [audio, setAudio] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const lastPrompt = useRef('');

  const player = useVideoPlayer(null, (p) => {
    p.loop = true;
    p.muted = false;
  });

  useEffect(() => {
    void refreshCredits();
  }, [refreshCredits]);

  // When a video result arrives, play it in the preview.
  useEffect(() => {
    if (result?.kind === 'video') {
      try {
        player.replace(result.url);
        player.play();
      } catch {}
    }
  }, [result, player]);

  const size = project ? { width: project.width, height: project.height } : undefined;
  const aspect = project ? project.width / project.height : 9 / 16;
  const cost = mode === 'image' ? 10 : audio ? 100 : 60;
  const close = () => setPanel(null);

  const run = async () => {
    const p = prompt.trim();
    if (!p || busy) return;
    setBusy(true);
    setErr(null);
    lastPrompt.current = p;
    try {
      if (mode === 'image') {
        const { url, balance } = await generateImage(serverUrl, p, size);
        useEditor.setState({ credits: balance });
        setResult({ kind: 'image', url });
      } else {
        const { url, audioUrl, balance } = await generateVideo(serverUrl, p, size, { durationSec, audio });
        useEditor.setState({ credits: balance });
        setResult({ kind: 'video', url, audioUrl, durationSec });
      }
    } catch (e) {
      if (e instanceof GenError && typeof e.balance === 'number') useEditor.setState({ credits: e.balance });
      setErr(errText(e, mode));
    } finally {
      setBusy(false);
    }
  };

  const tryAgain = () => {
    setResult(null);
    setErr(null);
  };

  const insert = async () => {
    if (!result || inserting) return;
    setInserting(true);
    try {
      if (result.kind === 'image') await insertImageFromUrl(result.url);
      else await insertVideoFromUrl(result.url, result.audioUrl, result.durationSec);
      close();
    } catch (e) {
      setErr(errText(e, mode));
      setInserting(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={close} presentationStyle="fullScreen">
      <View style={s.root}>
        <View style={s.header}>
          <Pressable onPress={close} hitSlop={12} style={s.round}>
            <VIcon name="close" size={22} color={vela.textLight} strokeWidth={2.2} />
          </Pressable>
          <Text style={s.title}>AI Generate</Text>
          <View style={s.creditPill}>
            <VIcon name="bolt" size={13} color={vela.accent} strokeWidth={2.2} />
            <Text style={s.creditText}>{credits == null ? '—' : credits}</Text>
          </View>
        </View>

        {result ? (
          <View style={s.body}>
            <View style={[s.preview, { aspectRatio: aspect }]}>
              {result.kind === 'image' ? (
                <Image source={{ uri: result.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : (
                <VideoView style={StyleSheet.absoluteFill} player={player} contentFit="cover" nativeControls={false} />
              )}
              {result.kind === 'video' && result.audioUrl ? (
                <View style={s.soundTag}>
                  <VIcon name="audio" size={13} color="#fff" strokeWidth={2} />
                  <Text style={s.soundTagText}>Sound</Text>
                </View>
              ) : null}
            </View>
            {err ? <Text style={s.err}>{err}</Text> : null}
            <View style={s.actions}>
              <Pressable onPress={tryAgain} disabled={inserting} style={[s.btn, s.btnGhost]}>
                <VIcon name="redo" size={18} color={vela.textLight} strokeWidth={2} />
                <Text style={s.btnGhostText}>Try again</Text>
              </Pressable>
              <Pressable onPress={insert} disabled={inserting} style={[s.btn, s.btnPrimary]}>
                {inserting ? <ActivityIndicator color={vela.onAccent} /> : <VIcon name="check" size={19} color={vela.onAccent} strokeWidth={2.6} />}
                <Text style={s.btnPrimaryText}>Insert</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.body}>
            <View style={s.seg}>
              {(['image', 'video'] as Mode[]).map((m) => (
                <Pressable key={m} onPress={() => setMode(m)} style={[s.segItem, mode === m && s.segItemOn]}>
                  <Text style={[s.segText, mode === m && { color: vela.onAccent }]}>{m === 'image' ? 'Image' : 'Video'}</Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              style={s.input}
              value={prompt}
              onChangeText={setPrompt}
              placeholder={mode === 'image' ? 'Describe the image…' : 'Describe the video…'}
              placeholderTextColor={vela.muted3}
              multiline
              autoFocus
            />

            {mode === 'video' ? (
              <>
                <View style={s.optRow}>
                  <Text style={s.optLabel}>Duration</Text>
                  <View style={s.seg}>
                    {([5, 10] as const).map((d) => (
                      <Pressable key={d} onPress={() => setDurationSec(d)} style={[s.segItem, durationSec === d && s.segItemOn]}>
                        <Text style={[s.segText, durationSec === d && { color: vela.onAccent }]}>{d}s</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <View style={s.optRow}>
                  <View>
                    <Text style={s.optLabel}>Sound</Text>
                    <Text style={s.optHint}>Generate a matching sound effect (+40 credits)</Text>
                  </View>
                  <Switch value={audio} onValueChange={setAudio} trackColor={{ true: vela.accent, false: vela.lightSurface }} thumbColor="#fff" />
                </View>
              </>
            ) : null}

            {err ? <Text style={s.err}>{err}</Text> : null}
            <View style={{ flex: 1 }} />
            <Pressable onPress={run} disabled={busy || !prompt.trim()} style={[s.btn, s.btnPrimary, s.generate, (busy || !prompt.trim()) && { opacity: 0.5 }]}>
              {busy ? <ActivityIndicator color={vela.onAccent} /> : <VIcon name="fx" size={19} color={vela.onAccent} strokeWidth={2} />}
              <Text style={s.btnPrimaryText}>{busy ? (mode === 'video' ? 'Generating… (~1 min)' : 'Generating…') : `Generate · ${cost} credits`}</Text>
            </Pressable>
            <Text style={s.footNote}>Runs on your render server in the project’s aspect ratio.</Text>
          </KeyboardAvoidingView>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: vela.editorBg, paddingTop: 54 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
  round: { width: 42, height: 42, borderRadius: 21, backgroundColor: vela.card2, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontFamily: font.extrabold, fontSize: 19 },
  creditPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: vela.accentSoft },
  creditText: { color: vela.accent, fontFamily: mono.bold, fontSize: 13 },

  body: { flex: 1, paddingHorizontal: 20, paddingBottom: 28, gap: 16 },

  seg: { flexDirection: 'row', backgroundColor: vela.card2, borderRadius: 12, padding: 4, gap: 4 },
  segItem: { flex: 1, height: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segItemOn: { backgroundColor: vela.accent },
  segText: { fontFamily: font.bold, fontSize: 15, color: vela.textLight },

  input: { minHeight: 110, backgroundColor: vela.card2, borderRadius: 14, padding: 16, color: '#fff', fontFamily: font.medium, fontSize: 16, textAlignVertical: 'top' },

  optRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  optLabel: { color: '#fff', fontFamily: font.semibold, fontSize: 16 },
  optHint: { color: vela.muted2, fontFamily: font.regular, fontSize: 12.5, marginTop: 2 },

  preview: { width: '100%', maxHeight: '78%', alignSelf: 'center', borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' },
  soundTag: { position: 'absolute', left: 10, top: 10, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  soundTagText: { color: '#fff', fontFamily: font.semibold, fontSize: 12 },

  actions: { flexDirection: 'row', gap: 12, marginTop: 'auto' },
  btn: { flex: 1, height: 54, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  btnPrimary: { backgroundColor: vela.accent },
  btnPrimaryText: { color: vela.onAccent, fontFamily: font.bold, fontSize: 17 },
  btnGhost: { backgroundColor: vela.card2 },
  btnGhostText: { color: vela.textLight, fontFamily: font.bold, fontSize: 17 },
  generate: { flex: 0, height: 56 },
  footNote: { color: vela.muted2, fontFamily: font.medium, fontSize: 12.5, textAlign: 'center' },
  err: { color: vela.danger, fontFamily: font.medium, fontSize: 13.5 },
});
