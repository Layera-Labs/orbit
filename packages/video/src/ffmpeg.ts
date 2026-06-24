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
import type { VideoProject } from './types';
import { projectDuration, transitionDuration } from './project';

export interface BuildFFmpegOptions {
  outputPath: string;
  /** overlay id → rendered PNG path. Overlays without an image are skipped. */
  overlayImages?: Record<string, string>;
  /** Base image to use when the project has no visual clip (e.g. a rendered background). */
  baseImage?: string;
  /** Map a clip/audio `src` to a local file path. Defaults to identity. */
  resolveSrc?: (src: string) => string;
}

export function buildFFmpegArgs(project: VideoProject, opts: BuildFFmpegOptions): string[] {
  const { width: W, height: H, fps } = project;
  const resolve = opts.resolveSrc ?? ((s) => s);
  const images = opts.overlayImages ?? {};
  const clips = project.clips;
  const useBaseImage = clips.length === 0;
  if (useBaseImage && !opts.baseImage) {
    throw new Error('VideoProject has no clips or base image to render');
  }
  const duration = projectDuration(project);
  const overlays = project.overlays.filter((o) => images[o.id]);
  const xfade = transitionDuration(project);

  const scaleChain = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${fps},format=yuv420p`;

  // ---- inputs: clips(0..C-1), overlays(C..), audio(after) ----
  const inputs: string[] = [];
  const clipCount = useBaseImage ? 1 : clips.length;
  if (useBaseImage) {
    inputs.push('-loop', '1', '-t', String(duration), '-i', opts.baseImage!);
  } else {
    for (const c of clips) {
      if (c.type === 'image') inputs.push('-loop', '1', '-t', String(c.duration), '-i', resolve(c.src));
      else inputs.push('-i', resolve(c.src));
    }
  }
  overlays.forEach((o) => inputs.push('-loop', '1', '-i', images[o.id]));
  project.audio.forEach((a) => inputs.push('-i', resolve(a.src)));
  const overlayBase = clipCount;
  const audioBase = clipCount + overlays.length;

  const segments: string[] = [];

  // ---- per-clip video chains → [c0..] ----
  const clipLabels: string[] = [];
  if (useBaseImage) {
    segments.push(`[0:v]${scaleChain}[c0]`);
    clipLabels.push('[c0]');
  } else {
    clips.forEach((c, idx) => {
      const pre = c.type === 'video' ? `trim=start=${c.trimIn ?? 0}:duration=${c.duration},setpts=PTS-STARTPTS,` : '';
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
      const out = i === clipLabels.length - 1 ? '[base]' : `[xf${i}]`;
      const offset = Math.max(0, accDur - xfade);
      segments.push(`${acc}${clipLabels[i]}xfade=transition=fade:duration=${xfade}:offset=${offset}${out}`);
      acc = out;
      accDur = accDur + clips[i].duration - xfade;
    }
    baseLabel = '[base]';
  } else {
    segments.push(`${clipLabels.join('')}concat=n=${clipLabels.length}:v=1:a=0[base]`);
    baseLabel = '[base]';
  }

  // ---- overlays over the joined video → [v] ----
  if (overlays.length === 0) {
    segments.push(`${baseLabel}null[v]`);
  } else {
    let last = baseLabel;
    overlays.forEach((o, i) => {
      const fade: string[] = ['format=rgba'];
      if (o.animation === 'fade') {
        const d = 0.3;
        fade.push(`fade=t=in:st=${o.start}:d=${d}:alpha=1`, `fade=t=out:st=${Math.max(0, o.end - d)}:d=${d}:alpha=1`);
      }
      segments.push(`[${overlayBase + i}:v]${fade.join(',')}[ov${i}]`);
      const out = i === overlays.length - 1 ? '[v]' : `[t${i}]`;
      segments.push(`${last}[ov${i}]overlay=0:0:enable='between(t,${o.start},${o.end})'${out}`);
      last = out;
    });
  }

  // ---- audio: music tracks (+ a lone video clip's own audio) ----
  const aLabels: string[] = [];
  project.audio.forEach((a, i) => {
    const label = `a${i}`;
    segments.push(
      `[${audioBase + i}:a]atrim=start=${a.trimIn ?? 0}:duration=${a.duration ?? duration},asetpts=PTS-STARTPTS,volume=${a.volume ?? 1}[${label}]`,
    );
    aLabels.push(`[${label}]`);
  });
  const loneClip = !useBaseImage && clips.length === 1 ? clips[0] : null;
  if (loneClip && loneClip.type === 'video' && !loneClip.muted) {
    segments.push(
      `[0:a]atrim=start=${loneClip.trimIn ?? 0}:duration=${loneClip.duration},asetpts=PTS-STARTPTS,volume=${loneClip.volume ?? 1}[abase]`,
    );
    aLabels.push('[abase]');
  }
  let audioMap: string | null = null;
  if (aLabels.length === 1) {
    audioMap = aLabels[0];
  } else if (aLabels.length > 1) {
    segments.push(`${aLabels.join('')}amix=inputs=${aLabels.length}:dropout_transition=0[a]`);
    audioMap = '[a]';
  }

  // ---- assemble ----
  const args: string[] = ['-y', ...inputs, '-filter_complex', segments.join(';'), '-map', '[v]'];
  if (audioMap) args.push('-map', audioMap);
  args.push(
    '-r', String(fps),
    '-t', String(duration),
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-profile:v', 'high',
    '-preset', 'veryfast',
  );
  if (audioMap) args.push('-c:a', 'aac', '-b:a', '192k');
  args.push('-movflags', '+faststart', opts.outputPath);
  return args;
}
