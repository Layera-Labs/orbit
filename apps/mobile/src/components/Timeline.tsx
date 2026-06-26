/**
 * CapCut-style multi-track timeline (Expo Go — RN Views + Gesture Handler).
 *
 * Layout: a FIXED left gutter of per-row add-icons aligned to FIVE fixed lanes,
 * top→bottom — Music · Text · Image · Video · Sound — and a horizontally
 * scrolling area (ruler + lanes) under a fixed playhead (scroll = scrub). Clips
 * are absolutely positioned by their ABSOLUTE start; a selected clip drags by
 * the body (move in time) or edge handles (trim); scroll locks while selected.
 * The Sound lane is a read-only waveform mirror of the main video clips' audio.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../constants';
import { MIN_CLIP } from '../model/editor-ops';
import { projectDuration } from '../model/project';
import type { Rect, VisualTrackClip } from '../model/types';
import { pickAndAddAudio, pickAndAddMedia, pickAndAddOverlay } from '../media/pick';
import { videoThumbnail } from '../storage/media';
import { OVERLAY_TRACK, useEditor } from '../store/editorStore';

const MUSIC_H = 38;
const TEXT_H = 30;
const IMAGE_H = 42;
const VIDEO_H = 56;
const SOUND_H = 34;
const RULER_H = 22;
const GUTTER_W = 48;
const LANE_GAP = 5;
const HANDLE_W = 16;
const PLAYHEAD_X = 10; // playhead offset from the gutter — clips start right here (no big gap)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type RowKind = 'audio' | 'text' | 'visual' | 'sound';
type ClipLike = { id: string; start: number; duration: number; trimIn?: number; src?: string; type?: 'video' | 'image'; rect?: Rect; text?: string };
interface RowDef {
  key: string;
  icon: IconName;
  label: string;
  kind: RowKind;
  height: number;
  clips: { clip: ClipLike; trackId: string }[];
  add: () => void;
  empty: string;
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
        <Ionicons name={clip.type === 'video' ? 'film-outline' : 'image-outline'} size={18} color={theme.muted} />
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

function ClipView({ clip, trackId, kind, height, selected, pxPerSec }: { clip: ClipLike; trackId: string; kind: RowKind; height: number; selected: boolean; pxPerSec: number }) {
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
  const bodyPan = Gesture.Pan().runOnJS(true).onBegin(begin).onUpdate((e) => setClipStart(trackId, clip.id, startRef.current.start + e.translationX / pxPerSec));
  const leftPan = Gesture.Pan()
    .runOnJS(true)
    .onBegin(begin)
    .onUpdate((e) => {
      const ds = e.translationX / pxPerSec;
      const newStart = Math.max(0, startRef.current.start + ds);
      const applied = newStart - startRef.current.start;
      trimClip(trackId, clip.id, { start: newStart, trimIn: Math.max(0, startRef.current.trimIn + applied), duration: Math.max(MIN_CLIP, startRef.current.duration - applied) });
    });
  const rightPan = Gesture.Pan()
    .runOnJS(true)
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
        <Waveform seed={clip.id} width={width} color="#9ff5d6" />
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

function laneBg(kind: RowKind) {
  return kind === 'audio' ? styles.audioLane : kind === 'text' ? styles.textLane : kind === 'sound' ? styles.soundLane : styles.visualLane;
}

/** Fixed, full-width background bar for a row (does not scroll). */
function RowBg({ row }: { row: RowDef }) {
  return <View style={[styles.rowBg, { height: row.height }, laneBg(row.kind)]} />;
}

