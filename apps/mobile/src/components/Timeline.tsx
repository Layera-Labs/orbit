/**
 * Vela-styled multi-track timeline (Expo Go — RN Views + Gesture Handler).
 *
 * Layout: a FIXED left gutter of per-row add-icons aligned to FIVE fixed lanes,
 * top→bottom — Music · Text · Image · Video · Sound — and a horizontally
 * scrolling area (ruler + lanes) under a fixed white playhead (scroll = scrub).
 * Each row shows a dark "empty track" bar; clips ride on top, absolutely
 * positioned by their ABSOLUTE start. A selected clip drags by the body (move in
 * time) or yellow edge handles (trim); those gestures block the scroll on touch
 * (blocksExternalGesture), so you can still scroll the timeline (drag empty area
 * / ruler) to the end while a clip stays selected.
 * The Sound lane is a read-only waveform mirror of the main clips' audio.
 */
import {
  Fragment,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Image,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  ScrollView,
} from "react-native-gesture-handler";
import { font, mono, vela } from "../constants";
import { VIcon, type VIconName } from "./VIcon";
import { MIN_CLIP } from "../model/editor-ops";
import { projectDuration } from "../model/project";
import type { Rect, Transition, VisualTrackClip } from "../model/types";
import { videoThumbnail } from "../storage/media";
import {
  OVERLAY_TRACK,
  type GapSelection,
  useEditor,
} from "../store/editorStore";

const MUSIC_H = 36;
const TEXT_H = 30;
const IMAGE_H = 40;
const VIDEO_H = 54;
const SOUND_H = 32;
const RULER_H = 22;
/** Fixed left icon column. Exported so the floating HUD can sit over a clip. */
export const GUTTER_W = 48;
const LANE_GAP = 6;
const SQUEEZE_H = 30; // compact height for a collapsed multi-lane group
const HANDLE_W = 16;
const ADD_TILE_W = 42;
const GAP_HUD_W = 174;
const GAP_HUD_BG = "#5b4bff";
/** Playhead offset from the gutter — clips start right here (no big gap). */
export const PLAYHEAD_X = 10;
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

type RowKind = "audio" | "text" | "visual" | "sound";
type ClipLike = {
  id: string;
  start: number;
  duration: number;
  trimIn?: number;
  src?: string;
  type?: "video" | "image";
  rect?: Rect;
  text?: string;
  transitionIn?: Transition;
};
type ClipEntry = { clip: ClipLike; trackId: string };
/** One collapsed sub-lane in a squeezed group — clips shown as colour bars. */
type SubLane = { color: string; clips: ClipEntry[] };
interface RowDef {
  key: string;
  icon: VIconName;
  label: string;
  kind: RowKind;
  /** Which collapsible group this lane belongs to (drives squeeze/expand). */
  group: string;
  height: number;
  clips: ClipEntry[];
  /** Gutter icon action; separate from lane expansion and empty-lane actions. */
  iconPress?: () => void;
  add: () => void;
  empty: string;
  /** show a white "+" tile after the last clip (the main video row) */
  addTile?: boolean;
  /** dim the lane to signal it's muted (the Sound row when the video audio is off) */
  muted?: boolean;
  /** lane has no actionable source (for example, an image-only main track) */
  disabled?: boolean;
  /** accent colour for this lane's clips when shown collapsed */
  color?: string;
  /** when set, this row is a collapsed summary of a multi-lane group */
  squeezed?: SubLane[];
}

const thumbCache = new Map<string, string>();

function fmtDur(s: number): string {
  return s >= 10 ? `${Math.round(s)}s` : `${s.toFixed(1)}s`;
}

function Filmstrip({
  clip,
  height,
}: {
  clip: VisualTrackClip;
  height: number;
}) {
  const initial = clip.type === "image" ? clip.src : thumbCache.get(clip.src);
  const [uri, setUri] = useState<string | undefined>(initial);
  useEffect(() => {
    let alive = true;
    if (clip.type === "video" && !thumbCache.has(clip.src)) {
      videoThumbnail(clip.src, clip.trimIn ?? 0).then((t) => {
        if (t) {
          thumbCache.set(clip.src, t);
          if (alive) setUri(t);
        }
      });
    }
    return () => {
      alive = false;
    };
  }, [clip.src, clip.type, clip.type === "video" ? clip.trimIn : 0]);

  if (!uri) {
    return (
      <View style={styles.thumbFallback}>
        <VIcon
          name={clip.type === "video" ? "video" : "image"}
          size={18}
          color={vela.muted}
        />
      </View>
    );
  }
  const tiles = Math.max(1, Math.ceil((clip.duration * 40) / height));
  return (
    <View style={styles.filmstrip}>
      {Array.from({ length: Math.min(12, tiles) }).map((_, i) => (
        <Image
          key={i}
          source={{ uri }}
          style={{ width: height, height }}
          resizeMode="cover"
        />
      ))}
    </View>
  );
}

