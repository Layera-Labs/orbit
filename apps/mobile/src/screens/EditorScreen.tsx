/**
 * Editor screen — Vela skin. Top bar (back · help · ratio chip · ⋯ · Save ·
 * Export), a white-framed composite preview, a transport row, the Vela timeline,
 * and the bottom tool rail. Tools we have wire to real actions; everything else
 * is tagged "soon". Sheets (settings, project menu, insert, audio, prefs,
 * filter, export) live in <EditorSheets/> and open via the store `panel` state.
 */
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { projectDuration } from "../model/project";
import { font, mono, ratioLabel, vela } from "../constants";
import { VIcon, type VIconName } from "../components/VIcon";
import { Preview } from "../components/Preview";
import { Timeline } from "../components/Timeline";
import { EditorSheets } from "../components/EditorSheets";
import { SelectionActionBar } from "../components/SelectionActionBar";
import { OVERLAY_TRACK, useEditor } from "../store/editorStore";

interface Tool {
  key: string;
  icon: VIconName;
  label: string;
  onPress?: () => void;
  soon?: boolean;
  danger?: boolean;
  disabled?: boolean;
}

const soonAlert = (label: string) =>
  Alert.alert("Coming soon", `${label} is coming soon.`);

function ToolButton({ tool }: { tool: Tool }) {
  const color = tool.soon
    ? vela.muted2
    : tool.danger
      ? vela.danger
      : vela.textLight;
  const onPress = tool.soon ? () => soonAlert(tool.label) : tool.onPress;
  const dimmed = tool.disabled && !tool.soon;
  return (
    <Pressable style={styles.tool} onPress={onPress} disabled={dimmed}>
      <VIcon
        name={tool.icon}
        size={25}
        color={dimmed ? vela.muted3 : color}
        strokeWidth={1.7}
      />
      <Text style={[styles.toolLabel, tool.danger && { color: vela.danger }]}>
        {tool.label}
      </Text>
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
  const projectName = useEditor((s) => s.name);
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
  const addText = useEditor((s) => s.addText);
  const openLibrary = useEditor((s) => s.openLibrary);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const { height: screenH } = useWindowDimensions();
  // Fullscreen player: `fsMounted` keeps the modal alive through its exit
  // animation; `fsAnim` (0→1) drives an expand-in / shrink-out of the player.
  const [fsMounted, setFsMounted] = useState(false);
  const fsAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!fsMounted) return;
    Animated.spring(fsAnim, {
      toValue: 1,
      useNativeDriver: true,
      damping: 26,
      stiffness: 240,
      mass: 1,
      restDisplacementThreshold: 0.4,
      restSpeedThreshold: 4,
    }).start();
  }, [fsMounted, fsAnim]);

  const openFullscreen = () => setFsMounted(true);
  const closeFullscreen = () => {
    Animated.timing(fsAnim, {
      toValue: 0,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setFsMounted(false);
    });
  };

  if (!project) return null;

  const dur = projectDuration(project);
  const tracks = project.tracks ?? [];
  const selectedTrack = selected
    ? tracks.find((t) => t.id === selected.trackId)
    : undefined;
  const selectedIsVisual = selectedTrack?.kind === "visual";
  const selectedIsAudio = selectedTrack?.kind === "audio";
  const selectedIsText = selected?.trackId === OVERLAY_TRACK;

  // Reserve a bounded timeline viewport. Expanded lane groups scroll vertically
  // inside it, so the preview can never be pushed through the fixed top bar.
  const timelineMaxH = Math.min(280, Math.max(220, Math.round(screenH * 0.3)));
  const previewMaxH = Math.max(
    150,
    Math.min(360, screenH - timelineMaxH - 290),
  );

  // Fit the white preview frame (7px white padding all round) into the space
  // left after the header, transport, timeline viewport, and tool rail.
  const ar = project.width / project.height;
  let iw = screenW - 48;
  let ih = iw / ar;
  const maxH = previewMaxH;
  if (ih > maxH) {
    ih = maxH;
    iw = ih * ar;
  }

  // Bottom tool rail. With nothing selected it shows Vela's eight; selecting a
  // clip/overlay REPLACES it with that element's contextual tools (CapCut-style).
  const base: Tool[] = [
    {
      key: "media",
      icon: "image",
      label: "Media",
      onPress: () => setPanel("insert"),
    },
    { key: "text", icon: "text", label: "Text", onPress: addText },
    {
      key: "sticker",
      icon: "sticker",
      label: "Sticker",
      onPress: () => openLibrary("stickers"),
    },
    {
      key: "audio",
      icon: "audio",
      label: "Audio",
      onPress: () => setPanel("audio"),
    },
    {
      key: "effect",
      icon: "effects",
      label: "Effect",
      onPress: () => setPanel("fx"),
    },
    {
      key: "more",
      icon: "dots",
      label: "More",
      onPress: () => setPanel("editmenu"),
    },
  ];
  // Full text toolset (CapCut). Font/Size/Color/Format/Spacing/Style all open
  // the live Text-edit sheet (where those controls live); the rest are real or
  // genuinely not built yet.
  const textTools: Tool[] = [
    {
      key: "edit",
      icon: "pencil",
      label: "Edit",
      onPress: () => setPanel("textedit"),
    },
    {
      key: "font",
      icon: "font",
      label: "Font",
      onPress: () => setPanel("textedit-font"),
    },
    {
      key: "size",
      icon: "fontsize",
      label: "Size",
      onPress: () => setPanel("textedit-size"),
    },
    { key: "split", icon: "split", label: "Split", onPress: splitAtPlayhead },
    {
      key: "delete",
      icon: "trash",
      label: "Delete",
      onPress: removeSelected,
      danger: true,
    },
    {
      key: "color",
      icon: "color",
      label: "Color",
      onPress: () => setPanel("textedit-color"),
    },
    {
      key: "format",
      icon: "format",
      label: "Format",
      onPress: () => setPanel("textedit"),
    },
    {
      key: "spacing",
      icon: "spacing",
      label: "Spacing",
      onPress: () => setPanel("textedit-size"),
    },
    {
      key: "style",
      icon: "style",
      label: "Style",
      onPress: () => setPanel("textedit-stroke"),
    },
    {
      key: "blending",
      icon: "blending",
      label: "Blending",
      onPress: () => setPanel("blend"),
    },
    { key: "opacity", icon: "opacity", label: "Opacity", soon: true },
    { key: "position", icon: "position", label: "Position", soon: true },
    {
      key: "mask",
      icon: "mask",
      label: "Mask",
      onPress: () => setPanel("mask"),
    },
    {
      key: "copy",
      icon: "duplicate",
      label: "Copy",
      onPress: duplicateSelected,
    },
  ];
  const audioTools: Tool[] = [
    { key: "split", icon: "split", label: "Split", onPress: splitAtPlayhead },
    {
      key: "volume",
      icon: "volume",
      label: "Volume",
      onPress: () => setPanel("volume"),
    },
    {
      key: "curve",
      icon: "curve",
      label: "Curve",
      onPress: () => setPanel("curve"),
    },
    {
      key: "copy",
      icon: "duplicate",
      label: "Copy",
      onPress: duplicateSelected,
    },
    {
      key: "delete",
      icon: "trash",
      label: "Delete",
      onPress: removeSelected,
      danger: true,
    },
  ];
  const visualTools: Tool[] = [
    { key: "split", icon: "split", label: "Split", onPress: splitAtPlayhead },
    {
      key: "trim",
      icon: "trim",
      label: "Trim",
      onPress: () => setPanel("trim"),
    },
    {
      key: "filter",
      icon: "filter",
      label: "Filter",
      onPress: () => setPanel("filter"),
    },
    { key: "fx", icon: "fx", label: "FX", onPress: () => setPanel("fx") },
    {
      key: "motion",
      icon: "motion",
      label: "Motion",
      onPress: () => setPanel("motion"),
    },
    {
      key: "keyframe",
      icon: "keyframe",
      label: "Keyframe",
      onPress: () => setPanel("keyframe"),
    },
    {
      key: "cutout",
      icon: "cutout",
      label: "Cutout",
      onPress: () => setPanel("cutout"),
    },
    {
      key: "mask",
      icon: "mask",
      label: "Mask",
      onPress: () => setPanel("mask"),
    },
    {
      key: "blending",
      icon: "blending",
      label: "Blend",
      onPress: () => setPanel("blend"),
    },
    {
      key: "speed",
      icon: "speed",
      label: "Speed",
      onPress: () => setPanel("speed"),
    },
    {
      key: "volume",
      icon: "volume",
      label: "Volume",
      onPress: () => setPanel("volume"),
    },
    {
      key: "curve",
      icon: "curve",
      label: "Curve",
      onPress: () => setPanel("curve"),
    },
    { key: "pip", icon: "fullscreen", label: "PiP", onPress: togglePiP },
    {
      key: "position",
      icon: "position",
      label: "Position",
      onPress: () => setPanel("position"),
    },
    {
      key: "up",
      icon: "chevronUp",
      label: "Up",
      onPress: () => moveSelectedLayer(1),
    },
    {
      key: "down",
      icon: "chevronDown",
      label: "Down",
      onPress: () => moveSelectedLayer(-1),
    },
    {
      key: "opacity",
      icon: "opacity",
      label: "Opacity",
      onPress: () => setPanel("opacity"),
    },
    {
      key: "copy",
      icon: "duplicate",
      label: "Copy",
      onPress: duplicateSelected,
    },
    {
      key: "delete",
      icon: "trash",
      label: "Delete",
      onPress: removeSelected,
      danger: true,
    },
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
        <View style={styles.projectGroup}>
          <Pressable onPress={closeEditor} hitSlop={10}>
            <VIcon name="back" size={24} color="#fff" />
          </Pressable>
          <Pressable
            style={styles.projectNameButton}
            onPress={() => setPanel("editmenu")}
          >
            <Text style={styles.projectName} numberOfLines={1}>
              {projectName || "New Project"}
            </Text>
            <VIcon name="chevronDown" size={13} color={vela.textLight2} />
          </Pressable>
        </View>

        <View style={styles.topGroup}>
          <Pressable
            style={styles.resolutionChip}
            onPress={() => setPanel("settings")}
          >
            <Text style={styles.resolutionText}>
              {ratioLabel(project.width, project.height)}
            </Text>
            <VIcon name="chevronDown" size={11} color={vela.textLight2} />
          </Pressable>
          <Pressable
            style={styles.exportTile}
            onPress={() => setPanel("export")}
          >
            <Text style={styles.exportTileText}>Export</Text>
          </Pressable>
        </View>
      </View>

      {/* Preview (tap to deselect — hides the selection action bar) */}
      <Pressable style={styles.stage} onPress={() => selected && select(null)}>
        <View
          style={[
            styles.whiteFrame,
            { width: iw + 14, height: ih + 14 },
            project.hdr && styles.hdrGlow,
          ]}
        >
          <View style={{ width: iw, height: ih }}>
            <Preview width={iw} height={ih} />
            {project.hdr ? (
              <View pointerEvents="none" style={styles.hdrSheen} />
            ) : null}
          </View>
        </View>
        <Pressable style={styles.fullscreenBtn} onPress={openFullscreen}>
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
            <VIcon name={isPlaying ? "pause" : "play"} size={24} color="#fff" />
          </Pressable>
          <Pressable onPress={() => setPlayhead(dur)} hitSlop={12}>
            <VIcon name="next" size={18} color="#fff" />
          </Pressable>
        </View>
        <View style={styles.transportRight}>
          <Pressable onPress={() => setPanel("prefs")} hitSlop={10}>
            <VIcon name="prefs" size={20} color="#fff" />
          </Pressable>
          <Pressable onPress={undo} disabled={!canUndo} hitSlop={8}>
            <VIcon
              name="undo"
              size={19}
              color={canUndo ? "#fff" : vela.muted3}
            />
          </Pressable>
          <Pressable onPress={redo} disabled={!canRedo} hitSlop={8}>
            <VIcon
              name="redo"
              size={19}
              color={canRedo ? "#fff" : vela.muted3}
            />
          </Pressable>
        </View>
      </View>

      {/* Timeline (with the floating selection action bar over its top) */}
      <View style={[styles.timelineWrap, { maxHeight: timelineMaxH }]}>
        <Timeline maxHeight={timelineMaxH} />
        <SelectionActionBar />
      </View>

      {/* Bottom tool rail */}
      <View style={styles.toolbar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.toolbarContent}
        >
          {bottomTools.map((t) => (
            <ToolButton key={t.key} tool={t} />
          ))}
        </ScrollView>
      </View>

      {/* Sheets + export progress */}
      <EditorSheets />

      {/* Fullscreen player — expands over the editor, keeps transport controls */}
      <Modal
        visible={fsMounted}
        transparent
        statusBarTranslucent
        animationType="none"
        onRequestClose={closeFullscreen}
      >
        <Animated.View
          style={[
            styles.fsRoot,
            {
              opacity: fsAnim,
              transform: [
                {
                  scale: fsAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.9, 1],
                    extrapolate: "clamp",
                  }),
                },
              ],
            },
          ]}
        >
          {(() => {
            let fw = screenW;
            let fh = fw / ar;
            if (fh > screenH - 96) {
              fh = screenH - 96;
              fw = fh * ar;
            }
            return <Preview width={fw} height={fh} />;
          })()}
          <View style={styles.fsTransport}>
            <Text style={styles.tc}>
              {playheadSec.toFixed(2)}
              <Text style={styles.tcDim}>s / {dur.toFixed(2)}s</Text>
            </Text>
            <View style={styles.transportBtns}>
              <Pressable onPress={() => setPlayhead(0)} hitSlop={12}>
                <VIcon name="prev" size={20} color="#fff" />
              </Pressable>
              <Pressable onPress={() => setPlaying(!isPlaying)} hitSlop={12}>
                <VIcon
                  name={isPlaying ? "pause" : "play"}
                  size={30}
                  color="#fff"
                />
              </Pressable>
              <Pressable onPress={() => setPlayhead(dur)} hitSlop={12}>
                <VIcon name="next" size={20} color="#fff" />
              </Pressable>
            </View>
            <Pressable
              style={styles.fsExit}
              onPress={closeFullscreen}
              hitSlop={12}
            >
              <VIcon name="fullscreenExit" size={22} color="#fff" />
            </Pressable>
          </View>
        </Animated.View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: vela.editorBg, paddingTop: 56 },

  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 8,
  },
  topGroup: { flexDirection: "row", alignItems: "center", gap: 8 },
  projectGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  projectNameButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minWidth: 0,
    maxWidth: 128,
  },
  projectName: {
    color: "#fff",
    fontFamily: font.semibold,
    fontSize: 13.5,
    flexShrink: 1,
  },
  resolutionChip: {
    height: 34,
    borderRadius: 10,
    backgroundColor: vela.saveTile,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
  },
  resolutionText: {
    color: vela.textLight,
    fontFamily: font.bold,
    fontSize: 10.5,
  },
  exportTile: {
    height: 34,
    borderRadius: 10,
    backgroundColor: vela.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 13,
  },
  exportTileText: { color: "#fff", fontFamily: font.bold, fontSize: 12.5 },

  stage: {
    flex: 1,
    minHeight: 150,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
  },
  whiteFrame: { backgroundColor: "#fff", borderRadius: 6, padding: 7 },
  // HDR on: a soft white bloom around the preview + a faint sheen over it.
  hdrGlow: {
    shadowColor: "#fff",
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 14,
  },
  hdrSheen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 4,
  },
  fullscreenBtn: {
    position: "absolute",
    right: 24,
    bottom: 6,
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  fsRoot: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  fsExit: { minWidth: 64, alignItems: "flex-end", justifyContent: "center" },
  fsTransport: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
  },

  transport: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingVertical: 6,
  },
  tc: { fontFamily: mono.regular, fontSize: 13, color: "#fff" },
  tcDim: { color: vela.muted2 },
  transportBtns: { flexDirection: "row", alignItems: "center", gap: 24 },
  transportRight: { flexDirection: "row", alignItems: "center", gap: 16 },

  timelineWrap: { position: "relative" },

  toolbar: {
    borderTopWidth: 1,
    borderTopColor: vela.toolbarBorder,
    backgroundColor: vela.toolbar,
  },
  toolbarContent: {
    paddingVertical: 14,
    paddingHorizontal: 8,
    paddingBottom: 22,
  },
  tool: { width: 66, alignItems: "center", gap: 7 },
  toolLabel: { color: vela.textLight2, fontSize: 12, fontFamily: font.medium },
  soonTag: {
    position: "absolute",
    top: -4,
    right: 8,
    backgroundColor: vela.card2,
    borderRadius: 5,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  soonTagText: { color: vela.muted2, fontSize: 8, fontFamily: font.bold },
});
