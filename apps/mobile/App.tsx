import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ResizeMode, Video } from 'expo-av';
import { StatusBar } from 'expo-status-bar';

// iOS SIMULATOR: localhost works (the sim shares your Mac's network).
// PHYSICAL phone: change this (in-app) to your Mac's LAN IP, e.g.
//   http://192.168.1.10:8787  — find it with: ipconfig getifaddr en0
const DEFAULT_SERVER = 'http://localhost:8787';

type Mode = 'quote' | 'ai';

export default function App() {
  const [server, setServer] = useState(DEFAULT_SERVER);
  const [mode, setMode] = useState<Mode>('quote');
  const [text, setText] = useState('Be water, my friend');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <StatusBar style="light" />
      <Text style={styles.title}>Orbit Video</Text>

      <Text style={styles.label}>Render server</Text>
      <TextInput
        style={styles.input}
        value={server}
        onChangeText={setServer}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="http://<mac-ip>:8787"
        placeholderTextColor="#64748b"
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
        placeholderTextColor="#64748b"
      />

      <Pressable style={[styles.btn, busy && styles.btnOff]} onPress={render} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Render video</Text>}
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {videoUrl ? (
        <Video
          style={styles.video}
          source={{ uri: videoUrl }}
          useNativeControls
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: 20, paddingTop: 64, backgroundColor: '#0b1120', minHeight: '100%', gap: 12 },
  title: { color: '#f8fafc', fontSize: 28, fontWeight: '700', marginBottom: 8 },
  label: { color: '#94a3b8', fontSize: 13, marginTop: 8 },
  input: {
    backgroundColor: '#1e293b',
    color: '#f8fafc',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 8 },
  tab: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#1e293b', alignItems: 'center' },
  tabOn: { backgroundColor: '#10b981' },
  tabText: { color: '#94a3b8', fontWeight: '600' },
  tabTextOn: { color: '#06281f' },
  btn: { backgroundColor: '#10b981', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 12 },
  btnOff: { opacity: 0.6 },
  btnText: { color: '#06281f', fontSize: 17, fontWeight: '700' },
  error: { color: '#f87171', marginTop: 8 },
  video: { width: '100%', aspectRatio: 9 / 16, borderRadius: 12, marginTop: 16, backgroundColor: '#000' },
});
