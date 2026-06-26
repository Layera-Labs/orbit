/**
 * Home (Projects) — Vela light skin. Header + round actions, a (decorative)
 * search field, a dismissible "Orbit for Desktop" promo, section tabs, a static
 * Folders row, and the real persisted projects grouped by recency. A floating
 * bottom nav sits on top. Tapping a project opens it; the ⋯ opens a project
 * menu (Rename / Move to Trash real, the rest soon).
 */
import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
          <LinearGradient colors={['#cdb89e', '#8d7256']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        )}
        <Text style={styles.posterTime}>{fmtTime(projectDuration(p.project))}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowName} numberOfLines={1}>{p.name}</Text>
        <View style={styles.rowFolder}>
          <View style={styles.folderDot} />
          <Text style={styles.rowFolderText}>Default</Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Pressable hitSlop={10} onPress={onMenu}>
          <Text style={styles.dots}>···</Text>
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
    { label: 'Move to Folder', d: 'M4 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2zM9 13h6M9 13l2-2M9 13l2 2', color: vela.ink2, onPress: () => soon('Move to Folder') },
    { label: 'Share Project', d: 'M5 12v7a1 1 0 001 1h12a1 1 0 001-1v-7M12 3v13M8 7l4-4 4 4', color: vela.ink2, pro: true, onPress: () => soon('Share Project') },
    { label: 'Rename', d: 'M4 20h4L18 10l-4-4L4 16zM14 6l4 4', color: vela.ink2, onPress: rename },
    { label: 'Create Template', d: 'M12 5a3 3 0 100 6 3 3 0 000-6zM5 19a7 7 0 0110-6.3M17 14v6M14 17h6', color: vela.ink2, onPress: () => soon('Create Template') },
    { label: 'Duplicate', d: 'M8 8h12v12H8zM4 4h12v3M4 4v12h3', color: vela.ink2, div: true, onPress: () => soon('Duplicate') },
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
              {it.pro ? (
                <View style={styles.proPill}><Text style={styles.proPillText}>♔ PRO</Text></View>
              ) : null}
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
  const [promoOpen, setPromoOpen] = useState(true);
  const [menuProject, setMenuProject] = useState<StoredProject | null>(null);

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

  const now = Date.now();
  const recent = projects.filter((p) => now - p.updatedAt < 30 * DAY);
  const older = projects.filter((p) => now - p.updatedAt >= 30 * DAY);

  const folders = [
    { name: 'Default', items: `${projects.length} ${projects.length === 1 ? 'Item' : 'Items'}`, d: FOLDER_DEFAULT },
    { name: 'Imported', items: '0 Items', d: FOLDER_IMPORTED },
  ];

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

        {/* promo */}
        {promoOpen ? (
          <LinearGradient colors={['#1a1340', '#3a2a8a', '#6d4aff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.promo}>
            <View style={styles.promoLogo}><Text style={styles.promoLogoText}>Ob</Text></View>
            <View style={{ marginLeft: 14, flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.promoTitle}>Orbit for Desktop</Text>
                <View style={styles.promoBadge}><Text style={styles.promoBadgeText}>NEW</Text></View>
              </View>
              <Text style={styles.promoSub}>Edit on the big screen — early access</Text>
            </View>
            <Pressable style={styles.promoClose} onPress={() => setPromoOpen(false)} hitSlop={8}>
              <Text style={styles.promoCloseText}>✕</Text>
            </Pressable>
            <Pressable style={styles.promoCta} onPress={() => soon('Desktop access')}>
              <Text style={styles.promoCtaText}>Get access</Text>
            </Pressable>
          </LinearGradient>
        ) : null}

        {/* tabs */}
        <View style={styles.tabs}>
          <Pressable>
            <Text style={styles.tabOn}>Projects <Text style={styles.tabCount}>{projects.length}</Text></Text>
            <View style={styles.tabUnderline} />
          </Pressable>
          <Pressable onPress={() => soon('Works')}><Text style={styles.tabOff}>Works 0</Text></Pressable>
          <Pressable onPress={() => soon('Templates')}><Text style={styles.tabOff}>Templates 0</Text></Pressable>
          <Pressable onPress={() => soon('Assets')}><Text style={styles.tabOff}>Assets 0</Text></Pressable>
        </View>
        <View style={styles.divider} />

        {/* folders */}
        <Text style={styles.sectionH}>Folders</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.folderRow}>
          {folders.map((f) => (
            <View key={f.name} style={styles.folder}>
              <LinearGradient colors={['#bfe0ff', '#9fc8ff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.folderCard}>
                <View style={styles.folderTab} />
                <VIcon d={f.d} size={30} color="#4a86d6" strokeWidth={2} />
              </LinearGradient>
              <Text style={styles.folderName}>{f.name}</Text>
              <Text style={styles.folderItems}>{f.items}</Text>
            </View>
          ))}
        </ScrollView>

        {/* projects */}
        <View style={styles.projectsHeader}>
          <Text style={styles.sectionH}>Projects <Text style={styles.tabCount}>{projects.length}</Text></Text>
          <Pressable onPress={() => soon('Edit')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={styles.editLink}>Edit</Text>
            <VIcon name="list" size={20} color="#888" strokeWidth={2} />
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
  roundBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },

  search: { marginHorizontal: 22, marginTop: 16, height: 46, borderRadius: 14, backgroundColor: vela.lightSurface, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  searchText: { color: vela.lightMuted, fontSize: 16, fontFamily: font.medium },

  promo: { marginHorizontal: 22, marginTop: 16, height: 96, borderRadius: 18, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, overflow: 'hidden' },
  promoLogo: { width: 50, height: 50, borderRadius: 13, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  promoLogoText: { fontFamily: font.extrabold, color: vela.accent, fontSize: 20, letterSpacing: -1 },
  promoTitle: { color: '#fff', fontFamily: font.extrabold, fontSize: 17 },
  promoBadge: { backgroundColor: vela.accent, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, marginLeft: 6 },
  promoBadgeText: { color: '#fff', fontSize: 9, fontFamily: font.bold },
  promoSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12.5, marginTop: 3, fontFamily: font.medium },
  promoClose: { position: 'absolute', right: 14, top: 14, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  promoCloseText: { color: '#fff', fontSize: 11 },
  promoCta: { position: 'absolute', right: 16, bottom: 14, backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  promoCtaText: { color: '#1a1340', fontFamily: font.bold, fontSize: 12 },

  tabs: { flexDirection: 'row', gap: 22, paddingHorizontal: 22, marginTop: 22 },
  tabOn: { fontFamily: font.bold, fontSize: 17, color: vela.ink, paddingBottom: 8 },
  tabOff: { fontFamily: font.bold, fontSize: 17, color: vela.lightMuted3, paddingBottom: 8 },
  tabCount: { color: vela.lightMuted },
  tabUnderline: { position: 'absolute', left: 0, bottom: 0, width: 26, height: 3, backgroundColor: vela.accent, borderRadius: 2 },
  divider: { height: 1, backgroundColor: vela.lightBorder },

  sectionH: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 6, fontFamily: font.extrabold, fontSize: 18, color: vela.ink },
  folderRow: { gap: 16, paddingHorizontal: 22, paddingBottom: 6 },
  folder: { width: 118 },
  folderCard: { height: 92, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  folderTab: { position: 'absolute', top: -7, left: 14, width: 40, height: 14, backgroundColor: '#9fc8ff', borderTopLeftRadius: 6, borderTopRightRadius: 6 },
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
  dots: { color: '#cfcfd6', fontSize: 18, letterSpacing: 1, paddingHorizontal: 4 },
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
  proPill: { marginLeft: 'auto', backgroundColor: '#2b2b30', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  proPillText: { color: vela.select, fontSize: 11, fontFamily: font.extrabold },
});
