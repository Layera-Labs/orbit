/**
 * Real-time composite preview, rendered with react-native-skia (dev build).
 *
 * The base visual track draws through Skia: the active VIDEO clip is decoded
 * per-frame by `useVideo` (one decoder — only the active clip's sub-component is
 * mounted, keyed by id) and an active IMAGE clip via `useImage`. Higher visual
 * tracks render as positioned overlay layers (image live; overlay video as a
 * poster frame). Text captions stay as RN <Text> over the Canvas. A JS transport
 * clock advances the playhead; per-clip filters/transitions slot into the Skia
 * layers (P4/P5). The server export is the true composite.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Canvas, ColorMatrix, Fill, Group, Image as SkImg, rect, useImage } from '@shopify/react-native-skia';
import { useSharedValue } from 'react-native-reanimated';
import { useClipFrame } from '../preview/useClipFrame';
import { ensureFontsLoaded, useFontsVersion } from '../text/fonts';
import { colorMatrix } from '../filters/registry';
import { mono, ratioLabel } from '../constants';
import { clipAtTime } from '../model/editor-ops';
import { projectDuration } from '../model/project';
import type { TextOverlay, VisualTrack, VisualTrackClip } from '../model/types';
import { videoThumbnail } from '../storage/media';
import { useEditor } from '../store/editorStore';

const TICK_MS = 50;
const posterCache = new Map<string, string>();

/** Skia/expo-video want a URI; our media srcs are bare file paths. */
function toUri(p?: string | null): string | null {
  if (!p) return null;
  return p.startsWith('http') || p.startsWith('file:') ? p : `file://${p}`;
}

