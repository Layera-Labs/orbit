/**
 * Real-time composite preview, rendered with react-native-skia (dev build).
 *
 * The base visual track draws through Skia: the active VIDEO clip is decoded
 * per-frame by `useVideo` (one decoder — only the active clip's sub-component is
 * mounted, keyed by id) and an active IMAGE clip via `useImage`. Higher visual
 * tracks render as positioned overlay layers (image via useImage; overlay video
 * decoded live by its own useClipFrame). Text captions stay as RN <Text> over
 * the Canvas. A JS transport
 * clock advances the playhead; per-clip filters/transitions slot into the Skia
 * layers (P4/P5). The server export is the true composite.
 */
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Blur, Canvas, ColorMatrix, Fill, Group, Image as SkImg, ImageShader, LinearGradient, type SkImage, Shader, Skia, rect, useImage, vec } from '@shopify/react-native-skia';
import { type SharedValue, useSharedValue } from 'react-native-reanimated';
import { useClipFrame } from '../preview/useClipFrame';
import { motionTransform, motionStateAt, hasMotion } from '../preview/motion';
import { blendToSkia } from '../preview/blend';
import { hasKeyframes, sampleKeyframes } from '../preview/keyframes';
import { ensureFontsLoaded, useFontsVersion } from '../text/fonts';
import { colorMatrix } from '../filters/registry';
import { mono, ratioLabel } from '../constants';
import { clipAtTime } from '../model/editor-ops';
import { projectDuration } from '../model/project';
import type { Background, TextOverlay, VisualTrack, VisualTrackClip } from '../model/types';
import { OVERLAY_TRACK, useEditor } from '../store/editorStore';

const TICK_MS = 50;

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