/** Scrolling clip layer for a row (transparent; sits on top of the RowBg). */
function ClipLane({ row, scrollW, pxPerSec, selected }: { row: RowDef; scrollW: number; pxPerSec: number; selected: ReturnType<typeof useEditor.getState>['selected'] }) {
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
          <ClipView key={clip.id} clip={clip} trackId={trackId} kind={row.kind} height={row.height} selected={selected?.trackId === trackId && selected?.clipId === clip.id} pxPerSec={pxPerSec} />
        ))
      )}
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
  const addText = useEditor((s) => s.addText);

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
    { key: 'music', icon: 'musical-notes', label: 'Music', kind: 'audio', height: MUSIC_H, clips: toEntries(audio), add: () => void pickAndAddAudio(), empty: 'Tap ♪+ to add music' },
    { key: 'text', icon: 'text', label: 'Text', kind: 'text', height: TEXT_H, clips: overlays.map((o) => ({ clip: { id: o.id, start: o.start, duration: Math.max(0.1, o.end - o.start), text: o.text }, trackId: OVERLAY_TRACK })), add: addText, empty: 'Tap T+ to add subtitle' },
    { key: 'image', icon: 'image', label: 'Image', kind: 'visual', height: IMAGE_H, clips: toEntries(visual.slice(1)), add: () => void pickAndAddOverlay(), empty: 'Tap +  to add sticker / PiP' },
    { key: 'video', icon: 'film', label: 'Video', kind: 'visual', height: VIDEO_H, clips: main ? main.clips.map((clip) => ({ clip, trackId: main.id })) : [], add: () => void pickAndAddMedia(), empty: 'Tap +  to add video' },
    { key: 'sound', icon: 'volume-high', label: 'Sound', kind: 'sound', height: SOUND_H, clips: main ? main.clips.filter((c) => c.type === 'video').map((clip) => ({ clip, trackId: main.id })) : [], add: () => Alert.alert('Coming soon', 'Voiceover is coming soon.'), empty: 'Original audio' },
  ];

  const end = project ? projectDuration(project) : 0;
  const scrollEnabled = !selected && !isPlaying;
  const scrollW = Math.max(1, viewW - GUTTER_W);
  const contentW = Math.max(1, end * pxPerSec);

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
                <Ionicons name={r.icon} size={16} color={theme.text} />
                <Text style={styles.gutterLabel}>{r.label}</Text>
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
                <RowBg key={r.key} row={r} />
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
                  <ClipLane key={r.key} row={r} scrollW={scrollW} pxPerSec={pxPerSec} selected={selected} />
                ))}
              </View>
            </View>
          </ScrollView>

          {/* Fixed playhead near the left of the scroll area */}
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
  root: { backgroundColor: theme.editorBg, borderTopWidth: 1, borderTopColor: theme.trackBorder },
  body: { flexDirection: 'row', paddingVertical: 8 },
  gutter: { width: GUTTER_W, borderRightWidth: 1, borderRightColor: theme.trackBorder },
  gutterItem: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  gutterLabel: { color: theme.subtext, fontSize: 8, fontWeight: '600' },

  ruler: { height: RULER_H, justifyContent: 'flex-end', borderBottomWidth: 1, borderBottomColor: theme.trackBorder },
  tickLabel: { color: theme.subtext, fontSize: 10, marginBottom: 1, fontWeight: '600' },
  tickMajor: { width: 1.5, height: 9, backgroundColor: theme.subtext },
  tickMinor: { width: 1, height: 5, backgroundColor: '#3f5170' },

  rowBg: { borderRadius: 6 },
  visualLane: { backgroundColor: theme.track },
  audioLane: { backgroundColor: '#332b3c' },
  textLane: { backgroundColor: theme.track },
  soundLane: { backgroundColor: '#34321f' },
  emptyTap: { height: '100%', justifyContent: 'center' },
  emptyHint: { color: theme.subtext, fontSize: 11, paddingLeft: 8 },

  clip: { position: 'absolute', top: 0, borderRadius: 8, overflow: 'hidden', backgroundColor: theme.surface, borderWidth: 2, borderColor: 'transparent' },
  audioClip: { backgroundColor: '#1f6f57' },
  textClip: { backgroundColor: '#6d4bd6', justifyContent: 'center' },
  clipOn: { borderColor: theme.accent },
  filmstrip: { flexDirection: 'row', height: '100%', overflow: 'hidden' },
  thumbFallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surface },
  textFill: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  textLabel: { color: '#fff', fontSize: 11, fontWeight: '700' },
  waveform: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', paddingHorizontal: 2 },
  soundBlock: { position: 'absolute', top: 0, bottom: 0, borderRadius: 6, overflow: 'hidden', backgroundColor: '#3a3417' },
  badge: { position: 'absolute', top: 2, left: 4, backgroundColor: '#000a', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  durTag: { position: 'absolute', bottom: 2, right: 4, backgroundColor: '#000a', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  durText: { color: '#fff', fontSize: 9, fontWeight: '600' },
  handle: { position: 'absolute', top: 0, bottom: 0, width: HANDLE_W, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
  handleLeft: { left: 0, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 },
  handleRight: { right: 0, borderTopRightRadius: 6, borderBottomRightRadius: 6 },
  handleBar: { width: 3, height: 18, borderRadius: 2, backgroundColor: theme.accentText },

  playhead: { position: 'absolute', top: 0, bottom: 0, alignItems: 'center', marginLeft: -1 },
  playheadKnob: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#fff' },
  playheadLine: { flex: 1, width: 2, backgroundColor: '#fff' },

  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.border },
  zoomBtn: { width: 34, height: 28, borderRadius: 8, backgroundColor: theme.surface, alignItems: 'center', justifyContent: 'center' },
  time: { color: theme.subtext, fontSize: 13, minWidth: 56, textAlign: 'center' },
});
