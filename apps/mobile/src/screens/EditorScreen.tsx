/**
 * Editor screen — Vela skin. Top bar (back · help · ratio chip · ⋯ · Save ·
 * Export), the composite preview, a transport row, the Vela timeline,
 * and the bottom tool rail. Every tool on the rail does what it says — the
 * "soon" badge and its alert are gone, and nothing was using them. Sheets
 * (settings, project menu, insert, audio, prefs, filter, export) live in
 * <EditorSheets/> and open via the store `panel` state.
 */
import { useEffect, useRef, useState } from "react";
import {
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
  danger?: boolean;
  disabled?: boolean;
}

const TOOL_WIDTH = 66;

function ToolButton({ tool }: { tool: Tool }) {
  const color = vela.textLight;
  const onPress = tool.onPress;
  const dimmed = tool.disabled;
  return (
    <Pressable style={styles.tool} onPress={onPress} disabled={dimmed}>
      <VIcon
        name={tool.icon}
        size={25}
        color={dimmed ? vela.muted3 : color}
        strokeWidth={1.7}
      />
      <Text style={styles.toolLabel}>{tool.label}</Text>
    </Pressable>
  );
}

export function EditorScreen() {
  const { width: screenW } = useWindowDimensions();
  const project = useEditor((s) => s.project);
  const projectName = useEditor((s) => s.name);
  const selected = useEditor((s) => s.selected);
  const selectedGap = useEditor((s) => s.selectedGap);
  const select = useEditor((s) => s.select);
  const closeEditor = useEditor((s) => s.closeEditor);
  const splitAtPlayhead = useEditor((s) => s.splitAtPlayhead);
  const removeSelected = useEditor((s) => s.removeSelected);
  const rippleDeleteSelected = useEditor((s) => s.rippleDeleteSelected);
  const rippleDelete = useEditor((s) => s.rippleDelete);
  const removeSelectedGap = useEditor((s) => s.removeSelectedGap);
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
  /** Measured, so the selection bar can clear the transport rather than cover it. */
  const [transportH, setTransportH] = useState(0);
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
  const openGapEffect = (panel: "mosaic" | "magnifier") => {
    if (!selectedGap) return;
    const track = tracks.find(
      (item) => item.id === selectedGap.trackId && item.kind === "visual",
    );
    if (!track || track.kind !== "visual") return;
    const next = [...track.clips]
      .sort((a, b) => a.start - b.start)
      .find((clip) => clip.start >= selectedGap.end - 0.001);
    const previous = [...track.clips]
      .sort((a, b) => b.start - a.start)
      .find((clip) => clip.start + clip.duration <= selectedGap.start + 0.001);
    const target = next ?? previous;
    if (!target) return;
    select({ trackId: track.id, clipId: target.id });
    setPanel(panel);
  };

  // Reserve a bounded timeline viewport. Expanded lane groups scroll vertically
  // inside it, so the preview can never be pushed through the fixed top bar.
  const timelineMaxH = Math.min(280, Math.max(220, Math.round(screenH * 0.3)));
  const previewMaxH = Math.max(
    150,
    Math.min(360, screenH - timelineMaxH - 290),
  );

  // Fit the preview into the space left after the header, transport, timeline
  // viewport, and tool rail.
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
  const deleteTool: Tool = {
    key: "delete",
    icon: rippleDelete ? "rippleDelete" : "trash",
    label: rippleDelete ? "Ripple delete" : "Delete",
    onPress: rippleDelete ? rippleDeleteSelected : removeSelected,
    danger: true,
  };
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
    deleteTool,
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
    {
      key: "opacity",
      icon: "opacity",
      label: "Opacity",
      onPress: () => setPanel("opacity"),
    },
    {
      key: "position",
      icon: "position",
      label: "Position",
      onPress: () => setPanel("position"),
    },
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
    deleteTool,
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
      key: "mosaic",
      icon: "grid",
      label: "Mosaic",
      onPress: () => setPanel("mosaic"),
    },
    {
      key: "magnifier",
      icon: "search",
      label: "Magnifier",
      onPress: () => setPanel("magnifier"),
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
    deleteTool,
  ];
  const gapTools: Tool[] = [
    {
      key: "delete-gap",
      icon: "trash",
      label: "Delete gap",
      onPress: removeSelectedGap,
      danger: true,
    },
    {
      key: "mosaic-gap",
      icon: "grid",
      label: "Mosaic",
      onPress: () => openGapEffect("mosaic"),
    },
    {
      key: "magnify-gap",
      icon: "search",
      label: "Magnifier",
      onPress: () => openGapEffect("magnifier"),
    },
    {
      key: "story-gap",
      icon: "list",
      label: "Story",
      onPress: () => setPanel("story"),
    },
  ];
  const bottomTools: Tool[] = selectedGap
    ? gapTools
    : selectedIsText
      ? textTools
      : selectedIsAudio
        ? audioTools
        : selected && selectedIsVisual
          ? visualTools
          : base;
  const bottomToolsFit = bottomTools.length * TOOL_WIDTH + 16 <= screenW;

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

      {/*
        Deliberately a View, not a Pressable.
        
        It used to deselect on press — a second selection path, sitting OUTSIDE
        Gesture Handler's arbitration, so it could fire at the end of a
        low-movement drag on one of the preview's transform handles and tear the
        selection down while the user was mid-edit. `Preview`'s own tap gesture
        already deselects, and it knows what was actually hit.
      */}
      <View style={styles.stage}>
        {/*
          No HDR treatment here. A white bloom and a 7% white wash used to
          appear when the project's HDR flag was on, which was two mistakes at
          once: this screen cannot display HDR, and the sheen made the preview
          genuinely lighter than the file it is meant to predict.
        */}
        {/*
          The picture sits directly on the stage. It used to be matted in a
          solid white card with 7pt of padding, which put the brightest surface
          in the app immediately around the one thing whose brightness is being
          judged — and rounded corners the exported file does not have.

          What replaces it is an edge, not a frame: a hairline one step off the
          background, drawn as an overlay so it costs the canvas no pixels and
          the picture stays exactly `iw × ih`. It exists because a dark clip on
          a dark stage otherwise has no findable boundary.
        */}
        <View style={{ width: iw, height: ih }}>
          <Preview width={iw} height={ih} />
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.stageEdge]}
          />
        </View>
        <Pressable style={styles.fullscreenBtn} onPress={openFullscreen}>
          <VIcon name="fullscreen" size={18} color="#fff" />
        </Pressable>
      </View>

      {/* Transport */}
      <View
        style={styles.transport}
        onLayout={(e) => setTransportH(e.nativeEvent.layout.height)}
      >
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
        {/*
          The bar is lifted clear of the transport as well as the timeline.
          Its height is measured rather than assumed because the transport is
          the row holding play, undo and redo — landing a few points short of
          it does not look slightly off, it makes the play button unreachable
          for as long as a clip is selected.
        */}
        <SelectionActionBar liftBy={transportH} />
      </View>

      {/* Bottom tool rail */}
      <View style={styles.toolbar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[
            styles.toolbarContent,
            bottomToolsFit && styles.toolbarContentCentered,
          ]}
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
  stageEdge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: vela.divider,
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
  toolbarContentCentered: {
    flexGrow: 1,
    justifyContent: "center",
  },
  tool: { width: TOOL_WIDTH, alignItems: "center", gap: 7 },
  toolLabel: { color: vela.textLight2, fontSize: 12, fontFamily: font.medium },
});
