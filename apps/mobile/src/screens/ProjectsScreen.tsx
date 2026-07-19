/**
 * Home (Projects) — Vela light skin. Header + round actions, a (decorative)
 * search field, a dismissible "Orbit for Desktop" promo, section tabs, a static
 * Folders row, and the real persisted projects grouped by recency. A floating
 * bottom nav sits on top. Tapping a project opens it; the ⋯ opens a project
 * menu (Rename / Move to Trash real, the rest soon).
 */
import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { font, mono, vela, ratioLabel } from '../constants';
import { projectDuration } from '../model/project';
import { VIcon, type VIconName } from '../components/VIcon';
import { BottomNav } from '../components/BottomNav';
import { BottomSheet } from '../components/BottomSheet';
import { Glass } from '../components/Glass';
import { useEditor } from '../store/editorStore';
import type { ViewMode } from '../storage/settings';
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

function CheckCircle({ on, size = 24 }: { on: boolean; size?: number }) {
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2 }, on ? styles.checkOn : styles.checkOff]}>
      {on ? <VIcon name="check" size={size * 0.62} color={vela.onAccent} strokeWidth={3} /> : null}
    </View>
  );
}

function ProjectRow({ p, onOpen, onMenu, selectMode, checked }: { p: StoredProject; onOpen: () => void; onMenu: () => void; selectMode?: boolean; checked?: boolean }) {
  return (
    <Pressable style={styles.row} onPress={onOpen} onLongPress={selectMode ? undefined : onMenu}>
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
      {selectMode ? (
        <CheckCircle on={!!checked} />
      ) : (
        <View style={{ alignItems: 'flex-end' }}>
          <Pressable hitSlop={10} onPress={onMenu}>
            <VIcon name="dots" size={18} color={vela.lightMuted} />
          </Pressable>
          <Text style={styles.rowDate}>{fmtDate(p.updatedAt)}</Text>
        </View>
      )}
    </Pressable>
  );
}

function ProjectGridCard({ p, cols, onOpen, onMenu, selectMode, checked }: { p: StoredProject; cols: 2 | 3; onOpen: () => void; onMenu: () => void; selectMode?: boolean; checked?: boolean }) {
  return (
    <Pressable style={cols === 3 ? styles.gridItem3 : styles.gridItem} onPress={onOpen} onLongPress={selectMode ? undefined : onMenu}>
      <View style={styles.gridPoster}>
        {p.posterUri ? (
          <Image source={{ uri: p.posterUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: vela.lightSurface, alignItems: 'center', justifyContent: 'center' }]}>
            <VIcon name="picture" size={cols === 3 ? 18 : 22} color={vela.lightMuted3} />
          </View>
        )}
        <Text style={styles.posterTime}>{fmtTime(projectDuration(p.project))}</Text>
        {selectMode ? (
          <View style={styles.gridCheck}><CheckCircle on={!!checked} size={cols === 3 ? 20 : 24} /></View>
        ) : null}
      </View>
      <Text style={[styles.gridCardName, cols === 3 && { fontSize: 12.5 }]} numberOfLines={1}>{p.name}</Text>
    </Pressable>
  );
}

function FolderPickerSheet({ folders, onPick, onClose }: { folders: string[]; onPick: (folder: string) => void; onClose: () => void }) {
  return (
    <BottomSheet onClose={onClose} style={styles.lightSheet} dim="rgba(20,20,30,0.32)">
      <Text style={styles.pickerTitle}>Move to Folder</Text>
      {folders.map((f) => (
        <Pressable key={f} style={styles.viewRow} onPress={() => onPick(f)}>
          <VIcon d={f === 'Imported' ? FOLDER_IMPORTED : FOLDER_DEFAULT} size={22} color={vela.ink2} strokeWidth={2} />
          <Text style={styles.viewLabel}>{f}</Text>
        </Pressable>
      ))}
      <Pressable
        style={styles.viewRow}
        onPress={() =>
          Alert.prompt('New Folder', 'Name the folder.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Create', onPress: (t?: string) => t && t.trim() && onPick(t.trim()) },
          ], 'plain-text')
        }
      >
        <VIcon name="plus" size={22} color={vela.accent} strokeWidth={2.4} />
        <Text style={[styles.viewLabel, { color: vela.accent }]}>New Folder…</Text>
      </Pressable>
    </BottomSheet>
  );
}

