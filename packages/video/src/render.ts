import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFFmpegArgs, type BuildFFmpegOptions } from './ffmpeg';
import { backgroundToSVG } from './background-svg';
import { overlayToSVG } from './overlay-svg';
import { rasterizeSVG } from './raster';
import { fontFilesFor } from './google-fonts';
import type { VideoProject } from './types';

export interface RenderOptions extends Omit<BuildFFmpegOptions, 'overlayImages' | 'hasAudio'> {
  /** ffmpeg binary path (default: `ffmpeg` on PATH). Production ships its own. */
  ffmpegPath?: string;
  /** ffprobe binary path (default: `ffprobe` on PATH). Used to detect which
   *  sources actually have audio so silent clips don't break the filtergraph. */
  ffprobePath?: string;
  /** Receives raw ffmpeg stderr chunks (progress lives here). */
  onProgress?: (chunk: string) => void;
  /** Hard cap on the encode, ms (default 10 min). A src pointing at a stalling
   *  HTTP stream would otherwise hang the process forever, holding its temp
   *  dir open — `isClientSrc` deliberately allows http(s) srcs. */
  timeoutMs?: number;
  /** Hard cap on each ffprobe, ms (default 30s). */
  probeTimeoutMs?: number;
}

const DEFAULT_RENDER_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_PROBE_TIMEOUT_MS = 30_000;

/**
 * Every encoder this process has running right now.
 *
 * A signal sent to the service reaches the SERVICE, not its children — ffmpeg
 * is a separate process, and `docker stop`/`kill -TERM <pid>` signal one pid,
 * not the tree. So a shutdown that simply exits leaves the encoder alive,
 * burning a core and writing to a temp file nobody will ever collect. Inside a
 * container the namespace teardown hides it; run under systemd or bare node and
 * it is a genuine orphan.
 */
const live = new Set<{ kill: (sig?: NodeJS.Signals) => boolean }>();

/**
 * Stop every encode this process started. Called on the way out.
 *
 * SIGTERM, then SIGKILL for anything still there a moment later — ffmpeg does
 * usually honour SIGTERM, and the point of shutting down is not to wait.
 */
export function killLiveRenders(): number {
  const n = live.size;
  for (const proc of live) {
    try {
      proc.kill('SIGTERM');
      setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {
          /* already gone */
        }
      }, 2_000).unref?.();
    } catch {
      /* already gone */
    }
  }
  live.clear();
  return n;
}

/** Kill a child after `ms`; SIGKILL if it ignores SIGTERM. Returns a canceller. */
function killAfter(proc: { kill: (sig?: NodeJS.Signals) => boolean }, ms: number, onKill: () => void) {
  const t = setTimeout(() => {
    onKill();
    proc.kill('SIGTERM');
    setTimeout(() => proc.kill('SIGKILL'), 5_000).unref?.();
  }, ms);
  t.unref?.();
  return () => clearTimeout(t);
}

/**
 * Render a project to `opts.outputPath`: rasterize each text overlay to a PNG,
 * then spawn ffmpeg to composite + encode. Resolves with the output path.
 */
export async function renderProject(project: VideoProject, opts: RenderOptions): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'orbit-video-'));
  try {
    // Clip-less legacy projects AND every multi-track project render their
    // background as a full-duration base canvas to composite onto.
    const resolveSrcEarly = opts.resolveSrc ?? ((s) => s);
    let baseImage: string | undefined;
    if (project.background?.type === 'image' && project.background.src) {
      // Image background: composite the resolved image file itself as the base
      // (buildMultiTrackArgs cover-scales it to the output frame).
      baseImage = resolveSrcEarly(project.background.src);
    } else if (project.clips.length === 0 || project.tracks !== undefined) {
      baseImage = join(dir, 'background.png');
      await writeFile(baseImage, rasterizeSVG(backgroundToSVG(project.background, project.width, project.height)));
    }
    // Download any Google fonts the captions use so resvg embeds them.
    const families = project.overlays.flatMap((o) => (o.type === 'text' && o.fontFamily ? [o.fontFamily] : []));
    const fontFiles = await fontFilesFor(families);

    const overlayImages: Record<string, string> = {};
    for (const overlay of project.overlays) {
      if (overlay.type !== 'text') continue;
      const png = rasterizeSVG(overlayToSVG(overlay, project.width, project.height), fontFiles);
      const path = join(dir, `${overlay.id}.png`);
      await writeFile(path, png);
      overlayImages[overlay.id] = path;
    }
    // Probe which sources actually carry audio so the builder only wires audio
    // that exists (silent clips / images would otherwise break the filtergraph).
    const resolveSrc = opts.resolveSrc ?? ((s) => s);
    const audioCandidates = new Set<string>();
    for (const c of project.clips) if (c.type === 'video') audioCandidates.add(resolveSrc(c.src));
    for (const a of project.audio) audioCandidates.add(resolveSrc(a.src));
    for (const t of project.tracks ?? []) {
      if (t.kind === 'visual') {
        for (const c of t.clips) if (c.type === 'video') audioCandidates.add(resolveSrc(c.src));
      } else {
        for (const c of t.clips) audioCandidates.add(resolveSrc(c.src));
      }
    }
    const withAudio = new Set<string>();
    await Promise.all(
      [...audioCandidates].map(async (src) => {
        if (await probeHasAudio(opts.ffprobePath ?? 'ffprobe', src, opts.probeTimeoutMs)) withAudio.add(src);
      }),
    );
    const hasAudio = (resolvedSrc: string) => withAudio.has(resolvedSrc);

    const args = buildFFmpegArgs(project, { ...opts, overlayImages, baseImage, hasAudio });
    await runFFmpeg(opts.ffmpegPath ?? 'ffmpeg', args, opts.onProgress, opts.timeoutMs);
    return opts.outputPath;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Resolve true if `file` has at least one audio stream (best-effort via ffprobe). */
function probeHasAudio(bin: string, file: string, timeoutMs = DEFAULT_PROBE_TIMEOUT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(
      bin,
      ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
    let out = '';
    // A probe of an unreachable/stalling URL never closes on its own.
    const cancel = killAfter(proc, timeoutMs, () => resolve(false));
    proc.stdout.on('data', (d: Buffer) => (out += d.toString()));
    proc.on('error', () => { cancel(); resolve(false); });
    proc.on('close', () => { cancel(); resolve(out.trim().length > 0); });
  });
}

function runFFmpeg(
  bin: string,
  args: string[],
  onProgress?: (s: string) => void,
  timeoutMs = DEFAULT_RENDER_TIMEOUT_MS,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    live.add(proc);
    let stderr = '';
    let timedOut = false;
    const cancel = killAfter(proc, timeoutMs, () => { timedOut = true; });
    proc.stderr.on('data', (d: Buffer) => {
      const s = d.toString();
      stderr += s;
      onProgress?.(s);
    });
    proc.on('error', (err) => { cancel(); live.delete(proc); reject(err); });
    proc.on('close', (code) => {
      cancel();
      live.delete(proc);
      if (timedOut) reject(new Error(`ffmpeg timed out after ${timeoutMs}ms`));
      else if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}\n${stderr.slice(-2000)}`));
    });
  });
}
