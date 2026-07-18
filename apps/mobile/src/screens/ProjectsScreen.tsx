/**
 * Home (Projects) — Vela light skin. Header + round actions, a (decorative)
 * search field, a dismissible "Orbit for Desktop" promo, section tabs, a static
 * Folders row, and the real persisted projects grouped by recency. A floating
 * bottom nav sits on top. Tapping a project opens it; the ⋯ opens a project
 * menu (Rename / Move to Trash real, the rest soon).
 */
import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { font, mono, vela, ratioLabel } from '../constants';
import { projectDuration } from '../model/project';
import { VIcon } from '../components/VIcon';
import { BottomNav } from '../components/BottomNav';
import { useEditor } from '../store/editorStore';
import type { StoredProject } from '../storage/projects';
import { CreateSheet } from './CreateSheet';

const DAY = 86400_000;
const soon = (label: string) => Alert.alert('Coming soon', `${label} is coming soon.`);

function clipCount(p: StoredProject): number {
  if (p.project.tracks?.length) return p.project.tracks.reduce((n, t) => n + t.clips.length, 0);
  return p.project.clips.length;
}
function fmtTime(sec: number): string {
  return `${Math.floor(sec / 60)}:${Math.floor(sec % 60).toString().padStart(2, '0')}`;
}
function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const FOLDER_DEFAULT = 'M12 4l8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4';
const FOLDER_IMPORTED = 'M14 4h4v16H6V4h4M9 11l3-3 3 3M12 8v8';

function ProjectRow({ p, onOpen, onMenu }: { p: StoredProject; onOpen: () => void; onMenu: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onOpen} onLongPress={onMenu}>
      <View style={styles.poster}>
        {p.posterUri ? (
          <Image source={{ uri: p.posterUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: vela.lightSurface, alignItems: 'center', justifyContent: 'center' }]}>
            <VIcon name="picture" size={22} color={vela.lightMuted3} />
          </View>
        )}
        <Text style={styles.posterTime}>{fmtTime(projectDuration(p.project))}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowName} numberOfLines={1}>{p.name}</Text>
        <View style={styles.rowFolder}>
          <View style={styles.folderDot} />
          <Text style={styles.rowFolderText}>{p.folder ?? 'Default'}</Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Pressable hitSlop={10} onPress={onMenu}>
          <VIcon name="dots" size={18} color={vela.lightMuted} />
        </Pressable>
        <Text style={styles.rowDate}>{fmtDate(p.updatedAt)}</Text>
      </View>
    </Pressable>
  );
}

interface MenuItem { label: string; d: string; color: string; onPress: () => void; pro?: boolean; div?: boolean; }

