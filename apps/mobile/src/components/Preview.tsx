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
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  Fragment,
  type ReactNode,
} from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";
import {
  Gesture,
  GestureDetector,
  type GestureType,
} from "react-native-gesture-handler";
import {
  Blur,
  Canvas,
  ColorMatrix,
  Fill,
  Group,
  Image as SkImg,
  ImageShader,
  LinearGradient,
  Mask,
  Path as SkPath,
  RuntimeShader,
  type SkImage,
  type Transforms3d,
  DiffRect,
  Shader,
  Skia,
  rect,
  rrect,
  vec,
} from "@shopify/react-native-skia";
import {
  type SharedValue,
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated";
import { useClipFrame } from "../preview/useClipFrame";
import { buildEdgeFadeMap, fadeFactorAt } from "../preview/transitions";
import {
  resolveTransitions,
  xfadeMapOf,
  xfadeStateFor,
  xfadeVeilAt,
  type XfMask,
} from "../preview/xfade";
import {
  canvasFramePx,
  frameOuterPaint,
  hasCanvasFrame,
} from "../preview/canvasFrame";
import { gradientEnds } from "../preview/gradient";
import {
  prefetchImage,
  prefetchVideo,
  useCachedImage,
} from "../preview/mediaCache";
import { motionTransform, motionStateAt, hasMotion } from "../preview/motion";
import { blendToSkia } from "../preview/blend";
import { snapSpan, targetsFor, type Span } from "../preview/snap";
import {
  animatesOpacity,
  animatesPosition,
  hasKeyframes,
  sampleKeyframes,
} from "../preview/keyframes";
import {
  elementFadeAt,
  resolveAnim,
  slideOffsetAt,
} from "../preview/elementAnim";
import { cropDrawRect, normalizeRotation } from "../preview/transform";
import {
  PreviewTransformHandles,
  type TransformPatch,
} from "./PreviewTransformHandles";
import { previewAudioOf, PreviewAudio } from "../preview/audioGraph";
import { ensureFontsLoaded, useFontsVersion } from "../text/fonts";
import { colorMatrix } from "../filters/registry";
import { mono, ratioLabel } from "../constants";
import { clipAtTime, clipsAtTime } from "../model/editor-ops";
import { projectDuration } from "../model/project";
import type {
  Background,
  Rect,
  CanvasFrame,
  TextOverlay,
  VisualTrack,
  VisualTrackClip,
} from "../model/types";
import { OVERLAY_TRACK, useEditor } from "../store/editorStore";

/** Fallback preview tick (20fps) when no preference is set. The Preview FPS
 *  preference drives this — see `tickMs` below. */
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

/**
 * The canvas frame: a mat over the finished picture.
 *
 * In its OWN `<Canvas>`, layered after the captions rather than drawn as the
 * last child of the main one — and that is a z-order fix, not a preference.
 * Captions are RN `<Text>` outside the Skia canvas (they need real font
 * rendering), so anything drawn inside the canvas sits UNDER them, while the
 * export composites the frame over every caption. Drawn here, the order is the
 * export's: picture, captions, frame.
 *
 * `DiffRect` is the mat exactly — an outer rect minus an inner rounded one —
 * so the shape needs no approximating, and the geometry comes from the mirrored
 * `canvasFramePx` rather than being worked out again here. Rounding the opening
 * rounds the CARD too, concentrically, and the wedges left outside it are
 * painted with the background, so the mat reads as an object sitting on the
 * page rather than a square with a hole in it.
 */
function CanvasFrameLayer({
  frame,
  background,
  width,
  height,
}: {
  frame: CanvasFrame | undefined;
  background: Background | undefined;
  width: number;
  height: number;
}) {
  if (!hasCanvasFrame(frame)) return null;
  const { borderPx, radiusPx, outerRadiusPx } = canvasFramePx(
    frame,
    width,
    height,
  );
  const inner = rect(
    borderPx,
    borderPx,
    Math.max(0, width - borderPx * 2),
    Math.max(0, height - borderPx * 2),
  );
  const full = rect(0, 0, width, height);
  /*
   * What shows outside the card. Read from the mirrored `frameOuterPaint` and
   * never worked out here: a photo background resolves to black in the export
   * because no rasterized SVG can carry a photograph, and painting the real
   * photo here instead would be exactly the divergence that helper exists to
   * prevent.
   */
  const paint = frameOuterPaint(background);
  const outerR = outerRadiusPx;
  return (
    <Canvas
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
    >
      {outerR > 0 ? (
        /* Outside the card: the background, opaque, whatever the band's own
           opacity is — see the shared SVG builder. */
        <DiffRect
          outer={rrect(full, 0, 0)}
          inner={rrect(full, outerR, outerR)}
          color={paint.kind === "color" ? paint.color : undefined}
        >
          {paint.kind === "gradient" ? (
            <LinearGradient
              start={gradientStart(paint.angle, width, height)}
              end={gradientEnd(paint.angle, width, height)}
              colors={[paint.from, paint.to]}
            />
          ) : null}
        </DiffRect>
      ) : null}
      <DiffRect
        outer={rrect(full, outerR, outerR)}
        inner={rrect(inner, radiusPx, radiusPx)}
        color={frame.color}
        opacity={frame.opacity ?? 1}
      />
    </Canvas>
  );
}

/** A gradient's endpoints in canvas px, from the shared angle convention. */
function gradientStart(angle: number | undefined, w: number, h: number) {
  const g = gradientEnds(angle);
  return vec(g.x1 * w, g.y1 * h);
}
function gradientEnd(angle: number | undefined, w: number, h: number) {
  const g = gradientEnds(angle);
  return vec(g.x2 * w, g.y2 * h);
}

/** The project background (solid / gradient / image) — mirrors the engine bg. */
function BackgroundFill({
  bg,
  width,
  height,
}: {
  bg: Background | undefined;
  width: number;
  height: number;
}) {
  const bgImg = useCachedImage(bg?.type === "image" ? toUri(bg.src) : null);
  if (bg?.type === "image") {
    return bgImg ? (
      <SkImg
        image={bgImg}
        x={0}
        y={0}
        width={width}
        height={height}
        fit="cover"
      />
    ) : (
      <Fill color="#000000" />
    );
  }
  if (bg?.type === "gradient") {
    // The angle comes from the SHARED convention, not from local cos/sin: the
    // old line here ran 180deg right-to-left while every export ran it
    // top-to-bottom. See `preview/gradient.ts`.
    return (
      <Fill>
        <LinearGradient
          start={gradientStart(bg.angle, width, height)}
          end={gradientEnd(bg.angle, width, height)}
          colors={[bg.from, bg.to]}
        />
      </Fill>
    );
  }
  return <Fill color={bg?.type === "color" ? bg.color : "#000000"} />;
}

/** Layer opacity at the playhead: keyframes if animated, else the static value. */
function clipKfOpacity(clip: VisualTrackClip, playheadSec: number): number {
  if (!hasKeyframes(clip.keyframes)) return clip.opacity ?? 1;
  return sampleKeyframes(
    clip.keyframes!,
    (playheadSec - clip.start) / Math.max(0.001, clip.duration),
  ).opacity;
}

/** Skia clip (rect or oval path) + invert for a clip's shape mask, in canvas px. */
function maskClipFor(
  mask: VisualTrackClip["mask"],
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (!mask || mask.rx <= 0 || mask.ry <= 0) return null;
  const cx = x + mask.cx * w;
  const cy = y + mask.cy * h;
  const hw = mask.rx * w;
  const hh = mask.ry * h;
  const box = rect(cx - hw, cy - hh, hw * 2, hh * 2);
  if (mask.shape === "circle") {
    const path = Skia.Path.Make();
    path.addOval(box);
    return { clip: path, invertClip: !!mask.invert };
  }
  return { clip: box, invertClip: !!mask.invert };
}

/** Local-effect region as a Skia path, in the visual clip's own canvas rect. */
function effectPathFor(
  effect: NonNullable<VisualTrackClip["mosaic"] | VisualTrackClip["magnifier"]>,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const cx = x + effect.cx * w;
  const cy = y + effect.cy * h;
  const hw = Math.max(1, effect.rx * w);
  const hh = Math.max(1, effect.ry * h);
  const box = rect(cx - hw, cy - hh, hw * 2, hh * 2);
  const path = Skia.Path.Make();
  if (effect.shape === "circle") path.addOval(box);
  else if (effect.shape === "rounded")
    path.addRRect(
      Skia.RRectXY(box, Math.min(hw, hh) * 0.35, Math.min(hw, hh) * 0.35),
    );
  else if (effect.shape === "diamond") {
    path.moveTo(cx, cy - hh);
    path.lineTo(cx + hw, cy);
    path.lineTo(cx, cy + hh);
    path.lineTo(cx - hw, cy);
    path.close();
  } else path.addRect(box);
  return { path, cx, cy, borderPx: Math.min(w, h) };
}

/**
 * Nearest-neighbour block pixelation, mirroring the export's
 * `scale down (area) -> scale up (neighbor)`. The preview used to blur every
 * mosaic pattern while ffmpeg pixelated three of them, so censoring a face
 * previewed as a soft blur and exported as hard blocks.
 */
/**
 * The transition mask families, as one shader over a described field.
 *
 * A direct port of `xfadeMaskAt` in `../preview/xfade`, which is itself a
 * direct port of `libavfilter/vf_xfade.c` — the JS copy is what the fixture
 * test holds to ffmpeg, and this is what actually paints. Written as one
 * uniform-driven effect rather than eleven shaders for the same reason the
 * shared module describes a field rather than naming a family: a new family
 * that fits the shape lands in both renderers with no new code in either.
 *
 * Two details that silently invert the picture if they are 'tidied':
 * `floor(W/2)` is ffmpeg's INTEGER division and differs from `W*0.5` by half a
 * pixel on an odd dimension, and SkSL's two-argument `atan(y, x)` takes the
 * arguments in the order ffmpeg's `atan2f(x - w/2, y - h/2)` passes them —
 * which is not the usual one, and rotates where the sweep begins by a quarter
 * turn if it is swapped.
 */
const XF_MASK = Skia.RuntimeEffect.Make(`
uniform float2 size;
uniform float field;
uniform float sgn;
uniform float bias;
uniform float2 flip;
uniform float invert;
half4 main(float2 xy) {
  float W = size.x;
  float H = size.y;
  float cx = floor(W * 0.5);
  float cy = floor(H * 0.5);
  float f = 0.0;
  if (field < 0.5) {
    float z = length(float2(cx, cy));
    f = z > 0.0 ? length(float2(xy.x - cx, xy.y - cy)) / z : 0.0;
  } else if (field < 1.5) {
    float w2 = W * 0.5;
    f = w2 > 0.0 ? abs((xy.x - w2) / w2) : 0.0;
  } else if (field < 2.5) {
    float h2 = H * 0.5;
    f = h2 > 0.0 ? abs((xy.y - h2) / h2) : 0.0;
  } else if (field < 3.5) {
    float fx = flip.x > 0.5 ? (W - 1.0 - xy.x) / W : xy.x / W;
    float fy = flip.y > 0.5 ? (H - 1.0 - xy.y) / H : xy.y / H;
    f = fx * fy;
  } else {
    f = atan(xy.x - cx, xy.y - cy);
  }
  float t = clamp(sgn * f + bias, 0.0, 1.0);
  float a = t * t * (3.0 - 2.0 * t);
  if (invert > 0.5) a = 1.0 - a;
  return half4(half(a));
}`)!;

/** `XfMask.field` in the order the shader's `field` uniform branches on. */
const MASK_FIELDS = ["radius", "absx", "absy", "prod", "angle"];

function maskUniforms(m: XfMask, width: number, height: number) {
  return {
    size: [width, height],
    field: Math.max(0, MASK_FIELDS.indexOf(m.field)),
    sgn: m.sign,
    bias: m.bias,
    flip: [m.flipX ? 1 : 0, m.flipY ? 1 : 0],
    invert: m.invert ? 1 : 0,
  };
}

const PIXELATE = Skia.RuntimeEffect.Make(`
uniform shader image;
uniform float block;
half4 main(float2 xy) {
  float b = max(block, 1.0);
  float2 q = floor(xy / b) * b + b * 0.5;
  return image.eval(q);
}`)!;

/**
 * Block size in CANVAS px for a mosaic pattern.
 *
 * The export downscales the region by `factor` then back up with `neighbor`, so
 * one output block spans `1 / factor` output px — independent of the region
 * size. Multiplying by the canvas:output scale puts the preview on the same
 * grid. Must track MOSAIC_BLOCK in packages/video/src/ffmpeg.ts.
 */
const MOSAIC_BLOCK: Record<string, number> = {
  mosaic: 0.1,
  triangle: 0.18,
  hexagon: 0.13,
};

function mosaicBlockPx(
  pattern: string,
  amount: number,
  scale: number,
): number {
  const block = MOSAIC_BLOCK[pattern] ?? MOSAIC_BLOCK.mosaic;
  const factor = Math.max(0.025, block * (1 - amount * 0.8));
  return Math.max(1, scale / factor);
}

/** Duplicate a clip inside its local Mosaic / Magnifier regions. */
function LocalVisualEffects({
  clip,
  content,
  x,
  y,
  w,
  h,
}: {
  clip: VisualTrackClip;
  content: ReactNode;
  x: number;
  y: number;
  w: number;
  h: number;
}) {
  const mosaic = clip.mosaic;
  const magnifier = clip.magnifier;
  // `Skia.Path.Make()` allocates a native object; this renders on every playhead
  // tick, for every layer, so build the paths only when the region or box moves.
  const mg = useMemo(
    () => (mosaic ? effectPathFor(mosaic, x, y, w, h) : null),
    [mosaic, x, y, w, h],
  );
  const lens = useMemo(
    () => (magnifier ? effectPathFor(magnifier, x, y, w, h) : null),
    [magnifier, x, y, w, h],
  );
  // Canvas px per OUTPUT px, so the pixelation grid matches the exported one.
  // The export renders this clip at `rect.w * project.width` px wide.
  const projectWidth = useEditor((s) => s.project?.width ?? 1080);
  const outW = Math.max(1, (clip.rect?.w ?? 1) * projectWidth);
  const scale = w / outW;
  return (
    <>
      {mosaic && mg ? (
        <Group clip={mg.path} opacity={mosaic.opacity}>
          <Group>
            {mosaic.pattern === "blur" ? (
              <Blur blur={Math.max(1, mosaic.amount * 22)} />
            ) : (
              <RuntimeShader
                source={PIXELATE}
                uniforms={{
                  block: mosaicBlockPx(mosaic.pattern, mosaic.amount, scale),
                }}
              />
            )}
            {content}
          </Group>
        </Group>
      ) : null}
      {magnifier && lens ? (
        <>
          <Group clip={lens.path} opacity={magnifier.opacity}>
            <Group
              origin={{ x: lens.cx, y: lens.cy }}
              transform={[{ scale: magnifier.zoom }]}
            >
              {content}
            </Group>
          </Group>
          {magnifier.borderWidth > 0 ? (
            <SkPath
              path={lens.path}
              color={magnifier.borderColor}
              style="stroke"
              strokeWidth={Math.max(1, magnifier.borderWidth * lens.borderPx)}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}

/** Hex (#rgb / #rrggbb) → normalized 0..1 RGB (defaults to green). */
function hexToRgb01(hex: string): [number, number, number] {
  let h = (hex || "").replace("#", "").trim();
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return [0, 0.83, 0];
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

/**
 * Where a clip's picture is drawn, and how.
 *
 * With no crop this is just the box with Skia's own `cover` fit, which agrees
 * with the export's `scale=…:force_original_aspect_ratio=increase,crop=`.
 *
 * With a crop, Skia has no way to say "draw this part of the source" — `<Image>`
 * takes no source rect. So the WHOLE image is drawn oversized and positioned so
 * the chosen window lands on the box (`fit="fill"`), and the caller clips to the
 * box. The rect is a derived value because for a video the natural size only
 * exists on the UI thread, inside the decoded frame.
 */
function useDrawRect(
  image: SkImage | SharedValue<SkImage | null>,
  crop: VisualTrackClip["crop"],
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const box = rect(x, y, w, h);
  const derived = useDerivedValue(() => {
    const img = "value" in image ? image.value : image;
    if (!img || !crop) return box;
    const d = cropDrawRect(img.width(), img.height(), crop, { x, y, w, h });
    return rect(d.x, d.y, d.w, d.h);
  }, [image, crop, x, y, w, h]);
  return crop
    ? ({ rect: derived, fit: "fill" } as const)
    : ({ rect: box, fit: "cover" } as const);
}

/** Draw `image` with a chroma key (cutout) into the given canvas rect. */
function ChromaImage({
  image,
  x,
  y,
  w,
  h,
  crop,
  cutout,
}: {
  image: SkImage | SharedValue<SkImage | null>;
  x: number;
  y: number;
  w: number;
  h: number;
  crop?: VisualTrackClip["crop"];
  cutout: NonNullable<VisualTrackClip["cutout"]>;
}) {
  const [r, g, b] = hexToRgb01(cutout.color);
  // The keyed path needs the identical treatment: a cropped green-screen clip
  // whose shader sampled the whole frame would key the wrong pixels.
  const draw = useDrawRect(image, crop, x, y, w, h);
  return (
    <Fill>
      <Shader
        source={CHROMA}
        uniforms={{
          keyColor: [r, g, b],
          similarity: cutout.similarity ?? 0.3,
          smoothness: cutout.smoothness ?? 0.1,
        }}
      >
        <ImageShader
          image={image}
          fit={draw.fit}
          rect={draw.rect}
          tx="decal"
          ty="decal"
        />
      </Shader>
    </Fill>
  );
}

/** An image or video frame drawn into a box, honouring the clip's crop. */
function ClipImage({
  image,
  x,
  y,
  w,
  h,
  crop,
  children,
}: {
  image: SkImage | SharedValue<SkImage | null>;
  x: number;
  y: number;
  w: number;
  h: number;
  crop?: VisualTrackClip["crop"];
  children?: React.ReactNode;
}) {
  const draw = useDrawRect(image, crop, x, y, w, h);
  return (
    <SkImg image={image} rect={draw.rect} fit={draw.fit}>
      {children}
    </SkImg>
  );
}

/** Skia/expo-video want a URI; our media srcs are bare file paths. */
function toUri(p?: string | null): string | null {
  if (!p) return null;
  return p.startsWith("http") || p.startsWith("file:") ? p : `file://${p}`;
}


type OverlayGeom = {
  x: number;
  y: number;
  w: number;
  h: number;
  op: number;
  mt: ReturnType<typeof motionTransform>;
  mc: ReturnType<typeof maskClipFor>;
};

/** Pure placement/opacity/motion/mask geometry for an overlay clip at the playhead. */
function overlayGeom(
  clip: VisualTrackClip,
  width: number,
  height: number,
  playheadSec: number,
): OverlayGeom {
  const r = clip.rect ?? { x: 0, y: 0, w: 1, h: 1 };
  const S = clip.start;
  const E = clip.start + clip.duration;
  /*
   * The same gates the engine applies, which this used to skip.
   *
   * `animatesPosition`/`animatesOpacity` matter because two keyframes that do
   * not actually change anything are IGNORED by the export — without the gates
   * they moved the clip here and not in the file. And a blended clip cannot
   * move in the export at all (its blend crops the base region under a
   * fixed-size box), so it must not move here either.
   */
  const kfs = clip.keyframes;
  const blended = !!clip.blend && clip.blend !== "normal";
  const kfPos = hasKeyframes(kfs) && animatesPosition(kfs!) && !blended;
  const kfOp = hasKeyframes(kfs) && animatesOpacity(kfs!);
  const kf =
    kfPos || kfOp
      ? sampleKeyframes(kfs!, (playheadSec - S) / Math.max(0.001, clip.duration))
      : null;
  const anim = resolveAnim(clip);
  const slide = blended
    ? { dx: 0, dy: 0 }
    : slideOffsetAt(anim, S, E, playheadSec, width, height);
  const x = (kfPos ? kf!.x : r.x) * width + slide.dx;
  const y = (kfPos ? kf!.y : r.y) * height + slide.dy;
  const w = r.w * width;
  const h = r.h * height;
  const op =
    (kfOp ? kf!.opacity : (clip.opacity ?? 1)) *
    elementFadeAt(anim, S, E, playheadSec);
  return {
    x,
    y,
    w,
    h,
    op,
    mt: motionTransform(
      clip.motion,
      clip.start,
      clip.duration,
      playheadSec,
      w,
      h,
    ),
    mc: maskClipFor(clip.mask, x, y, w, h),
  };
}

/** Shared overlay compositing (rect clip + opacity + blend + motion + mask + fx) given a resolved image. */
function OverlayFrame({
  clip,
  geom,
  image,
}: {
  clip: VisualTrackClip;
  geom: OverlayGeom;
  image: SkImage | SharedValue<SkImage | null>;
}) {
  const { x, y, w, h, op, mt, mc } = geom;
  const cm = colorMatrix(clip.filter);
  const content = clip.cutout ? (
    <ChromaImage
      image={image}
      x={x}
      y={y}
      w={w}
      h={h}
      crop={clip.crop}
      cutout={clip.cutout}
    />
  ) : (
    <ClipImage image={image} x={x} y={y} w={w} h={h} crop={clip.crop}>
      {cm ? <ColorMatrix matrix={cm} /> : null}
      {clip.blur ? <Blur blur={clip.blur * 20} /> : null}
    </ClipImage>
  );
  const composed = (
    <>
      {content}
      <LocalVisualEffects
        clip={clip}
        content={content}
        x={x}
        y={y}
        w={w}
        h={h}
      />
    </>
  );
  /*
   * Rotation goes on an OUTER group, outside the rect clip — an axis-aligned
   * clip applied after the turn would shave the corners the rotation just
   * created. It is also NOT folded into the motion transform below: motion
   * pivots on the frame centre and rotation on the rect centre, and one
   * transform array carries one origin.
   *
   * Positive is clockwise, the same direction as the export's `rotate` and the
   * canvas compositor's `ctx.rotate`.
   */
  const deg = normalizeRotation(clip.rotation);
  const body = (
    <Group
      clip={rect(x, y, w, h)}
      opacity={op}
      blendMode={blendToSkia(clip.blend)}
    >
      <Group transform={mt} origin={{ x: x + w / 2, y: y + h / 2 }}>
        {mc ? (
          <Group clip={mc.clip} invertClip={mc.invertClip}>
            {composed}
          </Group>
        ) : (
          composed
        )}
      </Group>
    </Group>
  );
  if (!deg) return body;
  return (
    <Group
      transform={[{ rotate: (deg * Math.PI) / 180 }]}
      origin={{ x: x + w / 2, y: y + h / 2 }}
    >
      {body}
    </Group>
  );
}

/** Overlay VIDEO clip — decoded live (its own useClipFrame), like the base. */
function OverlayVideoLayer({
  clip,
  width,
  height,
  isPlaying,
  playheadSec,
}: {
  clip: VisualTrackClip;
  width: number;
  height: number;
  isPlaying: boolean;
  playheadSec: number;
}) {
  const playing = useSharedValue(isPlaying);
  const timeSV = useSharedValue(0);
  useEffect(() => {
    playing.value = isPlaying;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);
  useEffect(() => {
    const sp = clip.speed && clip.speed > 0 ? clip.speed : 1;
    timeSV.value =
      (clip.trimIn ?? 0) + Math.max(0, (playheadSec - clip.start) * sp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playheadSec, clip.start, clip.trimIn, clip.speed]);
  const frame = useClipFrame(toUri(clip.src), playing, timeSV);
  return (
    <OverlayFrame
      clip={clip}
      geom={overlayGeom(clip, width, height, playheadSec)}
      image={frame}
    />
  );
}

/** Overlay IMAGE / sticker clip. */
function OverlayImageLayer({
  clip,
  width,
  height,
  playheadSec,
}: {
  clip: VisualTrackClip;
  width: number;
  height: number;
  playheadSec: number;
}) {
  // Cached, not `useImage`: this layer is keyed by clip id, so every crossing
  // of a cut remounts it, and `useImage` re-reads and re-decodes the file each
  // time — with nothing on screen until it lands.
  const img = useCachedImage(toUri(clip.src));
  if (!img) return null;
  return (
    <OverlayFrame
      clip={clip}
      geom={overlayGeom(clip, width, height, playheadSec)}
      image={img}
    />
  );
}

export function Preview({ width, height }: { width: number; height: number }) {
  const project = useEditor((s) => s.project);
  // Preview FPS preference drives the transport clock.
  const previewFps = useEditor((s) => s.prefs.previewFps);
  const snapping = useEditor((s) => s.prefs.snapping);
  const tickMs = previewFps > 0 ? Math.round(1000 / previewFps) : TICK_MS;
  const playheadSec = useEditor((s) => s.playheadSec);
  const isPlaying = useEditor((s) => s.isPlaying);
  const setPlayhead = useEditor((s) => s.setPlayhead);
  const setPlaying = useEditor((s) => s.setPlaying);
  const select = useEditor((s) => s.select);
  const selected = useEditor((s) => s.selected);
  const panel = useEditor((s) => s.panel);
  const setClipRect = useEditor((s) => s.setClipRect);
  const applyClipTransform = useEditor((s) => s.applyClipTransform);
  const applyClipMosaic = useEditor((s) => s.applyClipMosaic);
  const applyClipMagnifier = useEditor((s) => s.applyClipMagnifier);
  const updateSelectedOverlay = useEditor((s) => s.updateSelectedOverlay);
  const dragRect = useRef<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const dragText = useRef<{ x: number; y: number } | null>(null);
  const dragEffect = useRef<{
    kind: "mosaic" | "magnifier";
    cx: number;
    cy: number;
    effect: NonNullable<
      VisualTrackClip["mosaic"] | VisualTrackClip["magnifier"]
    >;
  } | null>(null);
  const fontsVersion = useFontsVersion();
  const startedAt = useRef(0);

  // Pre-load Google fonts referenced by captions (e.g. on reopening a project).
  const famKey = (project?.overlays ?? [])
    .map((o) => (o.type === "text" ? o.fontFamily : ""))
    .join(",");
  useEffect(() => {
    ensureFontsLoaded(
      (project?.overlays ?? []).flatMap((o) =>
        o.type === "text" && o.fontFamily ? [o.fontFamily] : [],
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [famKey]);

  const total = project ? projectDuration(project) : 0;
  const lookupT = total > 0 ? Math.min(playheadSec, total - 0.01) : playheadSec;
  const visualTracks = (project?.tracks ?? []).filter(
    (t): t is VisualTrack => t.kind === "visual",
  );
  const base = visualTracks[0];
  const overlayTracks = visualTracks.slice(1);
  /*
   * What a transform handle is doing RIGHT NOW.
   *
   * Held here rather than written through the store on every pointer frame:
   * this component is the only one that needs to redraw during a resize, and
   * going through `apply` would clone the project, re-render the timeline and
   * the editor chrome, and queue a save and a sync sixty times a second. The
   * store is written once, on release.
   */
  const [live, setLive] = useState<
    | (TransformPatch & {
        clipId: string;
        mosaic?: VisualTrackClip["mosaic"];
        magnifier?: VisualTrackClip["magnifier"];
      })
    | null
  >(null);
  /*
   * The dragged CAPTION's position, held here for the same reason as `live`
   * above: `updateSelectedOverlay` goes through `apply`, which clones the
   * project, re-renders the preview, the timeline and the editor chrome and
   * queues a save and a sync. Doing that on every pointer frame made the
   * caption trail the finger by several frames — so you kept moving to catch
   * it up and pushed it off the canvas.
   *
   * One write on release, which is also one undo step instead of however many
   * frames the drag took.
   */
  const [liveText, setLiveText] = useState<
    { id: string; x: number; y: number } | null
  >(null);
  /**
   * Each caption's rendered height in screen pixels, reported by the layer
   * itself. A ref rather than state: it is read by the drag and must never
   * cause a render of its own.
   */
  const captionH = useRef<Record<string, number>>({});
  const withLive = (c: VisualTrackClip): VisualTrackClip =>
    live && live.clipId === c.id
      ? {
          ...c,
          ...(live.rect ? { rect: live.rect } : {}),
          ...(live.rotation != null ? { rotation: live.rotation } : {}),
          ...(live.crop ? { crop: live.crop } : {}),
          // Dragging the mosaic or the magnifier moves a REGION of the clip, so
          // it rides here too rather than through `apply` on every frame.
          ...(live.mosaic ? { mosaic: live.mosaic } : {}),
          ...(live.magnifier ? { magnifier: live.magnifier } : {}),
        }
      : c;

  const baseClips = base?.clips ?? [];
  /*
   * Up to TWO base clips, because main-track clips overlap by their transition
   * duration — inside a crossfade the outgoing clip and the incoming one are
   * both live, and drawing both is the whole point.
   *
   * Everything below reads the transition from the mirrored `xfade.ts` rather
   * than computing it here. This file used to carry its own copy of the fade
   * maths, agreeing with the engine by luck and with nothing checking that it
   * kept agreeing; `preview/__tests__/xfade.test.ts` is that check now.
   */
  const baseLive = base
    ? (clipsAtTime(base, lookupT) as VisualTrackClip[]).map(withLive)
    : [];
  const baseActive = baseLive[baseLive.length - 1];
  const baseIdx = baseActive
    ? baseClips.findIndex((c) => c.id === baseActive.id)
    : -1;
  const nextBaseClip = baseIdx >= 0 ? baseClips[baseIdx + 1] : undefined;

  const baseFades = useMemo(() => buildEdgeFadeMap(baseClips), [baseClips]);
  const baseXfades = useMemo(
    () => xfadeMapOf(resolveTransitions(baseClips).boundaries),
    [baseClips],
  );
  /**
   * One base clip's transition state: how transparent it is, and which part of
   * the canvas it is allowed to paint.
   *
   * The geometry is resolved against the PREVIEW's own size rather than the
   * project's, which is deliberate — `xfadeStateAt` applies ffmpeg's integer
   * split rule to whatever canvas it is handed, so a wipe's edge lands on a
   * real pixel here instead of on a scaled fraction of a 1080-wide one.
   */
  const baseXf = (c: VisualTrackClip) => {
    const xf = xfadeStateFor(
      baseXfades.get(c.id),
      playheadSec,
      width,
      height,
    );
    /*
     * Scale and travel ride on ONE transform list, in that order, so a squeeze
     * that also slid would compose the way a matrix does rather than the way
     * two nested groups would. Nothing emits both today; writing it as one list
     * is what keeps that true for free if something ever does.
     */
    const t: Transforms3d = [];
    if (xf?.scale) t.push({ scaleX: xf.scale.x }, { scaleY: xf.scale.y });
    if (xf?.dx) t.push({ translateX: xf.dx });
    if (xf?.dy) t.push({ translateY: xf.dy });
    return {
      opacity:
        fadeFactorAt(
          baseFades.get(c.id),
          c.start,
          c.start + c.duration,
          playheadSec,
        ) * (xf?.alpha ?? 1),
      clip: xf?.clip,
      hole: xf?.hole,
      mask: xf?.mask,
      travel: t.length ? t : undefined,
      /*
       * The solid a `fadeblack`/`fadewhite` dips through. It is asked for on the
       * INCOMING side only and drawn immediately beneath that clip, which is
       * the one position that puts it over the outgoing clip and under the
       * incoming one.
       */
      veil: xf?.role === "to" ? xfadeVeilAt(xf.name, xf.p) : null,
    };
  };

  /*
   * Warm the clips either side of the one on screen, so crossing a cut finds
   * its media already decoded instead of starting a disk read at the moment it
   * is needed. Both neighbours, because scrubbing goes backwards as often as
   * forwards. Prefetching is idempotent — a hit and a load already in flight
   * both return immediately — so running it on every clip change costs nothing
   * once warm.
   */
  const prevSrc = baseIdx > 0 ? baseClips[baseIdx - 1] : undefined;
  useEffect(() => {
    for (const c of [prevSrc, nextBaseClip]) {
      if (!c) continue;
      if (c.type === "image") prefetchImage(toUri(c.src));
      else prefetchVideo(toUri(c.src));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevSrc?.src, prevSrc?.type, nextBaseClip?.src, nextBaseClip?.type]);

  /*
   * Transport clock.
   *
   * Time is DERIVED from a fixed origin, never accumulated. The old version did
   * `acc += (now - last) / 1000` inside the interval, so every late tick — a
   * slow frame, a JS-thread stall, the app backgrounding for a moment — was
   * added to the timeline permanently. Play a two-minute project under load and
   * the playhead ended up somewhere the video never was, with no way to recover
   * short of stopping. Deriving from the origin means a late tick simply lands
   * at the right time.
   *
   * It also stops mattering how accurate `tickMs` is: the interval controls how
   * OFTEN we look, not what the answer is.
   */
  useEffect(() => {
    if (!isPlaying || !project) return;
    const startAt = playheadSec >= total ? 0 : playheadSec;
    const origin = Date.now();
    startedAt.current = startAt;
    const timer = setInterval(() => {
      const t = startAt + (Date.now() - origin) / 1000;
      if (t >= total) {
        setPlayhead(total);
        setPlaying(false);
        return;
      }
      setPlayhead(t);
    }, tickMs);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, total, project?.id, tickMs]);

  /*
   * Sound. The graph outlives individual plays so the players stay open; it is
   * only rebuilt when the set of audio clips actually changes.
   */
  const audioRef = useRef<PreviewAudio | null>(null);
  if (!audioRef.current) audioRef.current = new PreviewAudio();
  useEffect(() => () => audioRef.current?.dispose(), []);

  const audioClips = previewAudioOf(project ?? {});
  // A cheap signature of what would change the graph: which clips exist, where
  // they sit, and what they point at. Volume is deliberately absent — it is read
  // per tick, so a fade must not rebuild anything.
  const audioKey = audioClips
    .map((c) => `${c.id}:${c.src}:${c.start}:${c.duration}:${c.trimIn ?? 0}`)
    .join("|");
  useEffect(() => {
    audioRef.current?.sync(audioClips, (src) => toUri(src) ?? src);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioKey]);

  // Position the audio wherever the playhead is — while playing, and also after
  // a scrub, so pressing play resumes from what you are looking at.
  useEffect(() => {
    audioRef.current?.update(playheadSec, isPlaying);
  }, [playheadSec, isPlaying]);

  useEffect(() => {
    if (!isPlaying) audioRef.current?.pause();
  }, [isPlaying]);

  const activeOverlays = overlayTracks
    .map((t) => {
      const c = clipAtTime(t, lookupT) as VisualTrackClip | undefined;
      return c ? { clip: withLive(c), trackId: t.id } : null;
    })
    .filter((x): x is { clip: VisualTrackClip; trackId: string } => !!x);
  const captions = (project?.overlays ?? [])
    .filter((o) => playheadSec >= o.start && playheadSec <= o.end)
    // The one under the finger is drawn from `liveText`, so it keeps up.
    .map((o) =>
      liveText && liveText.id === o.id
        ? { ...o, x: liveText.x, y: liveText.y }
        : o,
    );
  const scale = project ? width / project.width : 1;

  // Alignment targets from the OTHER objects on canvas — the dragged one is
  // excluded so it can't snap to itself. Only consumed when Object Snapping is
  // on; canvas edges and centre are always live regardless.
  const snapOthers = useMemo(() => {
    const x: Span[] = [];
    const y: Span[] = [];
    for (const { clip, trackId } of activeOverlays) {
      if (selected?.trackId === trackId && selected?.clipId === clip.id)
        continue;
      const r = clip.rect;
      if (!r) continue;
      x.push({ pos: r.x, size: r.w });
      y.push({ pos: r.y, size: r.h });
    }
    for (const o of captions) {
      if (selected?.trackId === OVERLAY_TRACK && selected?.clipId === o.id)
        continue;
      x.push({ pos: o.x, size: 0 });
      y.push({ pos: o.y, size: 0 });
    }
    return { x, y };
  }, [activeOverlays, captions, selected?.trackId, selected?.clipId]);

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
        ? sampleKeyframes(
            o.keyframes!,
            Math.max(
              0,
              Math.min(
                1,
                (playheadSec - o.start) / Math.max(0.001, o.end - o.start),
              ),
            ),
          )
        : null;
      const cy = kf ? kf.y : o.y;
      if (Math.abs(ny - cy) < 0.1) {
        select({ trackId: OVERLAY_TRACK, clipId: o.id });
        return;
      }
    }
    if (baseActive && base) {
      const isSel =
        selected?.trackId === base.id && selected?.clipId === baseActive.id;
      select(isSel ? null : { trackId: base.id, clipId: baseActive.id });
      return;
    }
    select(null);
  }

  // Drag a selected PiP/overlay clip to reposition it on the canvas; a tap
  // (no movement) selects. Dragging the base clip does nothing.
  /*
   * The transform handles need to beat the canvas's own pan, whichever would
   * activate first, so they take a ref to it rather than relying on ordering.
   */
  const canvasGesture = useRef<GestureType>(undefined);
  /*
   * Where the drag has got to, in ONE function each — the same rule the
   * timeline's trim handles follow. The frame under the finger and the value
   * finally committed both come from here, so they cannot disagree, and the
   * snapping is applied once rather than being written out twice.
   */
  const textAt = (
    id: string,
    from: { x: number; y: number },
    dx: number,
    dy: number,
  ) => {
    /*
     * `y` is the TOP of the caption, not its centre — the layer is positioned
     * with `top: o.y * height` — so clamping the anchor to 1 let you drag the
     * text until only its first pixel row was on the canvas and then off it
     * entirely. The PiP path has always clamped against its box (`1 - r.h`);
     * a caption has no box in the model, because its height depends on the
     * font, the string and where it wraps. So it is MEASURED: the rendered
     * layer reports its height and the drag stops one caption short of the
     * bottom edge.
     *
     * A measurement that has not arrived yet falls back to 0, which is the old
     * behaviour for exactly one frame rather than a guess that could be wrong
     * in either direction.
     */
    const h = (captionH.current[id] ?? 0) / height;
    // A caption is anchored by a point, so it snaps as a zero-size span.
    const tx = Math.max(0, Math.min(1, from.x + dx / width));
    const ty = Math.max(0, Math.min(Math.max(0, 1 - h), from.y + dy / height));
    return {
      x: snapSpan({ pos: tx, size: 0 }, targetsFor(snapping, snapOthers.x)),
      y: Math.min(
        Math.max(0, 1 - h),
        snapSpan({ pos: ty, size: 0 }, targetsFor(snapping, snapOthers.y)),
      ),
    };
  };
  const effectAt = (
    from: NonNullable<typeof dragEffect.current>,
    dx: number,
    dy: number,
  ) => ({
    ...from.effect,
    cx: Math.max(
      from.effect.rx,
      Math.min(1 - from.effect.rx, from.cx + dx / width),
    ),
    cy: Math.max(
      from.effect.ry,
      Math.min(1 - from.effect.ry, from.cy + dy / height),
    ),
  });
  const rectAt = (r: Rect, dx: number, dy: number): Rect => {
    const rawX = Math.max(0, Math.min(1 - r.w, r.x + dx / width));
    const rawY = Math.max(0, Math.min(1 - r.h, r.y + dy / height));
    return {
      ...r,
      x: Math.max(
        0,
        Math.min(
          1 - r.w,
          snapSpan({ pos: rawX, size: r.w }, targetsFor(snapping, snapOthers.x)),
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          1 - r.h,
          snapSpan({ pos: rawY, size: r.h }, targetsFor(snapping, snapOthers.y)),
        ),
      ),
    };
  };
  const dragPan = Gesture.Pan()
    .runOnJS(true)
    .onBegin(() => {
      dragRect.current = null;
      dragText.current = null;
      dragEffect.current = null;
      const sel = useEditor.getState().selected;
      if (!sel) return;
      if (panel === "mosaic" || panel === "magnifier") {
        const tr = (project?.tracks ?? []).find((t) => t.id === sel.trackId);
        const clip = tr?.clips.find((item) => item.id === sel.clipId) as
          | VisualTrackClip
          | undefined;
        const effect = panel === "mosaic" ? clip?.mosaic : clip?.magnifier;
        if (effect) {
          dragEffect.current = {
            kind: panel,
            cx: effect.cx,
            cy: effect.cy,
            effect,
          };
          return;
        }
      }
      if (sel.trackId === OVERLAY_TRACK) {
        const overlay = selectedOverlayFromState(sel.clipId);
        if (overlay) dragText.current = { x: overlay.x, y: overlay.y };
        return;
      }
      if (!base || sel.trackId === base.id) return;
      const tr = (project?.tracks ?? []).find((t) => t.id === sel.trackId);
      const c = tr?.clips.find((x) => x.id === sel.clipId) as
        | VisualTrackClip
        | undefined;
      if (c?.rect) dragRect.current = { ...c.rect };
    })
    .onUpdate((e) => {
      const sel = useEditor.getState().selected;
      if (!sel) return;
      const localEffect = dragEffect.current;
      if (localEffect) {
        const next = effectAt(localEffect, e.translationX, e.translationY);
        setLive({ clipId: sel.clipId, [localEffect.kind]: next });
        return;
      }
      const text = dragText.current;
      if (text && sel.trackId === OVERLAY_TRACK) {
        setLiveText({
          id: sel.clipId,
          ...textAt(sel.clipId, text, e.translationX, e.translationY),
        });
        return;
      }
      const r = dragRect.current;
      if (!r) return;
      setLive({ clipId: sel.clipId, rect: rectAt(r, e.translationX, e.translationY) });
    })
    /*
     * One write, on release. `onEnd` runs only on a real finish, so a cancelled
     * gesture drops back to the stored position rather than committing wherever
     * the finger happened to be; `onFinalize` runs either way and is what clears
     * the live value.
     */
    .onEnd((e) => {
      const sel = useEditor.getState().selected;
      if (!sel) return;
      const localEffect = dragEffect.current;
      if (localEffect) {
        const next = effectAt(localEffect, e.translationX, e.translationY);
        if (localEffect.kind === "mosaic")
          applyClipMosaic(next as NonNullable<VisualTrackClip["mosaic"]>);
        else
          applyClipMagnifier(next as NonNullable<VisualTrackClip["magnifier"]>);
        return;
      }
      const text = dragText.current;
      if (text && sel.trackId === OVERLAY_TRACK) {
        updateSelectedOverlay(
          textAt(sel.clipId, text, e.translationX, e.translationY),
        );
        return;
      }
      const r = dragRect.current;
      if (r) setClipRect(sel.trackId, sel.clipId, rectAt(r, e.translationX, e.translationY));
    })
    .onFinalize(() => {
      setLiveText(null);
      setLive(null);
    });
  dragPan.withRef(canvasGesture);
  const tap = Gesture.Tap()
    .runOnJS(true)
    .maxDistance(10)
    .onEnd((e) => onTapPreview(e.x, e.y));
  const gesture = Gesture.Race(dragPan, tap);

  /*
   * The selected clip, if it is a visual one that is on screen right now — the
   * handles have nothing to attach to otherwise. Captions are excluded: they
   * are RN text with their own anchor, not a box on the canvas.
   */
  const handleTarget = (() => {
    if (!selected || isPlaying) return null;
    const overlay = activeOverlays.find(
      (o) => o.trackId === selected.trackId && o.clip.id === selected.clipId,
    );
    if (overlay) return overlay;
    if (base && baseActive && selected.trackId === base.id && selected.clipId === baseActive.id)
      return { clip: baseActive, trackId: base.id };
    return null;
  })();
  const handleGeom = handleTarget
    ? overlayGeom(handleTarget.clip, width, height, playheadSec)
    : null;


  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.frame, { width, height }]}>
        <Canvas style={{ width, height }}>
          <BackgroundFill
            bg={project?.background}
            width={width}
            height={height}
          />
          {/*
            The base clip goes through exactly the same layer as an overlay.
            It used to have its own pair of components, and they had drifted
            from the export in two ways: they drew with `fit="contain"` while
            `buildMultiTrackArgs` (and `frameStateAt`) cover-fit every clip, so
            a clip whose aspect differed from the project's letterboxed here and
            was centre-cropped in the MP4; and they ignored `rect` entirely, so
            a main-track clip made picture-in-picture still filled the preview.
          */}
          {baseLive.map((c) => {
            const xf = baseXf(c);
            const body = (
            /*
             * The transition's clip goes on the OUTER group, in canvas
             * coordinates, because a wipe cuts the FRAME and not the clip: a
             * picture-in-picture straddling the split is half gone, which is
             * what the export does when it composites the run from two
             * full-canvas frames.
             */
            <Group
              opacity={xf.opacity}
              clip={
                xf.clip
                  ? rect(xf.clip.x, xf.clip.y, xf.clip.w, xf.clip.h)
                  : xf.hole
                    ? rect(xf.hole.x, xf.hole.y, xf.hole.w, xf.hole.h)
                    : undefined
              }
              /*
               * A hole is the same rect INVERTED — everything except the band.
               * It is what lets the squeeze families keep the incoming clip on
               * top, where every other family puts it, rather than teaching the
               * compositor to reorder its layers for one transition. `clip` and
               * `hole` are never both set, so one prop carries both.
               */
              invertClip={!!xf.hole}
            >
              {/*
                * The travel goes on an INNER group, inside the clip. The clip
                * is the canvas region this side of the transition owns and the
                * translate is the picture moving within it; one group carrying
                * both would drag the window along with the picture, which reads
                * as a cut rather than a slide.
                */}
              <Group
                transform={xf.travel}
                origin={{ x: width / 2, y: height / 2 }}
              >
                {c.type === "video" ? (
                  <OverlayVideoLayer
                    clip={c}
                    width={width}
                    height={height}
                    isPlaying={isPlaying}
                    playheadSec={playheadSec}
                  />
                ) : (
                  <OverlayImageLayer
                    clip={c}
                    width={width}
                    height={height}
                    playheadSec={playheadSec}
                  />
                )}
              </Group>
            </Group>
            );
            return (
              <Fragment key={c.id}>
                {/*
                  * The dip's solid, under the incoming clip and over the
                  * outgoing one. It fills the whole canvas because that is what
                  * the export composites — the run is built from two
                  * full-canvas frames and the colour is mixed across all of it,
                  * not only where a clip happens to sit.
                  */}
                {xf.veil && xf.veil.alpha > 0 ? (
                  <Group opacity={xf.veil.alpha}>
                    <Fill color={xf.veil.color} />
                  </Group>
                ) : null}
                {/*
                  * The soft families mask the INCOMING side only, matching
                  * `xfadeStateAt`. `mode="alpha"` because the shader returns
                  * its answer in the alpha channel.
                  */}
                {xf.mask ? (
                  <Mask
                    mode="alpha"
                    mask={
                      <Fill>
                        <Shader
                          source={XF_MASK}
                          uniforms={maskUniforms(xf.mask, width, height)}
                        />
                      </Fill>
                    }
                  >
                    {body}
                  </Mask>
                ) : (
                  body
                )}
              </Fragment>
            );
          })}
          {activeOverlays.map(({ clip }) =>
            clip.type === "video" ? (
              <OverlayVideoLayer
                key={clip.id}
                clip={clip}
                width={width}
                height={height}
                isPlaying={isPlaying}
                playheadSec={playheadSec}
              />
            ) : (
              <OverlayImageLayer
                key={clip.id}
                clip={clip}
                width={width}
                height={height}
                playheadSec={playheadSec}
              />
            ),
          )}
        </Canvas>

        {!baseActive && total === 0 ? (
          <Text style={styles.empty}>
            your clip ·{" "}
            {project ? ratioLabel(project.width, project.height) : "9:16"}
          </Text>
        ) : null}

        {handleTarget && handleGeom ? (
          <PreviewTransformHandles
            clip={handleTarget.clip}
            box={{
              x: handleGeom.x,
              y: handleGeom.y,
              w: handleGeom.w,
              h: handleGeom.h,
            }}
            width={width}
            height={height}
            canvasGesture={canvasGesture}
            onLive={(patch) =>
              setLive(patch ? { ...patch, clipId: handleTarget.clip.id } : null)
            }
            onCommit={(patch) => {
              // One write, one history entry, one save, one sync — however many
              // pointer frames the gesture took.
              applyClipTransform(handleTarget.trackId, handleTarget.clip.id, patch);
              setLive(null);
            }}
          />
        ) : null}

        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {captions.map((o: TextOverlay) => {
            // Animate the caption over its [start,end] window: keyframes drive
            // opacity + position (delta from the baked anchor); motion adds a
            // centered Ken-Burns scale/pan — the same math the export uses.
            const dur = Math.max(0.001, o.end - o.start);
            const p = Math.max(0, Math.min(1, (playheadSec - o.start) / dur));
            const kfPos =
              hasKeyframes(o.keyframes) && animatesPosition(o.keyframes!);
            const kfOp =
              hasKeyframes(o.keyframes) && animatesOpacity(o.keyframes!);
            const kf =
              kfPos || kfOp ? sampleKeyframes(o.keyframes!, p) : null;
            /*
             * The caption's own animation, which this preview did not read at
             * all — every caption is created with `animation: 'fade'` and the
             * export has always honoured it, so captions faded in the file and
             * hard-cut on screen. `resolveAnim` maps that legacy field and the
             * new `animateIn`/`animateOut` to one thing.
             */
            const anim = resolveAnim(o);
            const slide = slideOffsetAt(anim, o.start, o.end, playheadSec, width, height);
            const ms = hasMotion(o.motion) ? motionStateAt(o.motion, p) : null;
            const tx =
              (ms ? ms.tx * width : 0) +
              (kfPos ? (kf!.x - o.x) * width : 0) +
              slide.dx;
            const ty =
              (ms ? ms.ty * height : 0) +
              (kfPos ? (kf!.y - o.y) * height : 0) +
              slide.dy;
            const sc = ms ? ms.scale : 1;
            const caption = (
              <View
                key={o.id}
                onLayout={(e) => {
                  captionH.current[o.id] = e.nativeEvent.layout.height;
                }}
                style={[
                  styles.textOverlay,
                  {
                    top: o.y * height,
                    // Horizontally the caption is laid out to its own
                    // alignment and then anchored by `x` — see `anchorDx`.
                    alignItems:
                      o.align === "left"
                        ? "flex-start"
                        : o.align === "right"
                          ? "flex-end"
                          : "center",
                    opacity:
                      (kfOp ? kf!.opacity : (o.opacity ?? 1)) *
                      (kfOp ? 1 : elementFadeAt(anim, o.start, o.end, playheadSec)),
                    // Pivot the Ken-Burns scale about the CANVAS centre (not the
                    // caption's own centre) so it matches the export's zoompan.
                    transformOrigin: [
                      width / 2,
                      0.5 * height - o.y * height,
                      0,
                    ],
                    transform: [
                      { translateX: tx },
                      { translateY: ty },
                      { scale: sc },
                    ],
                  },
                ]}
              >
                {/*
                  * `x` positions the caption, and it did NOT before this.
                  *
                  * The layer spans the full width and centred its text, so
                  * `o.x` moved nothing on screen — while `overlay-svg.ts`
                  * anchors the text at `width * o.x` and always has. Dragging a
                  * caption sideways therefore appeared to do nothing and moved
                  * it in the exported file, and a caption placed off-centre
                  * anywhere else came back centred here. A preview that
                  * disagrees with the file about where the words are.
                  *
                  * The offset goes on an INNER view rather than the outer one
                  * because the outer carries the Ken-Burns `transformOrigin`,
                  * which is expressed in its own box — translate that box and
                  * the zoom starts pivoting about the wrong point.
                  */}
                <View
                  style={{
                    transform: [
                      {
                        translateX:
                          (o.x -
                            (o.align === "left"
                              ? 0
                              : o.align === "right"
                                ? 1
                                : 0.5)) *
                          width,
                      },
                    ],
                  }}
                >
                  <CaptionText o={o} scale={scale} fontsVersion={fontsVersion} />
                </View>
              </View>
            );
            if (o.mask) {
              const maskLeft = (o.mask.cx - o.mask.rx) * width;
              const maskTop = (o.mask.cy - o.mask.ry) * height;
              const maskWidth = o.mask.rx * 2 * width;
              const maskHeight = o.mask.ry * 2 * height;
              if (o.mask.invert) {
                // Inverted = show everything OUTSIDE the region. RN views can't
                // express a hole, so clip the caption into the four bands
                // around the mask box. Exact for `rect`; for `circle` the four
                // bbox corners stay hidden (the export cuts a true ellipse).
                const bands = [
                  { left: 0, top: 0, width, height: Math.max(0, maskTop) },
                  {
                    left: 0,
                    top: maskTop + maskHeight,
                    width,
                    height: Math.max(0, height - (maskTop + maskHeight)),
                  },
                  {
                    left: 0,
                    top: maskTop,
                    width: Math.max(0, maskLeft),
                    height: maskHeight,
                  },
                  {
                    left: maskLeft + maskWidth,
                    top: maskTop,
                    width: Math.max(0, width - (maskLeft + maskWidth)),
                    height: maskHeight,
                  },
                ];
                return (
                  <View key={o.id} style={StyleSheet.absoluteFill}>
                    {bands.map((b, bi) => (
                      <View
                        key={bi}
                        style={{
                          position: "absolute",
                          left: b.left,
                          top: b.top,
                          width: b.width,
                          height: b.height,
                          overflow: "hidden",
                        }}
                      >
                        <View
                          style={{
                            position: "absolute",
                            left: -b.left,
                            top: -b.top,
                            width,
                            height,
                          }}
                        >
                          {caption}
                        </View>
                      </View>
                    ))}
                  </View>
                );
              }
              return (
                <View
                  key={o.id}
                  style={{
                    position: "absolute",
                    left: maskLeft,
                    top: maskTop,
                    width: maskWidth,
                    height: maskHeight,
                    overflow: "hidden",
                    borderRadius:
                      o.mask.shape === "circle"
                        ? Math.min(maskWidth, maskHeight) / 2
                        : 0,
                  }}
                >
                  <View
                    style={{
                      position: "absolute",
                      left: -maskLeft,
                      top: -maskTop,
                      width,
                      height,
                    }}
                  >
                    {caption}
                  </View>
                </View>
              );
            }
            return caption;
          })}
        </View>

        {/* Last, so it covers the captions exactly as the export's final
            overlay does. */}
        <CanvasFrameLayer
          frame={project?.frame}
          background={project?.background}
          width={width}
          height={height}
        />
      </View>
    </GestureDetector>
  );
}

function selectedOverlayFromState(id: string): TextOverlay | undefined {
  return useEditor
    .getState()
    .project?.overlays.find((overlay) => overlay.id === id);
}

/** Fold an opacity into a hex color → rgba() (pass-through for non-hex). */
function shadowRgba(color: string, opacity?: number): string {
  if (opacity == null) return color;
  const m = /^#([0-9a-f]{6})$/i.exec(color) ?? /^#([0-9a-f]{3})$/i.exec(color);
  if (!m) return color;
  let hex = m[1];
  if (hex.length === 3)
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// 8-direction offsets used to fake a text stroke (RN <Text> has no native one).
const STROKE_OFFSETS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;

/**
 * Renders one caption's text with its style: line-height, drop shadow (native
 * textShadow), and an outline stroke drawn as offset duplicate <Text> layers
 * behind the fill (there is no native RN text stroke). Keyed by fontsVersion so
 * it remounts once a downloaded font registers (iOS font-miss cache).
 */
function CaptionText({
  o,
  scale,
  fontsVersion,
}: {
  o: TextOverlay;
  scale: number;
  fontsVersion: number;
}) {
  const fontSize = Math.max(8, o.fontSize * scale);
  const base: TextStyle = {
    fontSize,
    fontWeight: o.bold ? "700" : "400",
    textAlign: o.align ?? "center",
    fontFamily: o.fontFamily,
    letterSpacing: (o.letterSpacing ?? 0) * scale,
    lineHeight: o.lineHeight ? fontSize * o.lineHeight : undefined,
  };
  /*
   * A shadow ONLY when one was asked for.
   *
   * There used to be a default "legibility floor" here, and it was a preview-only
   * lie: `overlay-svg.ts` emits its shadow filter under `if (o.shadow)`, so the
   * export drew nothing and the preview was quietly prettier than the file. The
   * web preview never added one either, so mobile was the odd surface out. The
   * honest way to make a caption read over bright footage is the stroke below,
   * which BOTH surfaces draw.
   */
  const shadow: TextStyle = o.shadow
    ? {
        textShadowColor: shadowRgba(o.shadow.color, o.shadow.opacity),
        textShadowOffset: {
          width: (o.shadow.dx ?? 0) * scale,
          height: (o.shadow.dy ?? 2) * scale,
        },
        textShadowRadius: (o.shadow.blur ?? 4) * scale,
      }
    : {};
  const key = `${o.fontFamily ?? "def"}-${fontsVersion}`;

  if (!o.stroke || o.stroke.width <= 0) {
    return (
      <Text key={key} style={[base, shadow, { color: o.color, width: "90%" }]}>
        {o.text}
      </Text>
    );
  }
  const w = o.stroke.width * scale;
  return (
    <View style={{ width: "90%" }}>
      {STROKE_OFFSETS.map(([dx, dy], i) => (
        <Text
          key={`${key}-s${i}`}
          style={[
            base,
            {
              color: o.stroke!.color,
              position: "absolute",
              left: 0,
              right: 0,
              transform: [{ translateX: dx * w }, { translateY: dy * w }],
            },
          ]}
        >
          {o.text}
        </Text>
      ))}
      <Text key={key} style={[base, shadow, { color: o.color }]}>
        {o.text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: "#000",
    borderRadius: 4,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    position: "absolute",
    bottom: 10,
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    fontFamily: mono.regular,
  },
  textOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
  },
});
