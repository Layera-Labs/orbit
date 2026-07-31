/**
 * Floating quick-action bar shown over the timeline whenever a clip, caption or
 * sticker is selected.
 *
 * Two things it is deliberately NOT:
 *
 * - It is not one action set for everything. A piece of music has no filter and
 *   a caption has no volume, so each kind of selection gets the actions that
 *   apply to it. The previous version showed the same six buttons for all of
 *   them and used a disabled-with-an-alert state to explain the ones that did
 *   nothing; an action that cannot apply simply is not in the list now.
 * - It is not parked in the middle. It follows the selected clip along the
 *   timeline, so it reads as belonging to that clip rather than to the screen.
 *   Vertically it stays just above the timeline: the timeline root clips its
 *   overflow, and dropping the bar onto the selected lane would bury three
 *   other lanes under it.
 *
 * No enter/exit animation, because the bar MOVES — a slide-in replayed on every
 * reposition reads as broken rather than lively.
 */
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { font, vela } from "../constants";
import { GUTTER_W, PLAYHEAD_X } from "./Timeline";
import { VIcon, type VIconName } from "./VIcon";
import type { VisualTrackClip } from "../model/types";
import { OVERLAY_TRACK, useEditor } from "../store/editorStore";

interface Action {
  key: string;
  icon: VIconName;
  label: string;
  /** Full label for screen readers when `label` is abbreviated to fit. */
  a11y?: string;
  onPress: () => void;
}

/** One slot per action. Six is the widest set, and 6×54 clears an iPhone SE. */
const ITEM_W = 54;
const EDGE = 8;

export function SelectionActionBar() {
  const selected = useEditor((s) => s.selected);
  const project = useEditor((s) => s.project);
  const pxPerSec = useEditor((s) => s.pxPerSec);
  const playheadSec = useEditor((s) => s.playheadSec);
  const rippleDelete = useEditor((s) => s.rippleDelete);
  const removeSelected = useEditor((s) => s.removeSelected);
  const rippleDeleteSelected = useEditor((s) => s.rippleDeleteSelected);
  const duplicateSelected = useEditor((s) => s.duplicateSelected);
  const splitAtPlayhead = useEditor((s) => s.splitAtPlayhead);
  const setPanel = useEditor((s) => s.setPanel);
  const mainTrackId = useEditor((s) => s.mainTrackId);
  const { width: screenW } = useWindowDimensions();

  if (!selected || !project) return null;

  // What is selected, in the terms the action sets are written in.
  const isText = selected.trackId === OVERLAY_TRACK;
  const track = project.tracks?.find((t) => t.id === selected.trackId);
  const clip = track?.clips.find((c) => c.id === selected.clipId);
  const overlay = isText
    ? project.overlays.find((o) => o.id === selected.clipId)
    : undefined;
  if (!isText && !clip) return null;
  if (isText && !overlay) return null;

  const isAudio = track?.kind === "audio";
  const visual = track?.kind === "visual" ? (clip as VisualTrackClip) : null;
  const isMainVisual = !!visual && selected.trackId === mainTrackId();

  const del: Action = {
    key: "delete",
    icon: rippleDelete ? "rippleDelete" : "trash",
    // "Ripple delete" cannot fit a 54pt slot, and a clipped label reads as
    // broken — the distinct icon carries the difference.
    label: rippleDelete ? "Ripple" : "Delete",
    a11y: rippleDelete ? "Ripple delete" : "Delete",
    onPress: rippleDelete ? rippleDeleteSelected : removeSelected,
  };
  const dup: Action = {
    key: "duplicate",
    icon: "duplicate",
    label: "Duplicate",
    onPress: duplicateSelected,
  };
  const split: Action = {
    key: "split",
    icon: "split",
    label: "Split",
    onPress: splitAtPlayhead,
  };
  const keyframe: Action = {
    key: "keyframe",
    icon: "keyframe",
    label: "Keyframe",
    onPress: () => setPanel("keyframe"),
  };

  let actions: Action[];
  if (isText) {
    actions = [
      { key: "edit", icon: "pencil", label: "Edit", onPress: () => setPanel("textedit") },
      { key: "font", icon: "font", label: "Font", onPress: () => setPanel("textedit-font") },
      { key: "color", icon: "color", label: "Colour", onPress: () => setPanel("textedit-color") },
      dup,
      del,
    ];
  } else if (isAudio) {
    actions = [
      { key: "audio", icon: "audio", label: "Edit", a11y: "Edit audio", onPress: () => setPanel("audioclip") },
      { key: "volume", icon: "volume", label: "Volume", onPress: () => setPanel("volume") },
      { key: "curve", icon: "curve", label: "Curve", onPress: () => setPanel("curve") },
      split,
      dup,
      del,
    ];
  } else if (!isMainVisual) {
    // A sticker or PiP on an overlay track: how it sits on the canvas is the
    // whole point of it, so placement leads.
    actions = [
      { key: "position", icon: "position", label: "Position", onPress: () => setPanel("position") },
      { key: "opacity", icon: "opacity", label: "Opacity", onPress: () => setPanel("opacity") },
      { key: "blend", icon: "blending", label: "Blend", onPress: () => setPanel("blend") },
      keyframe,
      dup,
      del,
    ];
  } else if (visual?.type === "image") {
    // A still has no sound and no speed; Ken Burns is what gives it life.
    actions = [
      split,
      { key: "filter", icon: "filter", label: "Filter", onPress: () => setPanel("filter") },
      { key: "motion", icon: "motion", label: "Motion", onPress: () => setPanel("motion") },
      keyframe,
      dup,
      del,
    ];
  } else {
    actions = [
      split,
      { key: "volume", icon: "volume", label: "Volume", onPress: () => setPanel("volume") },
      { key: "filter", icon: "filter", label: "Filter", onPress: () => setPanel("filter") },
      keyframe,
      dup,
      del,
    ];
  }

  /*
   * Follow the clip. Scrolling the timeline IS setting the playhead
   * (Timeline's onScroll), so the scroll offset is playheadSec × pxPerSec and
   * the clip's on-screen centre needs no extra plumbing out of the timeline.
   */
  const start = clip ? clip.start : overlay!.start;
  const duration = clip
    ? clip.duration
    : Math.max(0.1, overlay!.end - overlay!.start);
  const barW = actions.length * ITEM_W + 4;
  const centre =
    GUTTER_W + PLAYHEAD_X + (start + duration / 2 - playheadSec) * pxPerSec;
  const left = Math.max(
    EDGE,
    Math.min(screenW - barW - EDGE, centre - barW / 2),
  );

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={[styles.bar, { left, width: barW }]}>
        {actions.map((a) => (
          <Pressable
            key={a.key}
            accessibilityRole="button"
            accessibilityLabel={a.a11y ?? a.label}
            style={styles.item}
            onPress={a.onPress}
          >
            <VIcon name={a.icon} size={18} color="#fff" strokeWidth={1.7} />
            <Text numberOfLines={1} style={styles.label}>
              {a.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: -22,
    left: 0,
    right: 0,
    zIndex: 30,
  },
  bar: {
    position: "absolute",
    flexDirection: "row",
    paddingHorizontal: 2,
    paddingVertical: 6,
    backgroundColor: vela.accent,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: vela.accentDim,
    // One direction, tinted to the accent's own dark rather than a black bloom.
    boxShadow: "0 5px 13px rgba(31,22,112,0.38)",
  },
  item: {
    width: ITEM_W,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  label: {
    color: "#fff",
    fontSize: 9,
    fontFamily: font.medium,
    textAlign: "center",
  },
});
