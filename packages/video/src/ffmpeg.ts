/**
 * Pure FFmpeg command builder: a `VideoProject` → an ffmpeg argv array.
 *
 * Kept side-effect-free (no spawning) so it is fully unit-testable. v1 renders
 * one base visual clip, burns text overlays via `drawtext`, and mixes audio —
 * encoding to H.264/AAC MP4 (iOS/Android friendly: yuv420p + faststart).
 */
import type { TextOverlay, VideoProject } from './types';
import { projectDuration } from './project';

export interface BuildFFmpegOptions {
  outputPath: string;
  /** A .ttf/.otf for drawtext — ffmpeg needs an explicit fontfile. */
  fontFile?: string;
  /** Map a clip/audio `src` to a local file path. Defaults to identity. */
  resolveSrc?: (src: string) => string;
}

/** A widely-present font on macOS dev machines; override in production. */
const DEFAULT_FONT = '/System/Library/Fonts/Supplemental/Arial.ttf';

/** Escape a string for use inside a drawtext `text='...'` value. */
export function escapeDrawText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/\n/g, '\\n');
}

function drawtext(o: TextOverlay, fontFile: string, W: number, H: number): string {
  const align = o.align ?? 'center';
  const x =
    align === 'center'
      ? '(w-text_w)/2'
      : align === 'right'
        ? `${Math.round(W * o.x)}-text_w`
        : `${Math.round(W * o.x)}`;
  const y = `${Math.round(H * o.y)}-text_h/2`;

  const parts: string[] = [
    `fontfile='${fontFile}'`,
    `text='${escapeDrawText(o.text)}'`,
    `fontsize=${o.fontSize}`,
    `fontcolor=${o.color}`,
    `x=${x}`,
    `y=${y}`,
  ];
  if (o.box) {
    parts.push(`box=1`, `boxcolor=${o.box.color}@${o.box.opacity ?? 1}`, `boxborderw=${o.box.padding ?? 10}`);
  }
  if (o.animation === 'fade') {
    const d = 0.3;
    parts.push(
      `alpha='if(lt(t,${o.start}+${d}),(t-${o.start})/${d},if(gt(t,${o.end}-${d}),(${o.end}-t)/${d},1))'`,
    );
  }
  parts.push(`enable='between(t,${o.start},${o.end})'`);
  return `drawtext=${parts.join(':')}`;
}

export function buildFFmpegArgs(project: VideoProject, opts: BuildFFmpegOptions): string[] {
  const { width: W, height: H, fps } = project;
  const resolve = opts.resolveSrc ?? ((s) => s);
  const fontFile = opts.fontFile ?? DEFAULT_FONT;
  const base = project.clips[0];
  if (!base) throw new Error('VideoProject has no clips to render');
  const duration = projectDuration(project);

  // ---- inputs ----
  const inputs: string[] = [];
  if (base.type === 'image') {
    inputs.push('-loop', '1', '-t', String(base.duration), '-i', resolve(base.src));
  } else {
    inputs.push('-i', resolve(base.src));
  }
  for (const a of project.audio) inputs.push('-i', resolve(a.src));

  // ---- video chain ----
  const vChain: string[] = [];
  if (base.type === 'video') {
    vChain.push(`trim=start=${base.trimIn ?? 0}:duration=${base.duration}`, 'setpts=PTS-STARTPTS');
  }
  vChain.push(
    `scale=${W}:${H}:force_original_aspect_ratio=increase`,
    `crop=${W}:${H}`,
    'setsar=1',
    `fps=${fps}`,
  );
  for (const ov of project.overlays) vChain.push(drawtext(ov, fontFile, W, H));
  let filterComplex = `[0:v]${vChain.join(',')}[v]`;

  // ---- audio chain ----
  const aLabels: string[] = [];
  const aChains: string[] = [];
  project.audio.forEach((a, i) => {
    const idx = i + 1; // audio inputs follow the base input
    const label = `a${i}`;
    aChains.push(
      `[${idx}:a]atrim=start=${a.trimIn ?? 0}:duration=${a.duration ?? duration},asetpts=PTS-STARTPTS,volume=${a.volume ?? 1}[${label}]`,
    );
    aLabels.push(`[${label}]`);
  });
  if (base.type === 'video' && !base.muted) {
    aChains.push(
      `[0:a]atrim=start=${base.trimIn ?? 0}:duration=${base.duration},asetpts=PTS-STARTPTS,volume=${base.volume ?? 1}[abase]`,
    );
    aLabels.push('[abase]');
  }

  let audioMap: string | null = null;
  if (aLabels.length === 1) {
    filterComplex += ';' + aChains.join(';');
    audioMap = aLabels[0];
  } else if (aLabels.length > 1) {
    filterComplex +=
      ';' + aChains.join(';') + `;${aLabels.join('')}amix=inputs=${aLabels.length}:dropout_transition=0[a]`;
    audioMap = '[a]';
  }

  // ---- assemble ----
  const args: string[] = ['-y', ...inputs, '-filter_complex', filterComplex, '-map', '[v]'];
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