function Waveform({
  seed,
  width,
  color,
}: {
  seed: string;
  width: number;
  color: string;
}) {
  const bars = Math.max(4, Math.floor(width / 5));
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return (
    <View style={styles.waveform} pointerEvents="none">
      {Array.from({ length: bars }).map((_, i) => {
        h = (h * 1103515245 + 12345) >>> 0;
        const amp = 0.25 + (((h >>> 16) % 1000) / 1000) * 0.7;
        return (
          <View
            key={i}
            style={{
              width: 2,
              borderRadius: 1,
              backgroundColor: color,
              height: `${amp * 70}%`,
            }}
          />
        );
      })}
    </View>
  );
}

function ClipView({
  clip,
  trackId,
  kind,
  height,
  selected,
  pxPerSec,
  scrollRef,
}: {
  clip: ClipLike;
  trackId: string;
  kind: RowKind;
  height: number;
  selected: boolean;
  pxPerSec: number;
  scrollRef: RefObject<ScrollView | null>;
}) {
  const select = useEditor((s) => s.select);
  const setClipStart = useEditor((s) => s.setClipStart);
  const trimClip = useEditor((s) => s.trimClip);
  const moveSelectedLayer = useEditor((s) => s.moveSelectedLayer);
  const mediaDurations = useEditor((s) => s.mediaDurations);
  const startRef = useRef({ start: 0, trimIn: 0, duration: 0 });
  /*
   * While a trim handle is down the rectangle follows the finger from LOCAL
   * state and the store is written once, on release. Writing it per pointer
   * frame cloned the whole project, re-rendered the timeline, the preview and
   * the editor chrome, and queued a save and a sync — so the edge trailed the
   * finger by several frames, which reads as an animation rather than a drag.
   * Committing once also makes the whole drag exactly one undo step, instead of
   * depending on HISTORY_COALESCE_MS to merge it.
   */
  const [live, setLive] = useState<{
    start: number;
    trimIn: number;
    duration: number;
  } | null>(null);

  const left = (live?.start ?? clip.start) * pxPerSec;
  const width = Math.max(20, (live?.duration ?? clip.duration) * pxPerSec);
  const v = clip as VisualTrackClip;
  const isPip =
    kind === "visual" &&
    !!v.rect &&
    (v.rect.w < 0.99 || v.rect.x > 0.01 || v.rect.y > 0.01);

  function begin() {
    startRef.current = {
      start: clip.start,
      trimIn: clip.trimIn ?? 0,
      duration: clip.duration,
    };
  }
  // A drag/trim on the clip wins over the timeline ScrollView (so it doesn't
  // scrub); touching empty timeline still scrolls — letting you scroll to the
  // end while a clip stays selected.
  const bodyPan = Gesture.Pan()
    .runOnJS(true)
    .blocksExternalGesture(scrollRef as never)
    .activeOffsetX([-6, 6])
    .onBegin(begin)
    .onUpdate((e) =>
      setClipStart(
        trackId,
        clip.id,
        startRef.current.start + e.translationX / pxPerSec,
      ),
    );
  // Both trim geometries live in one function each, so the rectangle under the
  // finger and the value finally committed can never disagree.
  function leftGeom(dx: number) {
    const s = startRef.current;
    const newStart = Math.max(0, s.start + dx / pxPerSec);
    const applied = newStart - s.start;
    return {
      start: newStart,
      trimIn: Math.max(0, s.trimIn + applied),
      duration: Math.max(MIN_CLIP, s.duration - applied),
    };
  }
  function rightGeom(dx: number) {
    const s = startRef.current;
    const srcLen = clip.src ? mediaDurations[clip.src] : undefined;
    const maxDur =
      kind === "visual" && v.type === "video" && srcLen
        ? srcLen - s.trimIn
        : 36000;
    return {
      start: s.start,
      trimIn: s.trimIn,
      duration: clamp(s.duration + dx / pxPerSec, MIN_CLIP, maxDur),
    };
  }
  const leftPan = Gesture.Pan()
    .runOnJS(true)
    .blocksExternalGesture(scrollRef as never)
    .onBegin(begin)
    .onUpdate((e) => setLive(leftGeom(e.translationX)))
    .onEnd((e) => trimClip(trackId, clip.id, leftGeom(e.translationX)))
    // Runs after onEnd, and also when the gesture is cancelled — so a cancelled
    // trim snaps back to the stored clip rather than stranding the live value.
    .onFinalize(() => setLive(null));
  const rightPan = Gesture.Pan()
    .runOnJS(true)
    .blocksExternalGesture(scrollRef as never)
    .onBegin(begin)
    .onUpdate((e) => setLive(rightGeom(e.translationX)))
    .onEnd((e) =>
      // Only `duration` — passing start/trimIn back would write a 0 onto clips
      // whose trimIn is legitimately undefined.
      trimClip(trackId, clip.id, {
        duration: rightGeom(e.translationX).duration,
      }),
    )
    .onFinalize(() => setLive(null));
  // Drag the selected clip vertically to restack it — up = higher layer. Commits
  // by lanes crossed on release. Loses to a horizontal move/trim (Race below).
  const vertPan = Gesture.Pan()
    .runOnJS(true)
    .blocksExternalGesture(scrollRef as never)
    .activeOffsetY([-12, 12])
    .failOffsetX([-12, 12])
    .onEnd((e) => {
      const steps = Math.round(-e.translationY / (height + LANE_GAP));
      const dir: 1 | -1 = steps >= 0 ? 1 : -1;
      for (let i = 0; i < Math.abs(steps); i++) moveSelectedLayer(dir);
    });

  const inner = (
    <Pressable
      onPress={() => select(selected ? null : { trackId, clipId: clip.id })}
      style={StyleSheet.absoluteFill}
    >
      {kind === "visual" ? (
        <Filmstrip clip={v} height={height} />
      ) : kind === "audio" ? (
        <Waveform seed={clip.id} width={width} color={vela.wave} />
      ) : (
        <View style={styles.textFill}>
          <Text numberOfLines={1} style={styles.textLabel}>
            {clip.text || "Text"}
          </Text>
        </View>
      )}
      {isPip ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>PiP</Text>
        </View>
      ) : null}
      {kind !== "text" ? (
        <View style={styles.durTag} pointerEvents="none">
          <Text style={styles.durText}>{fmtDur(clip.duration)}</Text>
        </View>
      ) : null}
    </Pressable>
  );

  return (
    <View
      style={[
        styles.clip,
        { left, width, height },
        kind === "audio" && styles.audioClip,
        kind === "text" && styles.textClip,
        selected && styles.clipOn,
      ]}
    >
      {selected ? (
        <GestureDetector gesture={Gesture.Race(vertPan, bodyPan)}>
          {inner}
        </GestureDetector>
      ) : (
        inner
      )}
      {selected ? (
        <>
          <GestureDetector gesture={leftPan}>
            <View style={[styles.handle, styles.handleLeft]}>
              <View style={styles.handleBar} />
            </View>
          </GestureDetector>
          <GestureDetector gesture={rightPan}>
            <View style={[styles.handle, styles.handleRight]}>
              <View style={styles.handleBar} />
            </View>
          </GestureDetector>
        </>
      ) : null}
    </View>
  );
}

