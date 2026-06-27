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
import { type GestureResponderEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { Blur, Canvas, ColorMatrix, Fill, Group, Image as SkImg, ImageShader, LinearGradient, type SkImage, Shader, Skia, rect, useImage, vec } from '@shopify/react-native-skia';
import { type SharedValue, useSharedValue } from 'react-native-reanimated';
import { useClipFrame } from '../preview/useClipFrame';
import { motionTransform } from '../preview/motion';
import { hasKeyframes, sampleKeyframes } from '../preview/keyframes';
import { ensureFontsLoaded, useFontsVersion } from '../text/fonts';
import { colorMatrix } from '../filters/registry';
import { mono, ratioLabel } from '../constants';
import { clipAtTime } from '../model/editor-ops';
import { projectDuration } from '../model/project';
import type { Background, TextOverlay, VisualTrack, VisualTrackClip } from '../model/types';
import { videoThumbnail } from '../storage/media';
import { OVERLAY_TRACK, useEditor } from '../store/editorStore';

const TICK_MS = 50;
const posterCache = new Map<string, string>();

// Chroma-key (cutout): mirror of the engine `colorkey` — pixels near `keyColor`
// are made transparent so lower layers show through. Approximation of ffmpeg's
// keyer (exact tolerances differ), keyed live to match the export visually.
const CHROMA = Skia.RuntimeEffect.Make(`
uniform shader image;
uniform float3 keyColor;
uniform float similarity;
uniform float smoothness;
half4 main(float2 xy) {
  half4 c = image.eval(xy);
  float d = distance(float3(c.rgb), keyColor);
  float ka = smoothstep(similarity, similarity + smoothness + 0.001, d);
  float a = ka * c.a;
  return half4(c.rgb * a, a);
}`)!;

/** The project background (solid or gradient) — mirrors the engine's resvg bg. */
function BackgroundFill({ bg, width, height }: { bg: Background | undefined; width: number; height: number }) {
  if (bg?.type === 'gradient') {
    const a = ((bg.angle ?? 0) * Math.PI) / 180;
    const cx = width / 2;
    const cy = height / 2;
    const hx = (Math.cos(a) * Math.max(width, height)) / 2;
    const hy = (Math.sin(a) * Math.max(width, height)) / 2;
    return (
      <Fill>
        <LinearGradient start={vec(cx - hx, cy - hy)} end={vec(cx + hx, cy + hy)} colors={[bg.from, bg.to]} />
      </Fill>
    );
  }
  return <Fill color={bg?.type === 'color' ? bg.color : '#000000'} />;
}

/** Interpolated layer opacity from a clip's keyframes at the playhead (1 if none). */
function clipKfOpacity(clip: VisualTrackClip, playheadSec: number): number {
  if (!hasKeyframes(clip.keyframes)) return 1;
  return sampleKeyframes(clip.keyframes!, (playheadSec - clip.start) / Math.max(0.001, clip.duration)).opacity;
}

/** Hex (#rgb / #rrggbb) → normalized 0..1 RGB (defaults to green). */
function hexToRgb01(hex: string): [number, number, number] {
  let h = (hex || '').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return [0, 0.83, 0];
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

/** Draw `image` with a chroma key (cutout) into the given canvas rect. */
function ChromaImage({ image, x, y, w, h, fit, cutout }: {
  image: SkImage | SharedValue<SkImage | null>;
  x: number; y: number; w: number; h: number;
  fit: 'contain' | 'cover';
  cutout: NonNullable<VisualTrackClip['cutout']>;
}) {
  const [r, g, b] = hexToRgb01(cutout.color);
  return (
    <Fill>
      <Shader source={CHROMA} uniforms={{ keyColor: [r, g, b], similarity: cutout.similarity ?? 0.3, smoothness: cutout.smoothness ?? 0.1 }}>
        <ImageShader image={image} fit={fit} rect={rect(x, y, w, h)} tx="decal" ty="decal" />
      </Shader>
    </Fill>
  );
}

/** Skia/expo-video want a URI; our media srcs are bare file paths. */
function toUri(p?: string | null): string | null {
  if (!p) return null;
  return p.startsWith('http') || p.startsWith('file:') ? p : `file://${p}`;
}

/** Base-clip opacity for fade-through-black transitions (in/out windows). */
function transitionOpacity(clip: VisualTrackClip, next: VisualTrackClip | undefined, t: number): number {
  const fin = clip.transitionIn && clip.transitionIn.type !== 'cut' ? clip.transitionIn.duration : 0;
  const fout = next?.transitionIn && next.transitionIn.type !== 'cut' ? next.transitionIn.duration : 0;
  const S = clip.start;
  const E = clip.start + clip.duration;
  let op = 1;
  if (fin > 0 && t < S + fin) op = Math.min(op, (t - S) / fin);
  if (fout > 0 && t > E - fout) op = Math.min(op, (E - t) / fout);
  return Math.max(0, Math.min(1, op));
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
    const sp = clip.speed && clip.speed > 0 ? clip.speed : 1;
    timeSV.value = (clip.trimIn ?? 0) + Math.max(0, (playheadSec - clip.start) * sp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playheadSec, clip.start, clip.trimIn, clip.speed]);
  const frame = useClipFrame(toUri(clip.src), playing, timeSV);
  const cm = colorMatrix(clip.filter);
  const mt = motionTransform(clip.motion, clip.start, clip.duration, playheadSec, width, height);
  return (
    <Group transform={mt} origin={{ x: width / 2, y: height / 2 }} opacity={clipKfOpacity(clip, playheadSec)}>
      {clip.cutout && frame ? (
        <ChromaImage image={frame} x={0} y={0} w={width} h={height} fit="contain" cutout={clip.cutout} />
      ) : (
        <SkImg image={frame} x={0} y={0} width={width} height={height} fit="contain">
          {cm ? <ColorMatrix matrix={cm} /> : null}
          {clip.blur ? <Blur blur={clip.blur * 20} /> : null}
        </SkImg>
      )}
    </Group>
  );
}

/** Active base IMAGE clip. */
function BaseImage({ clip, width, height, playheadSec }: { clip: VisualTrackClip; width: number; height: number; playheadSec: number }) {
  const img = useImage(toUri(clip.src));
  const cm = colorMatrix(clip.filter);
  const mt = motionTransform(clip.motion, clip.start, clip.duration, playheadSec, width, height);
  if (!img) return null;
  return (
    <Group transform={mt} origin={{ x: width / 2, y: height / 2 }} opacity={clipKfOpacity(clip, playheadSec)}>
      {clip.cutout ? (
        <ChromaImage image={img} x={0} y={0} w={width} h={height} fit="contain" cutout={clip.cutout} />
      ) : (
        <SkImg image={img} x={0} y={0} width={width} height={height} fit="contain">
          {cm ? <ColorMatrix matrix={cm} /> : null}
          {clip.blur ? <Blur blur={clip.blur * 20} /> : null}
        </SkImg>
      )}
    </Group>
  );
}

/** A positioned overlay layer (image live; video as a poster frame). */
function OverlayLayer({ clip, width, height, playheadSec }: { clip: VisualTrackClip; width: number; height: number; playheadSec: number }) {
  const r = clip.rect ?? { x: 0, y: 0, w: 1, h: 1 };
  const kf = hasKeyframes(clip.keyframes)
    ? sampleKeyframes(clip.keyframes!, (playheadSec - clip.start) / Math.max(0.001, clip.duration))
    : null;
  const x = (kf ? kf.x : r.x) * width;
  const y = (kf ? kf.y : r.y) * height;
  const w = r.w * width;
  const h = r.h * height;
  const op = kf ? kf.opacity : 1;

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
  const mt = motionTransform(clip.motion, clip.start, clip.duration, playheadSec, w, h);
  if (!img) return null;
  return (
    <Group clip={rect(x, y, w, h)} opacity={op}>
      <Group transform={mt} origin={{ x: x + w / 2, y: y + h / 2 }}>
        {clip.cutout ? (
          <ChromaImage image={img} x={x} y={y} w={w} h={h} fit="cover" cutout={clip.cutout} />
        ) : (
          <SkImg image={img} x={x} y={y} width={w} height={h} fit="cover">
            {cm ? <ColorMatrix matrix={cm} /> : null}
            {clip.blur ? <Blur blur={clip.blur * 20} /> : null}
          </SkImg>
        )}
      </Group>
    </Group>
  );
}

export function Preview({ width, height }: { width: number; height: number }) {
  const project = useEditor((s) => s.project);
  const playheadSec = useEditor((s) => s.playheadSec);
  const isPlaying = useEditor((s) => s.isPlaying);
  const setPlayhead = useEditor((s) => s.setPlayhead);
  const setPlaying = useEditor((s) => s.setPlaying);
  const select = useEditor((s) => s.select);
  const selected = useEditor((s) => s.selected);
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
  const baseClips = base?.clips ?? [];
  const baseIdx = baseActive ? baseClips.findIndex((c) => c.id === baseActive.id) : -1;
  const nextBaseClip = baseIdx >= 0 ? baseClips[baseIdx + 1] : undefined;
  const baseOp = baseActive ? transitionOpacity(baseActive, nextBaseClip, playheadSec) : 1;

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
    .map((t) => {
      const c = clipAtTime(t, lookupT) as VisualTrackClip | undefined;
      return c ? { clip: c, trackId: t.id } : null;
    })
    .filter((x): x is { clip: VisualTrackClip; trackId: string } => !!x);
  const captions = (project?.overlays ?? []).filter((o) => playheadSec >= o.start && playheadSec <= o.end);
  const scale = project ? width / project.width : 1;

  // Tap an element in the preview to SELECT it (top→bottom): sticker/PiP overlays
  // by rect, then captions by a y-band, then the base clip; empty area deselects.
  function onTapPreview(e: GestureResponderEvent) {
    const nx = e.nativeEvent.locationX / width;
    const ny = e.nativeEvent.locationY / height;
    for (let i = activeOverlays.length - 1; i >= 0; i--) {
      const { clip, trackId } = activeOverlays[i];
      const r = clip.rect ?? { x: 0, y: 0, w: 1, h: 1 };
      if (nx >= r.x && nx <= r.x + r.w && ny >= r.y && ny <= r.y + r.h) {
        select({ trackId, clipId: clip.id });
        return;
      }
    }
    for (const o of captions) {
      if (Math.abs(ny - o.y) < 0.1) {
        select({ trackId: OVERLAY_TRACK, clipId: o.id });
        return;
      }
    }
    if (baseActive && base) {
      const isSel = selected?.trackId === base.id && selected?.clipId === baseActive.id;
      select(isSel ? null : { trackId: base.id, clipId: baseActive.id });
      return;
    }
    select(null);
  }

  return (
    <Pressable style={[styles.frame, { width, height }]} onPress={onTapPreview}>
      <Canvas style={{ width, height }}>
        <BackgroundFill bg={project?.background} width={width} height={height} />
        <Group opacity={baseOp}>
          {baseActive?.type === 'video' ? (
            <BaseVideo key={baseActive.id} clip={baseActive} width={width} height={height} isPlaying={isPlaying} playheadSec={playheadSec} />
          ) : baseActive?.type === 'image' ? (
            <BaseImage key={baseActive.id} clip={baseActive} width={width} height={height} playheadSec={playheadSec} />
          ) : null}
        </Group>
        {activeOverlays.map(({ clip }) => (
          <OverlayLayer key={clip.id} clip={clip} width={width} height={height} playheadSec={playheadSec} />
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: { backgroundColor: '#000', borderRadius: 4, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  empty: { position: 'absolute', bottom: 10, color: 'rgba(255,255,255,0.6)', fontSize: 10, fontFamily: mono.regular },
  textOverlay: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
});
