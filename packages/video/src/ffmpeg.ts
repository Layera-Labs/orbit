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
import { FULL_FRAME, type AudioTrack, type VideoProject, type VisualTrack } from './types';
import { projectDuration, transitionDuration } from './project';
import { atempoChain, filterToFFmpeg } from './filters';

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
}

export function buildFFmpegArgs(project: VideoProject, opts: BuildFFmpegOptions): string[] {
  // Multi-track projects composite layers; legacy projects keep the concat/xfade path below.
  if (project.tracks !== undefined) return buildMultiTrackArgs(project, opts);

  const { width: W, height: H, fps } = project;
  const resolve = opts.resolveSrc ?? ((s) => s);
  const hasAudio = opts.hasAudio ?? (() => true);
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
    if (!hasAudio(resolve(a.src))) return; // skip an audio file with no audio stream
    const label = `a${i}`;
    segments.push(
      `[${audioBase + i}:a]atrim=start=${a.trimIn ?? 0}:duration=${a.duration ?? duration},asetpts=PTS-STARTPTS,volume=${a.volume ?? 1}[${label}]`,
    );
    aLabels.push(`[${label}]`);
  });
  const loneClip = !useBaseImage && clips.length === 1 ? clips[0] : null;
  if (loneClip && loneClip.type === 'video' && !loneClip.muted && hasAudio(resolve(loneClip.src))) {
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

/**
 * Multi-track (v2) compositor. Stacks visual tracks bottom→top: each clip is
 * trimmed, scaled to its normalized `rect`, time-shifted to its absolute
 * `start` (setpts) and overlaid (gated by `enable`) onto a background base.
 * Text overlays composite last. Audio clips + each video clip's own audio are
 * positioned with `adelay` and mixed. Requires `opts.baseImage` (the rasterized
 * background) so there is always a full-duration canvas.
 */
function buildMultiTrackArgs(project: VideoProject, opts: BuildFFmpegOptions): string[] {
  const { width: W, height: H, fps } = project;
  const resolve = opts.resolveSrc ?? ((s) => s);
  const hasAudio = opts.hasAudio ?? (() => true);
  const images = opts.overlayImages ?? {};
  if (!opts.baseImage) throw new Error('multi-track render requires a base background image');
  const duration = projectDuration(project);
  const tracks = project.tracks ?? [];
  const visualClips = tracks.filter((t): t is VisualTrack => t.kind === 'visual').flatMap((t) => t.clips);
  const audioClips = tracks.filter((t): t is AudioTrack => t.kind === 'audio').flatMap((t) => t.clips);
  const textOverlays = project.overlays.filter((o) => images[o.id]);
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  const r3 = (n: number) => Math.round(n * 1000) / 1000;

  // Transitions (fade-through-black) on the MAIN (first visual) track: a clip's
  // `transitionIn` fades it in; the previous clip then fades out. clip.id → fade.
  const mainTrack = tracks.find((t): t is VisualTrack => t.kind === 'visual');
  const mainClips = mainTrack?.clips ?? [];
  const fadeMap = new Map<string, { fin: number; fout: number }>();
  mainClips.forEach((c, i) => {
    const fin = c.transitionIn && c.transitionIn.type !== 'cut' ? c.transitionIn.duration : 0;
    const next = mainClips[i + 1];
    const fout = next?.transitionIn && next.transitionIn.type !== 'cut' ? next.transitionIn.duration : 0;
    if (fin || fout) fadeMap.set(c.id, { fin, fout });
  });

  // ---- inputs: base(0), visual clips, text overlays, audio clips ----
  const inputs: string[] = [];
  let idx = 0;
  inputs.push('-loop', '1', '-t', String(duration), '-i', opts.baseImage);
  const baseIdx = idx++;
  const vIn = visualClips.map((c) => {
    if (c.type === 'image') inputs.push('-loop', '1', '-t', String(c.duration), '-i', resolve(c.src));
    else inputs.push('-i', resolve(c.src));
    return idx++;
  });
  const oIn = textOverlays.map((o) => {
    inputs.push('-loop', '1', '-i', images[o.id]);
    return idx++;
  });
  const aIn = audioClips.map((a) => {
    inputs.push('-i', resolve(a.src));
    return idx++;
  });

  const segments: string[] = [`[${baseIdx}:v]scale=${W}:${H},setsar=1,fps=${fps},format=yuv420p[base]`];

  // ---- composite visual clips over the base (bottom→top) ----
  let prev = '[base]';
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
    const shift = sp === 1 ? `setpts=PTS-STARTPTS+${S}/TB` : `setpts=(PTS-STARTPTS)/${sp}+${S}/TB`;
    const prep = c.type === 'video' ? `trim=start=${c.trimIn ?? 0}:duration=${srcDur},${shift},` : `setpts=PTS-STARTPTS+${S}/TB,`;
    const grade = filterToFFmpeg(c.filter);
    const fade = fadeMap.get(c.id);
    const fmt = c.type === 'image' ? 'rgba' : fade ? 'yuva420p' : 'yuv420p';
    let chain = `${prep}${grade}scale=${rw}:${rh}:force_original_aspect_ratio=increase,crop=${rw}:${rh},setsar=1,fps=${fps},format=${fmt}`;
    if (fade?.fin) chain += `,fade=t=in:st=${r3(S)}:d=${fade.fin}:alpha=1`;
    if (fade?.fout) chain += `,fade=t=out:st=${r3(E - fade.fout)}:d=${fade.fout}:alpha=1`;
    segments.push(`[${vIn[i]}:v]${chain}[v${i}]`);
    segments.push(`${prev}[v${i}]overlay=${rx}:${ry}:enable='between(t,${S},${E})':eof_action=pass[c${i}]`);
    prev = `[c${i}]`;
  });

  // ---- text overlays on top ----
  textOverlays.forEach((o, i) => {
    const fade = ['format=rgba'];
    if (o.animation === 'fade') {
      const d = 0.3;
      fade.push(`fade=t=in:st=${o.start}:d=${d}:alpha=1`, `fade=t=out:st=${Math.max(0, o.end - d)}:d=${d}:alpha=1`);
    }
    segments.push(`[${oIn[i]}:v]${fade.join(',')}[t${i}]`);
    segments.push(`${prev}[t${i}]overlay=0:0:enable='between(t,${o.start},${o.end})'[tc${i}]`);
    prev = `[tc${i}]`;
  });
  const vLabel = prev;

  // ---- audio: positioned audio clips + each video clip's own audio, mixed ----
  const aLabels: string[] = [];
  audioClips.forEach((a, i) => {
    if (!hasAudio(resolve(a.src))) return;
    const ms = Math.max(0, Math.round(a.start * 1000));
    segments.push(
      `[${aIn[i]}:a]atrim=start=${a.trimIn ?? 0}:duration=${a.duration},asetpts=PTS-STARTPTS,adelay=${ms}:all=1,volume=${a.volume ?? 1}[aa${i}]`,
    );
    aLabels.push(`[aa${i}]`);
  });
  visualClips.forEach((c, i) => {
    if (c.type !== 'video' || c.muted || !hasAudio(resolve(c.src))) return;
    const ms = Math.max(0, Math.round(c.start * 1000));
    const sp = c.speed && c.speed > 0 ? c.speed : 1;
    const srcDur = c.duration * sp;
    const tempo = atempoChain(sp);
    const tempoPart = tempo ? `${tempo},` : '';
    segments.push(
      `[${vIn[i]}:a]atrim=start=${c.trimIn ?? 0}:duration=${srcDur},asetpts=PTS-STARTPTS,${tempoPart}adelay=${ms}:all=1,volume=${c.volume ?? 1}[va${i}]`,
    );
    aLabels.push(`[va${i}]`);
  });
  let audioMap: string | null = null;
  if (aLabels.length === 1) {
    audioMap = aLabels[0];
  } else if (aLabels.length > 1) {
    segments.push(`${aLabels.join('')}amix=inputs=${aLabels.length}:dropout_transition=0:normalize=0[a]`);
    audioMap = '[a]';
  }

  // ---- assemble ----
  const args: string[] = ['-y', ...inputs, '-filter_complex', segments.join(';'), '-map', vLabel];
  if (audioMap) args.push('-map', audioMap);
  args.push('-r', String(fps), '-t', String(duration), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-preset', 'veryfast');
  if (audioMap) args.push('-c:a', 'aac', '-b:a', '192k');
  args.push('-movflags', '+faststart', opts.outputPath);
  return args;
}