function ProjectMenu({ p, onClose }: { p: StoredProject; onClose: () => void }) {
  const renameProject = useEditor((s) => s.renameProject);
  const removeProject = useEditor((s) => s.removeProject);
  const duplicateProject = useEditor((s) => s.duplicateProject);
  const setProjectFolder = useEditor((s) => s.setProjectFolder);

  function moveFolder() {
    onClose();
    Alert.prompt(
      'Move to Folder',
      'Type a folder name (creates it if new).',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Move', onPress: (t?: string) => t && setProjectFolder(p.id, t) },
      ],
      'plain-text',
      p.folder ?? 'Default',
    );
  }

  function rename() {
    onClose();
    Alert.prompt(
      'Rename project',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save', onPress: (t?: string) => t && renameProject(p.id, t) },
      ],
      'plain-text',
      p.name,
    );
  }
  function trash() {
    onClose();
    Alert.alert('Move to Trash', `Delete "${p.name}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeProject(p.id) },
    ]);
  }
  const items: MenuItem[] = [
    { label: 'Move to Folder', d: 'M4 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2zM9 13h6M9 13l2-2M9 13l2 2', color: vela.ink2, onPress: moveFolder },
    { label: 'Share Project', d: 'M5 12v7a1 1 0 001 1h12a1 1 0 001-1v-7M12 3v13M8 7l4-4 4 4', color: vela.ink2, pro: true, onPress: () => soon('Share Project') },
    { label: 'Rename', d: 'M4 20h4L18 10l-4-4L4 16zM14 6l4 4', color: vela.ink2, onPress: rename },
    { label: 'Create Template', d: 'M12 5a3 3 0 100 6 3 3 0 000-6zM5 19a7 7 0 0110-6.3M17 14v6M14 17h6', color: vela.ink2, onPress: () => soon('Create Template') },
    { label: 'Duplicate', d: 'M8 8h12v12H8zM4 4h12v3M4 4v12h3', color: vela.ink2, div: true, onPress: () => { onClose(); duplicateProject(p.id); } },
    { label: 'Move to Trash', d: 'M5 7h14M9 7V4h6v3M6 7l1 13h10l1-13', color: '#ff3b30', onPress: trash },
  ];

  return (
    <Pressable style={styles.menuBackdrop} onPress={onClose}>
      <Pressable style={styles.menuSheet} onPress={() => {}}>
        <View style={styles.menuHeader}>
          <View>
            <Text style={styles.menuTitle} numberOfLines={1}>{p.name}</Text>
            <Text style={styles.menuSub}>{ratioLabel(p.project.width, p.project.height)}</Text>
          </View>
          <VIcon name="pencil" size={24} color={vela.ink2} />
        </View>
        <View style={styles.menuDivider} />
        {items.map((it) => (
          <View key={it.label}>
            {it.div ? <View style={styles.menuItemDivider} /> : null}
            <Pressable style={styles.menuRow} onPress={it.onPress}>
              <VIcon d={it.d} size={24} color={it.color} />
              <Text style={[styles.menuRowText, { color: it.color }]}>{it.label}</Text>
            </Pressable>
          </View>
        ))}
      </Pressable>
    </Pressable>
  );
}

export function ProjectsScreen() {
  const projects = useEditor((s) => s.projects);
  const openProject = useEditor((s) => s.openProject);
  const newProject = useEditor((s) => s.newProject);
  const go = useEditor((s) => s.go);
  const serverUrl = useEditor((s) => s.serverUrl);
  const setServerUrl = useEditor((s) => s.setServerUrl);
  const [createOpen, setCreateOpen] = useState(false);
  const [menuProject, setMenuProject] = useState<StoredProject | null>(null);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);

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

  const folderOf = (p: StoredProject) => p.folder ?? 'Default';
  const now = Date.now();
  const visible = activeFolder ? projects.filter((p) => folderOf(p) === activeFolder) : projects;
  const recent = visible.filter((p) => now - p.updatedAt < 30 * DAY);
  const older = visible.filter((p) => now - p.updatedAt >= 30 * DAY);

  const folderNames = Array.from(new Set(['Default', 'Imported', ...projects.map(folderOf)]));
  const folders = folderNames.map((name) => ({
    name,
    count: projects.filter((p) => folderOf(p) === name).length,
    d: name === 'Imported' ? FOLDER_IMPORTED : FOLDER_DEFAULT,
  }));

  return (
    <View style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        {/* header */}
        <View style={styles.header}>
          <Text style={styles.h1}>Projects</Text>
          <View style={styles.headerActions}>
            <Pressable style={styles.roundBtn} onPress={() => go('quick')}>
              <VIcon name="bolt" size={20} color={vela.ink2} strokeWidth={2} />
            </Pressable>
            <Pressable style={styles.roundBtn} onPress={promptServer}>
              <VIcon name="prefs" size={20} color={vela.ink2} strokeWidth={2} />
            </Pressable>
          </View>
        </View>

        {/* search */}
        <Pressable style={styles.search} onPress={() => soon('Search')}>
          <VIcon name="search" size={19} color={vela.lightMuted} strokeWidth={2.2} />
          <Text style={styles.searchText}>Search your projects</Text>
        </Pressable>

        {/* folders */}
        <Text style={styles.sectionH}>Folders</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.folderRow}>
          {folders.map((f) => {
            const on = activeFolder === f.name;
            return (
              <Pressable key={f.name} style={styles.folder} onPress={() => setActiveFolder(on ? null : f.name)}>
                <View style={[styles.folderCard, on && styles.folderCardOn]}>
                  <VIcon d={f.d} size={30} color={on ? vela.accent : vela.ink3} strokeWidth={2} />
                </View>
                <Text style={[styles.folderName, on && { color: vela.accent }]}>{f.name}</Text>
                <Text style={styles.folderItems}>{f.count} {f.count === 1 ? 'Item' : 'Items'}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* projects */}
        <View style={styles.projectsHeader}>
          <Text style={styles.sectionH}>Projects <Text style={styles.tabCount}>{projects.length}</Text></Text>
          <Pressable onPress={() => soon('Edit')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={styles.editLink}>Edit</Text>
            <VIcon name="list" size={20} color={vela.lightMuted} strokeWidth={2} />
          </Pressable>
        </View>

        {projects.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No projects yet.</Text>
            <Text style={styles.emptyHint}>Tap the + below to start editing.</Text>
          </View>
        ) : null}

        {recent.length ? <Text style={styles.groupLabel}>PAST 30 DAYS</Text> : null}
        {recent.map((p) => (
          <ProjectRow key={p.id} p={p} onOpen={() => openProject(p.id)} onMenu={() => setMenuProject(p)} />
        ))}

        {older.length ? <Text style={styles.groupLabel}>OLDER</Text> : null}
        {older.map((p) => (
          <ProjectRow key={p.id} p={p} onOpen={() => openProject(p.id)} onMenu={() => setMenuProject(p)} />
        ))}
      </ScrollView>

      <BottomNav active="home" onHome={() => {}} onDiscover={() => go('discover')} onCreate={() => setCreateOpen(true)} />

      <CreateSheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={() => {
          setCreateOpen(false);
          newProject('Untitled', 1080, 1920);
        }}
      />

      {menuProject ? <ProjectMenu p={menuProject} onClose={() => setMenuProject(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: vela.homeBg, paddingTop: 54 },

  header: { paddingHorizontal: 22, paddingTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { fontFamily: font.extrabold, fontSize: 30, color: vela.ink, letterSpacing: -0.6 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  roundBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: vela.lightCard, alignItems: 'center', justifyContent: 'center' },

  search: { marginHorizontal: 22, marginTop: 16, height: 46, borderRadius: 14, backgroundColor: vela.lightSurface, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  searchText: { color: vela.lightMuted, fontSize: 16, fontFamily: font.medium },

  tabCount: { color: vela.lightMuted },

  sectionH: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 6, fontFamily: font.extrabold, fontSize: 18, color: vela.ink },
  folderRow: { gap: 16, paddingHorizontal: 22, paddingBottom: 6, paddingTop: 4 },
  folder: { width: 118 },
  folderCard: { height: 92, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: vela.lightSurface },
  folderCardOn: { backgroundColor: vela.accentSoft, borderWidth: 1.5, borderColor: vela.accent },
  folderName: { textAlign: 'center', marginTop: 9, fontFamily: font.bold, fontSize: 15, color: vela.ink },
  folderItems: { textAlign: 'center', fontSize: 12, color: '#a0a0a8', marginTop: 1 },

  projectsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 22 },
  editLink: { color: vela.accent, fontFamily: font.bold, fontSize: 15 },

  groupLabel: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 4, fontSize: 11.5, fontFamily: font.bold, letterSpacing: 1, color: vela.lightMuted2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 22, paddingVertical: 12 },
  poster: { width: 62, height: 84, borderRadius: 11, overflow: 'hidden', backgroundColor: '#ddd' },
  posterTime: { position: 'absolute', left: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 10, fontFamily: mono.regular, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  rowName: { fontFamily: font.bold, fontSize: 18, color: vela.ink },
  rowFolder: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  folderDot: { width: 14, height: 14, borderRadius: 4, backgroundColor: vela.folderDot },
  rowFolderText: { color: vela.lightMuted, fontSize: 13.5, fontFamily: font.medium },
  rowDate: { color: vela.lightMuted2, fontSize: 13, marginTop: 14 },

  empty: { alignItems: 'center', marginTop: 50, gap: 6 },
  emptyText: { color: vela.ink2, fontSize: 16, fontFamily: font.semibold },
  emptyHint: { color: vela.lightMuted, fontSize: 13 },

  // project menu
  menuBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(20,20,30,0.32)', justifyContent: 'flex-end' },
  menuSheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 30 },
  menuHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 18 },
  menuTitle: { fontFamily: font.extrabold, fontSize: 22, color: vela.ink2, maxWidth: 260 },
  menuSub: { color: vela.lightMuted, fontSize: 14, marginTop: 4 },
  menuDivider: { height: 1, backgroundColor: vela.lightSurface, marginBottom: 6 },
  menuItemDivider: { height: 1, backgroundColor: vela.lightSurface, marginVertical: 6 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 15 },
  menuRowText: { fontSize: 18, fontFamily: font.semibold },
});
