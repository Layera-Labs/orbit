import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppHeader } from '../components/AppHeader';
import { BottomNav } from '../components/BottomNav';
import { BottomSheet } from '../components/BottomSheet';
import { Glass } from '../components/Glass';
import { SectionTitle } from '../components/OrbitUi';
import { VIcon, type VIconName } from '../components/VIcon';
import { font, mono, vela } from '../constants';
import { projectDuration } from '../model/project';
import type { StoredProject } from '../storage/projects';
import { useEditor } from '../store/editorStore';
import { BUILTIN_TEMPLATES } from '../templates';
import { CreateSheet } from './CreateSheet';

const shortcuts: Array<{
  label: string;
  hint: string;
  icon: VIconName;
  color: string;
  width?: number;
  height?: number;
}> = [
  {
    label: '16:9',
    hint: 'YouTube',
    icon: 'video',
    color: '#ef4444',
    width: 1920,
    height: 1080,
  },
  {
    label: '9:16',
    hint: 'Reel',
    icon: 'frame',
    color: '#ff6c61',
    width: 1080,
    height: 1920,
  },
  {
    label: '1:1',
    hint: 'Square',
    icon: 'picture',
    color: vela.accent,
    width: 1080,
    height: 1080,
  },
  { label: 'More', hint: 'Formats', icon: 'dots', color: vela.ink3 },
];

const FOLDER_ICON = 'M3 7h7l2 2h9v10H3z';
const MOVE_FOLDER_ICON = 'M4 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2zM9 13h6M9 13l2-2M9 13l2 2';

function folderOf(project: StoredProject): string {
  return project.folder?.trim() || 'Default';
}

