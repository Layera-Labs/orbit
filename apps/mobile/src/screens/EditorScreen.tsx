/**
 * Editor screen — Vela skin. Top bar (back · help · ratio chip · ⋯ · Save ·
 * Export), a white-framed composite preview, a transport row, the Vela timeline,
 * and the bottom tool rail. Tools we have wire to real actions; everything else
 * is tagged "soon". Sheets (settings, project menu, insert, audio, prefs,
 * filter, export) live in <EditorSheets/> and open via the store `panel` state.
 */
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const { height: screenH } = useWindowDimensions();
  const [fullscreen, setFullscreen] = useState(false);

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
    { key: 'trim', icon: 'trim', label: 'Trim', onPress: () => setPanel('trim') },
    { key: 'fx', icon: 'fx', label: 'FX', onPress: () => setPanel('fx') },
    { key: 'motion', icon: 'motion', label: 'Motion', onPress: () => setPanel('motion') },
    { key: 'split', icon: 'split', label: 'Split', onPress: splitAtPlayhead, disabled: clipCount === 0 },
    { key: 'cutout', icon: 'cutout', label: 'Cutout', onPress: () => setPanel('cutout') },
    { key: 'quality', icon: 'quality', label: 'Quality', onPress: () => setPanel('settings') },
    { key: 'speed', icon: 'speed', label: 'Speed', onPress: () => setPanel('speed') },
    { key: 'volume', icon: 'volume', label: 'Volume', onPress: () => setPanel('volume') },
  ];
  // Full text toolset (CapCut). Font/Size/Color/Format/Spacing/Style all open
  // the live Text-edit sheet (where those controls live); the rest are real or
  // genuinely not built yet.
  const editText = () => setPanel('textedit');
  const textTools: Tool[] = [
    { key: 'edit', icon: 'pencil', label: 'Edit', onPress: editText },
    { key: 'font', icon: 'font', label: 'Font', onPress: editText },
    { key: 'size', icon: 'fontsize', label: 'Size', onPress: editText },
    { key: 'split', icon: 'split', label: 'Split', onPress: splitAtPlayhead },
    { key: 'delete', icon: 'trash', label: 'Delete', onPress: removeSelected, danger: true },
    { key: 'color', icon: 'color', label: 'Color', onPress: editText },
    { key: 'format', icon: 'format', label: 'Format', onPress: editText },
    { key: 'spacing', icon: 'spacing', label: 'Spacing', onPress: editText },
    { key: 'style', icon: 'style', label: 'Style', onPress: editText },
    { key: 'blending', icon: 'blending', label: 'Blending', onPress: () => setPanel('blend') },
    { key: 'opacity', icon: 'opacity', label: 'Opacity', soon: true },
    { key: 'position', icon: 'position', label: 'Position', soon: true },
    { key: 'mask', icon: 'mask', label: 'Mask', onPress: () => setPanel('mask') },
    { key: 'copy', icon: 'duplicate', label: 'Copy', onPress: duplicateSelected },
  ];
  const audioTools: Tool[] = [
    { key: 'split', icon: 'split', label: 'Split', onPress: splitAtPlayhead },
    { key: 'volume', icon: 'volume', label: 'Volume', onPress: () => setPanel('volume') },
    { key: 'curve', icon: 'curve', label: 'Curve', onPress: () => setPanel('curve') },
    { key: 'copy', icon: 'duplicate', label: 'Copy', onPress: duplicateSelected },
    { key: 'delete', icon: 'trash', label: 'Delete', onPress: removeSelected, danger: true },
  ];
  const visualTools: Tool[] = [
    { key: 'split', icon: 'split', label: 'Split', onPress: splitAtPlayhead },
    { key: 'trim', icon: 'trim', label: 'Trim', onPress: () => setPanel('trim') },
    { key: 'filter', icon: 'filter', label: 'Filter', onPress: () => setPanel('filter') },
    { key: 'fx', icon: 'fx', label: 'FX', onPress: () => setPanel('fx') },
    { key: 'motion', icon: 'motion', label: 'Motion', onPress: () => setPanel('motion') },
    { key: 'keyframe', icon: 'keyframe', label: 'Keyframe', onPress: () => setPanel('keyframe') },
    { key: 'cutout', icon: 'cutout', label: 'Cutout', onPress: () => setPanel('cutout') },
    { key: 'mask', icon: 'mask', label: 'Mask', onPress: () => setPanel('mask') },
    { key: 'blending', icon: 'blending', label: 'Blend', onPress: () => setPanel('blend') },
    { key: 'speed', icon: 'speed', label: 'Speed', onPress: () => setPanel('speed') },
    { key: 'volume', icon: 'volume', label: 'Volume', onPress: () => setPanel('volume') },
    { key: 'curve', icon: 'curve', label: 'Curve', onPress: () => setPanel('curve') },
    { key: 'pip', icon: 'fullscreen', label: 'PiP', onPress: togglePiP },
    { key: 'position', icon: 'position', label: 'Position', onPress: () => setPanel('position') },
    { key: 'up', icon: 'chevronUp', label: 'Up', onPress: () => moveSelectedLayer(1) },
    { key: 'down', icon: 'chevronDown', label: 'Down', onPress: () => moveSelectedLayer(-1) },
    { key: 'opacity', icon: 'opacity', label: 'Opacity', onPress: () => setPanel('opacity') },
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
        </View>

        <Pressable style={styles.ratioChip} onPress={() => setPanel('settings')} hitSlop={8}>
          <VIcon name="frame" size={18} color="#fff" />
          <Text style={styles.ratioChipText}>{ratioLabel(project.width, project.height)}</Text>
          <VIcon name="chevronDown" size={14} color="#fff" />
        </Pressable>

        <View style={styles.topGroup}>
          {/* AI is the singular gold accent and the headline action — first in the cluster. */}
          <Pressable style={styles.aiTile} onPress={() => setPanel('ai')}>
            <VIcon name="fx" size={17} color={vela.onAccent} strokeWidth={2} />
            <Text style={styles.aiTileText}>AI</Text>
          </Pressable>
          <Pressable style={styles.saveTile} onPress={() => Alert.alert('Saved', 'Your project saves automatically.')}>
            <VIcon name="save" size={19} color="#fff" />
          </Pressable>
          <Pressable style={styles.saveTile} onPress={() => setPanel('export')}>
            <VIcon name="export" size={19} color="#fff" />
          </Pressable>
          <Pressable onPress={() => setPanel('editmenu')} hitSlop={10}>
            <VIcon name="dots" size={22} color="#fff" />
          </Pressable>
        </View>
      </View>

      {/* Preview (tap to deselect — hides the selection action bar) */}
      <Pressable style={styles.stage} onPress={() => selected && select(null)}>
        <View style={[styles.whiteFrame, { width: iw + 14, height: ih + 14 }, project.hdr && styles.hdrGlow]}>
          <View style={{ width: iw, height: ih }}>
            <Preview width={iw} height={ih} />
            {project.hdr ? <View pointerEvents="none" style={styles.hdrSheen} /> : null}
          </View>
        </View>
        <Pressable style={styles.fullscreenBtn} onPress={() => setFullscreen(true)}>
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
          <Pressable onPress={undo} disabled={!canUndo} hitSlop={8}>
            <VIcon name="undo" size={19} color={canUndo ? '#fff' : vela.muted3} />
          </Pressable>
          <Pressable onPress={redo} disabled={!canRedo} hitSlop={8}>
            <VIcon name="redo" size={19} color={canRedo ? '#fff' : vela.muted3} />
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

      {/* Fullscreen player — hides the timeline, keeps transport controls */}
      <Modal visible={fullscreen} animationType="fade" onRequestClose={() => setFullscreen(false)}>
        <View style={styles.fsRoot}>
          {(() => {
            let fw = screenW;
            let fh = fw / ar;
            if (fh > screenH - 96) {
              fh = screenH - 96;
              fw = fh * ar;
            }
            return <Preview width={fw} height={fh} />;
          })()}
          <Pressable style={styles.fsClose} onPress={() => setFullscreen(false)} hitSlop={12}>
            <VIcon name="close" size={26} color="#fff" />
          </Pressable>
          <View style={styles.fsTransport}>
            <Text style={styles.tc}>
              {playheadSec.toFixed(2)}
              <Text style={styles.tcDim}>s / {dur.toFixed(2)}s</Text>
            </Text>
            <View style={styles.transportBtns}>
              <Pressable onPress={() => setPlayhead(0)} hitSlop={12}><VIcon name="prev" size={20} color="#fff" /></Pressable>
              <Pressable onPress={() => setPlaying(!isPlaying)} hitSlop={12}><VIcon name={isPlaying ? 'pause' : 'play'} size={30} color="#fff" /></Pressable>
              <Pressable onPress={() => setPlayhead(dur)} hitSlop={12}><VIcon name="next" size={20} color="#fff" /></Pressable>
            </View>
            <View style={{ width: 64 }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: vela.editorBg, paddingTop: 56 },

  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 4, paddingBottom: 8 },
  topGroup: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  ratioChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratioChipText: { color: '#fff', fontFamily: font.semibold, fontSize: 15 },
  saveTile: { width: 42, height: 36, borderRadius: 10, backgroundColor: vela.saveTile, alignItems: 'center', justifyContent: 'center' },
  aiTile: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 36, paddingHorizontal: 13, borderRadius: 10, backgroundColor: vela.accent },
  aiTileText: { color: vela.onAccent, fontFamily: font.bold, fontSize: 14.5 },

  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  whiteFrame: { backgroundColor: '#fff', borderRadius: 6, padding: 7 },
  // HDR on: a soft white bloom around the preview + a faint sheen over it.
  hdrGlow: { shadowColor: '#fff', shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 0 }, elevation: 14 },
  hdrSheen: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 4 },
  fullscreenBtn: { position: 'absolute', right: 24, bottom: 6, width: 34, height: 34, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  fsRoot: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  fsClose: { position: 'absolute', top: 52, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  fsTransport: { position: 'absolute', left: 0, right: 0, bottom: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 },

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