/** Active base VIDEO clip — its own `useVideo` decoder; mounted only while active. */
function BaseVideo({ clip, width, height, isPlaying, playheadSec }: { clip: VisualTrackClip; width: number; height: number; isPlaying: boolean; playheadSec: number }) {
  const playing = useSharedValue(isPlaying);
  const timeSV = useSharedValue(0);
  useEffect(() => {
    playing.value = isPlaying;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);
  useEffect(() => {
    timeSV.value = (clip.trimIn ?? 0) + Math.max(0, playheadSec - clip.start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playheadSec, clip.start, clip.trimIn]);
  const frame = useClipFrame(toUri(clip.src), playing, timeSV);
  const cm = colorMatrix(clip.filter);
  return (
    <SkImg image={frame} x={0} y={0} width={width} height={height} fit="contain">
      {cm ? <ColorMatrix matrix={cm} /> : null}
    </SkImg>
  );
}

/** Active base IMAGE clip. */
function BaseImage({ clip, width, height }: { clip: VisualTrackClip; width: number; height: number }) {
  const img = useImage(toUri(clip.src));
  const cm = colorMatrix(clip.filter);
  if (!img) return null;
  return (
    <SkImg image={img} x={0} y={0} width={width} height={height} fit="contain">
      {cm ? <ColorMatrix matrix={cm} /> : null}
    </SkImg>
  );
}

/** A positioned overlay layer (image live; video as a poster frame). */
function OverlayLayer({ clip, width, height }: { clip: VisualTrackClip; width: number; height: number }) {
  const r = clip.rect ?? { x: 0, y: 0, w: 1, h: 1 };
  const x = r.x * width;
  const y = r.y * height;
  const w = r.w * width;
  const h = r.h * height;

  const [posterUri, setPosterUri] = useState<string | null>(clip.type === 'image' ? clip.src : posterCache.get(clip.src) ?? null);
  useEffect(() => {
    let alive = true;
    if (clip.type === 'video' && !posterCache.has(clip.src)) {
      videoThumbnail(clip.src, clip.trimIn ?? 0).then((t) => {
        if (t) {
          posterCache.set(clip.src, t);
          if (alive) setPosterUri(t);
        }
      });
    }
    return () => {
      alive = false;
    };
  }, [clip.src, clip.type, clip.type === 'video' ? clip.trimIn : 0]);

  const img = useImage(toUri(posterUri));
  const cm = colorMatrix(clip.filter);
  if (!img) return null;
  return (
    <Group clip={rect(x, y, w, h)}>
      <SkImg image={img} x={x} y={y} width={w} height={h} fit="cover">
        {cm ? <ColorMatrix matrix={cm} /> : null}
      </SkImg>
    </Group>
  );
}

export function Preview({ width, height }: { width: number; height: number }) {
  const project = useEditor((s) => s.project);
  const playheadSec = useEditor((s) => s.playheadSec);
  const isPlaying = useEditor((s) => s.isPlaying);
  const setPlayhead = useEditor((s) => s.setPlayhead);
  const setPlaying = useEditor((s) => s.setPlaying);
  const fontsVersion = useFontsVersion();
  const startedAt = useRef(0);

  // Pre-load Google fonts referenced by captions (e.g. on reopening a project).
  const famKey = (project?.overlays ?? []).map((o) => (o.type === 'text' ? o.fontFamily : '')).join(',');
  useEffect(() => {
    ensureFontsLoaded((project?.overlays ?? []).flatMap((o) => (o.type === 'text' && o.fontFamily ? [o.fontFamily] : [])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [famKey]);

  const total = project ? projectDuration(project) : 0;
  const lookupT = total > 0 ? Math.min(playheadSec, total - 0.01) : playheadSec;
  const visualTracks = (project?.tracks ?? []).filter((t): t is VisualTrack => t.kind === 'visual');
  const base = visualTracks[0];
  const overlayTracks = visualTracks.slice(1);
  const baseActive = base ? (clipAtTime(base, lookupT) as VisualTrackClip | undefined) : undefined;

  // Transport clock: advance the playhead while playing.
  useEffect(() => {
    if (!isPlaying || !project) return;
    let last = Date.now();
    let acc = playheadSec >= total ? 0 : playheadSec;
    startedAt.current = acc;
    const timer = setInterval(() => {
      const now = Date.now();
      acc += (now - last) / 1000;
      last = now;
      if (acc >= total) {
        setPlayhead(total);
        setPlaying(false);
        return;
      }
      setPlayhead(acc);
    }, TICK_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, total, project?.id]);

  const activeOverlays = overlayTracks
    .map((t) => clipAtTime(t, lookupT) as VisualTrackClip | undefined)
    .filter((c): c is VisualTrackClip => !!c);
  const captions = (project?.overlays ?? []).filter((o) => playheadSec >= o.start && playheadSec <= o.end);
  const scale = project ? width / project.width : 1;

  return (
    <View style={[styles.frame, { width, height }]}>
      <Canvas style={{ width, height }}>
        <Fill color="#000000" />
        {baseActive?.type === 'video' ? (
          <BaseVideo key={baseActive.id} clip={baseActive} width={width} height={height} isPlaying={isPlaying} playheadSec={playheadSec} />
        ) : baseActive?.type === 'image' ? (
          <BaseImage key={baseActive.id} clip={baseActive} width={width} height={height} />
        ) : null}
        {activeOverlays.map((c) => (
          <OverlayLayer key={c.id} clip={c} width={width} height={height} />
        ))}
      </Canvas>

      {!baseActive && total === 0 ? (
        <Text style={styles.empty}>your clip · {project ? ratioLabel(project.width, project.height) : '9:16'}</Text>
      ) : null}

      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {captions.map((o: TextOverlay) => (
          <View key={o.id} style={[styles.textOverlay, { top: o.y * height }]}>
            <Text
              key={`${o.fontFamily ?? 'def'}-${fontsVersion}`}
              style={{
                color: o.color,
                fontSize: Math.max(8, o.fontSize * scale),
                fontWeight: o.bold ? '700' : '400',
                textAlign: o.align ?? 'center',
                fontFamily: o.fontFamily,
                width: '90%',
              }}
            >
              {o.text}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { backgroundColor: '#000', borderRadius: 4, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  empty: { position: 'absolute', bottom: 10, color: 'rgba(255,255,255,0.6)', fontSize: 10, fontFamily: mono.regular },
  textOverlay: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
});
