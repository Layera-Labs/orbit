/**
 * Pure FFmpeg command builder: a `VideoProject` (+ pre-rendered overlay PNGs,
 * and an optional base image for clip-less projects) → an ffmpeg argv array.
 * Side-effect-free, so it is fully unit-testable.
 *
 * Pipeline: each clip is trimmed/scaled/cropped to the output frame, then the
 * clips are joined — `concat` for hard cuts or chained `xfade` for crossfades.
 * Text overlays composite over the joined video via `overlay` (PNG inputs, so
 * no libfreetype needed). Audio mixes the music tracks (single-clip projects
 * also keep the clip's own audio). Encodes to H.264/AAC MP4 (yuv420p + faststart).
 */
import {
  FULL_FRAME,
  type AudioTrack,
  type ExportOutput,
  type VideoProject,
  type VisualTrack,
} from "./types";
import { projectDuration, transitionDuration } from "./project";
import { atempoChain, filterToFFmpeg } from "./filters";
import { hasMotion, motionToZoompan } from "./motion";
import { chromaToFFmpeg } from "./cutout";
import { maskToFFmpeg } from "./mask";
import { blendToFFmpeg } from "./blend";
import { hasVolumeCurve, volumeCurveExpr } from "./curve";
import {
  animatesOpacity,
  animatesPosition,
  hasKeyframes,
  keyframeExpr,
} from "./keyframes";
import {
  even,
  magnifierCropPx,
  mosaicBlurSigma,
  mosaicStepPx,
  r3,
  regionBoxPx,
} from "./layout";
import { buildFadeMap } from "./transitions";

export interface BuildFFmpegOptions {
  outputPath: string;
  /** overlay id → rendered PNG path. Overlays without an image are skipped. */
  overlayImages?: Record<string, string>;
  /** Base image to use when the project has no visual clip (e.g. a rendered background). */
  baseImage?: string;
  /** Map a clip/audio `src` to a local file path. Defaults to identity. */
  resolveSrc?: (src: string) => string;
  /** Whether a resolved src actually has an audio stream. Defaults to assuming
   *  yes; pass a real probe so silent clips/images don't break the filtergraph. */
  hasAudio?: (resolvedSrc: string) => boolean;
  /** Per-export output overrides (resolution / fps / bitrate / audio-only). */
  output?: ExportOutput;
}

/** Alpha-mask a cropped local-effect patch to its selected lens shape. */
/**
 * Mosaic block size as a fraction of the region, per pattern. Exported so the
 * Skia preview can pixelate with the SAME block sizes — the preview used to
 * blur every pattern while the export pixelated three of them, so censoring a
 * face previewed soft and exported as hard blocks.
 *
 * NOTE: `triangle` and `hexagon` currently differ from `mosaic` only in block
 * SIZE — all three are square blocks. Real triangular / hexagonal cells have no
 * ffmpeg equivalent, so naming them after shapes overpromises; that is a
 * labelling decision to revisit, not a preview/export mismatch.
 */
/** Re-exported from `layout.ts`, where the preview reads it too. */
export { MOSAIC_BLOCK } from "./layout";

/** Corner radius factor for the "rounded" region shape. MUST match the Skia
 *  preview's `Skia.RRectXY(box, min(hw,hh) * ROUNDED_R, …)` or the exported
 *  corners are visibly tighter than the ones the user positioned. */
// Lives in `layout.ts` so the browser compositor rounds by the same factor.
import { ROUNDED_R } from "./layout";

