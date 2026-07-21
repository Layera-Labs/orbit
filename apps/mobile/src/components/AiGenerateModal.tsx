/**
 * Full-screen AI generation flow. Describe → Generate → PREVIEW the result with
 * Insert / Try again. Image or Video; video adds a duration control and an
 * optional Sound switch (silent 60 / with a generated sound effect 100). The
 * provider key lives on the render server; the app only meters credits.
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import { font, mono, vela } from '../constants';
import { VIcon } from './VIcon';
import { useEditor } from '../store/editorStore';
import { useAuth } from '../store/authStore';
import { generateImage, generateVideo, GenError } from '../net/genClient';
import { uploadMedia } from '../net/renderClient';
import { addHistory } from '../storage/genHistory';

type Mode = 'image' | 'video';
type VideoSource = 'text' | 'photo';
type Result = { kind: Mode; url: string; audioUrl?: string; durationSec?: number };

/** Mode-aware starter prompts — tap to seed the field (and fill the idle space). */
const IDEAS: Record<Mode, string[]> = {
  image: [
    'Neon-lit city street in the rain, cinematic',
    'Minimal product shot on warm beige, soft light',
    'Portrait in golden-hour light, shallow depth',
  ],
  video: [
    'Slow push-in on a still mountain lake at dawn',
    'Cinematic slow-motion coffee pour, close up',
    'Timelapse of clouds drifting over a city at dusk',
  ],
};

function errText(e: unknown, mode: Mode): string {
  if (e instanceof GenError) {
    if (e.kind === 'out-of-credits') return 'You’re out of credits.';
    if (e.kind === 'unauthenticated') return 'Your session expired. Close and sign in again.';
    if (e.kind === 'not-configured') return `${mode === 'image' ? 'Image' : 'Video'} generation isn’t set up on the render server.`;
    if (e.kind === 'no-server') return 'Can’t reach the render server. Set its URL in Profile › Render server.';
    return e.message;
  }
  return e instanceof Error ? e.message : 'Generation failed.';
}

const isCancel = (e: unknown): boolean => e instanceof GenError && e.kind === 'cancelled';

