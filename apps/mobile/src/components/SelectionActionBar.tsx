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
 * - It is not parked in the middle. It follows the selected clip in BOTH axes:
 *   along the timeline to the clip's centre, and up or down to the lane the
 *   clip lives on. It used to be lifted clear of the whole timeline, which put
 *   the bar for a clip on the fourth lane at the very top of the screen with
 *   nothing connecting the two. Sitting one row off its own lane says which
 *   lane it belongs to without a line drawn between them.
 * - It is not on its own clip. Above the lane if there is room above it, below
 *   it otherwise — so the top lane pushes the bar down rather than covering
 *   the clip you just selected, or climbing onto the transport.
 *
 * It is rendered INSIDE the timeline's vertical scroller, so it travels with
 * the lanes for free. Positioning it from the outside would mean plumbing that
 * scroll offset back out, and the bar would drift off its lane every time the
 * lanes moved under it.
 *
 * No enter/exit animation, because the bar MOVES — a slide-in replayed on every
 * reposition reads as broken rather than lively.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { font } from "../constants";
import { laneColors } from "./laneColors";
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
 * Deliberately tight. The bar now lands one row off its own lane rather than
 * above the whole timeline, so every point of its height covers a neighbouring
 * lane — the padding is 4pt a side, not the 9 it carried when it floated in
 * open space above everything. Icon and label keep the sizes the timeline's gap
 * HUD already proves; what came off is the air around them.
 */
const ITEM_W = 54;
const EDGE = 8;
const ICON = 18;
const LABEL_H = 11;
const PAD_V = 4;
/** One slot: the icon, the gap under it, and one line of label. */
const ITEM_H = ICON + 2 + LABEL_H;
/**
 * The bar's exact height: a slot, the padding either side of it, and its 1pt
 * border top and bottom. Stated as a constant because it is what places the bar
 * against its lane, and a wrong number here does not merely misalign it — it
 * drops the bar onto the clip it describes.
 *
 * A percentage would express the same intent without the magic number, but the
 * bar is absolutely positioned and so contributes no height to measure against.
 * `ITEM_H` is therefore the SLOT's height and not `BAR_H - 2`: the slot sits
 * inside the padding, so deriving one from the other double-counted it and made
 * the bar 8pt taller than the number placing it.
 */
const BAR_H = ITEM_H + PAD_V * 2 + 2;
/** Clearance between the bar and the lane it belongs to. */
const LANE_GAP = 5;

export interface SelectionActionBarProps {
  /** Top of the selected clip's lane, in the timeline scroll area's own space. */
  laneTop: number;
  /** Width of the scroll area, for clamping the bar inside it. */
  width: number;
  /** x of time zero in that same space (the timeline's playhead offset). */
  originX: number;
}

export function SelectionActionBar({
  laneTop,
  width,
  originX,
}: SelectionActionBarProps) {
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

  if (!selected || !project) return null;

  // What is selected, in the terms the action sets are written in.
  const isOverlay = selected.trackId === OVERLAY_TRACK;
  const track = project.tracks?.find((t) => t.id === selected.trackId);
  const clip = track?.clips.find((c) => c.id === selected.clipId);
  const overlay = isOverlay
    ? project.overlays.find((o) => o.id === selected.clipId)
    : undefined;
  if (!isOverlay && !clip) return null;
  if (isOverlay && !overlay) return null;
  /*
   * The overlay lane holds captions AND pictures now, so "on the overlay track"
   * stopped being the same question as "is it text". It matters: the text set
   * opens Font and Colour sheets, which read `fontSize` and `color` off the
   * selection — on a sticker those are not there, and the sheets would come up
   * showing their own defaults and write them into a picture on the first tap.
   */
  const isText = overlay?.type === "text";
  const isImageOverlay = overlay?.type === "image";

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
    isOverlay ? "text" : isAudio ? "audio" : "visual",
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
  } else if (isImageOverlay) {
    // A picture on the overlay stack. How it sits on the canvas is the whole
    // point of it, so placement leads — the same order the PiP set uses.
    actions = [
      {
        key: "image",
        icon: "position",
        label: "Adjust",
        a11y: "Adjust the picture",
        onPress: () => setPanel("imageoverlay"),
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
  const centre = originX + (start + duration / 2 - playheadSec) * pxPerSec;
  const left = Math.max(EDGE, Math.min(width - barW - EDGE, centre - barW / 2));

  /*
   * ALWAYS above its own lane. Asked for repeatedly, and the reason is that a
   * bar which sometimes sits above and sometimes below has no readable
   * relationship to the lane it belongs to — you have to work out which lane it
   * came from instead of seeing it.
   *
   * The music lane is the case that used to break it: it is the top lane, so
   * `above` goes negative (RULER_H is 22 against a bar of ~41) and the old rule
   * flipped the bar to the far side, where it landed on the text lane and read
   * as belonging to that.
   *
   * Clamped to 0 rather than allowed negative, which would put it over the
   * transport controls — the play button and undo, which have to stay
   * tappable. On the top lane that means it overlaps the ruler and the top few
   * pixels of the lane's own strip. That is a deliberate trade: covering a
   * little of the waveform it names is much cheaper than appearing over a
   * different lane entirely.
   */
  const top = Math.max(0, laneTop - BAR_H - LANE_GAP);

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View
        style={[
          styles.bar,
          {
            left,
            width: barW,
            top,
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
  // Fills the timeline's scroll area, so `top` is measured from the top of the
  // ruler — the same space the lane offsets are computed in.
  wrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
  },
  bar: {
    position: "absolute",
    flexDirection: "row",
    paddingHorizontal: 2,
    paddingVertical: PAD_V,
    borderRadius: 11,
    borderCurve: "continuous",
    borderWidth: 1,
    // Fill and edge are tinted per lane at the call site. The shadow is not:
    // it is one direction and nearly black, so it reads as the same lift under
    // all five hues instead of five differently-coloured smears.
    boxShadow: "0 5px 13px rgba(6,5,20,0.42)",
  },
  item: {
    width: ITEM_W,
    height: ITEM_H,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  // `lineHeight` is stated because RN's default leading for a 10pt face is
  // taller than LABEL_H, and the slack lands under the label — which reads as
  // the bar being bottom-heavy however small the padding gets.
  label: { fontSize: 10, lineHeight: LABEL_H, fontFamily: font.semibold },
});