function SoundBlock({ clip, pxPerSec }: { clip: ClipLike; pxPerSec: number }) {
  const left = clip.start * pxPerSec;
  const width = Math.max(20, clip.duration * pxPerSec);
  return (
    <View style={[styles.soundBlock, { left, width }]} pointerEvents="none">
      <Waveform seed={`${clip.id}snd`} width={width} color={vela.waveSound} />
    </View>
  );
}

function tickStep(pps: number): number {
  for (const s of [0.5, 1, 2, 5, 10, 15, 30, 60, 120])
    if (s * pps >= 56) return s;
  return 300;
}

function Ruler({ end, pxPerSec }: { end: number; pxPerSec: number }) {
  const step = tickStep(pxPerSec);
  const minor = step / 5;
  const count = Math.floor(end / minor) + 1;
  const perMajor = Math.round(step / minor);
  return (
    <View style={[styles.ruler, { width: Math.max(1, end * pxPerSec) }]}>
      {Array.from({ length: count }).map((_, i) => {
        const t = i * minor;
        const major = i % perMajor === 0;
        return (
          <View
            key={i}
            style={{
              position: "absolute",
              left: t * pxPerSec,
              bottom: 0,
              alignItems: "center",
            }}
          >
            {major ? (
              <Text style={styles.tickLabel}>{Math.round(t)}s</Text>
            ) : null}
            <View style={major ? styles.tickMajor : styles.tickMinor} />
          </View>
        );
      })}
    </View>
  );
}

/** Fixed, full-width "empty track" bar for a row (does not scroll). */
function RowBg({ height }: { height: number }) {
  return <View style={[styles.rowBg, { height }]} />;
}

/** Empty intervals before/between clips. A trailing interval is not removable. */
function gapsOf(clips: ClipEntry[]): GapSelection[] {
  if (!clips.length) return [];
  const sorted = [...clips].sort((a, b) => a.clip.start - b.clip.start);
  const gaps: GapSelection[] = [];
  let cursor = 0;
  for (const { clip, trackId } of sorted) {
    if (clip.start > cursor + 0.001)
      gaps.push({ trackId, start: cursor, end: clip.start });
    cursor = Math.max(cursor, clip.start + clip.duration);
  }
  return gaps;
}

