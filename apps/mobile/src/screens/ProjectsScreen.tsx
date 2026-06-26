import { useEffect, useState } from 'react';
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ratioLabel, theme } from '../constants';
import { useEditor } from '../store/editorStore';
import type { StoredProject } from '../storage/projects';
import { NewProjectModal } from './NewProjectModal';

/** Clip count across multi-track layers (falls back to legacy clips). */
function clipCount(p: StoredProject): number {
  if (p.project.tracks?.length) return p.project.tracks.reduce((n, t) => n + t.clips.length, 0);
  return p.project.clips.length;
}

export function ProjectsScreen() {
  const projects = useEditor((s) => s.projects);
  const refreshProjects = useEditor((s) => s.refreshProjects);
  const openProject = useEditor((s) => s.openProject);
  const removeProject = useEditor((s) => s.removeProject);
  const newProject = useEditor((s) => s.newProject);
  const go = useEditor((s) => s.go);
  const serverUrl = useEditor((s) => s.serverUrl);
  const setServerUrl = useEditor((s) => s.setServerUrl);
  const [modal, setModal] = useState(false);

  function promptServer() {
    Alert.prompt(
      'Render server',
      'URL of your render service (your Mac’s IP for a physical phone).',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save', onPress: (text?: string) => text && setServerUrl(text) },
      ],
      'plain-text',
      serverUrl,
    );
  }

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  function confirmDelete(p: StoredProject) {
    Alert.alert('Delete project', `Delete "${p.name}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeProject(p.id) },
    ]);
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>Orbit</Text>
          <Text style={styles.sub}>Projects</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.iconBtn} onPress={promptServer} hitSlop={8}>
            <Ionicons name="settings-outline" size={18} color={theme.subtext} />
          </Pressable>
          <Pressable style={styles.quick} onPress={() => go('quick')}>
            <Ionicons name="flash" size={14} color={theme.subtext} />
            <Text style={styles.quickText}>Quick generate</Text>
          </Pressable>
        </View>
      </View>

      <Pressable style={styles.newBtn} onPress={() => setModal(true)}>
        <Text style={styles.newBtnText}>+  New project</Text>
      </Pressable>

      <FlatList
        data={projects}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No projects yet.</Text>
            <Text style={styles.emptyHint}>Tap “New project” to start editing.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => openProject(item.id)} onLongPress={() => confirmDelete(item)}>
            <View style={styles.poster}>
              {item.posterUri ? (
                <Image source={{ uri: item.posterUri }} style={styles.posterImg} resizeMode="cover" />
              ) : (
                <Ionicons name="film-outline" size={24} color={theme.muted} />
              )}
            </View>
            <View style={styles.rowMeta}>
              <Text style={styles.rowName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.rowSub}>
                {ratioLabel(item.project.width, item.project.height)} · {clipCount(item)}{' '}
                {clipCount(item) === 1 ? 'clip' : 'clips'}
              </Text>
            </View>
            <Pressable hitSlop={10} onPress={() => confirmDelete(item)}>
              <Ionicons name="trash-outline" size={18} color={theme.muted} />
            </Pressable>
          </Pressable>
        )}
      />

      <NewProjectModal
        visible={modal}
        onClose={() => setModal(false)}
        onCreate={(name, w, h) => {
          setModal(false);
          newProject(name, w, h);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg, paddingTop: 64, paddingHorizontal: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  brand: { color: theme.text, fontSize: 30, fontWeight: '800' },
  sub: { color: theme.subtext, fontSize: 14, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { backgroundColor: theme.surface, padding: 9, borderRadius: 10 },
  quick: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.surface, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  quickText: { color: theme.subtext, fontWeight: '600', fontSize: 13 },
  newBtn: { backgroundColor: theme.accent, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 18 },
  newBtnText: { color: theme.accentText, fontSize: 17, fontWeight: '700' },
  list: { paddingVertical: 18, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderRadius: 12, padding: 10, gap: 12 },
  poster: { width: 52, height: 52, borderRadius: 8, backgroundColor: theme.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  posterImg: { width: '100%', height: '100%' },
  rowMeta: { flex: 1 },
  rowName: { color: theme.text, fontSize: 16, fontWeight: '600' },
  rowSub: { color: theme.muted, fontSize: 13, marginTop: 2 },
  empty: { alignItems: 'center', marginTop: 60, gap: 6 },
  emptyText: { color: theme.subtext, fontSize: 16 },
  emptyHint: { color: theme.muted, fontSize: 13 },
});
