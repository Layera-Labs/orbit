import { type ComponentProps, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { projectDuration } from '../model/project';
import { clipAtTime } from '../model/editor-ops';
import type { VisualTrackClip } from '../model/types';
import { videoThumbnail } from '../storage/media';
import { RATIOS, ratioLabel, theme } from '../constants';
import { Preview } from '../components/Preview';
import { Timeline } from '../components/Timeline';
import { exportProject, downloadToPhotos, type ExportProgress } from '../net/renderClient';
import { OVERLAY_TRACK, useEditor } from '../store/editorStore';

type IconName = ComponentProps<typeof Ionicons>['name'];
interface Tool {
  key: string;
  icon: IconName;
  label: string;
  onPress?: () => void;
  soon?: boolean;
  danger?: boolean;
  disabled?: boolean;
}

function fmt(sec: number): string {
  const s = Math.max(0, sec);
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

function progressLabel(p: ExportProgress): string {
  switch (p.stage) {
    case 'uploading':
      return `Uploading media ${p.current ?? 1}/${p.total ?? 1}…`;
    case 'rendering':
      return 'Rendering on server…';
    case 'downloading':
      return 'Downloading…';
    case 'saving':
      return 'Saving to Photos…';
  }
}

function ToolButton({ tool, vertical }: { tool: Tool; vertical?: boolean }) {
  const color = tool.soon ? theme.muted : tool.danger ? theme.danger : theme.text;
  const onPress = tool.soon ? () => Alert.alert('Coming soon', `${tool.label} is coming soon.`) : tool.onPress;
  return (
    <Pressable
      style={[styles.tool, vertical && styles.toolVertical, tool.disabled && !tool.soon && styles.toolDisabled]}
      onPress={onPress}
      disabled={tool.disabled && !tool.soon}
    >
      <Ionicons name={tool.icon} size={22} color={tool.disabled && !tool.soon ? theme.muted : color} />
      <Text style={[styles.toolLabel, tool.danger && { color: theme.danger }]}>{tool.label}</Text>
      {tool.soon ? (
        <View style={styles.soonBadge}>
          <Text style={styles.soonText}>soon</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function EditorScreen() {
  const { width: screenW } = useWindowDimensions();
  const project = useEditor((s) => s.project);
  const name = useEditor((s) => s.name);
  const selected = useEditor((s) => s.selected);
  const closeEditor = useEditor((s) => s.closeEditor);
  const splitAtPlayhead = useEditor((s) => s.splitAtPlayhead);
  const removeSelected = useEditor((s) => s.removeSelected);
  const moveSelectedLayer = useEditor((s) => s.moveSelectedLayer);
  const togglePiP = useEditor((s) => s.togglePiP);
  const serverUrl = useEditor((s) => s.serverUrl);
  const playheadSec = useEditor((s) => s.playheadSec);
  const isPlaying = useEditor((s) => s.isPlaying);
  const setPlaying = useEditor((s) => s.setPlaying);
  const setPlayhead = useEditor((s) => s.setPlayhead);
  const setPoster = useEditor((s) => s.setPoster);
  const setRatio = useEditor((s) => s.setRatio);
  const setName = useEditor((s) => s.setName);
  const sourceDims = useEditor((s) => s.sourceDims);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!project) return null;

  const dur = projectDuration(project);
  const tracks = project.tracks ?? [];
  const clipCount = tracks.reduce((n, t) => n + t.clips.length, 0);
  const selectedTrack = selected ? tracks.find((t) => t.id === selected.trackId) : undefined;
  const selectedIsVisual = selectedTrack?.kind === 'visual';
  const selectedIsAudio = selectedTrack?.kind === 'audio';
  const selectedIsText = selected?.trackId === OVERLAY_TRACK;

  function promptEditText() {
    const st = useEditor.getState();
    const sel = st.selected;
    if (!sel || sel.trackId !== OVERLAY_TRACK) return;
    const o = st.project?.overlays.find((x) => x.id === sel.clipId);
    Alert.prompt(
      'Caption text',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save', onPress: (t?: string) => t !== undefined && st.editSelectedText(t) },
      ],
      'plain-text',
      o?.text ?? '',
    );
  }

  // Fit a preview frame for this ratio into the available width.
  const ar = project.width / project.height;
  let fw = screenW - 40;
  let fh = fw / ar;
  if (fh > 260) {
    fh = 260;
    fw = fh * ar;
  }

  async function onExport() {
    if (!project) return;
    if (clipCount === 0 && project.overlays.length === 0) {
      Alert.alert('Nothing to export', 'Import a clip first.');
      return;
    }
    setExporting(true);
    setExportMsg('Preparing…');
    try {
      const url = await exportProject(serverUrl, project, (p) => setExportMsg(progressLabel(p)));
      await downloadToPhotos(url, Date.now(), (p) => setExportMsg(progressLabel(p)));
      setExporting(false);
      Alert.alert('Exported', 'Your video was saved to Photos.');
    } catch (e) {
      setExporting(false);
      Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
    }
  }

  async function onCover() {
    if (!project) return;
    const mainTrack = project.tracks?.find((t) => t.kind === 'visual');
    const c = mainTrack ? (clipAtTime(mainTrack, playheadSec) as VisualTrackClip | undefined) : undefined;
    if (!c) {
      Alert.alert('Cover', 'Add a video or image first, move the playhead, then tap Cover.');
      return;
    }
    if (c.type === 'image') {
      setPoster(c.src);
      Alert.alert('Cover set', 'Project cover updated.');
      return;
    }
    const t = await videoThumbnail(c.src, (c.trimIn ?? 0) + (playheadSec - c.start));
    if (t) {
      setPoster(t);
      Alert.alert('Cover set', 'Project cover updated to the current frame.');
    } else {
      Alert.alert('Cover', 'Could not capture the frame.');
    }
  }

  function onRename() {
    Alert.prompt(
      'Rename project',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save', onPress: (t?: string) => t && setName(t) },
      ],
      'plain-text',
      name,
    );
  }

  const ratioOptions = sourceDims
    ? [{ key: 'orig', label: 'Original', hint: 'Source', width: sourceDims.width, height: sourceDims.height }, ...RATIOS]
    : RATIOS;

  // Bottom feature bar: the headline tools (horizontal scroll), then a few
  // selection-specific actions appended on the right.
  const base: Tool[] = [
    { key: 'cover', icon: 'image-outline', label: 'Cover', onPress: onCover, disabled: clipCount === 0 },
    { key: 'split', icon: 'cut-outline', label: 'Split', onPress: splitAtPlayhead, disabled: clipCount === 0 },
    { key: 'speed', icon: 'speedometer-outline', label: 'Speed', soon: true },
    { key: 'filter', icon: 'color-filter-outline', label: 'Filter', soon: true },
    { key: 'effects', icon: 'sparkles-outline', label: 'Effects', soon: true },
    { key: 'extract', icon: 'download-outline', label: 'Extract', soon: true },
    { key: 'fx', icon: 'flash-outline', label: 'FX', soon: true },
    { key: 'quality', icon: 'tv-outline', label: 'Quality', soon: true },
  ];
  let contextual: Tool[] = [];
  if (selectedIsText) {
    contextual = [
      { key: 'edit', icon: 'create-outline', label: 'Edit', onPress: promptEditText },
      { key: 'del', icon: 'trash-outline', label: 'Delete', onPress: removeSelected, danger: true },
    ];
  } else if (selectedIsAudio) {
    contextual = [
      { key: 'vol', icon: 'volume-high-outline', label: 'Volume', soon: true },
      { key: 'del', icon: 'trash-outline', label: 'Delete', onPress: removeSelected, danger: true },
    ];
  } else if (selected) {
    contextual = [
      { key: 'pip', icon: 'scan-outline', label: 'PiP', onPress: togglePiP, disabled: !selectedIsVisual },
      { key: 'up', icon: 'chevron-up', label: 'Up', onPress: () => moveSelectedLayer(1), disabled: !selectedIsVisual },
      { key: 'down', icon: 'chevron-down', label: 'Down', onPress: () => moveSelectedLayer(-1), disabled: !selectedIsVisual },
      { key: 'del', icon: 'trash-outline', label: 'Delete', onPress: removeSelected, danger: true },
    ];
  }
  const bottomTools: Tool[] = [...base, ...contextual];

  return (
    <View style={styles.root}>
      <View style={styles.topbar}>
        <Pressable onPress={closeEditor} hitSlop={10}>
          <Text style={styles.back}>‹ Projects</Text>
        </Pressable>
        <View style={styles.titleWrap}>
          <Pressable style={styles.ratioChip} onPress={() => setSettingsOpen(true)}>
            <Ionicons name="phone-portrait-outline" size={15} color={theme.text} />
            <Text style={styles.ratioChipText}>{ratioLabel(project.width, project.height)}</Text>
            <Ionicons name="chevron-down" size={14} color={theme.subtext} />
          </Pressable>
        </View>
        <Pressable style={[styles.export, exporting && styles.exportOff]} onPress={onExport} disabled={exporting}>
          <Text style={styles.exportText}>Export</Text>
        </Pressable>
      </View>

      <View style={styles.previewWrap}>
        <Preview width={fw} height={fh} />
      </View>

      {/* Transport bar */}
      <View style={styles.transport}>
        <Text style={styles.tc}>
          {fmt(playheadSec)} / {fmt(dur)}
        </Text>
        <View style={styles.transportBtns}>
          <Pressable onPress={() => setPlayhead(0)} hitSlop={12}>
            <Ionicons name="play-skip-back" size={20} color={theme.text} />
          </Pressable>
          <Pressable style={styles.playMain} onPress={() => setPlaying(!isPlaying)} hitSlop={12}>
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={24} color={theme.accentText} />
          </Pressable>
          <Pressable onPress={() => setPlayhead(dur)} hitSlop={12}>
            <Ionicons name="play-skip-forward" size={20} color={theme.text} />
          </Pressable>
        </View>
      </View>

      {/* Timeline (its own left gutter holds per-row add buttons) */}
      <Timeline />

      {/* Bottom contextual edit-bar */}
      <View style={styles.bottomBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bottomBarContent}>
          {bottomTools.map((t) => (
            <ToolButton key={t.key} tool={t} />
          ))}
        </ScrollView>
      </View>

      <Modal visible={exporting} transparent animationType="fade">
        <View style={styles.exportBackdrop}>
          <View style={styles.exportCard}>
            <ActivityIndicator color={theme.accent} size="large" />
            <Text style={styles.exportMsg}>{exportMsg}</Text>
          </View>
        </View>
      </Modal>

      {/* Project settings (ratio / HDR / rename) */}
      <Modal visible={settingsOpen} transparent animationType="slide" onRequestClose={() => setSettingsOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSettingsOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Project settings</Text>
              <Pressable onPress={() => setSettingsOpen(false)} hitSlop={10}>
                <Ionicons name="checkmark" size={24} color={theme.accent} />
              </Pressable>
            </View>

            <Text style={styles.sheetLabel}>Aspect ratio</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ratioRow}>
              {ratioOptions.map((r) => {
                const on = r.width === project.width && r.height === project.height;
                return (
                  <Pressable key={r.key} style={[styles.ratioCard, on && styles.ratioCardOn]} onPress={() => setRatio(r.width, r.height)}>
                    <Text style={[styles.ratioCardLabel, on && styles.ratioCardLabelOn]}>{r.label}</Text>
                    <Text style={styles.ratioCardHint}>{r.hint}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.sheetRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetRowTitle}>
                  HDR <Text style={styles.soonInline}>soon</Text>
                </Text>
                <Text style={styles.sheetRowSub}>Convert the export to an HDR video</Text>
              </View>
              <Switch value={false} disabled trackColor={{ true: theme.accent, false: theme.border }} />
            </View>

            <Pressable style={styles.sheetActionRow} onPress={() => { setSettingsOpen(false); onRename(); }}>
              <Ionicons name="create-outline" size={18} color={theme.text} />
              <Text style={styles.sheetActionText}>Rename project</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.muted} style={{ marginLeft: 'auto' }} />
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.editorBg, paddingTop: 56 },
  topbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 },
  back: { color: theme.accent, fontSize: 16, fontWeight: '600', width: 84 },
  titleWrap: { flex: 1, alignItems: 'center' },
  title: { color: theme.text, fontSize: 16, fontWeight: '700' },
  subtitle: { color: theme.muted, fontSize: 12, marginTop: 1 },
  export: { backgroundColor: theme.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, width: 84, alignItems: 'center' },
  exportOff: { opacity: 0.5 },
  exportText: { color: theme.accentText, fontWeight: '700' },

  previewWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.border },
  tc: { position: 'absolute', left: 18, color: theme.subtext, fontSize: 12, fontVariant: ['tabular-nums'] },
  transportBtns: { flexDirection: 'row', alignItems: 'center', gap: 28 },
  playMain: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },

  timelineRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: theme.border },
  rail: { width: 60, paddingVertical: 8, gap: 6, borderRightWidth: 1, borderRightColor: theme.border, backgroundColor: theme.surface2 },
  timelineWrap: { flex: 1 },

  bottomBar: { borderTopWidth: 1, borderTopColor: theme.border },
  bottomBarContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 10, alignItems: 'center' },

  tool: { alignItems: 'center', gap: 3, minWidth: 56, paddingVertical: 2 },
  toolVertical: { minWidth: 0, width: '100%' },
  toolDisabled: { opacity: 0.35 },
  toolLabel: { color: theme.subtext, fontSize: 11 },
  soonBadge: { position: 'absolute', top: -3, right: 4, backgroundColor: theme.surface, borderRadius: 4, paddingHorizontal: 3 },
  soonText: { color: theme.muted, fontSize: 7, fontWeight: '700' },

  exportBackdrop: { flex: 1, backgroundColor: '#000c', alignItems: 'center', justifyContent: 'center' },
  exportCard: { backgroundColor: theme.surface, borderRadius: 16, padding: 28, alignItems: 'center', gap: 14, minWidth: 200 },
  exportMsg: { color: theme.text, fontSize: 15 },

  ratioChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.surface, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  ratioChipText: { color: theme.text, fontWeight: '700', fontSize: 14 },

  sheetBackdrop: { flex: 1, backgroundColor: '#000a', justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.surface2, padding: 20, paddingBottom: 36, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 12 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { color: theme.text, fontSize: 18, fontWeight: '700' },
  sheetLabel: { color: theme.subtext, fontSize: 13 },
  ratioRow: { gap: 10, paddingVertical: 2 },
  ratioCard: { minWidth: 72, backgroundColor: theme.surface, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 2, borderColor: 'transparent', alignItems: 'center' },
  ratioCardOn: { borderColor: theme.accent },
  ratioCardLabel: { color: theme.text, fontSize: 16, fontWeight: '700' },
  ratioCardLabelOn: { color: theme.accent },
  ratioCardHint: { color: theme.muted, fontSize: 11, marginTop: 2 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderRadius: 12, padding: 14, marginTop: 4 },
  sheetRowTitle: { color: theme.text, fontSize: 15, fontWeight: '600' },
  sheetRowSub: { color: theme.muted, fontSize: 12, marginTop: 2 },
  soonInline: { color: theme.muted, fontSize: 10, fontWeight: '700' },
  sheetActionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.surface, borderRadius: 12, padding: 14 },
  sheetActionText: { color: theme.text, fontSize: 15, fontWeight: '600' },
});