/** An ffmpeg eval expression that is true inside `shape`, inset by `inset` px. */
function shapeInside(
  shape: "rectangle" | "circle" | "rounded" | "diamond",
  width: number,
  height: number,
  inset = 0,
): string {
  const cx = Math.round(width / 2);
  const cy = Math.round(height / 2);
  const ax = Math.max(1, Math.round(width / 2) - inset);
  const ay = Math.max(1, Math.round(height / 2) - inset);
  if (shape === "rectangle") {
    return inset <= 0
      ? "1"
      : `lte(abs(X-${cx}),${ax})*lte(abs(Y-${cy}),${ay})`;
  }
  if (shape === "circle") {
    return `lte((X-${cx})^2/${ax * ax}+(Y-${cy})^2/${ay * ay},1)`;
  }
  if (shape === "diamond") {
    return `lte(abs(X-${cx})/${ax}+abs(Y-${cy})/${ay},1)`;
  }
  const radius = Math.max(
    1,
    Math.round(Math.min(width, height) * ROUNDED_R) - inset,
  );
  const bx = Math.max(0, ax - radius);
  const by = Math.max(0, ay - radius);
  return `gt(lte(abs(X-${cx}),${bx})*lte(abs(Y-${cy}),${ay})+lte(abs(X-${cx}),${ax})*lte(abs(Y-${cy}),${by})+lte((abs(X-${cx})-${bx})^2+(abs(Y-${cy})-${by})^2,${radius * radius}),0)`;
}

/**
 * The alpha/colour pass applied to a local-FX patch before it is overlaid.
 *
 * Alpha is SET to a constant (the region's own opacity) inside the shape rather
 * than multiplied into the source alpha. The source alpha is restored once,
 * after every region has been composited — otherwise a clip that already
 * carries alpha (opacity, mask, cutout, a transition fade) has that alpha
 * composited with itself and the region renders `2a - a²` instead of `a`.
 *
 * `border` paints a stroke in the band just inside the shape edge, which is how
 * the preview draws the magnifier ring.
 */
function localEffectPatch(
  shape: "rectangle" | "circle" | "rounded" | "diamond",
  width: number,
  height: number,
  opacity: number,
  border?: { px: number; color: string },
): string {
  const a = Math.round(clamp01(opacity) * 255);
  const inside = shapeInside(shape, width, height);
  const alpha = shape === "rectangle" ? `${a}` : `if(${inside},${a},0)`;
  if (!border || border.px < 1) {
    return `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${alpha}'`;
  }
  const inner = shapeInside(shape, width, height, Math.round(border.px));
  const ring = `(${inside})*(1-(${inner}))`;
  const [br, bg, bb] = hexToRgb255(border.color);
  return `geq=r='if(${ring},${br},r(X,Y))':g='if(${ring},${bg},g(X,Y))':b='if(${ring},${bb},b(X,Y))':a='${alpha}'`;
}

/** #rgb / #rrggbb → [r,g,b] 0..255 (white when unparseable). */
function hexToRgb255(color: string): [number, number, number] {
  const m =
    /^#([0-9a-f]{6})$/i.exec(color.trim()) ??
    /^#([0-9a-f]{3})$/i.exec(color.trim());
  if (!m) return [255, 255, 255];
  const hex =
    m[1].length === 3
      ? m[1]
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : m[1];
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

/** Finite-guard a client number: NaN/Infinity would reach the filtergraph as
 *  the literal "NaN" and make ffmpeg reject the whole chain. */
function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}

function clamp01(value: unknown): number {
  return num(value, 1, 0, 1);
}

