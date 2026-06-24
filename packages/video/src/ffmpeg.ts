/**
 * Pure FFmpeg command builder: a `VideoProject` (+ pre-rendered overlay PNGs,
 * and an optional base image for clip-less projects) → an ffmpeg argv array.
 * Side-effect-free, so it is fully unit-testable.
 *
 * Overlays are composited as image inputs via the `overlay` filter (with
 * `enable` timing and optional alpha fade) rather than `drawtext`, so the
 * ffmpeg build needs no libfreetype. Encodes to H.264/AAC MP4 (iOS/Android
 * friendly: yuv420p + faststart).
 */
import type { VideoProject } from './types';
import { projectDuration } from './project';

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
  const clip = project.clips[0];
  if (!clip && !opts.baseImage) {
    throw new Error('VideoProject has no clips or base image to render');
  }
  const duration = projectDuration(project);
  const overlays = project.overlays.filter((o) => images[o.id]);
  const isVideoBase = clip?.type === 'video';

  // ---- inputs: base(0), overlay images(1..N), audio(N+1..) ----
  const inputs: string[] = [];
  if (isVideoBase) {
    inputs.push('-i', resolve(clip!.src));
  } else if (clip?.type === 'image') {
    inputs.push('-loop', '1', '-t', String(clip.duration), '-i', resolve(clip.src));
  } else {
    // synthesized background base image, looped for the whole timeline
    inputs.push('-loop', '1', '-t', String(duration), '-i', opts.baseImage!);
  }
  overlays.forEach((o) => inputs.push('-loop', '1', '-i', images[o.id]));
  project.audio.forEach((a) => inputs.push('-i', resolve(a.src)));
  const audioBaseIndex = 1 + overlays.length;

  // ---- video chain + overlay compositing ----
  const vChain: string[] = [];
  if (isVideoBase) {
    vChain.push(`trim=start=${clip!.trimIn ?? 0}:duration=${clip!.duration}`, 'setpts=PTS-STARTPTS');
  }
  vChain.push(
    `scale=${W}:${H}:force_original_aspect_ratio=increase`,
    `crop=${W}:${H}`,
    'setsar=1',
    `fps=${fps}`,
  );

  const segments: string[] = [];
  if (overlays.length === 0) {
    segments.push(`[0:v]${vChain.join(',')}[v]`);
  } else {
    segments.push(`[0:v]${vChain.join(',')}[base]`);
    let prev = '[base]';
    overlays.forEach((o, i) => {
      const fade: string[] = ['format=rgba'];
      if (o.animation === 'fade') {
        const d = 0.3;
        fade.push(`fade=t=in:st=${o.start}:d=${d}:alpha=1`, `fade=t=out:st=${Math.max(0, o.end - d)}:d=${d}:alpha=1`);
      }
      segments.push(`[${i + 1}:v]${fade.join(',')}[ov${i}]`);
      const out = i === overlays.length - 1 ? '[v]' : `[t${i}]`;
      segments.push(`${prev}[ov${i}]overlay=0:0:enable='between(t,${o.start},${o.end})'${out}`);
      prev = out;
    });
  }

  // ---- audio ----
  const aLabels: string[] = [];
  project.audio.forEach((a, i) => {
    const idx = audioBaseIndex + i;
    const label = `a${i}`;
    segments.push(
      `[${idx}:a]atrim=start=${a.trimIn ?? 0}:duration=${a.duration ?? duration},asetpts=PTS-STARTPTS,volume=${a.volume ?? 1}[${label}]`,
    );
    aLabels.push(`[${label}]`);
  });
  if (isVideoBase && !clip!.muted) {
    segments.push(
      `[0:a]atrim=start=${clip!.trimIn ?? 0}:duration=${clip!.duration},asetpts=PTS-STARTPTS,volume=${clip!.volume ?? 1}[abase]`,
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