export function AiGenerateModal() {
  const setPanel = useEditor((s) => s.setPanel);
  const project = useEditor((s) => s.project);
  const credits = useEditor((s) => s.credits);
  const refreshCredits = useEditor((s) => s.refreshCredits);
  const serverUrl = useEditor((s) => s.serverUrl);
  const insertImageFromUrl = useEditor((s) => s.insertImageFromUrl);
  const insertVideoFromUrl = useEditor((s) => s.insertVideoFromUrl);

  const [mode, setMode] = useState<Mode>('image');
  const [source, setSource] = useState<VideoSource>('text');
  const [photoUri, setPhotoUri] = useState<string | null>(null); // local preview
  const [photoToken, setPhotoToken] = useState<string | null>(null); // uploaded ref
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [durationSec, setDurationSec] = useState<5 | 10>(5);
  const [audio, setAudio] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [needCredits, setNeedCredits] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const lastPrompt = useRef('');
  const abortRef = useRef<AbortController | null>(null);

  // The generated mp4 carries no audio; any sound the user paid for is a separate
  // track, so the video preview stays muted and the sound plays via `sfx`.
  const player = useVideoPlayer(null, (p) => {
    p.loop = true;
    p.muted = true;
  });
  const sfx = useAudioPlayer();

  useEffect(() => {
    void refreshCredits();
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, [refreshCredits]);

  // When a video result arrives, play it in the preview — with its sound effect,
  // if one was generated, looped in sync so the paid audio is actually audible.
  useEffect(() => {
    if (result?.kind !== 'video') return;
    try {
      player.replace(result.url);
      player.play();
    } catch {}
    if (result.audioUrl) {
      try {
        sfx.replace(result.audioUrl);
        sfx.loop = true;
        sfx.play();
      } catch {}
    }
    return () => {
      try { player.pause(); } catch {}
      try { sfx.pause(); } catch {}
    };
  }, [result, player, sfx]);

  const size = project ? { width: project.width, height: project.height } : undefined;
  const aspect = project ? project.width / project.height : 9 / 16;
  const cost = mode === 'image' ? 10 : audio ? 100 : 60;
  // Photo source needs an uploaded image; text source needs a prompt.
  const usingPhoto = mode === 'video' && source === 'photo';
  const canGenerate = !!prompt.trim() && !busy && !uploadingPhoto && (!usingPhoto || !!photoToken);
  const close = () => {
    abortRef.current?.abort();
    setPanel(null);
  };

  // Pick a photo from the library and upload it, so a video can animate it.
  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setErr('Allow photo library access to animate a photo.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (res.canceled || !res.assets?.[0]) return;
    const uri = res.assets[0].uri;
    setPhotoUri(uri);
    setPhotoToken(null);
    setErr(null);
    setUploadingPhoto(true);
    try {
      setPhotoToken(await uploadMedia(serverUrl, uri));
    } catch {
      setErr('Could not upload the photo. Check the render-server URL.');
      setPhotoUri(null);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const run = async () => {
    const p = prompt.trim();
    if (!canGenerate) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setErr(null);
    setNeedCredits(false);
    lastPrompt.current = p;
    try {
      if (mode === 'image') {
        const { url, balance } = await generateImage(serverUrl, p, size, ac.signal);
        useEditor.setState({ credits: balance });
        setResult({ kind: 'image', url });
        addHistory({ kind: 'image', url, prompt: p });
      } else {
        const { url, audioUrl, balance } = await generateVideo(serverUrl, p, size, { durationSec, audio, image: usingPhoto ? photoToken ?? undefined : undefined }, ac.signal);
        useEditor.setState({ credits: balance });
        setResult({ kind: 'video', url, audioUrl, durationSec });
        addHistory({ kind: 'video', url, audioUrl, durationSec, prompt: p });
      }
    } catch (e) {
      if (isCancel(e)) return; // user cancelled / dismissed — nothing charged, no error UI
      if (e instanceof GenError && e.kind === 'unauthenticated') void useAuth.getState().logout(); // re-gate next open
      if (e instanceof GenError && e.kind === 'out-of-credits') setNeedCredits(true);
      if (e instanceof GenError && typeof e.balance === 'number') useEditor.setState({ credits: e.balance });
      setErr(errText(e, mode));
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setBusy(false);
    }
  };

  const cancel = () => abortRef.current?.abort();

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
          <Pressable onPress={() => setPanel('buycredits')} style={s.creditPill} hitSlop={8}>
            <VIcon name="bolt" size={13} color={vela.accent} strokeWidth={2.2} />
            <Text style={s.creditText}>{credits == null ? '—' : credits}</Text>
            <VIcon name="plus" size={12} color={vela.accent} strokeWidth={2.6} />
          </Pressable>
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
              <Pressable onPress={insert} disabled={inserting} style={[s.btn, s.btnPrimary]}>
                {inserting ? <ActivityIndicator color={vela.onAccent} /> : <VIcon name="check" size={19} color={vela.onAccent} strokeWidth={2.6} />}
                <Text style={s.btnPrimaryText}>Insert into timeline</Text>
              </Pressable>
              <Pressable onPress={tryAgain} disabled={inserting} hitSlop={10} style={s.retry}>
                <VIcon name="redo" size={16} color={vela.textLight2} strokeWidth={2} />
                <Text style={s.retryText}>Try again</Text>
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
              placeholder={mode === 'image' ? 'Describe the image…' : usingPhoto ? 'Describe the motion…' : 'Describe the video…'}
              placeholderTextColor={vela.muted3}
              multiline
              autoFocus
            />

            {mode === 'video' ? (
              <>
                <View style={s.optRow}>
                  <Text style={s.optLabel}>Source</Text>
                  <View style={s.seg}>
                    {(['text', 'photo'] as VideoSource[]).map((sv) => (
                      <Pressable key={sv} onPress={() => setSource(sv)} style={[s.segItem, source === sv && s.segItemOn]}>
                        <Text style={[s.segText, source === sv && { color: vela.onAccent }]}>{sv === 'text' ? 'Text' : 'Photo'}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                {usingPhoto ? (
                  <Pressable onPress={pickPhoto} style={s.photoTile}>
                    {photoUri ? (
                      <>
                        <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                        <View style={s.photoOverlay}>
                          {uploadingPhoto ? (
                            <ActivityIndicator color="#fff" />
                          ) : (
                            <>
                              <VIcon name="image" size={16} color="#fff" strokeWidth={2} />
                              <Text style={s.photoOverlayText}>Change photo</Text>
                            </>
                          )}
                        </View>
                      </>
                    ) : (
                      <View style={s.photoEmpty}>
                        <VIcon name="image" size={26} color={vela.muted} strokeWidth={1.8} />
                        <Text style={s.photoEmptyText}>Pick a photo to animate</Text>
                      </View>
                    )}
                  </Pressable>
                ) : null}
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
            {needCredits ? (
              <Pressable onPress={() => setPanel('buycredits')} style={s.getCredits}>
                <VIcon name="bolt" size={16} color={vela.onAccent} strokeWidth={2.2} />
                <Text style={s.getCreditsText}>Get more credits</Text>
              </Pressable>
            ) : null}

            {!prompt.trim() && !busy && !usingPhoto ? (
              <View style={s.ideas}>
                <Text style={s.ideasLabel}>Need a starting point</Text>
                {IDEAS[mode].map((idea) => (
                  <Pressable key={idea} onPress={() => setPrompt(idea)} style={s.idea}>
                    <VIcon name="fx" size={14} color={vela.muted} strokeWidth={2} />
                    <Text style={s.ideaText} numberOfLines={1}>{idea}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <View style={{ flex: 1 }} />
            <Pressable onPress={run} disabled={!canGenerate} style={[s.btn, s.btnPrimary, s.generate, !canGenerate && { opacity: 0.5 }]}>
              {busy ? <ActivityIndicator color={vela.onAccent} /> : <VIcon name="fx" size={19} color={vela.onAccent} strokeWidth={2} />}
              <Text style={s.btnPrimaryText}>{busy ? (mode === 'video' ? 'Generating… (~1 min)' : 'Generating…') : `Generate · ${cost} credits`}</Text>
            </Pressable>
            {busy ? (
              <Pressable onPress={cancel} hitSlop={10} style={s.retry}>
                <VIcon name="close" size={16} color={vela.textLight2} strokeWidth={2.2} />
                <Text style={s.retryText}>Cancel</Text>
              </Pressable>
            ) : (
              <Text style={s.footNote}>Runs on your render server in the project’s aspect ratio.</Text>
            )}
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

  actions: { gap: 10, marginTop: 'auto' },
  btn: { height: 54, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  btnPrimary: { backgroundColor: vela.accent },
  btnPrimaryText: { color: vela.onAccent, fontFamily: font.bold, fontSize: 17 },
  retry: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  retryText: { color: vela.textLight2, fontFamily: font.semibold, fontSize: 15 },
  generate: { height: 56 },

  photoTile: { height: 128, borderRadius: 14, overflow: 'hidden', backgroundColor: vela.card2 },
  photoEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  photoEmptyText: { color: vela.muted, fontFamily: font.medium, fontSize: 14 },
  photoOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 9, backgroundColor: 'rgba(0,0,0,0.5)' },
  photoOverlayText: { color: '#fff', fontFamily: font.semibold, fontSize: 13.5 },

  getCredits: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 13, backgroundColor: vela.accent },
  getCreditsText: { color: vela.onAccent, fontFamily: font.bold, fontSize: 15.5 },

  ideas: { gap: 8 },
  ideasLabel: { color: vela.muted2, fontFamily: font.semibold, fontSize: 12.5, marginBottom: 2, letterSpacing: 0.2 },
  idea: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: vela.card2, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14 },
  ideaText: { flex: 1, color: vela.textLight2, fontFamily: font.medium, fontSize: 14.5 },
  footNote: { color: vela.muted2, fontFamily: font.medium, fontSize: 12.5, textAlign: 'center' },
  err: { color: vela.danger, fontFamily: font.medium, fontSize: 13.5 },
});