export function buildFFmpegArgs(
  project: VideoProject,
  opts: BuildFFmpegOptions,
): string[] {
  // Multi-track projects composite layers; legacy projects keep the concat/xfade path below.
  if (project.tracks !== undefined) return buildMultiTrackArgs(project, opts);

  const { width: W, height: H, fps } = project;
  const resolve = opts.resolveSrc ?? ((s) => s);
  const hasAudio = opts.hasAudio ?? (() => true);
  const images = opts.overlayImages ?? {};
  const clips = project.clips;
  const useBaseImage = clips.length === 0;
  if (useBaseImage && !opts.baseImage) {
    throw new Error("VideoProject has no clips or base image to render");
  }
  const duration = projectDuration(project);
  const overlays = project.overlays.filter((o) => images[o.id]);
  const xfade = transitionDuration(project);

  const scaleChain = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${fps},format=yuv420p`;

  // ---- inputs: clips(0..C-1), overlays(C..), audio(after) ----
  const inputs: string[] = [];
  const clipCount = useBaseImage ? 1 : clips.length;
  if (useBaseImage) {
    inputs.push("-loop", "1", "-t", String(duration), "-i", opts.baseImage!);
  } else {
    for (const c of clips) {
      if (c.type === "image")
        inputs.push(
          "-loop",
          "1",
          "-t",
          String(c.duration),
          "-i",
          resolve(c.src),
        );
      else inputs.push("-i", resolve(c.src));
    }
  }
  overlays.forEach((o) => inputs.push("-loop", "1", "-i", images[o.id]));
  project.audio.forEach((a) => inputs.push("-i", resolve(a.src)));
  const overlayBase = clipCount;
  const audioBase = clipCount + overlays.length;

  const segments: string[] = [];

  // ---- per-clip video chains → [c0..] ----
  const clipLabels: string[] = [];
  if (useBaseImage) {
    segments.push(`[0:v]${scaleChain}[c0]`);
    clipLabels.push("[c0]");
  } else {
    clips.forEach((c, idx) => {
      const pre =
        c.type === "video"
          ? `trim=start=${c.trimIn ?? 0}:duration=${c.duration},setpts=PTS-STARTPTS,`
          : "";
      segments.push(`[${idx}:v]${pre}${scaleChain}[c${idx}]`);
      clipLabels.push(`[c${idx}]`);
    });
  }

  // ---- join clips → [base] (single clip passes through) ----
  let baseLabel: string;
  if (clipLabels.length === 1) {
    baseLabel = clipLabels[0];
  } else if (xfade > 0) {
    let acc = clipLabels[0];
    let accDur = clips[0].duration;
    for (let i = 1; i < clipLabels.length; i++) {
      const out = i === clipLabels.length - 1 ? "[base]" : `[xf${i}]`;
      const offset = Math.max(0, accDur - xfade);
      segments.push(
        `${acc}${clipLabels[i]}xfade=transition=fade:duration=${xfade}:offset=${offset}${out}`,
      );
      acc = out;
      accDur = accDur + clips[i].duration - xfade;
    }
    baseLabel = "[base]";
  } else {
    segments.push(
      `${clipLabels.join("")}concat=n=${clipLabels.length}:v=1:a=0[base]`,
    );
    baseLabel = "[base]";
  }

  // ---- overlays over the joined video → [v] ----
  if (overlays.length === 0) {
    segments.push(`${baseLabel}null[v]`);
  } else {
    let last = baseLabel;
    overlays.forEach((o, i) => {
      const fade: string[] = ["format=rgba"];
      if (o.animation === "fade") {
        const d = 0.3;
        fade.push(
          `fade=t=in:st=${o.start}:d=${d}:alpha=1`,
          `fade=t=out:st=${Math.max(0, o.end - d)}:d=${d}:alpha=1`,
        );
      }
      segments.push(`[${overlayBase + i}:v]${fade.join(",")}[ov${i}]`);
      const out = i === overlays.length - 1 ? "[v]" : `[t${i}]`;
      segments.push(
        `${last}[ov${i}]overlay=0:0:enable='between(t,${o.start},${o.end})'${out}`,
      );
      last = out;
    });
  }

  // ---- audio: music tracks (+ a lone video clip's own audio) ----
  const aLabels: string[] = [];
  project.audio.forEach((a, i) => {
    if (!hasAudio(resolve(a.src))) return; // skip an audio file with no audio stream
    const label = `a${i}`;
    segments.push(
      `[${audioBase + i}:a]atrim=start=${a.trimIn ?? 0}:duration=${a.duration ?? duration},asetpts=PTS-STARTPTS,volume=${a.volume ?? 1}[${label}]`,
    );
    aLabels.push(`[${label}]`);
  });
  const loneClip = !useBaseImage && clips.length === 1 ? clips[0] : null;
  if (
    loneClip &&
    loneClip.type === "video" &&
    !loneClip.muted &&
    hasAudio(resolve(loneClip.src))
  ) {
    segments.push(
      `[0:a]atrim=start=${loneClip.trimIn ?? 0}:duration=${loneClip.duration},asetpts=PTS-STARTPTS,volume=${loneClip.volume ?? 1}[abase]`,
    );
    aLabels.push("[abase]");
  }
  let audioMap: string | null = null;
  if (aLabels.length === 1) {
    audioMap = aLabels[0];
  } else if (aLabels.length > 1) {
    segments.push(
      `${aLabels.join("")}amix=inputs=${aLabels.length}:dropout_transition=0[a]`,
    );
    audioMap = "[a]";
  }

  // ---- assemble ----
  const args: string[] = [
    "-y",
    ...inputs,
    "-filter_complex",
    segments.join(";"),
    "-map",
    "[v]",
  ];
  if (audioMap) args.push("-map", audioMap);
  args.push(
    "-r",
    String(fps),
    "-t",
    String(duration),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-profile:v",
    "high",
    "-preset",
    "veryfast",
  );
  if (audioMap) args.push("-c:a", "aac", "-b:a", "192k");
  args.push("-movflags", "+faststart", opts.outputPath);
  return args;
}

/**
 * Multi-track (v2) compositor. Stacks visual tracks bottom→top: each clip is
 * trimmed, scaled to its normalized `rect`, time-shifted to its absolute
 * `start` (setpts) and overlaid (gated by `enable`) onto a background base.
 * Text overlays composite last. Audio clips + each video clip's own audio are
 * positioned with `adelay` and mixed. Requires `opts.baseImage` (the rasterized
 * background) so there is always a full-duration canvas.
 */
function buildMultiTrackArgs(
  project: VideoProject,
  opts: BuildFFmpegOptions,
): string[] {
  const { width: W, height: H, fps } = project;
  const resolve = opts.resolveSrc ?? ((s) => s);
  const hasAudio = opts.hasAudio ?? (() => true);
  const images = opts.overlayImages ?? {};
  if (!opts.baseImage)
    throw new Error("multi-track render requires a base background image");
  const duration = projectDuration(project);
  const tracks = project.tracks ?? [];
  const visualClips = tracks
    .filter((t): t is VisualTrack => t.kind === "visual")
    .flatMap((t) => t.clips);
  const audioClips = tracks
    .filter((t): t is AudioTrack => t.kind === "audio")
    .flatMap((t) => t.clips);
  const textOverlays = project.overlays.filter((o) => images[o.id]);

  // Transitions (fade-through-black) on the MAIN (first visual) track: a clip's
  // `transitionIn` fades it in; the previous clip then fades out. clip.id → fade.
  // Shared with the browser preview via `transitions.ts` — see `frame.ts`.
  const mainTrack = tracks.find((t): t is VisualTrack => t.kind === "visual");
  const fadeMap = buildFadeMap(mainTrack?.clips ?? []);

  // ---- inputs: base(0), visual clips, text overlays, audio clips ----
  const inputs: string[] = [];
  let idx = 0;
  inputs.push("-loop", "1", "-t", String(duration), "-i", opts.baseImage);
  const baseIdx = idx++;
  const vIn = visualClips.map((c) => {
    if (c.type === "image")
      inputs.push("-loop", "1", "-t", String(c.duration), "-i", resolve(c.src));
    else inputs.push("-i", resolve(c.src));
    return idx++;
  });
  const oIn = textOverlays.map((o) => {
    inputs.push("-loop", "1", "-i", images[o.id]);
    return idx++;
  });
  const aIn = audioClips.map((a) => {
    inputs.push("-i", resolve(a.src));
    return idx++;
  });

  // Colour/gradient backgrounds are rasterized at exactly W×H (stretch = identity);
  // an image background is an arbitrary photo, so cover-scale + crop it to fill.
  const baseScale =
    project.background?.type === "image"
      ? `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`
      : `scale=${W}:${H}`;
  const segments: string[] = [
    `[${baseIdx}:v]${baseScale},setsar=1,fps=${fps},format=yuv420p[base]`,
  ];

  // ---- composite visual clips over the base (bottom→top) ----
  let prev = "[base]";
  visualClips.forEach((c, i) => {
    const R = c.rect ?? FULL_FRAME;
    const rw = even(R.w * W);
    const rh = even(R.h * H);
    const rx = Math.round(R.x * W);
    const ry = Math.round(R.y * H);
    const S = c.start;
    const E = c.start + c.duration;
    const sp = c.speed && c.speed > 0 ? c.speed : 1;
    // speed: consume `duration*sp` source seconds, then setpts divides by sp.
    const srcDur = c.duration * sp;
    const shift =
      sp === 1
        ? `setpts=PTS-STARTPTS+${S}/TB`
        : `setpts=(PTS-STARTPTS)/${sp}+${S}/TB`;
    const prep =
      c.type === "video"
        ? `trim=start=${c.trimIn ?? 0}:duration=${srcDur},${shift},`
        : `setpts=PTS-STARTPTS+${S}/TB,`;
    const grade = filterToFFmpeg(c.filter);
    const fade = fadeMap.get(c.id);
    const key = chromaToFFmpeg(c.cutout);
    const kfs = c.keyframes;
    const kfOpacity = hasKeyframes(kfs) && animatesOpacity(kfs!);
    const kfPosition = hasKeyframes(kfs) && animatesPosition(kfs!);
    // static opacity (keyframes override when they animate opacity).
    const staticOpacity =
      !kfOpacity && c.opacity != null && c.opacity < 0.999
        ? Math.max(0, c.opacity)
        : null;
    const maskChain = maskToFFmpeg(c.mask, rw, rh);
    // alpha plane needed for keying, animated/static opacity, a mask, OR fades.
    const fmt =
      c.type === "image" ||
      key ||
      kfOpacity ||
      staticOpacity != null ||
      maskChain ||
      c.mosaic ||
      c.magnifier
        ? "rgba"
        : fade
          ? "yuva420p"
          : "yuv420p";
    let chain = `${prep}${grade}scale=${rw}:${rh}:force_original_aspect_ratio=increase,crop=${rw}:${rh},setsar=1,fps=${fps},format=${fmt}`;
    if (key) chain += `,${key}`;
    if (c.blur && c.blur > 0) chain += `,gblur=sigma=${r3(c.blur * 20)}`;
    if (hasMotion(c.motion)) {
      // zoompan re-times to a 0-based PTS, so re-anchor the clip's timeline start.
      const zp = motionToZoompan(
        c.motion,
        Math.round(c.duration * fps),
        rw,
        rh,
        fps,
      );
      if (zp) chain += `,${zp},setpts=PTS-STARTPTS+${r3(S)}/TB`;
    }
    if (kfOpacity) {
      // bake per-frame opacity into the alpha plane (T = timeline seconds).
      const a = keyframeExpr(kfs!, "opacity", S, c.duration, "T", 255);
      chain += `,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='clip(${a},0,255)'`;
    } else if (staticOpacity != null) {
      chain += `,colorchannelmixer=aa=${r3(staticOpacity)}`;
    }
    // mask runs after opacity so alpha(X,Y) already carries the opacity.
    if (maskChain) chain += `,${maskChain}`;
    if (fade?.fin) chain += `,fade=t=in:st=${r3(S)}:d=${fade.fin}:alpha=1`;
    if (fade?.fout)
      chain += `,fade=t=out:st=${r3(E - fade.fout)}:d=${fade.fout}:alpha=1`;
    const hasLocalFx = !!(c.mosaic || c.magnifier);
    const rawLabel = hasLocalFx ? `vr${i}` : `v${i}`;
    segments.push(`[${vIn[i]}:v]${chain}[${rawLabel}]`);
    // Keep a copy of the clip's own alpha; it is merged back after every region
    // has been composited so the regions cannot double-composite it.
    let localFxLabel = `[${rawLabel}]`;
    if (hasLocalFx) {
      segments.push(`[${rawLabel}]split[fxin${i}][fxa${i}]`);
      localFxLabel = `[fxin${i}]`;
    }
    let localFxIndex = 0;
    // Shared with the browser compositor — see `layout.ts`. Not reimplemented
    // here, so a lens cannot land on different pixels in preview and export.
    const regionBox = (region: { cx: number; cy: number; rx: number; ry: number }) =>
      regionBoxPx(region, rw, rh);
    const addRegionFx = (
      region: NonNullable<typeof c.mosaic | typeof c.magnifier>,
      filter: string,
      kind: "mo" | "mg",
      border?: { px: number; color: string },
    ) => {
      const { ew, eh, ex, ey } = regionBox(region);
      const base = `${kind}b${i}_${localFxIndex}`;
      const src = `${kind}s${i}_${localFxIndex}`;
      const patch = `${kind}p${i}_${localFxIndex}`;
      const out = `${kind}o${i}_${localFxIndex}`;
      const shapeAlpha = localEffectPatch(
        region.shape,
        ew,
        eh,
        region.opacity,
        border,
      );
      segments.push(`${localFxLabel}split[${base}][${src}]`);
      segments.push(
        `[${src}]crop=${ew}:${eh}:${ex}:${ey},${filter},format=rgba,${shapeAlpha}[${patch}]`,
      );
      segments.push(
        `[${base}][${patch}]overlay=${ex}:${ey}:eof_action=pass[${out}]`,
      );
      localFxLabel = `[${out}]`;
      localFxIndex += 1;
    };
    if (c.mosaic) {
      const m = c.mosaic;
      const amount = num(m.amount, 0.35, 0, 1);
      if (m.pattern === "blur") {
        // gblur's sigma maxes out at 1024; amount is already clamped to 0..1.
        addRegionFx(m, `gblur=sigma=${mosaicBlurSigma(amount)}`, "mo");
      } else {
        const { ew, eh } = regionBox(m);
        const { sw, sh } = mosaicStepPx(m.pattern, amount, ew, eh);
        addRegionFx(
          m,
          `scale=${sw}:${sh}:flags=area,scale=${ew}:${eh}:flags=neighbor`,
          "mo",
        );
      }
    }
    if (c.magnifier) {
      const m = c.magnifier;
      const { ew, eh } = regionBox(m);
      const { sw, sh, sx, sy } = magnifierCropPx(m.zoom, ew, eh);
      // The preview strokes the lens outline at borderWidth * min(W,H); match it.
      const borderPx = Math.round(
        num(m.borderWidth, 0, 0, 0.5) * Math.min(rw, rh),
      );
      addRegionFx(
        m,
        `crop=${sw}:${sh}:${sx}:${sy},scale=${ew}:${eh}:flags=lanczos`,
        "mg",
        borderPx >= 1
          ? { px: borderPx, color: m.borderColor ?? "#ffffff" }
          : undefined,
      );
    }
    if (hasLocalFx) {
      // Restore the clip's own alpha exactly once, after all regions.
      segments.push(`[fxa${i}]alphaextract[fxam${i}]`);
      segments.push(`${localFxLabel}[fxam${i}]alphamerge[v${i}]`);
    }
    const blendMode = blendToFFmpeg(c.blend);
    if (blendMode) {
      // Blend the clip with the base region under its rect, then overlay the
      // blended patch back (time-gated). Clip alpha (mask/cutout/opacity) is
      // preserved via alphamerge so it still composites correctly.
      segments.push(`${prev}split[bk${i}][bcs${i}]`);
      segments.push(
        `[bcs${i}]crop=${rw}:${rh}:${rx}:${ry},format=rgba[bc${i}]`,
      );
      segments.push(`[v${i}]format=rgba,split[vc${i}][vas${i}]`);
      segments.push(`[vas${i}]alphaextract[va${i}]`);
      segments.push(
        `[bc${i}][vc${i}]blend=all_mode=${blendMode}:eof_action=pass[blr${i}]`,
      );
      segments.push(`[blr${i}][va${i}]alphamerge[bl${i}]`);
      segments.push(
        `[bk${i}][bl${i}]overlay=${rx}:${ry}:enable='between(t,${S},${E})':eof_action=pass[c${i}]`,
      );
    } else {
      const ox = kfPosition
        ? `'${keyframeExpr(kfs!, "x", S, c.duration, "t", W)}'`
        : `${rx}`;
      const oy = kfPosition
        ? `'${keyframeExpr(kfs!, "y", S, c.duration, "t", H)}'`
        : `${ry}`;
      segments.push(
        `${prev}[v${i}]overlay=${ox}:${oy}:enable='between(t,${S},${E})':eof_action=pass[c${i}]`,
      );
    }
    prev = `[c${i}]`;
  });

  // ---- text overlays on top ----
  // The caption PNG is full-frame (WxH) with the text baked at its anchor, so it
  // reuses the same motion/keyframe machinery as visual clips: motion zoom/pans
  // the whole layer, keyframed opacity bakes per-frame alpha, keyframed position
  // translates the layer by the delta from the baked anchor.
  textOverlays.forEach((o, i) => {
    const S = o.start;
    const E = o.end;
    const dur = Math.max(0.001, E - S);
    const kfs = o.keyframes;
    const kfOpacity = hasKeyframes(kfs) && animatesOpacity(kfs!);
    const kfPosition = hasKeyframes(kfs) && animatesPosition(kfs!);
    const chain: string[] = ["format=rgba"];
    if (hasMotion(o.motion)) {
      // zoompan re-times to a 0-based PTS, so re-anchor to the caption start.
      const zp = motionToZoompan(o.motion, Math.round(dur * fps), W, H, fps);
      if (zp) chain.push(zp, `setpts=PTS-STARTPTS+${r3(S)}/TB`);
    }
    if (kfOpacity) {
      const a = keyframeExpr(kfs!, "opacity", S, dur, "T", 255);
      chain.push(`geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='clip(${a},0,255)'`);
    } else if (o.opacity != null && o.opacity < 1) {
      chain.push(`colorchannelmixer=aa=${Math.max(0, Math.min(1, o.opacity))}`);
    }
    if (!kfOpacity && o.animation === "fade") {
      const d = 0.3;
      chain.push(
        `fade=t=in:st=${r3(S)}:d=${d}:alpha=1`,
        `fade=t=out:st=${r3(Math.max(0, E - d))}:d=${d}:alpha=1`,
      );
    }
    const textMask = maskToFFmpeg(o.mask, W, H);
    if (textMask) chain.push(textMask);
    segments.push(`[${oIn[i]}:v]${chain.join(",")}[t${i}]`);
    const ox = kfPosition
      ? `'(${keyframeExpr(kfs!, "x", S, dur, "t", W)})-${r3(o.x * W)}'`
      : `0`;
    const oy = kfPosition
      ? `'(${keyframeExpr(kfs!, "y", S, dur, "t", H)})-${r3(o.y * H)}'`
      : `0`;
    segments.push(
      `${prev}[t${i}]overlay=${ox}:${oy}:enable='between(t,${r3(S)},${r3(E)})'[tc${i}]`,
    );
    prev = `[tc${i}]`;
  });
  const vLabel = prev;

  // ---- audio: positioned audio clips + each video clip's own audio, mixed ----
  const aLabels: string[] = [];
  // gain: a per-frame volume expression when a curve is set, else a constant.
  const gain = (
    curve: (typeof audioClips)[number]["volumeCurve"],
    vol: number | undefined,
    start: number,
    duration: number,
  ) =>
    hasVolumeCurve(curve)
      ? `volume='${volumeCurveExpr(curve!, start, duration)}':eval=frame`
      : `volume=${vol ?? 1}`;
  audioClips.forEach((a, i) => {
    if (!hasAudio(resolve(a.src))) return;
    const ms = Math.max(0, Math.round(a.start * 1000));
    segments.push(
      `[${aIn[i]}:a]atrim=start=${a.trimIn ?? 0}:duration=${a.duration},asetpts=PTS-STARTPTS,adelay=${ms}:all=1,${gain(a.volumeCurve, a.volume, a.start, a.duration)}[aa${i}]`,
    );
    aLabels.push(`[aa${i}]`);
  });
  visualClips.forEach((c, i) => {
    if (c.type !== "video" || c.muted || !hasAudio(resolve(c.src))) return;
    const ms = Math.max(0, Math.round(c.start * 1000));
    const sp = c.speed && c.speed > 0 ? c.speed : 1;
    const srcDur = c.duration * sp;
    const tempo = atempoChain(sp);
    const tempoPart = tempo ? `${tempo},` : "";
    segments.push(
      `[${vIn[i]}:a]atrim=start=${c.trimIn ?? 0}:duration=${srcDur},asetpts=PTS-STARTPTS,${tempoPart}adelay=${ms}:all=1,${gain(c.volumeCurve, c.volume, c.start, c.duration)}[va${i}]`,
    );
    aLabels.push(`[va${i}]`);
  });
  let audioMap: string | null = null;
  if (aLabels.length === 1) {
    audioMap = aLabels[0];
  } else if (aLabels.length > 1) {
    segments.push(
      `${aLabels.join("")}amix=inputs=${aLabels.length}:dropout_transition=0:normalize=0[a]`,
    );
    audioMap = "[a]";
  }

  // ---- assemble (with per-export output overrides) ----
  const out = opts.output;
  const audioOnly = !!out?.audioOnly && !!audioMap;
  let vMap = vLabel;
  if (!audioOnly && out?.width && out?.height) {
    segments.push(
      `${vLabel}scale=${even(out.width)}:${even(out.height)}:flags=lanczos,setsar=1[vout]`,
    );
    vMap = "[vout]";
  }
  const args: string[] = [
    "-y",
    ...inputs,
    "-filter_complex",
    segments.join(";"),
  ];
  if (!audioOnly) args.push("-map", vMap);
  if (audioMap) args.push("-map", audioMap);
  args.push("-t", String(duration));
  if (audioOnly) {
    args.push("-vn");
  } else if (out?.hdr) {
    // HDR10: 10-bit HEVC tagged BT.2020 primaries + PQ (SMPTE-2084) transfer.
    args.push(
      "-r",
      String(out.fps && out.fps > 0 ? out.fps : fps),
      "-c:v",
      "libx265",
      "-pix_fmt",
      "yuv420p10le",
      "-color_primaries",
      "bt2020",
      "-color_trc",
      "smpte2084",
      "-colorspace",
      "bt2020nc",
      "-x265-params",
      "colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:hdr10=1:repeat-headers=1",
      "-tag:v",
      "hvc1",
      "-preset",
      "veryfast",
    );
    if (out.bitrate && out.bitrate > 0)
      args.push(
        "-b:v",
        `${out.bitrate}M`,
        "-maxrate",
        `${out.bitrate}M`,
        "-bufsize",
        `${out.bitrate * 2}M`,
      );
  } else {
    args.push(
      "-r",
      String(out?.fps && out.fps > 0 ? out.fps : fps),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-profile:v",
      "high",
      "-preset",
      "veryfast",
    );
    if (out?.bitrate && out.bitrate > 0)
      args.push(
        "-b:v",
        `${out.bitrate}M`,
        "-maxrate",
        `${out.bitrate}M`,
        "-bufsize",
        `${out.bitrate * 2}M`,
      );
  }
  if (audioMap) args.push("-c:a", "aac", "-b:a", "192k");
  args.push("-movflags", "+faststart", opts.outputPath);
  return args;
}
