import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { DEFAULT_SERVER, theme } from '../constants';
import { useEditor } from '../store/editorStore';

type Mode = 'quote' | 'ai';

/** The original prompt→render demo, preserved as a quick path that needs no editing. */
export function QuickGenerateScreen() {
  const go = useEditor((s) => s.go);
  const [server, setServer] = useState(DEFAULT_SERVER);
  const [mode, setMode] = useState<Mode>('quote');
  const [text, setText] = useState('Be water, my friend');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
  });
  useEffect(() => {
    if (videoUrl) {
      player.replace(videoUrl);
      player.play();
    }
  }, [videoUrl, player]);

  async function render() {
    setBusy(true);
    setError(null);
    setVideoUrl(null);
    try {
      const base = server.replace(/\/+$/, '');
      let res: Response;
      if (mode === 'ai') {
        res = await fetch(`${base}/v1/generate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt: text }),
        });
      } else {
        const project = {
          id: 'p',
          schemaVersion: 1,
          width: 1080,
          height: 1920,
          fps: 30,
          background: { type: 'gradient', from: '#0f172a', to: '#334155', angle: 180 },
          clips: [],
          overlays: [
            {
              id: 'q',
              type: 'text',
              text: `“${text}”`,
              start: 0,
              end: 5,
              x: 0.5,
              y: 0.45,
              fontSize: 64,
              color: '#ffffff',
              align: 'center',
              animation: 'fade',
            },
          ],
          audio: [],
        };
        res = await fetch(`${base}/v1/render`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ project }),
        });
      }
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? `HTTP ${res.status}`);
      setVideoUrl(`${base}${data.url}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <Pressable onPress={() => go('projects')} hitSlop={10}>
        <Text style={styles.back}>‹ Projects</Text>
      </Pressable>
      <Text style={styles.title}>Quick generate</Text>

      <Text style={styles.label}>Render server</Text>
      <TextInput
        style={styles.input}
        value={server}
        onChangeText={setServer}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="http://<mac-ip>:8787"
        placeholderTextColor={theme.muted}
      />

      <View style={styles.tabs}>
        {(['quote', 'ai'] as Mode[]).map((m) => (
          <Pressable key={m} onPress={() => setMode(m)} style={[styles.tab, mode === m && styles.tabOn]}>
            <Text style={[styles.tabText, mode === m && styles.tabTextOn]}>
              {m === 'quote' ? 'Quote (no key)' : 'AI describe'}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>{mode === 'ai' ? 'Describe the video' : 'Quote text'}</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={text}
        onChangeText={setText}
        multiline
        placeholderTextColor={theme.muted}
      />

      <Pressable style={[styles.btn, busy && styles.btnOff]} onPress={render} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Render video</Text>}
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {videoUrl ? <VideoView style={styles.video} player={player} nativeControls contentFit="contain" /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: 20, paddingTop: 64, backgroundColor: theme.bg, minHeight: '100%', gap: 12 },
  back: { color: theme.accent, fontSize: 16, fontWeight: '600' },
  title: { color: theme.text, fontSize: 28, fontWeight: '700', marginBottom: 8 },
  label: { color: theme.subtext, fontSize: 13, marginTop: 8 },
  input: { backgroundColor: theme.surface, color: theme.text, borderRadius: 10, padding: 12, fontSize: 16 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 8 },
  tab: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: theme.surface, alignItems: 'center' },
  tabOn: { backgroundColor: theme.accent },
  tabText: { color: theme.subtext, fontWeight: '600' },
  tabTextOn: { color: theme.accentText },
  btn: { backgroundColor: theme.accent, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 12 },
  btnOff: { opacity: 0.6 },
  btnText: { color: theme.accentText, fontSize: 17, fontWeight: '700' },
  error: { color: theme.danger, marginTop: 8 },
  video: { width: '100%', aspectRatio: 9 / 16, borderRadius: 12, marginTop: 16, backgroundColor: '#000' },
});
