/**
 * Editor screen — Vela skin. Top bar (back · help · ratio chip · ⋯ · Save ·
 * Export), a white-framed composite preview, a transport row, the Vela timeline,
 * and the bottom tool rail. Tools we have wire to real actions; everything else
 * is tagged "soon". Sheets (settings, project menu, insert, audio, prefs,
 * filter, export) live in <EditorSheets/> and open via the store `panel` state.
 */
import { Alert, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { projectDuration } from '../model/project';
import { ratioLabel, font, mono, vela } from '../constants';
import { VIcon, type VIconName } from '../components/VIcon';
import { Preview } from '../components/Preview';
import { Timeline } from '../components/Timeline';
import { EditorSheets } from '../components/EditorSheets';
import { SelectionActionBar } from '../components/SelectionActionBar';
import { OVERLAY_TRACK, useEditor } from '../store/editorStore';

interface Tool {
  key: string;
  icon: VIconName;
  label: string;
  onPress?: () => void;
  soon?: boolean;
  danger?: boolean;
  disabled?: boolean;
}

const soonAlert = (label: string) => Alert.alert('Coming soon', `${label} is coming soon.`);

function ToolButton({ tool }: { tool: Tool }) {
  const color = tool.soon ? vela.muted2 : tool.danger ? vela.danger : vela.textLight;
  const onPress = tool.soon ? () => soonAlert(tool.label) : tool.onPress;
  const dimmed = tool.disabled && !tool.soon;
  return (
    <Pressable style={styles.tool} onPress={onPress} disabled={dimmed}>
      <VIcon name={tool.icon} size={25} color={dimmed ? vela.muted3 : color} strokeWidth={1.7} />
      <Text style={[styles.toolLabel, tool.danger && { color: vela.danger }]}>{tool.label}</Text>
      {tool.soon ? (
        <View style={styles.soonTag}>
          <Text style={styles.soonTagText}>soon</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function EditorScreen() {
  const { width: screenW } = useWindowDimensions();
  const project = useEditor((s) => s.project);
  const selected = useEditor((s) => s.selected);
  const select = useEditor((s) => s.select);
  const closeEditor = useEditor((s) => s.closeEditor);
  const splitAtPlayhead = useEditor((s) => s.splitAtPlayhead);
  const removeSelected = useEditor((s) => s.removeSelected);
  const moveSelectedLayer = useEditor((s) => s.moveSelectedLayer);
  const togglePiP = useEditor((s) => s.togglePiP);
  const duplicateSelected = useEditor((s) => s.duplicateSelected);
  const playheadSec = useEditor((s) => s.playheadSec);
  const isPlaying = useEditor((s) => s.isPlaying);
  const setPlaying = useEditor((s) => s.setPlaying);
  const setPlayhead = useEditor((s) => s.setPlayhead);
  const setPanel = useEditor((s) => s.setPanel);

  if (!project) return null;

  const dur = projectDuration(project);
  const tracks = project.tracks ?? [];
  const clipCount = tracks.reduce((n, t) => n + t.clips.length, 0);
  const selectedTrack = selected ? tracks.find((t) => t.id === selected.trackId) : undefined;
  const selectedIsVisual = selectedTrack?.kind === 'visual';
  const selectedIsAudio = selectedTrack?.kind === 'audio';
  const selectedIsText = selected?.trackId === OVERLAY_TRACK;

  // Fit the white preview frame (7px white padding all round) into the stage.
  const ar = project.width / project.height;
  let iw = screenW - 48;
  let ih = iw / ar;
  const maxH = 380;
  if (ih > maxH) {
    ih = maxH;
    iw = ih * ar;
  }

  // Bottom tool rail. With nothing selected it shows Vela's eight; selecting a
  // clip/overlay REPLACES it with that element's contextual tools (CapCut-style).
  const base: Tool[] = [
    { key: 'filter', icon: 'filter', label: 'Filter', onPress: () => setPanel('filter') },
    { key: 'trim', icon: 'trim', label: 'Trim', soon: true },
    { key: 'fx', icon: 'fx', label: 'FX', onPress: () => setPanel('fx') },
    { key: 'motion', icon: 'motion', label: 'Motion', onPress: () => setPanel('motion') },
    { key: 'split', icon: 'split', label: 'Split', onPress: splitAtPlayhead, disabled: clipCount === 0 },
    { key: 'cutout', icon: 'cutout', label: 'Cutout', soon: true },
    { key: 'quality', icon: 'quality', label: 'Quality', onPress: () => setPanel('settings') },
    { key: 'speed', icon: 'speed', label: 'Speed', onPress: () => setPanel('speed') },
    { key: 'volume', icon: 'volume', label: 'Volume', onPress: () => setPanel('volume') },
  ];
  // Full text toolset (CapCut). Split/Delete/Copy are real; the rest are soon.
  const textTools: Tool[] = [
    { key: 'font', icon: 'font', label: 'Font', soon: true },
    { key: 'size', icon: 'fontsize', label: 'Size', soon: true },
    { key: 'split', icon: 'split', label: 'Split', onPress: splitAtPlayhead },
    { key: 'delete', icon: 'trash', label: 'Delete', onPress: removeSelected, danger: true },
    { key: 'color', icon: 'color', label: 'Color', soon: true },
    { key: 'format', icon: 'format', label: 'Format', soon: true },
    { key: 'spacing', icon: 'spacing', label: 'Spacing', soon: true },
    { key: 'style', icon: 'style', label: 'Style', soon: true },
    { key: 'blending', icon: 'blending', label: 'Blending', soon: true },
    { key: 'opacity', icon: 'opacity', label: 'Opacity', soon: true },
    { key: 'position', icon: 'position', label: 'Position', soon: true },
    { key: 'mask', icon: 'mask', label: 'Mask', soon: true },
    { key: 'copy', icon: 'duplicate', label: 'Copy', onPress: duplicateSelected },
  ];
  const audioTools: Tool[] = [
    { key: 'split', icon: 'split', label: 'Split', onPress: splitAtPlayhead },
    { key: 'volume', icon: 'volume', label: 'Volume', onPress: () => setPanel('volume') },
    { key: 'copy', icon: 'duplicate', label: 'Copy', onPress: duplicateSelected },
    { key: 'delete', icon: 'trash', label: 'Delete', onPress: removeSelected, danger: true },
  ];
  const visualTools: Tool[] = [
    { key: 'split', icon: 'split', label: 'Split', onPress: splitAtPlayhead },
    { key: 'filter', icon: 'filter', label: 'Filter', onPress: () => setPanel('filter') },
    { key: 'fx', icon: 'fx', label: 'FX', onPress: () => setPanel('fx') },
    { key: 'motion', icon: 'motion', label: 'Motion', onPress: () => setPanel('motion') },
    { key: 'speed', icon: 'speed', label: 'Speed', onPress: () => setPanel('speed') },
    { key: 'volume', icon: 'volume', label: 'Volume', onPress: () => setPanel('volume') },
    { key: 'pip', icon: 'fullscreen', label: 'PiP', onPress: togglePiP },
    { key: 'up', icon: 'chevronUp', label: 'Up', onPress: () => moveSelectedLayer(1) },
    { key: 'down', icon: 'chevronDown', label: 'Down', onPress: () => moveSelectedLayer(-1) },
    { key: 'opacity', icon: 'opacity', label: 'Opacity', soon: true },
    { key: 'copy', icon: 'duplicate', label: 'Copy', onPress: duplicateSelected },
    { key: 'delete', icon: 'trash', label: 'Delete', onPress: removeSelected, danger: true },
  ];
  const bottomTools: Tool[] = selectedIsText
    ? textTools
    : selectedIsAudio
      ? audioTools
      : selected && selectedIsVisual
        ? visualTools
        : base;

  return (
    <View style={styles.root}>
      {/* Top bar */}
      <View style={styles.topbar}>
        <View style={styles.topGroup}>
          <Pressable onPress={closeEditor} hitSlop={10}>
            <VIcon name="back" size={24} color="#fff" />
          </Pressable>
          <Pressable onPress={() => soonAlert('Help')} hitSlop={10}>
            <VIcon name="help" size={22} color={vela.muted} />
          </Pressable>
        </View>

        <Pressable style={styles.ratioChip} onPress={() => setPanel('settings')} hitSlop={8}>
          <VIcon name="frame" size={18} color="#fff" />
          <Text style={styles.ratioChipText}>{ratioLabel(project.width, project.height)}</Text>
          <VIcon name="chevronDown" size={14} color="#fff" />
        </Pressable>

        <View style={styles.topGroup}>
          <Pressable onPress={() => setPanel('editmenu')} hitSlop={10}>
            <VIcon name="dots" size={22} color="#fff" />
          </Pressable>
          <Pressable style={styles.saveTile} onPress={() => Alert.alert('Saved', 'Your project saves automatically.')}>
            <VIcon name="save" size={19} color="#fff" />
          </Pressable>
          <Pressable style={styles.exportTile} onPress={() => setPanel('export')}>
            <VIcon name="export" size={19} color="#fff" />
          </Pressable>
        </View>
      </View>

      {/* Preview (tap to deselect — hides the selection action bar) */}
      <Pressable style={styles.stage} onPress={() => selected && select(null)}>
        <View style={[styles.whiteFrame, { width: iw + 14, height: ih + 14 }]}>
          <Preview width={iw} height={ih} />
        </View>
        <Pressable style={styles.fullscreenBtn} onPress={() => soonAlert('Fullscreen')}>
          <VIcon name="fullscreen" size={18} color="#fff" />
        </Pressable>
      </Pressable>

      {/* Transport */}
      <View style={styles.transport}>
        <Text style={styles.tc}>
          {playheadSec.toFixed(2)}
          <Text style={styles.tcDim}>s / {dur.toFixed(2)}s</Text>
        </Text>
        <View style={styles.transportBtns}>
          <Pressable onPress={() => setPlayhead(0)} hitSlop={12}>
            <VIcon name="prev" size={18} color="#fff" />
          </Pressable>
          <Pressable onPress={() => setPlaying(!isPlaying)} hitSlop={12}>
            <VIcon name={isPlaying ? 'pause' : 'play'} size={24} color="#fff" />
          </Pressable>
          <Pressable onPress={() => setPlayhead(dur)} hitSlop={12}>
            <VIcon name="next" size={18} color="#fff" />
          </Pressable>
        </View>
        <View style={styles.transportRight}>
          <Pressable onPress={() => setPanel('prefs')} hitSlop={10}>
            <VIcon name="prefs" size={20} color="#fff" />
          </Pressable>
          <Pressable onPress={() => soonAlert('Undo')} hitSlop={8}>
            <VIcon d="M9 14l-4-4 4-4M5 10h7a5 5 0 015 5v1" size={19} color={vela.muted2} />
          </Pressable>
          <Pressable onPress={() => soonAlert('Redo')} hitSlop={8}>
            <VIcon d="M15 14l4-4-4-4M19 10h-7a5 5 0 00-5 5v1" size={19} color={vela.muted2} />
          </Pressable>
        </View>
      </View>

      {/* Timeline (with the floating selection action bar over its top) */}
      <View style={styles.timelineWrap}>
        <Timeline />
        <SelectionActionBar />
      </View>

      {/* Bottom tool rail */}
      <View style={styles.toolbar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbarContent}>
          {bottomTools.map((t) => (
            <ToolButton key={t.key} tool={t} />
          ))}
        </ScrollView>
      </View>

      {/* Sheets + export progress */}
      <EditorSheets />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: vela.editorBg, paddingTop: 56 },

  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 4, paddingBottom: 8 },
  topGroup: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  ratioChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratioChipText: { color: '#fff', fontFamily: font.semibold, fontSize: 15 },
  saveTile: { width: 42, height: 36, borderRadius: 10, backgroundColor: vela.saveTile, alignItems: 'center', justifyContent: 'center' },
  exportTile: { width: 42, height: 36, borderRadius: 10, backgroundColor: vela.accent, alignItems: 'center', justifyContent: 'center' },

  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  whiteFrame: { backgroundColor: '#fff', borderRadius: 6, padding: 7 },
  fullscreenBtn: { position: 'absolute', right: 24, bottom: 6, width: 34, height: 34, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },

  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingVertical: 6 },
  tc: { fontFamily: mono.regular, fontSize: 13, color: '#fff' },
  tcDim: { color: vela.muted2 },
  transportBtns: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  transportRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },

  timelineWrap: { position: 'relative' },

  toolbar: { borderTopWidth: 1, borderTopColor: vela.toolbarBorder, backgroundColor: vela.toolbar },
  toolbarContent: { paddingVertical: 14, paddingHorizontal: 8, paddingBottom: 22 },
  tool: { width: 66, alignItems: 'center', gap: 7 },
  toolLabel: { color: vela.textLight2, fontSize: 12, fontFamily: font.medium },
  soonTag: { position: 'absolute', top: -4, right: 8, backgroundColor: vela.card2, borderRadius: 5, paddingHorizontal: 4, paddingVertical: 1 },
  soonTagText: { color: vela.muted2, fontSize: 8, fontFamily: font.bold },
});