/** The project background (solid / gradient / image) — mirrors the engine bg. */
function BackgroundFill({ bg, width, height }: { bg: Background | undefined; width: number; height: number }) {
  const bgImg = useImage(bg?.type === 'image' ? toUri(bg.src) : null);
  if (bg?.type === 'image') {
    return bgImg ? <SkImg image={bgImg} x={0} y={0} width={width} height={height} fit="cover" /> : <Fill color="#000000" />;
  }
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

/** Layer opacity at the playhead: keyframes if animated, else the static value. */
function clipKfOpacity(clip: VisualTrackClip, playheadSec: number): number {
  if (!hasKeyframes(clip.keyframes)) return clip.opacity ?? 1;
  return sampleKeyframes(clip.keyframes!, (playheadSec - clip.start) / Math.max(0.001, clip.duration)).opacity;
}

/** Skia clip (rect or oval path) + invert for a clip's shape mask, in canvas px. */
function maskClipFor(mask: VisualTrackClip['mask'], x: number, y: number, w: number, h: number) {
  if (!mask || mask.rx <= 0 || mask.ry <= 0) return null;
  const cx = x + mask.cx * w;
  const cy = y + mask.cy * h;
  const hw = mask.rx * w;
  const hh = mask.ry * h;
  const box = rect(cx - hw, cy - hh, hw * 2, hh * 2);
  if (mask.shape === 'circle') {
    const path = Skia.Path.Make();
    path.addOval(box);
    return { clip: path, invertClip: !!mask.invert };
  }
  return { clip: box, invertClip: !!mask.invert };
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
  const mc = maskClipFor(clip.mask, 0, 0, width, height);
  const content =
    clip.cutout && frame ? (
      <ChromaImage image={frame} x={0} y={0} w={width} h={height} fit="contain" cutout={clip.cutout} />
    ) : (
      <SkImg image={frame} x={0} y={0} width={width} height={height} fit="contain">
        {cm ? <ColorMatrix matrix={cm} /> : null}
        {clip.blur ? <Blur blur={clip.blur * 20} /> : null}
      </SkImg>
    );
  return (
    <Group transform={mt} origin={{ x: width / 2, y: height / 2 }} opacity={clipKfOpacity(clip, playheadSec)} blendMode={blendToSkia(clip.blend)}>
      {mc ? <Group clip={mc.clip} invertClip={mc.invertClip}>{content}</Group> : content}
    </Group>
  );
}

/** Active base IMAGE clip. */
function BaseImage({ clip, width, height, playheadSec }: { clip: VisualTrackClip; width: number; height: number; playheadSec: number }) {
  const img = useImage(toUri(clip.src));
  const cm = colorMatrix(clip.filter);
  const mt = motionTransform(clip.motion, clip.start, clip.duration, playheadSec, width, height);
  const mc = maskClipFor(clip.mask, 0, 0, width, height);
  if (!img) return null;
  const content = clip.cutout ? (
    <ChromaImage image={img} x={0} y={0} w={width} h={height} fit="contain" cutout={clip.cutout} />
  ) : (
    <SkImg image={img} x={0} y={0} width={width} height={height} fit="contain">
      {cm ? <ColorMatrix matrix={cm} /> : null}
      {clip.blur ? <Blur blur={clip.blur * 20} /> : null}
    </SkImg>
  );
  return (
    <Group transform={mt} origin={{ x: width / 2, y: height / 2 }} opacity={clipKfOpacity(clip, playheadSec)} blendMode={blendToSkia(clip.blend)}>
      {mc ? <Group clip={mc.clip} invertClip={mc.invertClip}>{content}</Group> : content}
    </Group>
  );
}

type OverlayGeom = { x: number; y: number; w: number; h: number; op: number; mt: ReturnType<typeof motionTransform>; mc: ReturnType<typeof maskClipFor> };

/** Pure placement/opacity/motion/mask geometry for an overlay clip at the playhead. */
function overlayGeom(clip: VisualTrackClip, width: number, height: number, playheadSec: number): OverlayGeom {
  const r = clip.rect ?? { x: 0, y: 0, w: 1, h: 1 };
  const kf = hasKeyframes(clip.keyframes)
    ? sampleKeyframes(clip.keyframes!, (playheadSec - clip.start) / Math.max(0.001, clip.duration))
    : null;
  const x = (kf ? kf.x : r.x) * width;
  const y = (kf ? kf.y : r.y) * height;
  const w = r.w * width;
  const h = r.h * height;
  const op = kf ? kf.opacity : clip.opacity ?? 1;
  return { x, y, w, h, op, mt: motionTransform(clip.motion, clip.start, clip.duration, playheadSec, w, h), mc: maskClipFor(clip.mask, x, y, w, h) };
}

/** Shared overlay compositing (rect clip + opacity + blend + motion + mask + fx) given a resolved image. */
function OverlayFrame({ clip, geom, image }: { clip: VisualTrackClip; geom: OverlayGeom; image: SkImage | SharedValue<SkImage | null> }) {
  const { x, y, w, h, op, mt, mc } = geom;
  const cm = colorMatrix(clip.filter);
  const content = clip.cutout ? (
    <ChromaImage image={image} x={x} y={y} w={w} h={h} fit="cover" cutout={clip.cutout} />
  ) : (
    <SkImg image={image} x={x} y={y} width={w} height={h} fit="cover">
      {cm ? <ColorMatrix matrix={cm} /> : null}
      {clip.blur ? <Blur blur={clip.blur * 20} /> : null}
    </SkImg>
  );
  return (
    <Group clip={rect(x, y, w, h)} opacity={op} blendMode={blendToSkia(clip.blend)}>
      <Group transform={mt} origin={{ x: x + w / 2, y: y + h / 2 }}>
        {mc ? <Group clip={mc.clip} invertClip={mc.invertClip}>{content}</Group> : content}
      </Group>
    </Group>
  );
}

/** Overlay VIDEO clip — decoded live (its own useClipFrame), like the base. */
function OverlayVideoLayer({ clip, width, height, isPlaying, playheadSec }: { clip: VisualTrackClip; width: number; height: number; isPlaying: boolean; playheadSec: number }) {
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
  return <OverlayFrame clip={clip} geom={overlayGeom(clip, width, height, playheadSec)} image={frame} />;
}

/** Overlay IMAGE / sticker clip. */
function OverlayImageLayer({ clip, width, height, playheadSec }: { clip: VisualTrackClip; width: number; height: number; playheadSec: number }) {
  const img = useImage(toUri(clip.src));
  if (!img) return null;
  return <OverlayFrame clip={clip} geom={overlayGeom(clip, width, height, playheadSec)} image={img} />;
}

export function Preview({ width, height }: { width: number; height: number }) {
  const project = useEditor((s) => s.project);
  const playheadSec = useEditor((s) => s.playheadSec);
  const isPlaying = useEditor((s) => s.isPlaying);
  const setPlayhead = useEditor((s) => s.setPlayhead);
  const setPlaying = useEditor((s) => s.setPlaying);
  const select = useEditor((s) => s.select);
  const selected = useEditor((s) => s.selected);
  const setClipRect = useEditor((s) => s.setClipRect);
  const dragRect = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
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
  function onTapPreview(px: number, py: number) {
    const nx = px / width;
    const ny = py / height;
    for (let i = activeOverlays.length - 1; i >= 0; i--) {
      const { clip, trackId } = activeOverlays[i];
      const r = clip.rect ?? { x: 0, y: 0, w: 1, h: 1 };
      if (nx >= r.x && nx <= r.x + r.w && ny >= r.y && ny <= r.y + r.h) {
        select({ trackId, clipId: clip.id });
        return;
      }
    }
    for (const o of captions) {
      // Hit-test the caption's CURRENT band: keyframes move it off its base y.
      const kf = hasKeyframes(o.keyframes)
        ? sampleKeyframes(o.keyframes!, Math.max(0, Math.min(1, (playheadSec - o.start) / Math.max(0.001, o.end - o.start))))
        : null;
      const cy = kf ? kf.y : o.y;
      if (Math.abs(ny - cy) < 0.1) {
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

  // Drag a selected PiP/overlay clip to reposition it on the canvas; a tap
  // (no movement) selects. Dragging the base clip does nothing.
  const dragPan = Gesture.Pan()
    .runOnJS(true)
    .onBegin(() => {
      dragRect.current = null;
      const sel = useEditor.getState().selected;
      if (!sel || !base || sel.trackId === base.id) return;
      const tr = (project?.tracks ?? []).find((t) => t.id === sel.trackId);
      const c = tr?.clips.find((x) => x.id === sel.clipId) as VisualTrackClip | undefined;
      if (c?.rect) dragRect.current = { ...c.rect };
    })
    .onUpdate((e) => {
      const r = dragRect.current;
      const sel = useEditor.getState().selected;
      if (!r || !sel) return;
      const nx = Math.max(0, Math.min(1 - r.w, r.x + e.translationX / width));
      const ny = Math.max(0, Math.min(1 - r.h, r.y + e.translationY / height));
      setClipRect(sel.trackId, sel.clipId, { ...r, x: nx, y: ny });
    });
  const tap = Gesture.Tap().runOnJS(true).maxDistance(10).onEnd((e) => onTapPreview(e.x, e.y));
  const gesture = Gesture.Race(dragPan, tap);

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.frame, { width, height }]}>
      <Canvas style={{ width, height }}>
        <BackgroundFill bg={project?.background} width={width} height={height} />
        <Group opacity={baseOp}>
          {baseActive?.type === 'video' ? (
            <BaseVideo key={baseActive.id} clip={baseActive} width={width} height={height} isPlaying={isPlaying} playheadSec={playheadSec} />
          ) : baseActive?.type === 'image' ? (
            <BaseImage key={baseActive.id} clip={baseActive} width={width} height={height} playheadSec={playheadSec} />
          ) : null}
        </Group>
        {activeOverlays.map(({ clip }) =>
          clip.type === 'video' ? (
            <OverlayVideoLayer key={clip.id} clip={clip} width={width} height={height} isPlaying={isPlaying} playheadSec={playheadSec} />
          ) : (
            <OverlayImageLayer key={clip.id} clip={clip} width={width} height={height} playheadSec={playheadSec} />
          ),
        )}
      </Canvas>

      {!baseActive && total === 0 ? (
        <Text style={styles.empty}>your clip · {project ? ratioLabel(project.width, project.height) : '9:16'}</Text>
      ) : null}

      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {captions.map((o: TextOverlay) => {
          // Animate the caption over its [start,end] window: keyframes drive
          // opacity + position (delta from the baked anchor); motion adds a
          // centered Ken-Burns scale/pan — the same math the export uses.
          const dur = Math.max(0.001, o.end - o.start);
          const p = Math.max(0, Math.min(1, (playheadSec - o.start) / dur));
          const kf = hasKeyframes(o.keyframes) ? sampleKeyframes(o.keyframes!, p) : null;
          const ms = hasMotion(o.motion) ? motionStateAt(o.motion, p) : null;
          const tx = (ms ? ms.tx * width : 0) + (kf ? (kf.x - o.x) * width : 0);
          const ty = (ms ? ms.ty * height : 0) + (kf ? (kf.y - o.y) * height : 0);
          const sc = ms ? ms.scale : 1;
          return (
            <View
              key={o.id}
              style={[
                styles.textOverlay,
                {
                  top: o.y * height,
                  opacity: kf ? kf.opacity : 1,
                  // Pivot the Ken-Burns scale about the CANVAS centre (not the
                  // caption's own centre) so it matches the export's zoompan.
                  transformOrigin: [width / 2, 0.5 * height - o.y * height, 0],
                  transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }],
                },
              ]}
            >
              <CaptionText o={o} scale={scale} fontsVersion={fontsVersion} />
            </View>
          );
        })}
      </View>
      </View>
    </GestureDetector>
  );
}