/** Scrolling clip layer for a row (transparent; sits on top of the RowBg). */
function ClipLane({
  row,
  pxPerSec,
  selected,
  scrollRef,
}: {
  row: RowDef;
  pxPerSec: number;
  selected: ReturnType<typeof useEditor.getState>["selected"];
  scrollRef: RefObject<ScrollView | null>;
}) {
  const select = useEditor((s) => s.select);
  const selectedGap = useEditor((s) => s.selectedGap);
  const selectGap = useEditor((s) => s.selectGap);
  const removeSelectedGap = useEditor((s) => s.removeSelectedGap);
  const setPlayhead = useEditor((s) => s.setPlayhead);
  const setPanel = useEditor((s) => s.setPanel);
  const lastEnd = row.clips.reduce(
    (m, { clip }) => Math.max(m, clip.start + clip.duration),
    0,
  );
  return (
    <View
      style={{
        height: row.height,
        zIndex: row.key === "video" && selectedGap ? 20 : 0,
      }}
    >
      {row.key === "video"
        ? gapsOf(row.clips).map((gap) => {
            const isSelected =
              selectedGap?.trackId === gap.trackId &&
              Math.abs(selectedGap.start - gap.start) < 0.001 &&
              Math.abs(selectedGap.end - gap.end) < 0.001;
            const width = Math.max(12, (gap.end - gap.start) * pxPerSec);
            return (
              <Fragment key={`gap-${gap.trackId}-${gap.start}`}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Empty space, ${(gap.end - gap.start).toFixed(1)} seconds`}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => selectGap(isSelected ? null : gap)}
                  style={[
                    styles.gap,
                    {
                      left: gap.start * pxPerSec,
                      width,
                      height: row.height,
                    },
                    isSelected && styles.gapOn,
                  ]}
                >
                  {isSelected && width >= 66 ? (
                    <Text style={styles.gapText} numberOfLines={1}>
                      Empty {(gap.end - gap.start).toFixed(1)}s
                    </Text>
                  ) : null}
                </Pressable>
                {isSelected ? (
                  <View
                    style={[
                      styles.gapHud,
                      {
                        left:
                          gap.start * pxPerSec +
                          Math.max(0, (width - GAP_HUD_W) / 2),
                      },
                    ]}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Add media to empty space"
                      style={styles.gapHudAction}
                      onPress={() => {
                        setPlayhead(gap.start);
                        setPanel("addvisual");
                      }}
                    >
                      <VIcon name="plus" size={19} color="#fff" />
                      <Text style={styles.gapHudText}>Add</Text>
                    </Pressable>
                    <View style={styles.gapHudDivider} />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Keep empty space"
                      style={styles.gapHudAction}
                      onPress={() => selectGap(null)}
                    >
                      <VIcon name="lock" size={19} color="#fff" />
                      <Text style={styles.gapHudText}>Keep</Text>
                    </Pressable>
                    <View style={styles.gapHudDivider} />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Delete empty space"
                      style={styles.gapHudAction}
                      onPress={removeSelectedGap}
                    >
                      <VIcon name="trash" size={19} color="#fff" />
                      <Text style={styles.gapHudText}>Delete</Text>
                    </Pressable>
                    <View style={styles.gapHudPointer} />
                  </View>
                ) : null}
              </Fragment>
            );
          })
        : null}
      {row.clips.length === 0
        ? null
        : row.kind === "sound"
          ? row.clips.map(({ clip }) => (
              <SoundBlock key={clip.id} clip={clip} pxPerSec={pxPerSec} />
            ))
          : row.clips.map(({ clip, trackId }) => (
              <ClipView
                key={clip.id}
                clip={clip}
                trackId={trackId}
                kind={row.kind}
                height={row.height}
                selected={
                  selected?.trackId === trackId && selected?.clipId === clip.id
                }
                pxPerSec={pxPerSec}
                scrollRef={scrollRef}
              />
            ))}
      {/* Transition chips between adjacent main-track clips */}
      {row.key === "video"
        ? row.clips.slice(1).map(({ clip, trackId }) => {
            const hasT =
              !!clip.transitionIn && clip.transitionIn.type !== "cut";
            return (
              <Pressable
                key={`tr-${clip.id}`}
                style={[
                  styles.trChip,
                  hasT && styles.trChipOn,
                  {
                    left: clip.start * pxPerSec - 11,
                    top: row.height / 2 - 10,
                  },
                ]}
                onPress={() => {
                  select({ trackId, clipId: clip.id });
                  setPanel("transition");
                }}
              >
                <VIcon
                  name={hasT ? "fx" : "plus"}
                  size={12}
                  color={hasT ? vela.onAccent : "#fff"}
                />
              </Pressable>
            );
          })
        : null}
      {row.addTile && row.clips.length > 0 ? (
        <Pressable
          onPress={row.add}
          style={[
            styles.addTile,
            { left: lastEnd * pxPerSec + 4, height: row.height },
          ]}
        >
          <VIcon name="plus" size={22} color={vela.onAccent} />
        </Pressable>
      ) : null}
      {/* Muted: dim the sound lane (tap still falls through to the gutter toggle). */}
      {row.muted && row.kind === "sound" ? (
        <View pointerEvents="none" style={styles.mutedOverlay} />
      ) : null}
    </View>
  );
}

/** Collapsed summary of a multi-lane group: each sub-lane's clips as colour bars.
 *  Tapping expands the group back to full lanes. */
function SqueezedLane({
  sublanes,
  height,
  pxPerSec,
  onPress,
}: {
  sublanes: SubLane[];
  height: number;
  pxPerSec: number;
  onPress: () => void;
}) {
  const n = Math.max(1, sublanes.length);
  const gap = 2;
  const barH = Math.max(3, (height - (n + 1) * gap) / n);
  return (
    <Pressable onPress={onPress} style={{ height, paddingVertical: gap, gap }}>
      {sublanes.map((sl, i) => (
        <View key={i} style={{ height: barH }}>
          {sl.clips.map(({ clip }) => (
            <View
              key={clip.id}
              style={{
                position: "absolute",
                left: clip.start * pxPerSec,
                width: Math.max(6, clip.duration * pxPerSec),
                top: 0,
                bottom: 0,
                borderRadius: 2,
                backgroundColor: sl.color,
              }}
            />
          ))}
        </View>
      ))}
    </Pressable>
  );
}

export function Timeline({ maxHeight = 270 }: { maxHeight?: number }) {
  const project = useEditor((s) => s.project);
  const pxPerSec = useEditor((s) => s.pxPerSec);
  const playheadSec = useEditor((s) => s.playheadSec);
  const selected = useEditor((s) => s.selected);
  const selectedGap = useEditor((s) => s.selectedGap);
  const setPlayhead = useEditor((s) => s.setPlayhead);
  const isPlaying = useEditor((s) => s.isPlaying);
  const setPanel = useEditor((s) => s.setPanel);
  const toggleMainMuted = useEditor((s) => s.toggleMainMuted);
  const select = useEditor((s) => s.select);

  const scrollRef = useRef<ScrollView>(null);
  const [viewW, setViewW] = useState(0);
  const userScrolling = useRef(false);
  // A group the user tapped to expand while nothing is selected. Cleared whenever
  // the selection changes (selecting a clip drives expansion on its own).
  const [manualExpand, setManualExpand] = useState<string | null>(null);
  useEffect(() => {
    setManualExpand(null);
  }, [selected, selectedGap]);

  const tracks = project?.tracks ?? [];
  const visual = tracks.filter((t) => t.kind === "visual");
  const audio = tracks.filter((t) => t.kind === "audio");
  const main = visual[0];
  const visualOverlays = visual.slice(1);
  const overlays = project?.overlays ?? [];
  const maxLayer = overlays.reduce((m, o) => Math.max(m, o.layer ?? 0), 0);
  const mainVideos = main ? main.clips.filter((c) => c.type === "video") : [];
  const hasOriginalAudio = mainVideos.length > 0;
  const mainMuted =
    !hasOriginalAudio || mainVideos.every((c) => (c.volume ?? 1) === 0);

  // The group holding the current selection stays expanded; a manual tap wins.
  const selGroup = selectedGap
    ? "video"
    : !selected
      ? null
      : selected.trackId === OVERLAY_TRACK
        ? "text"
        : main && selected.trackId === main.id
          ? "video"
          : audio.some((t) => t.id === selected.trackId)
            ? "music"
            : visualOverlays.some((t) => t.id === selected.trackId)
              ? "image"
              : null;
  const activeGroup = manualExpand ?? selGroup;

  // Build each group's lanes (top→bottom); collapse inactive multi-lane groups
  // into a single colour-bar summary strip.
  const lanes: RowDef[] = [];
  const emit = (
    group: string,
    groupIcon: VIconName,
    color: string,
    laneList: RowDef[],
  ) => {
    if (laneList.length >= 2 && activeGroup !== group) {
      lanes.push({
        key: `sq-${group}`,
        icon: groupIcon,
        label: group,
        kind: laneList[0].kind,
        group,
        height: SQUEEZE_H,
        clips: [],
        iconPress: laneList[0].iconPress,
        add: () => setManualExpand(group),
        empty: "",
        color,
        squeezed: laneList.map((l) => ({
          color: l.color ?? color,
          clips: l.clips,
        })),
      });
    } else {
      lanes.push(...laneList);
    }
  };

  // Music — one lane per audio track (or a single empty lane).
  emit(
    "music",
    "gutterAudio",
    vela.trackMusic,
    audio.length
      ? audio.map((t) => ({
          key: `aud-${t.id}`,
          icon: "gutterAudio" as VIconName,
          label: "Music",
          kind: "audio" as RowKind,
          group: "music",
          height: MUSIC_H,
          clips: t.clips.map((clip) => ({ clip, trackId: t.id })),
          iconPress: () => setPanel("audio"),
          add: () => setPanel("audio"),
          empty: "Tap to add music",
          color: vela.trackMusic,
        }))
      : [
          {
            key: "music",
            icon: "gutterAudio",
            label: "Music",
            kind: "audio",
            group: "music",
            height: MUSIC_H,
            clips: [],
            iconPress: () => setPanel("audio"),
            add: () => setPanel("audio"),
            empty: "Tap to add music",
            color: vela.trackMusic,
          },
        ],
  );

  // Text — one lane per stacking layer, top layer first.
  emit(
    "text",
    "text",
    vela.trackText,
    overlays.length
      ? Array.from({ length: maxLayer + 1 }, (_, i) => maxLayer - i).map(
          (L) => ({
            key: `text-${L}`,
            icon: "text" as VIconName,
            label: "Text",
            kind: "text" as RowKind,
            group: "text",
            height: TEXT_H,
            clips: overlays
              .filter((o) => (o.layer ?? 0) === L)
              .map((o) => ({
                clip: {
                  id: o.id,
                  start: o.start,
                  duration: Math.max(0.1, o.end - o.start),
                  text: o.text,
                },
                trackId: OVERLAY_TRACK,
              })),
            iconPress: () => setPanel("texttrack"),
            add: () => setPanel("texttrack"),
            empty: "Tap to add subtitle",
            color: vela.trackText,
          }),
        )
      : [
          {
            key: "text",
            icon: "text",
            label: "Text",
            kind: "text",
            group: "text",
            height: TEXT_H,
            clips: [],
            iconPress: () => setPanel("texttrack"),
            add: () => setPanel("texttrack"),
            empty: "Tap to add subtitle",
            color: vela.trackText,
          },
        ],
  );

  // Image — one lane per visual overlay track (stickers / PiP).
  emit(
    "image",
    "image",
    vela.waveSound,
    visualOverlays.length
      ? visualOverlays.map((t) => ({
          key: `img-${t.id}`,
          icon: "image" as VIconName,
          label: "Image",
          kind: "visual" as RowKind,
          group: "image",
          height: IMAGE_H,
          clips: t.clips.map((clip) => ({ clip, trackId: t.id })),
          iconPress: () => setPanel("imagetrack"),
          add: () => setPanel("imagetrack"),
          empty: "Tap to add sticker / PiP",
          color: vela.waveSound,
        }))
      : [
          {
            key: "image",
            icon: "image",
            label: "Image",
            kind: "visual",
            group: "image",
            height: IMAGE_H,
            clips: [],
            iconPress: () => setPanel("imagetrack"),
            add: () => setPanel("imagetrack"),
            empty: "Tap to add sticker / PiP",
            color: vela.waveSound,
          },
        ],
  );

  // Video (main) and Sound (main audio) — always single lanes.
  lanes.push({
    key: "video",
    icon: "video",
    label: "Video",
    kind: "visual",
    group: "video",
    height: VIDEO_H,
    clips: main ? main.clips.map((clip) => ({ clip, trackId: main.id })) : [],
    iconPress: () => setPanel("addvisual"),
    add: () => setPanel("addvisual"),
    empty: "Tap to add image/video",
    addTile: true,
  });
  lanes.push({
    key: "sound",
    icon: mainMuted ? "mute" : "volume",
    label: "Sound",
    kind: "sound",
    group: "sound",
    height: SOUND_H,
    muted: mainMuted,
    disabled: !hasOriginalAudio,
    clips: main
      ? main.clips
          .filter((c) => c.type === "video")
          .map((clip) => ({ clip, trackId: main.id }))
      : [],
    iconPress: toggleMainMuted,
    add: toggleMainMuted,
    empty: "Original audio",
  });

  const end = project ? projectDuration(project) : 0;
  // Scroll stays enabled while a clip is selected — clip drag/trim gestures
  // block the scroll on touch (see ClipView), so both coexist.
  const scrollEnabled = !isPlaying;
  const scrollW = Math.max(1, viewW - GUTTER_W);
  // leave room past the content for the white "+" add tile on the video row.
  const contentW = Math.max(1, end * pxPerSec + ADD_TILE_W + 8);

  useEffect(() => {
    if (!userScrolling.current && viewW > 0)
      scrollRef.current?.scrollTo({
        x: playheadSec * pxPerSec,
        animated: false,
      });
  }, [playheadSec, pxPerSec, viewW]);

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!userScrolling.current) return;
    setPlayhead(e.nativeEvent.contentOffset.x / Math.max(1, pxPerSec));
  }

  return (
    <View
      style={[styles.root, { maxHeight }]}
      onLayout={(e: LayoutChangeEvent) => setViewW(e.nativeEvent.layout.width)}
    >
      <ScrollView
        showsVerticalScrollIndicator
        contentContainerStyle={styles.verticalContent}
        nestedScrollEnabled
      >
        {/* Deliberately unanimated. A spring layout transition here made lanes
            squeeze and expand with a lag, and every trim that changed which
            lanes exist dragged the whole timeline along behind the finger. */}
        <View style={styles.body}>
          {/* Fixed left gutter: per-row add icons */}
          <View style={styles.gutter}>
            <View style={{ height: RULER_H }} />
            <View style={{ gap: LANE_GAP }}>
              {lanes.map((r) => (
                <Pressable
                  key={r.key}
                  accessibilityRole={r.kind === "sound" ? "switch" : "button"}
                  accessibilityLabel={
                    r.kind === "sound"
                      ? r.disabled
                        ? "Original audio unavailable"
                        : r.muted
                          ? "Unmute original audio"
                          : "Mute original audio"
                      : r.label
                  }
                  accessibilityState={
                    r.kind === "sound"
                      ? { checked: !r.muted, disabled: !!r.disabled }
                      : undefined
                  }
                  disabled={r.disabled}
                  style={[styles.gutterItem, { height: r.height }]}
                  onPress={r.iconPress ?? r.add}
                >
                  <VIcon
                    name={r.icon}
                    size={18}
                    color={
                      r.disabled
                        ? vela.muted3
                        : r.kind === "sound" && r.muted
                          ? vela.danger
                          : "#fff"
                    }
                  />
                </Pressable>
              ))}
            </View>
          </View>

          {/* Scroll area: full-width row bars (fixed) under scrolling clips */}
          <View style={{ flex: 1 }}>
            {/* Fixed full-width background bars (do not scroll) */}
            <View
              style={[StyleSheet.absoluteFill, { paddingLeft: PLAYHEAD_X }]}
              pointerEvents="none"
            >
              <View style={{ height: RULER_H }} />
              <View style={{ gap: LANE_GAP }}>
                {lanes.map((r) => (
                  <RowBg key={r.key} height={r.height} />
                ))}
              </View>
            </View>

            {/* Scrolling ruler + clip lanes (transparent, on top) */}
            <ScrollView
              ref={scrollRef}
              horizontal
              style={selectedGap ? styles.timelineForeground : undefined}
              showsHorizontalScrollIndicator={false}
              scrollEnabled={scrollEnabled}
              scrollEventThrottle={16}
              onScroll={onScroll}
              onScrollBeginDrag={() => (userScrolling.current = true)}
              onMomentumScrollEnd={() => (userScrolling.current = false)}
              onScrollEndDrag={() => (userScrolling.current = false)}
              contentContainerStyle={{
                paddingLeft: PLAYHEAD_X,
                paddingRight: scrollW,
              }}
            >
              <View style={{ width: contentW }}>
                {/* Tap empty timeline (or the ruler) to deselect — hides the
                  selection toolbar. Sits behind the clips, which catch their own
                  taps; a scroll drag cancels the press so scrubbing still works.
                  It runs `scrollW` past the content because the track scrolls a
                  full viewport further than that: bounded to `contentW`, a tap
                  in the empty space past the last clip did nothing at all. */}
                {selected || selectedGap ? (
                  <Pressable
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      left: 0,
                      width: contentW + scrollW,
                    }}
                    onPress={() => select(null)}
                  />
                ) : null}
                <Ruler end={end} pxPerSec={pxPerSec} />
                <View style={{ gap: LANE_GAP }}>
                  {lanes.map((r) =>
                    r.squeezed ? (
                      <SqueezedLane
                        key={r.key}
                        sublanes={r.squeezed}
                        height={r.height}
                        pxPerSec={pxPerSec}
                        onPress={r.add}
                      />
                    ) : (
                      <ClipLane
                        key={r.key}
                        row={r}
                        pxPerSec={pxPerSec}
                        selected={selected}
                        scrollRef={scrollRef}
                      />
                    ),
                  )}
                </View>
              </View>
            </ScrollView>

            {/* Fixed empty-row hints — pinned left so they never scroll under the
              gutter (box-none lets drags fall through to the ScrollView). */}
            <View
              style={[
                StyleSheet.absoluteFill,
                styles.hintOverlay,
                { paddingLeft: PLAYHEAD_X },
              ]}
              pointerEvents="box-none"
            >
              <View style={{ height: RULER_H }} />
              <View style={{ gap: LANE_GAP }}>
                {lanes.map((r) => (
                  <View
                    key={r.key}
                    style={{ height: r.height, justifyContent: "center" }}
                    pointerEvents="box-none"
                  >
                    {!r.squeezed && r.clips.length === 0 ? (
                      <Pressable onPress={r.add} style={styles.emptyTap}>
                        <Text style={styles.emptyHint} numberOfLines={1}>
                          {r.empty}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </View>
            </View>

            {/* Fixed white playhead near the left of the scroll area */}
            <View
              style={[styles.playhead, { left: PLAYHEAD_X }]}
              pointerEvents="none"
            >
              <View style={styles.playheadKnob} />
              <View style={styles.playheadLine} />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: vela.editorBg, paddingTop: 4, overflow: "hidden" },
  verticalContent: { paddingBottom: 4 },
  body: { flexDirection: "row", paddingVertical: 8 },
  gutter: { width: GUTTER_W },
  gutterItem: { alignItems: "center", justifyContent: "center" },
  timelineForeground: { zIndex: 8 },
  hintOverlay: { zIndex: 2 },

  ruler: { height: RULER_H, justifyContent: "flex-end" },
  tickLabel: {
    color: vela.muted3,
    fontSize: 9,
    marginBottom: 1,
    fontFamily: mono.regular,
  },
  tickMajor: { width: 1.5, height: 8, backgroundColor: vela.muted3 },
  tickMinor: { width: 1, height: 4, backgroundColor: vela.tickMinor },

  rowBg: { borderRadius: 7, backgroundColor: vela.emptyTrack },
  gap: {
    position: "absolute",
    top: 0,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  gapOn: {
    backgroundColor: "rgba(91, 75, 255, 0.22)",
    borderColor: vela.select,
    borderWidth: 2,
    borderStyle: "dashed",
  },
  gapText: {
    color: "#d9d4ff",
    fontFamily: font.bold,
    fontSize: 10,
  },
  gapHud: {
    position: "absolute",
    top: -72,
    width: GAP_HUD_W,
    height: 62,
    zIndex: 30,
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: GAP_HUD_BG,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 7,
    boxShadow: "0 6px 18px rgba(0,0,0,0.32)",
  },
  gapHudAction: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    height: 52,
  },
  gapHudText: {
    color: "#fff",
    fontFamily: font.semibold,
    fontSize: 10,
  },
  gapHudDivider: {
    width: StyleSheet.hairlineWidth,
    height: 34,
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  gapHudPointer: {
    position: "absolute",
    bottom: -5,
    left: GAP_HUD_W / 2 - 5,
    width: 10,
    height: 10,
    backgroundColor: GAP_HUD_BG,
    transform: [{ rotate: "45deg" }],
  },
  emptyTap: { alignSelf: "flex-start", paddingVertical: 6 },
  emptyHint: { color: vela.muted2, fontSize: 13, paddingLeft: 12 },

  clip: {
    position: "absolute",
    top: 0,
    borderRadius: 7,
    overflow: "hidden",
    backgroundColor: vela.clipBg,
    borderWidth: 2,
    borderColor: "transparent",
  },
  audioClip: { backgroundColor: vela.trackMusic },
  textClip: { backgroundColor: vela.trackText, justifyContent: "center" },
  clipOn: { borderColor: vela.select },
  filmstrip: { flexDirection: "row", height: "100%", overflow: "hidden" },
  thumbFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: vela.clipBg,
  },
  textFill: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  textLabel: { color: vela.onAccent, fontSize: 11, fontFamily: font.bold },
  waveform: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
    paddingHorizontal: 2,
  },
  soundBlock: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderRadius: 7,
    overflow: "hidden",
    backgroundColor: vela.soundBlock,
  },
  mutedOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 7,
    backgroundColor: "rgba(12,11,10,0.6)",
  },
  badge: {
    position: "absolute",
    top: 2,
    left: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  badgeText: { color: "#fff", fontSize: 9, fontFamily: font.bold },
  durTag: {
    position: "absolute",
    bottom: 2,
    right: 4,
    backgroundColor: "#000a",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  durText: { color: "#fff", fontSize: 9, fontFamily: mono.medium },
  addTile: {
    position: "absolute",
    top: 0,
    width: ADD_TILE_W,
    backgroundColor: vela.accent,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  trChip: {
    position: "absolute",
    width: 26,
    height: 22,
    borderRadius: 7,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 6,
  },
  trChipOn: { backgroundColor: vela.accent },
  handle: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: HANDLE_W,
    backgroundColor: vela.select,
    alignItems: "center",
    justifyContent: "center",
  },
  handleLeft: { left: 0, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 },
  handleRight: {
    right: 0,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
  },
  handleBar: { width: 3, height: 18, borderRadius: 2, backgroundColor: "#111" },

  playhead: {
    position: "absolute",
    top: 0,
    bottom: 0,
    zIndex: 9,
    alignItems: "center",
    marginLeft: -1,
  },
  // Bespoke two-tone playhead: brand-gold knob on an always-visible white rail.
  playheadKnob: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: vela.accent,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  playheadLine: { flex: 1, width: 2, backgroundColor: "#fff" },
});