function durationLabel(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`;
}

function CheckCircle({ selected }: { selected: boolean }) {
  return (
    <View style={[styles.checkCircle, selected ? styles.checkCircleOn : styles.checkCircleOff]}>
      {selected ? <VIcon name='check' size={14} color='#fff' strokeWidth={3} /> : null}
    </View>
  );
}

function ProjectCard({ project, onPress, layout, selecting, selected }: { project: StoredProject; onPress: () => void; layout: 'grid' | 'list'; selecting: boolean; selected: boolean }) {
  const poster = (
    <View style={layout === 'grid' ? styles.projectPoster : styles.projectRowPoster}>
      {project.posterUri ? <Image source={{ uri: project.posterUri }} style={StyleSheet.absoluteFill} resizeMode='cover' /> : <LinearGradient colors={['#273351', '#6c4cff']} style={StyleSheet.absoluteFill} />}
      <Text style={styles.duration}>{durationLabel(projectDuration(project.project))}</Text>
      {selecting && layout === 'grid' ? (
        <View style={styles.gridCheck}>
          <CheckCircle selected={selected} />
        </View>
      ) : null}
    </View>
  );

  return (
    <Pressable accessibilityRole='button' accessibilityState={selecting ? { selected } : undefined} style={[layout === 'grid' ? styles.projectCard : styles.projectRow, selected && styles.projectSelected]} onPress={onPress}>
      {poster}
      <View style={styles.projectText}>
        <Text style={styles.projectName} numberOfLines={1}>{project.name}</Text>
        <Text style={styles.projectMeta} numberOfLines={1}>{folderOf(project)} · Edited recently</Text>
      </View>
      {selecting && layout === 'list' ? <CheckCircle selected={selected} /> : null}
    </Pressable>
  );
}

function FolderCard({ name, count, selected, onPress }: { name: string; count: number; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole='button' accessibilityState={{ selected }} style={[styles.folderCard, selected && styles.folderCardOn]} onPress={onPress}>
      <View style={[styles.folderIcon, selected && styles.folderIconOn]}>
        <VIcon d={FOLDER_ICON} size={23} color={selected ? vela.accent : vela.ink3} strokeWidth={1.8} />
      </View>
      <Text style={[styles.folderName, selected && styles.folderNameOn]} numberOfLines={1}>{name}</Text>
      <Text style={styles.folderCount}>{count} {count === 1 ? 'project' : 'projects'}</Text>
    </Pressable>
  );
}

function MoveProjectsSheet({ folders, onPick, onClose }: { folders: string[]; onPick: (folder: string) => void; onClose: () => void }) {
  return (
    <BottomSheet onClose={onClose} style={styles.moveSheet} dim='rgba(20,20,30,0.32)'>
      <Text style={styles.moveTitle}>Move to Folder</Text>
      <Text style={styles.moveSubtitle}>Choose a destination for the selected projects.</Text>
      {folders.map((folder) => (
        <Pressable key={folder} accessibilityRole='button' style={styles.moveRow} onPress={() => onPick(folder)}>
          <View style={styles.moveFolderIcon}>
            <VIcon d={FOLDER_ICON} size={22} color={vela.accent} strokeWidth={1.9} />
          </View>
          <Text style={styles.moveLabel}>{folder}</Text>
          <VIcon name='chevronRight' size={17} color={vela.lightMuted} />
        </Pressable>
      ))}
    </BottomSheet>
  );
}

export function HomeScreen() {
  const projects = useEditor((s) => s.projects);
  const go = useEditor((s) => s.go);
  const openProject = useEditor((s) => s.openProject);
  const newProject = useEditor((s) => s.newProject);
  const newProjectFromTemplate = useEditor((s) => s.newProjectFromTemplate);
  const viewMode = useEditor((s) => s.viewMode);
  const setViewMode = useEditor((s) => s.setViewMode);
  const removeProjects = useEditor((s) => s.removeProjects);
  const setProjectsFolder = useEditor((s) => s.setProjectsFolder);
  const [createOpen, setCreateOpen] = useState(false);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveOpen, setMoveOpen] = useState(false);
  const sortedProjects = [...projects].sort((a, b) => b.updatedAt - a.updatedAt);
  const folderNames = Array.from(new Set(['Default', ...sortedProjects.map(folderOf)]));
  const folders = [
    { name: 'All Projects', count: sortedProjects.length, value: null },
    ...folderNames.map((name) => ({ name, count: sortedProjects.filter((project) => folderOf(project) === name).length, value: name })),
  ];
  const visibleProjects = sortedProjects.filter((project) => !activeFolder || folderOf(project) === activeFolder);
  const projectLayout = viewMode === 'list' ? 'list' : 'grid';

  const create = (width: number, height: number) => newProject('Untitled', width, height);

  function toggleProject(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelection() {
    setSelecting(false);
    setSelected(new Set());
    setMoveOpen(false);
  }

  const allVisibleSelected = visibleProjects.length > 0 && visibleProjects.every((project) => selected.has(project.id));

  function toggleAllVisible() {
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleProjects.forEach((project) => next.delete(project.id));
      else visibleProjects.forEach((project) => next.add(project.id));
      return next;
    });
  }

  function deleteSelected() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    Alert.alert('Delete Projects', `Delete ${ids.length} selected ${ids.length === 1 ? 'project' : 'projects'}? This can’t be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          removeProjects(ids);
          exitSelection();
        },
      },
    ]);
  }

  function moveSelected(folder: string) {
    if (!selected.size) return;
    setProjectsFolder(Array.from(selected), folder);
    exitSelection();
    setActiveFolder(folder);
  }

  return (
    <View style={styles.root}>
      <AppHeader
        brand
        actions={[
          {
            icon: 'profile',
            label: 'Open profile',
            onPress: () => go('profile'),
          },
        ]}
      />
      <ScrollView contentInsetAdjustmentBehavior='automatic' showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View>
          <Text style={styles.greeting}>Good evening, Creator 👋</Text>
          <Text style={styles.hero}>What will you{`\n`}create today?</Text>
        </View>

        <View style={styles.shortcuts}>
          {shortcuts.map((shortcut) => (
            <Pressable key={shortcut.label} style={styles.shortcut} onPress={() => (shortcut.width && shortcut.height ? create(shortcut.width, shortcut.height) : setCreateOpen(true))}>
              <View style={[styles.shortcutIcon, { backgroundColor: `${shortcut.color}16` }]}>
                <VIcon name={shortcut.icon} size={19} color={shortcut.color} />
              </View>
              <Text style={styles.shortcutLabel}>{shortcut.label}</Text>
              <Text style={styles.shortcutHint}>{shortcut.hint}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.section}>
          <SectionTitle title='Trending Templates' action='See All' onAction={() => go('discover')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontal}>
            {BUILTIN_TEMPLATES.slice(0, 6).map((template) => (
              <Pressable key={template.id} style={styles.templateWrap} onPress={() => newProjectFromTemplate(template)}>
                <LinearGradient colors={template.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.templateCard}>
                  <Text style={styles.templateTag}>{template.tag.toUpperCase()}</Text>
                  <Text style={styles.templateName}>{template.name}</Text>
                </LinearGradient>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <SectionTitle title='Project Folders' />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.folderRow}>
            {folders.map((folder) => (
              <FolderCard key={folder.name} name={folder.name} count={folder.count} selected={activeFolder === folder.value} onPress={() => setActiveFolder(folder.value)} />
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <View style={styles.projectsHeader}>
            <View style={styles.projectsTitleWrap}>
              <Text style={styles.projectsTitle}>{activeFolder ? `${activeFolder} Projects` : 'Projects'}</Text>
              <Text style={styles.projectsCount}>{selecting ? `${selected.size} selected` : visibleProjects.length}</Text>
            </View>
            {selecting ? (
              <View style={styles.selectionHeaderActions}>
                <Pressable accessibilityRole='button' hitSlop={8} onPress={toggleAllVisible}>
                  <Text style={styles.headerActionText}>{allVisibleSelected ? 'Deselect All' : 'Select All'}</Text>
                </Pressable>
                <Pressable accessibilityRole='button' hitSlop={8} onPress={exitSelection}>
                  <Text style={styles.headerActionText}>Done</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.projectControls}>
                <View style={styles.viewToggle}>
                  <Pressable accessibilityRole='button' accessibilityLabel='Grid view' accessibilityState={{ selected: projectLayout === 'grid' }} style={[styles.viewButton, projectLayout === 'grid' && styles.viewButtonOn]} onPress={() => setViewMode('grid2')}>
                    <VIcon name='grid' size={17} color={projectLayout === 'grid' ? vela.accent : vela.ink3} />
                  </Pressable>
                  <Pressable accessibilityRole='button' accessibilityLabel='List view' accessibilityState={{ selected: projectLayout === 'list' }} style={[styles.viewButton, projectLayout === 'list' && styles.viewButtonOn]} onPress={() => setViewMode('list')}>
                    <VIcon name='list' size={18} color={projectLayout === 'list' ? vela.accent : vela.ink3} />
                  </Pressable>
                </View>
                <Pressable accessibilityRole='button' accessibilityLabel='Select projects' disabled={!visibleProjects.length} style={[styles.manageButton, !visibleProjects.length && styles.controlDisabled]} onPress={() => setSelecting(true)}>
                  <VIcon name='dots' size={18} color={vela.ink3} />
                </Pressable>
              </View>
            )}
          </View>
          {visibleProjects.length ? (
            <View style={projectLayout === 'grid' ? styles.projectsGrid : styles.projectsList}>
              {visibleProjects.map((project) => (
                <ProjectCard key={project.id} project={project} layout={projectLayout} selecting={selecting} selected={selected.has(project.id)} onPress={() => (selecting ? toggleProject(project.id) : openProject(project.id))} />
              ))}
            </View>
          ) : (
            <Pressable style={styles.empty} disabled={selecting} onPress={() => setCreateOpen(true)}>
              <VIcon name='video' size={28} color={vela.accent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.emptyTitle}>{activeFolder ? `No projects in ${activeFolder}` : 'Your first story starts here'}</Text>
                <Text style={styles.emptyText}>{activeFolder ? 'Choose another folder or create a project.' : 'Create a project or start from a template.'}</Text>
              </View>
              <VIcon name='chevronRight' size={18} color={vela.lightMuted} />
            </Pressable>
          )}
        </View>
      </ScrollView>

      {selecting ? (
        <View style={styles.selectionActionWrap} pointerEvents='box-none'>
          <Glass style={styles.selectionActionBar} fallbackColor={vela.lightCard} interactive colorScheme='light'>
            <Pressable accessibilityRole='button' style={styles.selectionAction} disabled={!selected.size} onPress={() => setMoveOpen(true)}>
              <VIcon d={MOVE_FOLDER_ICON} size={22} color={selected.size ? vela.ink2 : vela.lightMuted3} strokeWidth={2} />
              <Text style={[styles.selectionActionText, !selected.size && styles.selectionActionTextOff]}>Move</Text>
            </Pressable>
            <View style={styles.selectionActionDivider} />
            <Pressable accessibilityRole='button' style={styles.selectionAction} disabled={!selected.size} onPress={deleteSelected}>
              <VIcon name='trash' size={22} color={selected.size ? '#ff3b30' : vela.lightMuted3} />
              <Text style={[styles.selectionActionText, { color: selected.size ? '#ff3b30' : vela.lightMuted3 }]}>Delete</Text>
            </Pressable>
          </Glass>
        </View>
      ) : (
        <BottomNav active='home' onHome={() => {}} onTemplates={() => go('discover')} onCreate={() => setCreateOpen(true)} onAi={() => go('ai')} />
      )}

      {moveOpen ? <MoveProjectsSheet folders={folderNames} onPick={moveSelected} onClose={() => setMoveOpen(false)} /> : null}

      <CreateSheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={(width, height) => {
          setCreateOpen(false);
          create(width, height);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: vela.homeBg },
  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 116,
    gap: 22,
  },
  greeting: { color: vela.ink3, fontFamily: font.medium, fontSize: 13.5 },
  hero: {
    color: vela.ink,
    fontFamily: font.extrabold,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.7,
    marginTop: 4,
  },
  shortcuts: { flexDirection: 'row', gap: 9 },
  shortcut: {
    flex: 1,
    minHeight: 80,
    backgroundColor: vela.lightCard,
    borderRadius: 14,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    boxShadow: '0 2px 8px rgba(24,24,36,0.05)',
  },
  shortcutIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutLabel: {
    color: vela.ink2,
    fontFamily: font.bold,
    fontSize: 11.5,
    marginTop: 5,
  },
  shortcutHint: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 9.5,
  },
  section: { gap: 11 },
  horizontal: { gap: 11, paddingRight: 8 },
  folderRow: { gap: 10, paddingRight: 8 },
  folderCard: {
    width: 116,
    minHeight: 90,
    backgroundColor: vela.lightCard,
    borderRadius: 15,
    borderCurve: 'continuous',
    padding: 11,
    borderWidth: 1,
    borderColor: vela.lightBorder,
  },
  folderCardOn: { backgroundColor: vela.accentSoft, borderColor: vela.accent },
  folderIcon: { width: 34, height: 30, borderRadius: 9, backgroundColor: vela.lightSurface, alignItems: 'center', justifyContent: 'center' },
  folderIconOn: { backgroundColor: '#fff' },
  folderName: { color: vela.ink2, fontFamily: font.bold, fontSize: 12.5, marginTop: 7 },
  folderNameOn: { color: vela.accent },
  folderCount: { color: vela.lightMuted, fontFamily: font.medium, fontSize: 9.5, marginTop: 1 },
  projectsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  projectsTitleWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 7, flexShrink: 1 },
  projectsTitle: { color: vela.ink, fontFamily: font.extrabold, fontSize: 16.5, flexShrink: 1 },
  projectsCount: { color: vela.lightMuted, fontFamily: font.bold, fontSize: 11.5 },
  projectControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  viewToggle: { height: 34, borderRadius: 10, backgroundColor: vela.lightSurface, padding: 3, flexDirection: 'row', alignItems: 'center' },
  viewButton: { width: 32, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  viewButtonOn: { backgroundColor: vela.lightCard, boxShadow: '0 1px 3px rgba(20,20,32,0.09)' },
  manageButton: { width: 34, height: 34, borderRadius: 10, backgroundColor: vela.lightSurface, alignItems: 'center', justifyContent: 'center' },
  controlDisabled: { opacity: 0.4 },
  selectionHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerActionText: { color: vela.accent, fontFamily: font.bold, fontSize: 12.5 },
  projectsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 11 },
  projectsList: { gap: 9 },
  projectCard: {
    width: '48.4%',
    backgroundColor: vela.lightCard,
    borderRadius: 15,
    borderCurve: 'continuous',
    padding: 8,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  projectRow: {
    minHeight: 82,
    backgroundColor: vela.lightCard,
    borderRadius: 15,
    borderCurve: 'continuous',
    padding: 9,
    paddingRight: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  projectSelected: { backgroundColor: vela.accentSoft, borderColor: vela.accent },
  projectPoster: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: 12,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: vela.lightSurface,
  },
  projectRowPoster: { width: 88, height: 60, borderRadius: 11, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: vela.lightSurface },
  projectText: { flex: 1, minWidth: 0 },
  duration: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    color: '#fff',
    backgroundColor: '#0009',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
    fontFamily: mono.medium,
    fontSize: 9.5,
  },
  projectName: {
    color: vela.ink,
    fontFamily: font.bold,
    fontSize: 12.5,
    marginTop: 6,
  },
  projectMeta: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 10.5,
    marginTop: 1,
  },
  checkCircle: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  checkCircleOn: { backgroundColor: vela.accent },
  checkCircleOff: { backgroundColor: '#ffffffdd', borderWidth: 2, borderColor: vela.lightMuted3 },
  gridCheck: { position: 'absolute', right: 7, top: 7 },
  empty: {
    minHeight: 78,
    backgroundColor: vela.lightCard,
    borderRadius: 15,
    borderCurve: 'continuous',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: { color: vela.ink, fontFamily: font.bold, fontSize: 14 },
  emptyText: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 12,
    marginTop: 2,
  },
  templateWrap: { width: 118 },
  templateCard: {
    height: 92,
    borderRadius: 12,
    borderCurve: 'continuous',
    padding: 10,
    justifyContent: 'flex-end',
  },
  templateTag: { color: '#ffffffb8', fontFamily: mono.medium, fontSize: 9 },
  templateName: {
    color: '#fff',
    fontFamily: font.extrabold,
    fontSize: 14,
    marginTop: 2,
  },
  selectionActionWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 106, justifyContent: 'flex-end' },
  selectionActionBar: { position: 'absolute', left: 18, right: 18, bottom: 24, height: 64, borderRadius: 32, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  selectionAction: { flex: 1, height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  selectionActionText: { color: vela.ink2, fontFamily: font.bold, fontSize: 15 },
  selectionActionTextOff: { color: vela.lightMuted3 },
  selectionActionDivider: { width: 1, height: 28, backgroundColor: vela.lightBorder },
  moveSheet: { backgroundColor: vela.lightCard, paddingHorizontal: 22, paddingTop: 22, paddingBottom: 30, gap: 0 },
  moveTitle: { color: vela.ink, fontFamily: font.extrabold, fontSize: 20 },
  moveSubtitle: { color: vela.lightMuted, fontFamily: font.medium, fontSize: 13, marginTop: 4, marginBottom: 10 },
  moveRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: vela.lightBorder },
  moveFolderIcon: { width: 36, height: 34, borderRadius: 10, backgroundColor: vela.accentSoft, alignItems: 'center', justifyContent: 'center' },
  moveLabel: { flex: 1, color: vela.ink2, fontFamily: font.semibold, fontSize: 16 },
});