function ViewOptionsSheet({ current, onPick, onClose }: { current: ViewMode; onPick: (m: ViewMode) => void; onClose: () => void }) {
  const opts: { mode: ViewMode; label: string; icon: VIconName }[] = [
    { mode: 'list', label: 'View as List', icon: 'list' },
    { mode: 'grid2', label: 'View as Grid (2 columns)', icon: 'grid' },
    { mode: 'grid3', label: 'View as Grid (3 columns)', icon: 'grid' },
  ];
  return (
    <BottomSheet onClose={onClose} style={styles.lightSheet} dim="rgba(20,20,30,0.32)">
      {opts.map((o) => (
        <Pressable key={o.mode} style={styles.viewRow} onPress={() => onPick(o.mode)}>
          <VIcon name={o.icon} size={22} color={vela.ink2} />
          <Text style={styles.viewLabel}>{o.label}</Text>
          {current === o.mode ? <VIcon name="check" size={20} color={vela.accent} strokeWidth={2.6} /> : null}
        </Pressable>
      ))}
    </BottomSheet>
  );
}

interface MenuItem { label: string; d: string; color: string; onPress: () => void; pro?: boolean; div?: boolean; }

function ProjectMenu({ p, onClose }: { p: StoredProject; onClose: () => void }) {
  const renameProject = useEditor((s) => s.renameProject);
  const removeProject = useEditor((s) => s.removeProject);
  const duplicateProject = useEditor((s) => s.duplicateProject);
  const setProjectFolder = useEditor((s) => s.setProjectFolder);
  const saveProjectAsTemplate = useEditor((s) => s.saveProjectAsTemplate);

  function makeTemplate() {
    onClose();
    saveProjectAsTemplate(p.id);
    Alert.alert('Template saved', `“${p.name}” is now in Discover → My Templates.`);
  }

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
    { label: 'Create Template', d: 'M12 5a3 3 0 100 6 3 3 0 000-6zM5 19a7 7 0 0110-6.3M17 14v6M14 17h6', color: vela.ink2, onPress: makeTemplate },
    { label: 'Duplicate', d: 'M8 8h12v12H8zM4 4h12v3M4 4v12h3', color: vela.ink2, div: true, onPress: () => { onClose(); duplicateProject(p.id); } },
    { label: 'Move to Trash', d: 'M5 7h14M9 7V4h6v3M6 7l1 13h10l1-13', color: '#ff3b30', onPress: trash },
  ];

  return (
    <BottomSheet onClose={onClose} style={styles.menuSheet} dim="rgba(20,20,30,0.32)">
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
    </BottomSheet>
  );
}

