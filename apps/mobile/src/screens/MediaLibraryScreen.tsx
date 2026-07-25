import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { BottomNav } from '../components/BottomNav';
import { Chip, SearchField } from '../components/OrbitUi';
import { VIcon } from '../components/VIcon';
import { font, mono, vela } from '../constants';
import type { StoredProject } from '../storage/projects';
import { useEditor } from '../store/editorStore';
import { CreateSheet } from './CreateSheet';

type Kind = 'All' | 'Video' | 'Photo' | 'Audio' | 'Favorites';
type MediaItem = {
  id: string;
  kind: Exclude<Kind, 'All' | 'Favorites'>;
  src?: string;
  duration: number;
  project: StoredProject;
};

function collectMedia(projects: StoredProject[]): MediaItem[] {
  const items: MediaItem[] = [];
  for (const project of projects) {
    for (const track of project.project.tracks ?? []) {
      for (const clip of track.clips) {
        if (track.kind === 'audio') {
          items.push({
            id: `${project.id}:${track.id}:${clip.id}`,
            kind: 'Audio',
            src: clip.src,
            duration: clip.duration,
            project,
          });
        } else if ('type' in clip) {
          items.push({
            id: `${project.id}:${track.id}:${clip.id}`,
            kind: clip.type === 'video' ? 'Video' : 'Photo',
            src: clip.type === 'image' ? clip.src : project.posterUri,
            duration: clip.duration,
            project,
          });
        }
      }
    }
  }
  return items;
}

function time(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`;
}

export function MediaLibraryScreen() {
  const projects = useEditor((s) => s.projects);
  const go = useEditor((s) => s.go);
  const openProject = useEditor((s) => s.openProject);
  const newProject = useEditor((s) => s.newProject);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<Kind>('All');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return collectMedia(projects).filter((item) => (kind === 'All' || kind === 'Favorites' || item.kind === kind) && (!q || item.project.name.toLowerCase().includes(q)));
  }, [kind, projects, query]);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <View style={styles.root}>
      <AppHeader
        title='Library'
        actions={[
          {
            icon: 'profile',
            label: 'Open profile',
            onPress: () => go('profile'),
          },
          {
            icon: 'plus',
            label: 'Create project',
            onPress: () => setCreateOpen(true),
            prominent: true,
          },
        ]}
      />
      <ScrollView contentInsetAdjustmentBehavior='automatic' showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <SearchField value={query} onChangeText={setQuery} placeholder='Search media…' />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {(['All', 'Video', 'Photo', 'Audio', 'Favorites'] as Kind[]).map((item) => (
            <Chip key={item} label={item} selected={kind === item} onPress={() => setKind(item)} />
          ))}
        </ScrollView>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>{items.length ? 'Your media' : 'Library'}</Text>
          <Pressable
            onPress={() => {
              setSelecting((value) => !value);
              setSelected(new Set());
            }}
            hitSlop={8}
          >
            <Text style={styles.select}>{selecting ? 'Done' : 'Select'}</Text>
          </Pressable>
        </View>

        {items.length ? (
          <View style={styles.grid}>
            {items.map((item, index) => {
              const checked = selected.has(item.id);
              return (
                <Pressable key={item.id} style={styles.cell} onPress={() => (selecting ? toggle(item.id) : openProject(item.project.id))}>
                  {item.kind !== 'Audio' && item.src ? (
                    <Image source={{ uri: item.src }} style={StyleSheet.absoluteFill} resizeMode='cover' />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, styles.audio, { backgroundColor: index % 2 ? '#26366f' : '#4b2a76' }]}>
                      <VIcon name='audio' size={30} color='#fff' />
                      <Text style={styles.audioName} numberOfLines={1}>
                        {item.project.name}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.duration}>{time(item.duration)}</Text>
                  {selecting ? <View style={[styles.check, checked && styles.checkOn]}>{checked ? <VIcon name='check' size={13} color='#fff' strokeWidth={3} /> : null}</View> : null}
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.empty}>
            <VIcon name='photos' size={34} color={vela.accent} />
            <Text style={styles.emptyTitle}>No media yet</Text>
            <Text style={styles.emptyText}>Media imported into your projects will appear here automatically.</Text>
          </View>
        )}
      </ScrollView>

      <BottomNav active='home' onHome={() => go('projects')} onTemplates={() => go('discover')} onCreate={() => setCreateOpen(true)} onAi={() => go('ai')} />
      <CreateSheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={(width, height) => {
          setCreateOpen(false);
          newProject('Untitled', width, height);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: vela.homeBg },
  content: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 116,
    gap: 14,
  },
  chips: { gap: 8, paddingRight: 8 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  sectionTitle: { color: vela.ink, fontFamily: font.extrabold, fontSize: 16.5 },
  select: { color: vela.accent, fontFamily: font.bold, fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  cell: {
    width: '31.6%',
    aspectRatio: 1.2,
    borderRadius: 11,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: vela.lightSurface,
  },
  duration: {
    position: 'absolute',
    left: 5,
    bottom: 5,
    color: '#fff',
    backgroundColor: '#0009',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1.5,
    fontFamily: mono.medium,
    fontSize: 8.5,
  },
  check: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#fff',
    backgroundColor: '#0004',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: vela.accent, borderColor: vela.accent },
  audio: { alignItems: 'center', justifyContent: 'center', padding: 8 },
  audioName: {
    color: '#fff',
    fontFamily: font.semibold,
    fontSize: 9.5,
    marginTop: 5,
  },
  empty: { paddingTop: 80, paddingHorizontal: 36, alignItems: 'center' },
  emptyTitle: {
    color: vela.ink,
    fontFamily: font.bold,
    fontSize: 17,
    marginTop: 12,
  },
  emptyText: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 5,
  },
});
