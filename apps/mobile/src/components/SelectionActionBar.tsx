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
 * - It does not sit on anything. Vertically it clears the timeline AND the
 *   transport row above it, which took two goes: dropping it on the selected
 *   clip's own lane buries three other lanes; the first fix cleared the lanes
 *   but landed on the play button, the timecode and undo. Clearing both means
 *   it can only overlap the very bottom edge of the picture, which is the one
 *   thing on this screen nothing is ever read from.
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
import { font } from "../constants";
import { laneColors } from "./laneColors";
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

/**
 * One slot per action: icon, then its label under it.
 *
 * The labels were dropped once, for a real reason — there is about 80pt between
 * the bottom of the preview and the top of the timeline, the transport sits in
 * the middle of it, and a taller bar has to go somewhere. They are back because
 * an icon alone is a guess, and the room comes from the only direction that
 * costs nothing: UP, into the letterboxed bottom edge of the picture, which is
 * the one part of this screen nothing is ever read from. The bar still clears
 * the transport, because `liftBy` is measured rather than assumed.
 *
 * The geometry is the one the timeline's gap HUD already proves at this size: a
 * 19pt icon, a 3pt gap, a 10pt label.
 */
const ITEM_W = 56;
const EDGE = 8;
const ICON = 19;
const LABEL_H = 12;
/**
 * The bar's exact height: the icon, the gap under it, one line of label, 8pt of
 * padding either side, and its 1pt border top and bottom. Stated as a constant
 * because it is what lifts the bar clear of the timeline, and a wrong number
 * here does not merely misalign the bar — it puts it back on top of the lanes.
 *
 * A percentage (`bottom: '100%'`) would express the same intent without the
 * magic number, but the bar is absolutely positioned and so contributes no
 * height to measure against.
 */
const BAR_H = ICON + 3 + LABEL_H + 16 + 2;

export function SelectionActionBar({ liftBy = 0 }: { liftBy?: number }) {
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
  /*
   * The bar wears the colour of the lane it came from, read from the same
   * registry the strip below it reads. That is the whole point of the registry
   * existing: a bar that says "music" while the clip under it says something
   * else is worse than no colour at all.
   */
  const lane = laneColors(
    isText ? "text" : isAudio ? "audio" : "visual",
    isMainVisual,
  );

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
  /**
   * On every kind of element, because entrance and exit animation is the one
   * thing in this bar that genuinely applies to all of them — a clip, a
   * sticker, a PiP and a caption all carry `animateIn`/`animateOut`.
   */
  const animate: Action = {
    key: "anim",
    icon: "motion",
    label: "Animate",
    a11y: "Entrance and exit animation",
    onPress: () => setPanel("anim"),
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
        key: "color",
        icon: "color",
        label: "Colour",
        onPress: () => setPanel("textedit-color"),
      },
      animate,
      dup,
      del,
    ];
  } else if (isAudio) {
    actions = [
      {
        key: "audio",
        icon: "audio",
        label: "Edit",
        a11y: "Edit audio",
        onPress: () => setPanel("audioclip"),
      },
      {
        key: "volume",
        icon: "volume",
        label: "Volume",
        onPress: () => setPanel("volume"),
      },
      // No Curve here. Edit opens `AudioClipSheet`, which owns fade in, fade
      // out and the handoff to the curve editor — so a second entry point sat
      // beside it offering the harder half of what it already does.
      split,
      dup,
      del,
    ];
  } else if (!isMainVisual) {
    // A sticker or PiP on an overlay track: how it sits on the canvas is the
    // whole point of it, so placement leads.
    actions = [
      {
        key: "position",
        icon: "position",
        label: "Position",
        onPress: () => setPanel("position"),
      },
      {
        key: "opacity",
        icon: "opacity",
        label: "Opacity",
        onPress: () => setPanel("opacity"),
      },
      {
        key: "blend",
        icon: "blending",
        label: "Blend",
        onPress: () => setPanel("blend"),
      },
      animate,
      dup,
      del,
    ];
  } else if (visual?.type === "image") {
    // A still has no sound and no speed; Ken Burns is what gives it life.
    actions = [
      split,
      {
        key: "filter",
        icon: "filter",
        label: "Filter",
        onPress: () => setPanel("filter"),
      },
      {
        key: "motion",
        icon: "motion",
        label: "Motion",
        onPress: () => setPanel("motion"),
      },
      animate,
      dup,
      del,
    ];
  } else {
    actions = [
      split,
      {
        key: "volume",
        icon: "volume",
        label: "Volume",
        onPress: () => setPanel("volume"),
      },
      {
        key: "filter",
        icon: "filter",
        label: "Filter",
        onPress: () => setPanel("filter"),
      },
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
      <View
        style={[
          styles.bar,
          // Clear of the timeline AND of the transport row above it. `liftBy`
          // is the transport's MEASURED height rather than a guess, because
          // being a few points short here does not look slightly wrong — it
          // puts the bar back on top of the play button.
          {
            left,
            width: barW,
            top: -(BAR_H + 8 + liftBy),
            backgroundColor: lane.key,
            borderColor: lane.body,
          },
        ]}
      >
        {actions.map((a) => (
          <Pressable
            key={a.key}
            accessibilityRole="button"
            accessibilityLabel={a.a11y ?? a.label}
            style={styles.item}
            onPress={a.onPress}
          >
            <VIcon
              name={a.icon}
              size={ICON}
              color={lane.onKey}
              strokeWidth={1.7}
            />
            <Text numberOfLines={1} style={[styles.label, { color: lane.onKey }]}>
              {a.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Anchored to the timeline's TOP EDGE, with the bar itself lifted entirely
  // above it. It used to sit at -22, which cleared nothing: the bar is 56 tall,
  // so two thirds of it hung over the ruler and the first lane and buried the
  // music track it was supposed to be describing.
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
  },
  bar: {
    position: "absolute",
    flexDirection: "row",
    paddingHorizontal: 2,
    paddingVertical: 9,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    // Fill and edge are tinted per lane at the call site. The shadow is not:
    // it is one direction and nearly black, so it reads as the same lift under
    // all five hues instead of five differently-coloured smears.
    boxShadow: "0 5px 13px rgba(6,5,20,0.42)",
  },
  item: {
    width: ITEM_W,
    height: BAR_H - 2,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  label: { fontSize: 10, fontFamily: font.semibold },
});
