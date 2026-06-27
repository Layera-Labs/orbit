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
import { type RefObject, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import { mono, vela } from '../constants';
import { VIcon, type VIconName } from './VIcon';
import { MIN_CLIP } from '../model/editor-ops';
import { projectDuration } from '../model/project';
import type { Rect, Transition, VisualTrackClip } from '../model/types';
import { pickAndAddMedia } from '../media/pick';
import { videoThumbnail } from '../storage/media';
import { OVERLAY_TRACK, useEditor } from '../store/editorStore';

const MUSIC_H = 36;
const TEXT_H = 30;
const IMAGE_H = 40;
const VIDEO_H = 54;
const SOUND_H = 32;
const RULER_H = 22;
const GUTTER_W = 48;
const LANE_GAP = 6;
const HANDLE_W = 16;
const ADD_TILE_W = 42;
const PLAYHEAD_X = 10; // playhead offset from the gutter — clips start right here (no big gap)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type RowKind = 'audio' | 'text' | 'visual' | 'sound';
type ClipLike = { id: string; start: number; duration: number; trimIn?: number; src?: string; type?: 'video' | 'image'; rect?: Rect; text?: string; transitionIn?: Transition };
interface RowDef {
  key: string;
  icon: VIconName;
  label: string;
  kind: RowKind;
  height: number;
  clips: { clip: ClipLike; trackId: string }[];
  add: () => void;
  empty: string;
  /** show a white "+" tile after the last clip (the main video row) */
  addTile?: boolean;
}

const thumbCache = new Map<string, string>();

function fmtDur(s: number): string {
  return s >= 10 ? `${Math.round(s)}s` : `${s.toFixed(1)}s`;
}

function Filmstrip({ clip, height }: { clip: VisualTrackClip; height: number }) {
  const initial = clip.type === 'image' ? clip.src : thumbCache.get(clip.src);
  const [uri, setUri] = useState<string | undefined>(initial);
  useEffect(() => {
    let alive = true;
    if (clip.type === 'video' && !thumbCache.has(clip.src)) {
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
  }, [clip.src, clip.type, clip.type === 'video' ? clip.trimIn : 0]);

  if (!uri) {
    return (
      <View style={styles.thumbFallback}>
        <VIcon name={clip.type === 'video' ? 'video' : 'image'} size={18} color={vela.muted} />
      </View>
    );
  }
  const tiles = Math.max(1, Math.ceil((clip.duration * 40) / height));
  return (
    <View style={styles.filmstrip}>
      {Array.from({ length: Math.min(12, tiles) }).map((_, i) => (
        <Image key={i} source={{ uri }} style={{ width: height, height }} resizeMode="cover" />
      ))}
    </View>
  );
}

function Waveform({ seed, width, color }: { seed: string; width: number; color: string }) {
  const bars = Math.max(4, Math.floor(width / 5));
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return (
    <View style={styles.waveform} pointerEvents="none">
      {Array.from({ length: bars }).map((_, i) => {
        h = (h * 1103515245 + 12345) >>> 0;
        const amp = 0.25 + (((h >>> 16) % 1000) / 1000) * 0.7;
        return <View key={i} style={{ width: 2, borderRadius: 1, backgroundColor: color, height: `${amp * 70}%` }} />;
      })}
    </View>
  );
}

function ClipView({ clip, trackId, kind, height, selected, pxPerSec, scrollRef }: { clip: ClipLike; trackId: string; kind: RowKind; height: number; selected: boolean; pxPerSec: number; scrollRef: RefObject<ScrollView | null> }) {
  const select = useEditor((s) => s.select);
  const setClipStart = useEditor((s) => s.setClipStart);
  const trimClip = useEditor((s) => s.trimClip);
  const mediaDurations = useEditor((s) => s.mediaDurations);
  const startRef = useRef({ start: 0, trimIn: 0, duration: 0 });

  const left = clip.start * pxPerSec;
  const width = Math.max(20, clip.duration * pxPerSec);
  const v = clip as VisualTrackClip;
  const isPip = kind === 'visual' && !!v.rect && (v.rect.w < 0.99 || v.rect.x > 0.01 || v.rect.y > 0.01);

  function begin() {
    startRef.current = { start: clip.start, trimIn: clip.trimIn ?? 0, duration: clip.duration };
  }
  // A drag/trim on the clip wins over the timeline ScrollView (so it doesn't
  // scrub); touching empty timeline still scrolls — letting you scroll to the
  // end while a clip stays selected.
  const bodyPan = Gesture.Pan()
    .runOnJS(true)
    .blocksExternalGesture(scrollRef)
    .activeOffsetX([-6, 6])
    .onBegin(begin)
    .onUpdate((e) => setClipStart(trackId, clip.id, startRef.current.start + e.translationX / pxPerSec));
  const leftPan = Gesture.Pan()
    .runOnJS(true)
    .blocksExternalGesture(scrollRef)
    .onBegin(begin)
    .onUpdate((e) => {
      const ds = e.translationX / pxPerSec;
      const newStart = Math.max(0, startRef.current.start + ds);
      const applied = newStart - startRef.current.start;
      trimClip(trackId, clip.id, { start: newStart, trimIn: Math.max(0, startRef.current.trimIn + applied), duration: Math.max(MIN_CLIP, startRef.current.duration - applied) });
    });
  const rightPan = Gesture.Pan()
    .runOnJS(true)
    .blocksExternalGesture(scrollRef)
    .onBegin(begin)
    .onUpdate((e) => {
      const ds = e.translationX / pxPerSec;
      const srcLen = clip.src ? mediaDurations[clip.src] : undefined;
      const maxDur = kind === 'visual' && v.type === 'video' && srcLen ? srcLen - startRef.current.trimIn : 36000;
      trimClip(trackId, clip.id, { duration: clamp(startRef.current.duration + ds, MIN_CLIP, maxDur) });
    });

  const inner = (
    <Pressable onPress={() => select(selected ? null : { trackId, clipId: clip.id })} style={StyleSheet.absoluteFill}>
      {kind === 'visual' ? (
        <Filmstrip clip={v} height={height} />
      ) : kind === 'audio' ? (
        <Waveform seed={clip.id} width={width} color="#c79bff" />
      ) : (
        <View style={styles.textFill}>
          <Text numberOfLines={1} style={styles.textLabel}>
            {clip.text || 'Text'}
          </Text>
        </View>
      )}
      {isPip ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>PiP</Text>
        </View>
      ) : null}
      {kind !== 'text' ? (
        <View style={styles.durTag} pointerEvents="none">
          <Text style={styles.durText}>{fmtDur(clip.duration)}</Text>
        </View>
      ) : null}
    </Pressable>
  );

  return (
    <View style={[styles.clip, { left, width, height }, kind === 'audio' && styles.audioClip, kind === 'text' && styles.textClip, selected && styles.clipOn]}>
      {selected ? <GestureDetector gesture={bodyPan}>{inner}</GestureDetector> : inner}
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
      <Waveform seed={`${clip.id}snd`} width={width} color="#c7b46a" />
    </View>
  );
}

function tickStep(pps: number): number {
  for (const s of [0.5, 1, 2, 5, 10, 15, 30, 60, 120]) if (s * pps >= 56) return s;
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
          <View key={i} style={{ position: 'absolute', left: t * pxPerSec, bottom: 0, alignItems: 'center' }}>
            {major ? <Text style={styles.tickLabel}>{Math.round(t)}s</Text> : null}
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

/** Scrolling clip layer for a row (transparent; sits on top of the RowBg). */
function ClipLane({ row, scrollW, pxPerSec, selected, scrollRef }: { row: RowDef; scrollW: number; pxPerSec: number; selected: ReturnType<typeof useEditor.getState>['selected']; scrollRef: RefObject<ScrollView | null> }) {
  const select = useEditor((s) => s.select);
  const setPanel = useEditor((s) => s.setPanel);
  const lastEnd = row.clips.reduce((m, { clip }) => Math.max(m, clip.start + clip.duration), 0);
  return (
    <View style={{ height: row.height }}>
      {row.clips.length === 0 ? (
        <Pressable onPress={row.add} style={[styles.emptyTap, { width: scrollW }]}>
          <Text style={styles.emptyHint} numberOfLines={1}>
            {row.empty}
          </Text>
        </Pressable>
      ) : row.kind === 'sound' ? (
        row.clips.map(({ clip }) => <SoundBlock key={clip.id} clip={clip} pxPerSec={pxPerSec} />)
      ) : (
        row.clips.map(({ clip, trackId }) => (
          <ClipView key={clip.id} clip={clip} trackId={trackId} kind={row.kind} height={row.height} selected={selected?.trackId === trackId && selected?.clipId === clip.id} pxPerSec={pxPerSec} scrollRef={scrollRef} />
        ))
      )}
      {/* Transition chips between adjacent main-track clips */}
      {row.key === 'video'
        ? row.clips.slice(1).map(({ clip, trackId }) => {
            const hasT = !!clip.transitionIn && clip.transitionIn.type !== 'cut';
            return (
              <Pressable
                key={`tr-${clip.id}`}
                style={[styles.trChip, hasT && styles.trChipOn, { left: clip.start * pxPerSec - 11, top: row.height / 2 - 10 }]}
                onPress={() => {
                  select({ trackId, clipId: clip.id });
                  setPanel('transition');
                }}
              >
                <VIcon name={hasT ? 'fx' : 'plus'} size={12} color={hasT ? '#111' : '#fff'} />
              </Pressable>
            );
          })
        : null}
      {row.addTile && row.clips.length > 0 ? (
        <Pressable onPress={row.add} style={[styles.addTile, { left: lastEnd * pxPerSec + 4, height: row.height }]}>
          <VIcon name="plus" size={22} color="#111" />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Timeline() {
  const project = useEditor((s) => s.project);
  const pxPerSec = useEditor((s) => s.pxPerSec);
  const playheadSec = useEditor((s) => s.playheadSec);
  const selected = useEditor((s) => s.selected);
  const setPlayhead = useEditor((s) => s.setPlayhead);
  const isPlaying = useEditor((s) => s.isPlaying);
  const setPanel = useEditor((s) => s.setPanel);

  const scrollRef = useRef<ScrollView>(null);
  const [viewW, setViewW] = useState(0);
  const userScrolling = useRef(false);

  const tracks = project?.tracks ?? [];
  const visual = tracks.filter((t) => t.kind === 'visual');
  const audio = tracks.filter((t) => t.kind === 'audio');
  const main = visual[0];
  const overlays = project?.overlays ?? [];

  const toEntries = (ts: { id: string; clips: ClipLike[] }[]) => ts.flatMap((t) => t.clips.map((clip) => ({ clip, trackId: t.id })));
  const rows: RowDef[] = [
    { key: 'music', icon: 'gutterAudio', label: 'Music', kind: 'audio', height: MUSIC_H, clips: toEntries(audio), add: () => setPanel('audio'), empty: 'Tap to add music' },
    { key: 'text', icon: 'subtitle', label: 'Text', kind: 'text', height: TEXT_H, clips: overlays.map((o) => ({ clip: { id: o.id, start: o.start, duration: Math.max(0.1, o.end - o.start), text: o.text }, trackId: OVERLAY_TRACK })), add: () => setPanel('insert'), empty: 'Tap to add subtitle' },
    { key: 'image', icon: 'image', label: 'Image', kind: 'visual', height: IMAGE_H, clips: toEntries(visual.slice(1)), add: () => setPanel('insert'), empty: 'Tap to add sticker / PiP' },
    { key: 'video', icon: 'video', label: 'Video', kind: 'visual', height: VIDEO_H, clips: main ? main.clips.map((clip) => ({ clip, trackId: main.id })) : [], add: () => void pickAndAddMedia(), empty: 'Tap to add video', addTile: true },
    { key: 'sound', icon: 'soundfx', label: 'Sound', kind: 'sound', height: SOUND_H, clips: main ? main.clips.filter((c) => c.type === 'video').map((clip) => ({ clip, trackId: main.id })) : [], add: () => Alert.alert('Coming soon', 'Voiceover is coming soon.'), empty: 'Original audio' },
  ];

  const end = project ? projectDuration(project) : 0;
  // Scroll stays enabled while a clip is selected — clip drag/trim gestures
  // block the scroll on touch (see ClipView), so both coexist.
  const scrollEnabled = !isPlaying;
  const scrollW = Math.max(1, viewW - GUTTER_W);
  // leave room past the content for the white "+" add tile on the video row.
  const contentW = Math.max(1, end * pxPerSec + ADD_TILE_W + 8);

  useEffect(() => {
    if (!userScrolling.current && viewW > 0) scrollRef.current?.scrollTo({ x: playheadSec * pxPerSec, animated: false });
  }, [playheadSec, pxPerSec, viewW]);

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!userScrolling.current) return;
    setPlayhead(e.nativeEvent.contentOffset.x / Math.max(1, pxPerSec));
  }

  return (
    <View style={styles.root} onLayout={(e: LayoutChangeEvent) => setViewW(e.nativeEvent.layout.width)}>
      <View style={styles.body}>
        {/* Fixed left gutter: per-row add icons */}
        <View style={styles.gutter}>
          <View style={{ height: RULER_H }} />
          <View style={{ gap: LANE_GAP }}>
            {rows.map((r) => (
              <Pressable key={r.key} style={[styles.gutterItem, { height: r.height }]} onPress={r.add}>
                <VIcon name={r.icon} size={18} color="#fff" />
              </Pressable>
            ))}
          </View>
        </View>

        {/* Scroll area: full-width row bars (fixed) under scrolling clips */}
        <View style={{ flex: 1 }}>
          {/* Fixed full-width background bars (do not scroll) */}
          <View style={[StyleSheet.absoluteFill, { paddingLeft: PLAYHEAD_X }]} pointerEvents="none">
            <View style={{ height: RULER_H }} />
            <View style={{ gap: LANE_GAP }}>
              {rows.map((r) => (
                <RowBg key={r.key} height={r.height} />
              ))}
            </View>
          </View>

          {/* Scrolling ruler + clip lanes (transparent, on top) */}
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            scrollEnabled={scrollEnabled}
            scrollEventThrottle={16}
            onScroll={onScroll}
            onScrollBeginDrag={() => (userScrolling.current = true)}
            onMomentumScrollEnd={() => (userScrolling.current = false)}
            onScrollEndDrag={() => (userScrolling.current = false)}
            contentContainerStyle={{ paddingLeft: PLAYHEAD_X, paddingRight: scrollW }}
          >
            <View style={{ width: contentW }}>
              <Ruler end={end} pxPerSec={pxPerSec} />
              <View style={{ gap: LANE_GAP }}>
                {rows.map((r) => (
                  <ClipLane key={r.key} row={r} scrollW={scrollW} pxPerSec={pxPerSec} selected={selected} scrollRef={scrollRef} />
                ))}
              </View>
            </View>
          </ScrollView>

          {/* Fixed white playhead near the left of the scroll area */}
          <View style={[styles.playhead, { left: PLAYHEAD_X }]} pointerEvents="none">
            <View style={styles.playheadKnob} />
            <View style={styles.playheadLine} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: vela.editorBg, paddingTop: 4 },
  body: { flexDirection: 'row', paddingVertical: 8 },
  gutter: { width: GUTTER_W },
  gutterItem: { alignItems: 'center', justifyContent: 'center' },

  ruler: { height: RULER_H, justifyContent: 'flex-end' },
  tickLabel: { color: vela.muted3, fontSize: 9, marginBottom: 1, fontFamily: mono.regular },
  tickMajor: { width: 1.5, height: 8, backgroundColor: vela.muted3 },
  tickMinor: { width: 1, height: 4, backgroundColor: '#3a3a42' },

  rowBg: { borderRadius: 7, backgroundColor: vela.emptyTrack },
  emptyTap: { height: '100%', justifyContent: 'center' },
  emptyHint: { color: vela.muted4, fontSize: 13, paddingLeft: 12 },

  clip: { position: 'absolute', top: 0, borderRadius: 7, overflow: 'hidden', backgroundColor: '#2a2a30', borderWidth: 2, borderColor: 'transparent' },
  audioClip: { backgroundColor: vela.audio },
  textClip: { backgroundColor: vela.accent, justifyContent: 'center' },
  clipOn: { borderColor: vela.select },
  filmstrip: { flexDirection: 'row', height: '100%', overflow: 'hidden' },
  thumbFallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2a2a30' },
  textFill: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  textLabel: { color: '#fff', fontSize: 11, fontFamily: 'HankenGrotesk_700Bold' },
  waveform: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', paddingHorizontal: 2 },
  soundBlock: { position: 'absolute', top: 0, bottom: 0, borderRadius: 7, overflow: 'hidden', backgroundColor: '#34321f' },
  badge: { position: 'absolute', top: 2, left: 4, backgroundColor: '#000a', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  badgeText: { color: '#fff', fontSize: 9, fontFamily: 'HankenGrotesk_700Bold' },
  durTag: { position: 'absolute', bottom: 2, right: 4, backgroundColor: '#000a', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  durText: { color: '#fff', fontSize: 9, fontFamily: mono.medium },
  addTile: { position: 'absolute', top: 0, width: ADD_TILE_W, backgroundColor: '#fff', borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  trChip: { position: 'absolute', width: 22, height: 20, borderRadius: 6, backgroundColor: '#000a', alignItems: 'center', justifyContent: 'center', zIndex: 6, borderWidth: 1, borderColor: '#fff6' },
  trChipOn: { backgroundColor: vela.select, borderColor: vela.select },
  handle: { position: 'absolute', top: 0, bottom: 0, width: HANDLE_W, backgroundColor: vela.select, alignItems: 'center', justifyContent: 'center' },
  handleLeft: { left: 0, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 },
  handleRight: { right: 0, borderTopRightRadius: 6, borderBottomRightRadius: 6 },
  handleBar: { width: 3, height: 18, borderRadius: 2, backgroundColor: '#111' },

  playhead: { position: 'absolute', top: 0, bottom: 0, alignItems: 'center', marginLeft: -1 },
  playheadKnob: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#fff' },
  playheadLine: { flex: 1, width: 2, backgroundColor: '#fff' },
});
