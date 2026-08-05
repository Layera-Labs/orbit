import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFFmpegArgs, type BuildFFmpegOptions } from './ffmpeg';
import { backgroundToSVG } from './background-svg';
import { canvasFrameToSVG, hasCanvasFrame } from './canvas-frame';
import { overlayFontOptions, overlayToSVG } from './overlay-svg';
import { rasterizeSVG } from './raster';
import { resolveFonts } from './google-fonts';
import { HDR_UNSUPPORTED_MESSAGE, supportsHdr } from './hdr';
import {
  parseXfadeTokens,
  resolveTransitions,
  transitionUnsupportedMessage,
  unsupportedTransitions,
} from './xfade';
import type { VideoProject, VisualTrackClip } from './types';

export interface RenderOptions extends Omit<BuildFFmpegOptions, 'overlayImages' | 'hasAudio'> {
  /** ffmpeg binary path (default: `ffmpeg` on PATH). Production ships its own. */
  ffmpegPath?: string;
  /** ffprobe binary path (default: `ffprobe` on PATH). Used to detect which
   *  sources actually have audio so silent clips don't break the filtergraph. */
  ffprobePath?: string;
  /** Receives raw ffmpeg stderr chunks (progress lives here). */
  onProgress?: (chunk: string) => void;
  /**
   * Receives how far through the encode ffmpeg has got, 0..1.
   *
   * `onProgress` above has been plumbed since the beginning and nothing ever
   * parsed it, so the clients had only four discrete stages to show and sat on
   * "rendering" for the entire encode. This turns the same stderr into the one
   * number a progress bar can honestly display.
   */
  onFraction?: (fraction: number) => void;
  /** Hard cap on the encode, ms (default 10 min). A src pointing at a stalling
   *  HTTP stream would otherwise hang the process forever, holding its temp
   *  dir open — `isClientSrc` deliberately allows http(s) srcs. */
  timeoutMs?: number;
  /** Hard cap on each ffprobe, ms (default 30s). */
  probeTimeoutMs?: number;
  /**
   * Receives conditions that did not fail the render but DID change the output.
   *
   * There is exactly one today and it is the reason this exists: a caption
   * whose font could not be resolved is rendered by resvg in a substitute face,
   * so the file no longer matches the preview. That used to happen in complete
   * silence — an unreachable Google produced a different-looking video and
   * nothing anywhere admitted it. A warning is not an error (the render is
   * still worth having), but it must not be invisible.
   */
  onWarning?: (warning: RenderWarning) => void;
}

/** Something that changed the output without failing the render. */
export interface RenderWarning {
  code: 'font-missing';
  message: string;
  /** The families that could not be resolved. */
  families: string[];
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
 * Whether this ffmpeg was built with the filter HDR needs, cached per binary.
 *
 * `zscale` is a build-time option, so the answer is a property of the install
 * and cannot change while the process runs — but a probe that failed because
 * the machine was momentarily wedged CAN change, so only a completed probe is
 * remembered. Caching a transient failure would disable HDR for the lifetime of
 * the service.
 */
const hdrCapable = new Map<string, Promise<boolean>>();

export function ffmpegSupportsHdr(bin: string): Promise<boolean> {
  const cached = hdrCapable.get(bin);
  if (cached) return cached;
  const probe = new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (value: boolean, remember: boolean) => {
      if (settled) return;
      settled = true;
      if (!remember) hdrCapable.delete(bin);
      resolve(value);
    };
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(bin, ['-hide_banner', '-filters'], { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      done(false, true); // no such binary — not transient
      return;
    }
    let out = '';
    const cancel = killAfter(proc, 10_000, () => done(false, false));
    proc.stdout?.on('data', (d: Buffer) => {
      out += String(d);
    });
    proc.on('error', () => {
      cancel();
      done(false, true);
    });
    proc.on('close', () => {
      cancel();
      done(supportsHdr(out), true);
    });
  });
  hdrCapable.set(bin, probe);
  return probe;
}

/**
 * Which `xfade` transitions this ffmpeg accepts, cached per binary.
 *
 * Same shape and same discipline as `ffmpegSupportsHdr` — a completed probe is
 * a property of the install and is remembered; a probe that timed out because
 * the box was wedged is not, since caching that would disable every geometric
 * transition for the life of the service.
 *
 * It asks `-h filter=xfade` rather than `-filters`, because `xfade` being
 * PRESENT says nothing: it has shipped since 4.3 and has gained transitions
 * since. What varies, and what breaks a render, is the enum inside it.
 */
const xfadeTokens = new Map<string, Promise<string[]>>();