/** Fold an opacity into a hex color → rgba() (pass-through for non-hex). */
function shadowRgba(color: string, opacity?: number): string {
  if (opacity == null) return color;
  const m = /^#([0-9a-f]{6})$/i.exec(color) ?? /^#([0-9a-f]{3})$/i.exec(color);
  if (!m) return color;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// 8-direction offsets used to fake a text stroke (RN <Text> has no native one).
const STROKE_OFFSETS = [
  [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1],
] as const;

/**
 * Renders one caption's text with its style: line-height, drop shadow (native
 * textShadow), and an outline stroke drawn as offset duplicate <Text> layers
 * behind the fill (there is no native RN text stroke). Keyed by fontsVersion so
 * it remounts once a downloaded font registers (iOS font-miss cache).
 */
function CaptionText({ o, scale, fontsVersion }: { o: TextOverlay; scale: number; fontsVersion: number }) {
  const fontSize = Math.max(8, o.fontSize * scale);
  const base: TextStyle = {
    fontSize,
    fontWeight: o.bold ? '700' : '400',
    textAlign: o.align ?? 'center',
    fontFamily: o.fontFamily,
    letterSpacing: (o.letterSpacing ?? 0) * scale,
    lineHeight: o.lineHeight ? fontSize * o.lineHeight : undefined,
  };
  const shadow: TextStyle = o.shadow
    ? {
        textShadowColor: shadowRgba(o.shadow.color, o.shadow.opacity),
        textShadowOffset: { width: (o.shadow.dx ?? 0) * scale, height: (o.shadow.dy ?? 2) * scale },
        textShadowRadius: (o.shadow.blur ?? 4) * scale,
      }
    : // Default legibility floor so captions read over any footage.
      { textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 };
  const key = `${o.fontFamily ?? 'def'}-${fontsVersion}`;

  if (!o.stroke || o.stroke.width <= 0) {
    return <Text key={key} style={[base, shadow, { color: o.color, width: '90%' }]}>{o.text}</Text>;
  }
  const w = o.stroke.width * scale;
  return (
    <View style={{ width: '90%' }}>
      {STROKE_OFFSETS.map(([dx, dy], i) => (
        <Text
          key={`${key}-s${i}`}
          style={[base, { color: o.stroke!.color, position: 'absolute', left: 0, right: 0, transform: [{ translateX: dx * w }, { translateY: dy * w }] }]}
        >
          {o.text}
        </Text>
      ))}
      <Text key={key} style={[base, shadow, { color: o.color }]}>{o.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { backgroundColor: '#000', borderRadius: 4, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  empty: { position: 'absolute', bottom: 10, color: 'rgba(255,255,255,0.85)', fontSize: 11, fontFamily: mono.regular },
  textOverlay: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
});