export function ProjectsScreen() {
  const projects = useEditor((s) => s.projects);
  const openProject = useEditor((s) => s.openProject);
  const newProject = useEditor((s) => s.newProject);
  const go = useEditor((s) => s.go);
  const serverUrl = useEditor((s) => s.serverUrl);
  const setServerUrl = useEditor((s) => s.setServerUrl);
  const viewMode = useEditor((s) => s.viewMode);
  const setViewMode = useEditor((s) => s.setViewMode);
  const removeProjects = useEditor((s) => s.removeProjects);
  const setProjectsFolder = useEditor((s) => s.setProjectsFolder);
  const [createOpen, setCreateOpen] = useState(false);
  const [menuProject, setMenuProject] = useState<StoredProject | null>(null);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [viewSheet, setViewSheet] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveOpen, setMoveOpen] = useState(false);

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
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const visible = (activeFolder ? projects.filter((p) => folderOf(p) === activeFolder) : projects)
    .filter((p) => !searching || p.name.toLowerCase().includes(q));
  const recent = visible.filter((p) => now - p.updatedAt < 30 * DAY);
  const older = visible.filter((p) => now - p.updatedAt >= 30 * DAY);

  const folderNames = Array.from(new Set(['Default', 'Imported', ...projects.map(folderOf)]));
  const folders = folderNames.map((name) => ({
    name,
    count: projects.filter((p) => folderOf(p) === name).length,
    d: name === 'Imported' ? FOLDER_IMPORTED : FOLDER_DEFAULT,
  }));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }
  const allSelected = visible.length > 0 && visible.every((p) => selected.has(p.id));
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(visible.map((p) => p.id)));
  }
  function deleteSelected() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    Alert.alert('Move to Trash', `Delete ${ids.length} ${ids.length === 1 ? 'project' : 'projects'}? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { removeProjects(ids); exitSelect(); } },
    ]);
  }
  function moveSelected(folder: string) {
    setProjectsFolder(Array.from(selected), folder);
    setMoveOpen(false);
    exitSelect();
  }

  const cols = viewMode === 'grid3' ? 3 : viewMode === 'grid2' ? 2 : 0;
  const onCard = (p: StoredProject) => (selectMode ? toggle(p.id) : openProject(p.id));
  const renderGroup = (label: string, items: StoredProject[]) => {
    if (!items.length) return null;
    return (
      <View key={label}>
        <Text style={styles.groupLabel}>{label}</Text>
        {cols === 0 ? (
          items.map((p) => <ProjectRow key={p.id} p={p} selectMode={selectMode} checked={selected.has(p.id)} onOpen={() => onCard(p)} onMenu={() => setMenuProject(p)} />)
        ) : (
          <View style={styles.gridWrap}>
            {items.map((p) => <ProjectGridCard key={p.id} p={p} cols={cols} selectMode={selectMode} checked={selected.has(p.id)} onOpen={() => onCard(p)} onMenu={() => setMenuProject(p)} />)}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        {/* header */}
        {selectMode ? (
          <View style={styles.header}>
            <Pressable onPress={exitSelect} hitSlop={12} style={styles.selectClose}>
              <VIcon name="close" size={22} color={vela.ink2} strokeWidth={2.2} />
            </Pressable>
            <Text style={styles.selectTitle}>{selected.size ? `${selected.size} selected` : 'Select items'}</Text>
            <Pressable onPress={toggleAll} hitSlop={8}>
              <Text style={styles.editLink}>{allSelected ? 'Deselect All' : 'Select All'}</Text>
            </Pressable>
          </View>
        ) : (
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
        )}

        {/* search */}
        <View style={styles.search}>
          <VIcon name="search" size={19} color={vela.lightMuted} strokeWidth={2.2} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search your projects"
            placeholderTextColor={vela.lightMuted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>

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
          {!selectMode ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <Pressable onPress={() => { if (projects.length) setSelectMode(true); }}><Text style={styles.editLink}>Edit</Text></Pressable>
              <Pressable onPress={() => setViewSheet(true)} hitSlop={8}>
                <VIcon name={viewMode === 'list' ? 'list' : 'grid'} size={20} color={vela.ink3} strokeWidth={2} />
              </Pressable>
            </View>
          ) : null}
        </View>

        {projects.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No projects yet.</Text>
            <Text style={styles.emptyHint}>Tap the + below to start editing.</Text>
          </View>
        ) : searching && visible.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No matches</Text>
            <Text style={styles.emptyHint}>Nothing named “{query.trim()}”.</Text>
          </View>
        ) : null}

        {renderGroup('PAST 30 DAYS', recent)}
        {renderGroup('OLDER', older)}
      </ScrollView>

      {viewSheet ? (
        <ViewOptionsSheet current={viewMode} onPick={(m) => { setViewMode(m); setViewSheet(false); }} onClose={() => setViewSheet(false)} />
      ) : null}

      {selectMode ? (
        <View style={styles.actionWrap} pointerEvents="box-none">
          <Glass style={styles.actionBar} fallbackColor={vela.lightCard} interactive colorScheme="light">
            <Pressable style={styles.actionBtn} disabled={selected.size === 0} onPress={() => setMoveOpen(true)}>
              <VIcon d="M4 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2zM9 13h6M9 13l2-2M9 13l2 2" size={23} color={selected.size ? vela.ink2 : vela.lightMuted3} strokeWidth={2} />
              <Text style={[styles.actionLabel, selected.size === 0 && styles.actionLabelOff]}>Move to</Text>
            </Pressable>
            <View style={styles.actionSep} />
            <Pressable style={styles.actionBtn} disabled={selected.size === 0} onPress={deleteSelected}>
              <VIcon name="trash" size={23} color={selected.size ? '#ff3b30' : vela.lightMuted3} strokeWidth={2} />
              <Text style={[styles.actionLabel, { color: selected.size ? '#ff3b30' : vela.lightMuted3 }]}>Delete</Text>
            </Pressable>
          </Glass>
        </View>
      ) : (
        <BottomNav active="home" onHome={() => {}} onDiscover={() => go('discover')} onCreate={() => setCreateOpen(true)} />
      )}

      {moveOpen ? (
        <FolderPickerSheet folders={folderNames} onPick={moveSelected} onClose={() => setMoveOpen(false)} />
      ) : null}

      <CreateSheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={(w, h) => {
          setCreateOpen(false);
          newProject('Untitled', w, h);
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
  searchInput: { flex: 1, color: vela.ink, fontSize: 16, fontFamily: font.medium, height: '100%' },

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

  // grid views
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 22, paddingTop: 4, gap: 14 },
  gridItem: { width: '47%' },
  gridItem3: { width: '30.4%' },
  gridPoster: { width: '100%', aspectRatio: 3 / 4, borderRadius: 12, overflow: 'hidden', backgroundColor: vela.lightSurface },
  gridCardName: { fontFamily: font.semibold, fontSize: 14, color: vela.ink, marginTop: 7 },

  // view-options sheet
  lightSheet: { backgroundColor: vela.lightCard, paddingHorizontal: 22, paddingTop: 18, paddingBottom: 28, gap: 0 },
  viewRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16 },
  viewLabel: { flex: 1, fontFamily: font.semibold, fontSize: 17, color: vela.ink2 },
  pickerTitle: { fontFamily: font.extrabold, fontSize: 20, color: vela.ink, paddingBottom: 6 },

  // multi-select
  selectClose: { width: 42, height: 42, borderRadius: 21, backgroundColor: vela.lightCard, alignItems: 'center', justifyContent: 'center' },
  selectTitle: { fontFamily: font.extrabold, fontSize: 20, color: vela.ink, letterSpacing: -0.3 },
  checkOn: { backgroundColor: vela.accent, alignItems: 'center', justifyContent: 'center' },
  checkOff: { borderWidth: 2, borderColor: vela.lightMuted3, backgroundColor: 'transparent' },
  gridCheck: { position: 'absolute', top: 8, right: 8 },

  actionWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 100, justifyContent: 'flex-end' },
  actionBar: { position: 'absolute', left: 18, right: 18, bottom: 26, height: 62, borderRadius: 31, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  actionBtn: { flex: 1, height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  actionLabel: { fontFamily: font.bold, fontSize: 16, color: vela.ink2 },
  actionLabelOff: { color: vela.lightMuted3 },
  actionSep: { width: 1, height: 28, backgroundColor: vela.lightSurface },

  // project menu
  menuSheet: { backgroundColor: vela.lightCard, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 30, gap: 0 },
  menuHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 18 },
  menuTitle: { fontFamily: font.extrabold, fontSize: 22, color: vela.ink2, maxWidth: 260 },
  menuSub: { color: vela.lightMuted, fontSize: 14, marginTop: 4 },
  menuDivider: { height: 1, backgroundColor: vela.lightSurface, marginBottom: 6 },
  menuItemDivider: { height: 1, backgroundColor: vela.lightSurface, marginVertical: 6 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 15 },
  menuRowText: { fontSize: 18, fontFamily: font.semibold },
});