export function ffmpegXfadeTokens(bin: string): Promise<string[]> {
  const cached = xfadeTokens.get(bin);
  if (cached) return cached;
  const probe = new Promise<string[]>((resolve) => {
    let settled = false;
    const done = (value: string[], remember: boolean) => {
      if (settled) return;
      settled = true;
      if (!remember) xfadeTokens.delete(bin);
      resolve(value);
    };
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(bin, ['-hide_banner', '-h', 'filter=xfade'], {
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      done([], true); // no such binary — not transient
      return;
    }
    let out = '';
    const cancel = killAfter(proc, 10_000, () => done([], false));
    proc.stdout?.on('data', (d: Buffer) => {
      out += String(d);
    });
    proc.on('error', () => {
      cancel();
      done([], true);
    });
    proc.on('close', () => {
      cancel();
      /*
       * An empty parse is treated as UNKNOWN, not as "supports nothing" — a
       * build with no xfade at all, or a help format we cannot read, must not
       * make every export refuse itself. Both readers take the empty array to
       * mean "do not subtract anything", which keeps a parser failure to a
       * missing safety net rather than an outage.
       */
      done(parseXfadeTokens(out), true);
    });
  });
  xfadeTokens.set(bin, probe);
  return probe;
}

/**
 * Render a project to `opts.outputPath`: rasterize each text overlay to a PNG,
 * then spawn ffmpeg to composite + encode. Resolves with the output path.
 */
export async function renderProject(project: VideoProject, opts: RenderOptions): Promise<string> {
  /*
   * Refuse HDR this ffmpeg cannot actually produce, before doing any work.
   * Without the check the encode succeeds and hands back a file whose tags lie
   * about its contents — which is exactly the failure this replaced, just
   * arriving from a build difference instead of a missing filter.
   */
  if (opts.output?.hdr && !(await ffmpegSupportsHdr(opts.ffmpegPath ?? 'ffmpeg'))) {
    throw new Error(HDR_UNSUPPORTED_MESSAGE);
  }
  /*
   * And refuse a transition this ffmpeg has never heard of, for the same
   * reason and one step earlier.
   *
   * Left alone this does not degrade, it detonates: an unknown `transition=`
   * token fails to PARSE, so ffmpeg rejects the entire filtergraph and the
   * error names an option rather than the clip or the effect that caused it.
   * The client cannot act on that, and the user finds out minutes into an
   * export. `cover*`/`reveal*` — Push and Reveal — are the live case: they
   * arrived in ffmpeg 6.1 and the service image ships Debian's 5.1.
   *
   * Refused rather than substituted. A push is not a slide (a slide moves both
   * pictures), so quietly swapping one would hand back a file that does not
   * match the timeline the user was watching — the same class of lie as an HDR
   * tag on SDR pixels.
   */
  {
    const mainTrack = project.tracks?.find((t) => t.kind === 'visual');
    if (mainTrack?.clips?.length) {
      const missing = unsupportedTransitions(
        resolveTransitions(mainTrack.clips as VisualTrackClip[]).boundaries,
        await ffmpegXfadeTokens(opts.ffmpegPath ?? 'ffmpeg'),
      );
      if (missing.length) throw new Error(transitionUnsupportedMessage(missing));
    }
  }
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
    /*
     * The canvas frame, rasterized once for the whole render — it is static, so
     * there is nothing to redraw per frame.
     *
     * Gated on `hasCanvasFrame` rather than on `project.frame` being present: a
     * frame of zero width and zero radius paints nothing, and rasterizing a
     * fully transparent PNG for it would cost an input, a decode and a
     * composite pass on every frame of the export. Skipped entirely for an
     * audio-only export, where there is no picture to put it on.
     */
    let frameImage: string | undefined;
    if (!opts.output?.audioOnly && hasCanvasFrame(project.frame)) {
      frameImage = join(dir, 'frame.png');
      await writeFile(
        frameImage,
        rasterizeSVG(
          canvasFrameToSVG(project.frame, project.width, project.height, project.background)!,
        ),
      );
    }
    /*
     * Resolve the fonts the captions use so resvg embeds them — disk first,
     * network last, never silently.
     *
     * A family we cannot find is not fatal: resvg substitutes and the render
     * still completes. But the substituted file no longer matches the preview,
     * which is the one divergence this engine is built to prevent, so it is
     * reported rather than swallowed.
     */
    const families = project.overlays.flatMap((o) => (o.type === 'text' && o.fontFamily ? [o.fontFamily] : []));
    const fonts_ = await resolveFonts(families);
    const fontFiles = fonts_.files;
    if (fonts_.missing.length) {
      opts.onWarning?.({
        code: 'font-missing',
        families: fonts_.missing,
        message:
          `could not resolve ${fonts_.missing.length} font ${fonts_.missing.length === 1 ? 'family' : 'families'} ` +
          `(${fonts_.missing.join(', ')}) — the export will use a substitute face and will not match the preview`,
      });
    }

    /*
     * The font bytes, keyed by family, so a caption is MEASURED from real
     * advance widths instead of the flat `0.58em` guess.
     *
     * The same map the web preview builds from `/v1/fonts/:family`, and it has
     * to be: the caption's background box is computed here and baked into the
     * SVG string BOTH renderers consume, so measuring from real metrics on one
     * side and from the approximation on the other would size that box
     * differently in the preview and the file.
     *
     * A family we could not read is simply absent, which falls back to the
     * approximation — the same behaviour as before any of this existed, and it
     * is already reported through `onWarning` above.
     */
    const fonts = new Map<string, Uint8Array>();
    await Promise.all(
      [...fonts_.byFamily].map(async ([family, path]) => {
        try {
          fonts.set(family, new Uint8Array(await readFile(path)));
        } catch {
          /* reported as missing already; the approximation still draws it */
        }
      }),
    );

    const overlayImages: Record<string, string> = {};
    for (const overlay of project.overlays) {
      if (overlay.type !== 'text') continue;
      const png = rasterizeSVG(
        overlayToSVG(overlay, project.width, project.height, overlayFontOptions(overlay, fonts)),
        fontFiles,
      );
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

    const args = buildFFmpegArgs(project, { ...opts, overlayImages, baseImage, frameImage, hasAudio });

    /*
     * Turn ffmpeg's own reporting into a fraction. The total comes from the
     * `-t` argument the builder just wrote rather than from `projectDuration`,
     * so an audio-only export or any future output override is measured against
     * what is actually being encoded.
     */
    const tIndex = args.indexOf('-t');
    const total = tIndex >= 0 ? Number(args[tIndex + 1]) : NaN;
    let lastSent = -1;
    const onChunk = opts.onFraction && Number.isFinite(total) && total > 0
      ? (chunk: string) => {
          opts.onProgress?.(chunk);
          // Null covers every "nothing yet" case, including the negative time
          // ffmpeg reports before the first frame — the pattern needs a digit
          // where the sign is, so it never matches.
          const encoded = parseEncodedSeconds(chunk);
          if (encoded === null) return;
          const fraction = Math.max(0, Math.min(1, encoded / total));
          // Only on a visible change. ffmpeg reports several times a second and
          // each call may cross a process or a database.
          if (fraction - lastSent < 0.01 && fraction < 1) return;
          lastSent = fraction;
          opts.onFraction!(fraction);
        }
      : opts.onProgress;

    await runFFmpeg(opts.ffmpegPath ?? 'ffmpeg', args, onChunk, opts.timeoutMs);
    return opts.outputPath;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * How many seconds of output ffmpeg has written, from its own status line.
 *
 * ffmpeg reports on stderr as `frame= 123 fps=30 ... time=00:00:04.12 ...`,
 * rewriting the line with a carriage return rather than a newline, so a single
 * chunk can hold several updates. Take the LAST, which is the most recent.
 *
 * `time=` can legitimately read `-00:00:00.01` or `N/A` early on; both mean
 * "nothing yet" rather than a value worth showing.
 */
const TIME_RE = /time=\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/g;

export function parseEncodedSeconds(chunk: string): number | null {
  let seconds: number | null = null;
  for (const m of chunk.matchAll(TIME_RE)) {
    seconds = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }
  return seconds;
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

/**
 * ffmpeg's leading banner: the version line, the compiler, the enormous
 * `configuration:` line and the `lib*` version table.
 *
 * Matched only against the START of stderr, so a `configuration:` appearing in
 * real output later is left alone.
 */
const FFMPEG_BANNER = /^(ffmpeg version |\s+built with |\s+configuration:|\s+lib[a-z]+\s+\d+\.)/;

/**
 * The part of ffmpeg's stderr a human needs, which is never the top of it.
 *
 * `stderr.slice(-2000)` alone is not enough. The banner is ~1500 characters, so
 * on a failure that prints little else the tail still BEGINS with the version
 * and the configure flags, and any UI that shows the message from the top — an
 * iOS Alert, say — shows nothing but build trivia while the actual error sits
 * below the fold with no way to scroll to it. That is exactly how a real export
 * failure reached a user as three screens of `--enable-libspeex`.
 *
 * Strips the leading banner block, then tails what remains. Falls back to the
 * raw text when that leaves nothing, because a message that says only
 * "exited with code 1" is worse than build trivia.
 */
export function ffmpegErrorTail(stderr: string, max = 2000): string {
  const lines = stderr.split('\n');
  let i = 0;
  while (i < lines.length && FFMPEG_BANNER.test(lines[i])) i++;
  const body = lines.slice(i).join('\n').trim() || stderr.trim();
  return body.length > max ? body.slice(-max) : body;
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
      else reject(new Error(`ffmpeg exited with code ${code}\n${ffmpegErrorTail(stderr)}`));
    });
  });
}
