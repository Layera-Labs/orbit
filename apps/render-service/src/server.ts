/**
 * HTTP render service: wraps the headless `@orbit/video` engine so any client
 * (the iOS app, web, a webhook) can render a video server-side with ffmpeg.
 *
 * Endpoints:
 *   GET  /health
 *   POST /v1/upload         (multipart, field "file") → { id }   store media, return an opaque token
 *   POST /v1/render         { project }               → { url }   render a VideoProject
 *   POST /v1/generate-image { prompt }                 → { url, balance }    generate an image (10 credits; needs RUNWAY_API_TOKEN)
 *   POST /v1/generate-video { prompt }                 → { url, balance }    generate a video (60/100 credits; needs RUNWAY_API_TOKEN)
 *   POST /v1/tts            { text, voice? }            → { url, balance }    text→speech voiceover (5 credits; needs ELEVENLABS_API_KEY)
 *   GET  /v1/credits                                   → { balance }         current account credit balance
 *   POST /v1/auth/guest                                → { token, user }     a token for a device that has not signed in
 *   POST /v1/billing/webhook { event }                 → { ok }              RevenueCat purchase → grant credits (shared-secret auth)
 *
 * Clients can't reach phone-local files, so they upload media first and reference
 * it in `clip.src` / `audio.src` as the returned `upload:<id>` token. `resolveSrc`
 * maps those tokens back to files INSIDE the media dir — a client can never put an
 * arbitrary filesystem path into ffmpeg. Rendered files are served from /files.
 *
 * EVERY route above requires a bearer token — upload and render included. Being
 * signed out is not the absence of one: a client asks `/v1/auth/guest` for a
 * token this server signed and uses it exactly like a session, so "no login
 * required" survives without anything being anonymous. What it replaces is an
 * `X-Orbit-Account` header the caller chose, which anyone could set to anyone
 * else's account.
 *
 * Generation is credit-metered via `@orbit/billing`: each account is granted
 * `ORBIT_FREE_CREDITS` on first touch, and a `generate_image` debits 10 credits
 * — only on a successful generation. This ships
 * an IN-MEMORY ledger for local/dev use. A production deployment swaps
 * `InMemoryLedgerStore` for a DB-backed `LedgerStore`, adds license/account auth,
 * replaces the dev `/v1/credits/grant` with its own payment webhook, and prices
 * credits (e.g. 100 = $5) in its own billing — Orbit only meters consumption.
 */
import cors from "cors";
import express, { type Express, type Request, type Response } from "express";
import multer from "multer";
import { spawn } from "node:child_process";
import { mkdir, mkdirSync, readFileSync } from "node:fs";
import {
  mkdir as mkdirAsync,
  readFile,
  readdir,
  rm as rmAsync,
  stat as statAsync,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ffmpegSupportsHdr,
  ffmpegXfadeTokens,
  isSafeFontFamily,
  killLiveRenders,
  renderProject,
  resolveFonts,
  type ExportOutput,
  type VideoProject,
} from "@orbit/video";
import {
  ElevenLabsProvider,
  GenerationService,
  ProviderError,
  RunwayProvider,
  groupWords,
} from "@orbit/video-gen";
import {
  InMemoryLedgerStore,
  InsufficientCreditsError,
  Ledger,
  makeAccountId,
  type AccountId,
  type LedgerStore,
} from "@orbit/billing";
import { authFromEnv, AuthError, type UserStore } from "@orbit/auth";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { collectClientSrcs, isClientSrc, makeResolveSrc } from "./resolve.js";
import { RemoteSrcError, fetchRemoteTo } from "./remote.js";
import { PgLedgerStore, PgUserStore, makePgPool } from "./pg-store.js";
import { InMemoryUserStore } from "./user-store.js";
import { RESET_PAGE_HEADERS, RESET_PAGE_HTML } from "./reset-page.js";
import { emailSenderFromEnv, resetEmailMessage } from "./email.js";
import { JobRegistry, JOB_TTL_MS } from "./jobs.js";
import { PgJobQueue } from "./job-queue.js";
import { PgProjectStore, type SyncedProject } from "./project-store.js";
import { storageFromEnv } from "./storage.js";

/**
 * A number from the environment, falling back on anything that isn't one.
 *
 * `Number(process.env.X ?? fallback)` is WRONG and was used everywhere here.
 * `??` only fires on null/undefined, and an environment variable is very often
 * the empty string instead — every `docker compose` file written as
 * `X: ${X:-}` sets it that way, which is the idiomatic way to make a variable
 * optional. `Number("")` is 0, not NaN, so the fallback is skipped and the
 * setting silently becomes zero.
 *
 * That is not a theoretical sharp edge. It shipped: `ORBIT_MAX_MEDIA_BYTES`
 * came through as "" on the first real deployment, the media budget became 0
 * bytes, and `evictMedia()` — which runs immediately after every upload —
 * deleted each file the instant it landed. Uploads answered 200, the render
 * then died with "No such file or directory", and nothing anywhere said the
 * budget was zero. The same trap sat under the rate limits (0 = refuse every
 * request), the render concurrency (0 = never run one) and the worker poll
 * interval (0 = spin).
 *
 * So: empty, NaN and anything below `min` all mean "not configured". `min`
 * defaults to 1 because a limit, a budget or an interval has no meaningful
 * zero — but the credit settings pass 0, where "free" and "no bonus" are real
 * answers a deployment can choose.
 */
export function envNumber(name: string, fallback: number, min = 1): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min) {
    console.warn(
      `[orbit] ${name}="${raw}" is not a usable number — using ${fallback}`,
    );
    return fallback;
  }
  return n;
}

/** Per-file upload cap, and the total media-store budget before eviction. */
const MAX_UPLOAD_BYTES = envNumber(
  "ORBIT_MAX_UPLOAD_BYTES",
  500 * 1024 * 1024,
);
const MAX_MEDIA_BYTES = envNumber(
  "ORBIT_MAX_MEDIA_BYTES",
  5 * 1024 * 1024 * 1024,
);
/**
 * The same budget for finished renders.
 *
 * Uploads have been evicted since the audit; outputs never were, so on local
 * disk the directory grew without limit until the volume filled — a slow, total
 * outage with no signal until it lands. With S3 configured the local copy is
 * only a staging file and this bound matters even more.
 */
const MAX_OUTPUT_BYTES = envNumber("ORBIT_MAX_OUTPUT_BYTES", 5 * 1024 * 1024 * 1024);
/**
 * What a failure is allowed to tell the caller.
 *
 * ffmpeg's stderr was being returned whole, and it opens with the full build
 * banner: the exact prefix it was compiled into, every `--enable-*` flag, and
 * the absolute paths of the machine that built it. That is free reconnaissance
 * handed to anyone who can make a render fail, which is anyone.
 *
 * The FIRST line that looks like a real diagnosis is kept, because a developer
 * using the SDK still needs to know their file was unreadable rather than
 * reading "render failed". Everything else stays in the server log.
 */
export function clientMessage(err: unknown, limit = 200): string {
  const raw = err instanceof Error ? err.message : String(err);
  const line = raw
    .split("\n")
    .map((l) => l.trim())
    .find(
      (l) =>
        l &&
        !/^ffmpeg version|^built with|^configuration:|^lib[a-z]+ +\d|^\s*$/i.test(l) &&
        !l.startsWith("--"),
    );
  return (line ?? "render failed").slice(0, limit);
}

/**
 * Requests per IP per window for the two expensive endpoints.
 *
 * Still per IP and not per account, even though both are authenticated now: a
 * guest token is cheap to mint, so a per-account limit would be one token away
 * from no limit at all.
 */
const RATE_WINDOW_MS = envNumber("ORBIT_RATE_WINDOW_MS", 60_000);
const UPLOAD_RATE_LIMIT = envNumber("ORBIT_UPLOAD_RATE_LIMIT", 60);
const RENDER_RATE_LIMIT = envNumber("ORBIT_RENDER_RATE_LIMIT", 10);
/**
 * The auth routes, which had no limit at all.
 *
 * `login` and `reset` were an unmetered password oracle: scrypt makes each
 * guess slow, but nothing stopped a machine making them forever. Worse,
 * `register` grants ORBIT_FREE_CREDITS to every new account, so an unlimited
 * signup rate is an unlimited supply of free generation — billed to whoever
 * owns the provider key. `forgot` sends mail, so an unlimited rate is a mail
 * cannon pointed at an address the attacker chooses.
 *
 * Creation is held tighter than verification because its cost is real money
 * and real email, not CPU.
 */
const AUTH_RATE_LIMIT = envNumber("ORBIT_AUTH_RATE_LIMIT", 20);
const AUTH_CREATE_RATE_LIMIT = envNumber("ORBIT_AUTH_CREATE_RATE_LIMIT", 5);
/**
 * Guest tokens get their own, looser budget.
 *
 * They cost no email and touch no password, but they DO carry the free tier,
 * so this cannot be unbounded. Five was too tight for the honest case: a
 * shared IP — an office, a campus, a carrier NAT — is many first-time visitors
 * in one minute, and refusing them is refusing to let the app start at all.
 */
const GUEST_RATE_LIMIT = envNumber("ORBIT_GUEST_RATE_LIMIT", 30);
/** Font fetches are cheap and heavily cached, but each miss can hit the network. */
const FONT_RATE_LIMIT = envNumber("ORBIT_FONT_RATE_LIMIT", 60);
/**
 * The purchase webhook.
 *
 * Generous, because a real retry storm from RevenueCat is legitimate traffic
 * and dropping it loses a customer their credits — but bounded, because the
 * route reaches the database and is the one endpoint authenticated by a shared
 * secret rather than a per-user token.
 */
const WEBHOOK_RATE_LIMIT = envNumber("ORBIT_WEBHOOK_RATE_LIMIT", 120);

/**
 * Build identity, reported by `/health`.
 *
 * The version is baked at build time from the package manifest; the commit is
 * whatever the image was built from and is absent when nobody set it, rather
 * than reporting a confident "unknown" that looks like a real value.
 */
const BUILD_VERSION = (() => {
  if (process.env.ORBIT_VERSION?.trim()) return process.env.ORBIT_VERSION.trim();
  try {
    // From `dist/`, the manifest is one level up. Read rather than hard-code:
    // a literal here drifts from the package the moment one of them is bumped,
    // and a version that lies is worse than no version.
    const here = dirname(fileURLToPath(import.meta.url));
    return JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")).version as string;
  } catch {
    return "unknown";
  }
})();
const BUILD_SHA = process.env.ORBIT_BUILD_SHA?.trim() || undefined;

/**
 * What has to happen before this process may exit.
 *
 * Registered by whatever set it up, run by `main.ts` on a signal. It exists
 * because a background worker owns state in a SHARED database: exiting without
 * unwinding it leaves a job marked as running on a machine that is gone.
 */
export type ShutdownTask = () => Promise<void>;

export function createServer(): Express {
  const app = express();
  const shutdownTasks: ShutdownTask[] = [];
  /*
   * CORS is open by default, and that is a decision rather than a default left
   * standing.
   *
   * Orbit is an embeddable SDK: the whole point is that a customer's own origin
   * calls this service, and there is no list of those origins to allow. Open
   * CORS is safe HERE specifically because authentication is a bearer token the
   * client attaches itself, held in localStorage or the keychain — both
   * origin-scoped, neither readable by another site. A hostile page can call
   * these routes all it likes; it has no token, so it is just another
   * anonymous caller getting a 401. This would NOT be safe with cookie auth,
   * where the browser attaches the credential for you — which is one more
   * reason the account cookie is gone.
   *
   * A deployment that knows its origins can still say so with
   * `ORBIT_ALLOWED_ORIGINS` (comma-separated).
   */
  const ALLOWED_ORIGINS = (process.env.ORBIT_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.use(cors(ALLOWED_ORIGINS.length ? { origin: ALLOWED_ORIGINS } : undefined));
  app.use(express.json({ limit: "8mb" }));

  const outDir = join(tmpdir(), "orbit-render-outputs");
  const mediaDir = join(tmpdir(), "orbit-render-media");
  mkdirSync(outDir, { recursive: true });
  mkdirSync(mediaDir, { recursive: true });
  const resolveSrc = makeResolveSrc(mediaDir);
  let counter = 0;
  let mediaCounter = 0;

  // Local unless the S3 variables are set; throws on a half-set configuration
  // rather than silently keeping everything on a disk that is about to vanish.
  const storage = storageFromEnv();
  const jobs = new JobRegistry();
  if (storage.kind === "local")
    console.warn(
      "[orbit] output storage is LOCAL DISK — renders do not survive a restart and a second replica cannot see them. Set ORBIT_S3_BUCKET for durable storage.",
    );

  /*
   * One structured line per request.
   *
   * The service logged only failures, so there was no way to answer "is it
   * slow, and where" without adding a print and redeploying. JSON because the
   * first thing any log pipeline does is parse it, and a human can still read
   * it. No bodies and no query strings — they carry upload tokens.
   */
  app.use((req: Request, res: Response, next: () => void) => {
    const started = Date.now();
    res.on("finish", () => {
      const ms = Date.now() - started;
      // Health checks would otherwise be most of the log.
      if (req.path === "/health") return;
      console.log(
        JSON.stringify({
          t: new Date().toISOString(),
          method: req.method,
          path: req.path,
          status: res.statusCode,
          ms,
        }),
      );
    });
    next();
  });

  /**
   * Turn a client-supplied source image into something the generation provider
   * can consume for image→video. `data:`/`http(s)` pass through; an
   * `upload:<id>` token (from /v1/upload) is read from the media dir and inlined
   * as a data URI (the provider can't fetch our private upload store, and in dev
   * it can't reach localhost). Throws on anything else.
   */
  async function resolveProviderImage(
    image?: string,
  ): Promise<string | undefined> {
    if (!image) return undefined;
    if (/^data:/.test(image) || /^https?:\/\//.test(image)) return image;
    const path = resolveSrc(image); // throws if the token escapes the media dir
    const buf = await readFile(path);
    const ext = extname(path).toLowerCase();
    const mime =
      ext === ".png"
        ? "image/png"
        : ext === ".webp"
          ? "image/webp"
          : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  }

  /** Write a base64 audio data URI to the served output dir, returning its
   *  /files URL; pass through anything already fetchable. */
  async function materializeAudio(url: string): Promise<string> {
    const m = /^data:audio\/[\w.+-]+;base64,(.*)$/s.exec(url);
    if (!m) return url;
    await mkdirAsync(outDir, { recursive: true });
    const name = `tts_${++counter}_${Date.now()}.mp3`;
    await writeFile(join(outDir, name), Buffer.from(m[1], "base64"));
    return `/files/${name}`;
  }

  // Serve rendered MP4s so clients can play them by URL.
  /*
   * Served output, with the headers that keep it output.
   *
   * These are files a client's own content produced, handed back from this
   * origin. `nosniff` is the one that matters: without it a browser is free to
   * re-interpret a response as HTML on a content-type it disagrees with, and
   * anything that renders as HTML here runs on the service's origin. The CSP
   * and the download disposition make that a dead end even if it did — a
   * sandboxed, script-free document that the browser saves rather than renders.
   */
  app.use(
    "/files",
    express.static(outDir, {
      setHeaders: (res) => {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
        res.setHeader("X-Frame-Options", "DENY");
        res.setHeader("Content-Disposition", "attachment");
      },
    }),
  );

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) =>
        mkdir(mediaDir, { recursive: true }, (e) => cb(e, mediaDir)),
      filename: (_req, file, cb) =>
        cb(
          null,
          `u_${++mediaCounter}_${Date.now()}${extname(file.originalname) || ".bin"}`,
        ),
    }),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  });

  /**
   * Fixed-window rate limit, keyed by client IP.
   *
   * `/v1/upload` and `/v1/render` are deliberately unauthenticated — the app is
   * guest-first, so requiring a token here would break the primary flow. That
   * leaves no per-account meter by default, so an anonymous caller could still
   * fill the disk. Two things now sit behind this: `withRenderSlot` caps encodes
   * in flight (the "pin every core" half of the problem), and `ORBIT_RENDER_COST`
   * can price an export against the ledger for deployments that want a quota.
   * Requiring identity to render remains a product decision, not this file's.
   */
  /**
   * Compare a shared secret without leaking its length or contents by timing.
   *
   * `!==` on strings returns at the first differing byte, which is a usable
   * oracle against an endpoint an attacker can call repeatedly. Lengths are
   * compared first and separately because `timingSafeEqual` THROWS on a length
   * mismatch rather than returning false — so the length check is not the leak,
   * it is the precondition, and a wrong-length guess is rejected before any
   * byte comparison happens at all.
   */
  const secretsMatch = (given: string | undefined, expected: string): boolean => {
    if (!given) return false;
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  };

  const hits = new Map<string, { n: number; resetAt: number }>();
  const rateLimit =
    (limit: number, windowMs: number) =>
    (req: Request, res: Response, next: () => void) => {
      const now = Date.now();
      const key = `${req.path}:${req.ip ?? "unknown"}`;
      const cur = hits.get(key);
      if (!cur || now >= cur.resetAt) {
        hits.set(key, { n: 1, resetAt: now + windowMs });
        if (hits.size > 10_000)
          for (const [k, v] of hits) if (now >= v.resetAt) hits.delete(k);
        return next();
      }
      if (cur.n >= limit) {
        res
          .status(429)
          .json({
            error: "too many requests",
            retryAfterMs: cur.resetAt - now,
          });
        return;
      }
      cur.n += 1;
      next();
    };

  /** Delete the oldest files in `dir` once it exceeds `budget`. */
  async function evictDir(dir: string, budget: number): Promise<void> {
    try {
      const names = await readdir(dir);
      const entries = await Promise.all(
        names.map(async (name) => {
          const path = join(dir, name);
          try {
            const s = await statAsync(path);
            return { path, size: s.size, at: s.mtimeMs };
          } catch {
            return null;
          }
        }),
      );
      const files = entries.filter((e): e is NonNullable<typeof e> => !!e);
      let total = files.reduce((sum, f) => sum + f.size, 0);
      if (total <= budget) return;
      for (const f of files.sort((a, b) => a.at - b.at)) {
        if (total <= budget) break;
        await rmAsync(f.path, { force: true });
        total -= f.size;
      }
    } catch {
      // Eviction is best-effort; never fail an upload or a render because of it.
    }
  }

  const evictMedia = () => evictDir(mediaDir, MAX_MEDIA_BYTES);
  const evictOutputs = () => evictDir(outDir, MAX_OUTPUT_BYTES);

  /**
   * HEIF-family stills (iPhone's default photo format) are read by ffmpeg's
   * mov/heif demuxer, which has no `loop` option — so the renderer's
   * `-loop 1 -t <dur> -i <img>` for still images dies with "Option not found".
   * Transcode those to PNG once at upload so every still goes down the image2
   * path. ffmpeg decodes HEIF fine; only the demuxer option is the problem.
   */
  async function normalizeStill(filename: string): Promise<string> {
    if (!/\.(heic|heif|avif)$/i.test(filename)) return filename;
    const src = join(mediaDir, filename);
    const outName = `${filename.replace(/\.[^.]+$/, "")}.png`;
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        process.env.FFMPEG_PATH ?? "ffmpeg",
        [
          "-y",
          "-i",
          src,
          "-frames:v",
          "1",
          "-update",
          "1",
          join(mediaDir, outName),
        ],
        {
          stdio: ["ignore", "ignore", "pipe"],
        },
      );
      let stderr = "";
      proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
      proc.on("error", reject);
      proc.on("close", (code) =>
        code === 0
          ? resolve()
          : reject(
              new Error(
                `ffmpeg (still normalize) exited ${code}\n${stderr.slice(-800)}`,
              ),
            ),
      );
    });
    return outName;
  }

  /**
   * Make every src in a project safe and local before ffmpeg sees it.
   *
   * Two rewrites, one walk, because the walk is the part that has to be
   * exhaustive and two of them would drift:
   *
   *  - HEIF-family stills become their PNG twin (see `normalizeStill`).
   *    Clients cache upload tokens across exports, so doing this only at upload
   *    time would miss already-uploaded media.
   *  - http(s) srcs are DOWNLOADED here and replaced with an upload token, so
   *    ffmpeg is never handed a URL. That is what closes the SSRF: `-i
   *    http://169.254.169.254/…` was an unauthenticated read of the render
   *    box's private network, returned to the caller as video.
   */
  async function localizeProject(project: VideoProject): Promise<VideoProject> {
    const cache = new Map<string, string>();
    const fix = async (
      src: string | undefined,
    ): Promise<string | undefined> => {
      if (!src) return src;
      if (cache.has(src)) return cache.get(src);

      if (/^https?:\/\//i.test(src)) {
        // Named like an upload because that is what it becomes: it lands in the
        // media dir, under the media counter, and is evicted on the same budget.
        const name = `r_${++mediaCounter}_${Date.now()}${extname(new URL(src).pathname) || ".bin"}`;
        await fetchRemoteTo(src, join(mediaDir, name), {
          maxBytes: MAX_UPLOAD_BYTES,
          maxRedirects: 3,
        });
        cache.set(src, `upload:${name}`);
        return cache.get(src);
      }

      if (!src.startsWith("upload:") || !/\.(heic|heif|avif)$/i.test(src))
        return src;
      cache.set(
        src,
        `upload:${await normalizeStill(src.slice("upload:".length))}`,
      );
      return cache.get(src);
    };
    const out = { ...project } as VideoProject;

    /*
     * Rewrite IN PLACE, preserving which of `clips` / `tracks` was present.
     *
     * This used to end with `{ ...project, clips, tracks }`, which always
     * defined both — and `buildFFmpegArgs` branches on `project.tracks !==
     * undefined`, not on its length. A legacy client that sent only `clips`
     * therefore got an empty `tracks: []` attached here and was routed into the
     * multi-track compositor with no visual tracks at all: a background-coloured
     * video, rendered successfully, with every clip silently dropped. The concat
     * path was unreachable server-side.
     */
    if (project.clips)
      out.clips = await Promise.all(
        project.clips.map(async (c) => ({ ...c, src: (await fix(c.src)) ?? c.src })),
      );
    if (project.tracks)
      out.tracks = await Promise.all(
        // Mapped per `kind` so the Track union survives — a single spread over
        // the union widens `clips` and loses the visual/audio discrimination.
        project.tracks.map(async (t) =>
          t.kind === "visual"
            ? {
                ...t,
                clips: await Promise.all(
                  t.clips.map(async (c) => ({ ...c, src: (await fix(c.src)) ?? c.src })),
                ),
              }
            : {
                ...t,
                clips: await Promise.all(
                  t.clips.map(async (c) => ({ ...c, src: (await fix(c.src)) ?? c.src })),
                ),
              },
        ),
      );

    /*
     * `audio` too, which this walk used to skip.
     *
     * Harmless while the only rewrite was HEIF (a sound file is not a still),
     * and a hole the moment remote fetching joined it: an http(s) src on an
     * audio clip would have gone to ffmpeg untouched and reopened the whole
     * SSRF through a different field. `collectClientSrcs` is the checklist of
     * every src-bearing field, and this walk must cover all of it.
     */
    if (project.audio)
      out.audio = await Promise.all(
        project.audio.map(async (a) => ({ ...a, src: (await fix(a.src)) ?? a.src })),
      );

    // The background can be a still too, and it is not in either list.
    if (project.background?.type === "image")
      out.background = {
        ...project.background,
        src: (await fix(project.background.src)) ?? project.background.src,
      };

    return out;
  }

  /*
   * Render admission control.
   *
   * Every render spawns ffmpeg, which will happily use every core it is given.
   * With nothing in front of it, N concurrent callers meant N encodes competing
   * for the same CPU: each one slower than if it had waited, and the box
   * unresponsive for everyone including the requests that only wanted to
   * upload. A rate limit does not help here — it counts requests per window,
   * not work in flight.
   *
   * So: a hard cap on encodes at once, and a BOUNDED line for the rest. The
   * bound matters more than the cap. An unbounded queue turns overload into a
   * pile of connections all held open past any sane client timeout, which is a
   * worse failure than being told plainly to come back later.
   */
  const MAX_CONCURRENT_RENDERS = Math.max(
    1,
    envNumber("ORBIT_MAX_CONCURRENT_RENDERS", 2),
  );
  const MAX_QUEUED_RENDERS = Math.max(
    0,
    envNumber("ORBIT_MAX_QUEUED_RENDERS", 8),
  );

  class QueueFullError extends Error {
    constructor() {
      super("render queue is full");
      this.name = "QueueFullError";
    }
  }

  let running = 0;
  const waiting: (() => void)[] = [];

  async function withRenderSlot<T>(fn: () => Promise<T>): Promise<T> {
    if (running >= MAX_CONCURRENT_RENDERS) {
      if (waiting.length >= MAX_QUEUED_RENDERS) throw new QueueFullError();
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    running += 1;
    try {
      return await fn();
    } finally {
      running -= 1;
      // Hand the slot to the next in line rather than letting every waiter wake
      // and race for it.
      waiting.shift()?.();
    }
  }

  /**
   * Pull any evicted upload back from durable storage before ffmpeg needs it.
   *
   * Done HERE, ahead of the render, rather than inside `resolveSrc` — that is
   * the security boundary and it is synchronous, and making it async would push
   * a promise through `@orbit/video`'s whole argument builder. This keeps the
   * boundary exactly as it was: the file is restored to the media dir under its
   * own name, and `resolveSrc` still refuses anything that escapes it.
   *
   * A miss is not an error. The object may genuinely be gone (local storage has
   * no second copy at all), and ffmpeg's own failure is a better message than a
   * guess made here.
   */
  async function ensureLocal(project: VideoProject): Promise<void> {
    if (storage.kind === "local") return;
    const names = new Set<string>();
    for (const src of collectClientSrcs(project)) {
      const m = typeof src === "string" && /^upload:([A-Za-z0-9._-]+)$/.exec(src);
      if (m) names.add(m[1]);
    }
    await Promise.all(
      [...names].map(async (name) => {
        const path = resolveSrc(`upload:${name}`);
        if (await statAsync(path).then(() => true, () => false)) return;
        await storage.fetchTo(name, path).catch((err) => {
          console.error(`[orbit] could not restore ${name}:`, err);
          return false;
        });
      }),
    );
  }

  /** Every `upload:` token in a project, deduped. */
  function uploadNames(project: VideoProject): Set<string> {
    const names = new Set<string>();
    for (const src of collectClientSrcs(project)) {
      const m = typeof src === "string" && /^upload:([A-Za-z0-9._-]+)$/.exec(src);
      if (m) names.add(m[1]);
    }
    return names;
  }

  /**
   * Which of a project's upload tokens this server cannot honour.
   *
   * The media dir is a CACHE with a byte budget, so a token is not a promise —
   * eviction, a redeploy onto a fresh volume, or simply pointing the app at a
   * different server all make one dangle. Clients cache tokens to avoid
   * re-uploading unchanged media, which is right, but it means a client can be
   * confidently wrong about what the server holds.
   *
   * Left to ffmpeg, that surfaces as "No such file or directory" from a
   * half-built filtergraph: an encode has already been queued, a render slot
   * taken, and the client is handed a message it cannot act on — so it retries
   * with the same dead tokens, forever. Answering BEFORE the encode, and
   * naming exactly which tokens are gone, is what lets the client re-upload
   * precisely those and get on with it.
   *
   * Runs `ensureLocal` first: with a bucket behind the cache the file is
   * usually restorable, and "missing" should mean genuinely unrecoverable.
   */
  async function missingUploads(project: VideoProject): Promise<string[]> {
    await ensureLocal(project);
    const missing: string[] = [];
    await Promise.all(
      [...uploadNames(project)].map(async (name) => {
        const there = await statAsync(resolveSrc(`upload:${name}`)).then(
          () => true,
          () => false,
        );
        if (!there) missing.push(`upload:${name}`);
      }),
    );
    return missing.sort();
  }

  async function render(
    project: VideoProject,
    output?: ExportOutput,
    /** Called once a render slot is actually held — see `JobRegistry.start`. */
    onStart?: () => void,
    /** How far through the encode ffmpeg has got, 0..1. */
    onFraction?: (fraction: number) => void,
  ): Promise<string> {
    await mkdirAsync(outDir, { recursive: true });
    await ensureLocal(project);
    const name = `v_${++counter}_${Date.now()}.mp4`;
    const path = join(outDir, name);
    const safe = await localizeProject(project);
    await withRenderSlot(() => {
      onStart?.();
      return renderProject(safe, {
        outputPath: path,
        resolveSrc,
        output,
        onFraction,
        /*
         * A render that succeeded but did not produce the file the user was
         * shown. Today that means a caption font we could not resolve, so
         * resvg substituted a face and the export no longer matches the
         * preview. It is not an error — the video is still worth having — but
         * it used to be completely invisible, which made "why does my text
         * look different in the export" unanswerable from the logs.
         */
        onWarning: (w) =>
          console.warn(
            JSON.stringify({
              t: new Date().toISOString(),
              event: "render-warning",
              code: w.code,
              families: w.families,
              message: w.message,
            }),
          ),
      });
    });
    /*
     * ffmpeg can only write a local file, so a render always lands on disk
     * first; `storage.put` decides whether that IS the artifact (local) or a
     * staging copy on its way to a bucket (s3). Either way the local file is
     * then subject to the output budget, which is why eviction runs here and
     * not only on upload.
     */
    const url = await storage.put(path, "video/mp4");
    void evictOutputs();
    return url;
  }

  // ---- generation + credit metering ----
  // Durable storage is Postgres (Neon / Supabase / any Postgres URL) via
  // DATABASE_URL — credits + self-hosted users live in the database, never on a
  // local disk. Without DATABASE_URL storage is in-memory and EPHEMERAL, for
  // automated tests and throwaway local runs only.
  let ledgerStore: LedgerStore;
  let userStore: UserStore;
  /** Shared across replicas when configured; `null` keeps everything local. */
  let queue: PgJobQueue | null = null;
  /** Project sync. Null without a database — there is nowhere to sync TO. */
  let projects: PgProjectStore | null = null;
  if (process.env.DATABASE_URL) {
    const pool = makePgPool(process.env.DATABASE_URL);
    ledgerStore = new PgLedgerStore(pool);
    userStore = new PgUserStore(pool);
    projects = new PgProjectStore(pool);
    /*
     * The SHARED queue, and only when the other half is true as well.
     *
     * A worker on another machine has to be able to read the uploads and write
     * the output. On local disk it cannot: the token names a file that exists
     * only on the box that received the upload. Enabling the queue there would
     * fail one render in N for a reason nobody could diagnose, so it stays off
     * unless durable storage is configured too — and says which half is
     * missing.
     */
    if (storage.kind === "local")
      console.warn(
        "[orbit] DATABASE_URL is set but storage is local disk — renders stay in-process. A shared queue needs shared storage (ORBIT_S3_BUCKET) or a worker would be handed media it cannot read.",
      );
    else queue = new PgJobQueue(pool);
  } else {
    console.warn(
      "[orbit] no DATABASE_URL — using in-memory storage (ephemeral; credits and accounts reset on restart)",
    );
    ledgerStore = new InMemoryLedgerStore();
    userStore = new InMemoryUserStore();
  }
  const ledger = new Ledger(ledgerStore);
  const gen = new GenerationService(
    new RunwayProvider({ token: process.env.RUNWAY_API_TOKEN }),
    ledger,
  );
  // TTS runs through a separate provider (ElevenLabs) but the same metered ledger.
  // The provider instance is shared with /v1/transcribe: same vendor, same key,
  // so captions need no second account and no second secret.
  const elevenLabs = new ElevenLabsProvider({
    apiKey: process.env.ELEVENLABS_API_KEY,
    voiceId: process.env.ELEVENLABS_VOICE_ID,
    model: process.env.ELEVENLABS_MODEL,
  });
  const ttsGen = new GenerationService(elevenLabs, ledger);
  const FREE_CREDITS = envNumber("ORBIT_FREE_CREDITS", 100, 0);
  /** Credits an export costs. 0 (the default) leaves rendering unmetered. */
  const RENDER_COST = envNumber("ORBIT_RENDER_COST", 0, 0);
  /** Credits a transcription costs. Priced like TTS: one pass over the audio. */
  const TRANSCRIBE_COST = Math.max(
    0,
    envNumber("ORBIT_TRANSCRIBE_COST", 5, 0),
  );
  const seeded = new Set<AccountId>();

  /*
   * ---- auth (pluggable, and ON) ----
   *
   * Every route below that costs money, touches storage or reads an account
   * requires a verified bearer token. Auth used to be opt-in, which meant the
   * DEFAULT deployment authenticated nothing and identity was whatever string
   * the caller put in `X-Orbit-Account` — set it to someone else's and you
   * spent their credits. So the provider now defaults to `selfhosted`, and
   * being signed out is expressed as a guest token the server issued rather
   * than as the absence of one.
   *
   * The secret is the one thing that cannot be defaulted. In production an
   * unset `ORBIT_JWT_SECRET` is a refusal to boot: guessing one would silently
   * make every token forgeable. In dev we mint an ephemeral one — tokens then
   * die with the process, which is the right nuisance for a machine that has
   * not been configured.
   */
  const AUTH_PROVIDER = process.env.ORBIT_AUTH_PROVIDER?.trim() || "selfhosted";
  const authEnv: Record<string, string | undefined> = {
    ...process.env,
    ORBIT_AUTH_PROVIDER: AUTH_PROVIDER,
  };
  if (AUTH_PROVIDER === "selfhosted" && !process.env.ORBIT_JWT_SECRET?.trim()) {
    if (process.env.NODE_ENV === "production")
      throw new Error(
        "ORBIT_JWT_SECRET is required in production (it signs every session token)",
      );
    authEnv.ORBIT_JWT_SECRET = randomBytes(32).toString("hex");
    console.warn(
      "[orbit] ORBIT_JWT_SECRET is unset — using an ephemeral dev secret; every token is invalidated on restart",
    );
  }
  const auth = authFromEnv(authEnv, { userStore });
  const LICENSE_KEY = process.env.ORBIT_LICENSE_KEY ?? "orbit";
  const SIGNUP_BONUS = envNumber("ORBIT_SIGNUP_BONUS", 0, 0);

  // ---- purchases: RevenueCat product id → credits granted ----
  // Override with ORBIT_CREDIT_PACKS (JSON, e.g. {"credits_500":550}). The store
  // product ids must match what's configured in RevenueCat / the app stores.
  const DEFAULT_CREDIT_PACKS: Record<string, number> = {
    credits_100: 100,
    credits_500: 550,
    credits_1200: 1400,
  };
  const CREDIT_PACKS: Record<string, number> = (() => {
    try {
      return process.env.ORBIT_CREDIT_PACKS
        ? {
            ...DEFAULT_CREDIT_PACKS,
            ...(JSON.parse(process.env.ORBIT_CREDIT_PACKS) as Record<
              string,
              number
            >),
          }
        : DEFAULT_CREDIT_PACKS;
    } catch {
      return DEFAULT_CREDIT_PACKS;
    }
  })();

  /** Grant the free tier once, the first time we see an account. */
  async function seedFreeTier(account: AccountId): Promise<void> {
    if (seeded.has(account) || FREE_CREDITS <= 0) return;
    seeded.add(account);
    // Idempotent across restarts: only grant if this account never got the free
    // tier before (the in-memory Set alone would re-grant every boot on a
    // persistent DB).
    const granted = (await ledger.history(account)).some(
      (e) => e.reason === "free-tier",
    );
    if (!granted) await ledger.credit(account, FREE_CREDITS, "free-tier");
  }

  /**
   * Resolve the billing account for a request, or answer 401.
   *
   * There is no unauthenticated path left. A signed-out device is not an
   * absence of identity, it is a guest token (`POST /v1/auth/guest`) — signed
   * by this server, naming a subject only this server could have issued. What
   * that replaces is a client-supplied `X-Orbit-Account` header: identity
   * asserted by the caller, trivially set to somebody else's account.
   *
   * Callers must `return` when this returns null; the response is already sent.
   */
  async function accountOf(
    req: Request,
    res: Response,
  ): Promise<AccountId | null> {
    if (!auth) {
      // Only reachable if a deployment explicitly unsets the provider.
      res.status(503).json({ error: "authentication is not configured" });
      return null;
    }
    const header = req.header("Authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const user = token ? await auth.adapter.verify(token) : null;
    if (!user) {
      res
        .status(401)
        .json({ error: "authentication required", kind: "unauthenticated" });
      return null;
    }
    const account = makeAccountId(LICENSE_KEY, user.endUserId);
    await seedFreeTier(account);
    return account;
  }

  /**
   * The same check as middleware, so it can run BEFORE a body parser.
   *
   * `/v1/upload` needs this: multer streams the file to disk as it parses, so
   * an auth check in the handler has already let an anonymous caller write
   * half a gigabyte before refusing them. Reject at the door instead.
   */
  const requireAuth = (req: Request, res: Response, next: () => void): void => {
    void accountOf(req, res).then((account) => {
      if (account) next();
    });
  };

  /*
   * Health, with the numbers you actually need during an incident.
   *
   * `ok` stays true while the queue is merely busy — a load balancer pulling
   * the one box that is doing work is precisely wrong. What it reports instead
   * is depth, so saturation is visible before it turns into 503s.
   */
  app.get("/health", async (_req: Request, res: Response) => {
    // With a shared queue the interesting depth is the CLUSTER's, not this
    // process's — one instance's idle semaphore says nothing about a backlog
    // every replica is working through.
    const shared = queue
      ? await queue.depth().catch(() => null)
      : null;
    /*
     * What this build's ffmpeg can actually do, so a client can offer HDR10
     * only where it will work rather than discovering it on a failed export.
     * `zscale` is a compile-time option and plenty of common builds (Homebrew's
     * among them) ship without it; the probe is cached per binary, so this is
     * one spawn for the life of the process.
     */
    const hdr = await ffmpegSupportsHdr(
      process.env.FFMPEG_PATH ?? "ffmpeg",
    ).catch(() => false);
    /*
     * And which `xfade` transitions it accepts, for the same reason with a
     * sharper edge: a token this build lacks does not render badly, it fails
     * the filtergraph BUILD and kills the render. `cover*`/`reveal*` — the
     * editors' Push and Reveal — arrived in ffmpeg 6.1, and Debian bookworm
     * (this image's base) ships 5.1, so the gap is live rather than
     * theoretical. Cached per binary like the HDR probe, so one spawn.
     */
    const transitions = await ffmpegXfadeTokens(
      process.env.FFMPEG_PATH ?? "ffmpeg",
    ).catch(() => [] as string[]);
    res.json({
      ok: true,
      service: "orbit-render",
      capabilities: { hdr, transitions },
      /*
       * Which build is actually answering. Without this, "is the fix
       * deployed?" is unanswerable from outside the box — and during an
       * incident that is the first question, not the fifth.
       */
      version: BUILD_VERSION,
      ...(BUILD_SHA ? { commit: BUILD_SHA } : {}),
      storage: storage.kind,
      queue: queue ? "shared" : "in-process",
      renders: {
        running,
        queued: waiting.length,
        capacity: MAX_CONCURRENT_RENDERS,
        queueLimit: MAX_QUEUED_RENDERS,
      },
      ...(shared ? { cluster: shared } : {}),
      jobs: jobs.size,
      uptimeSec: Math.round(process.uptime()),
    });
  });

  app.post(
    "/v1/upload",
    rateLimit(UPLOAD_RATE_LIMIT, RATE_WINDOW_MS),
    // Before multer: storage and bandwidth are not free, and an unauthenticated
    // write turned this into a public file host for anyone who found the URL.
    requireAuth,
    upload.single("file"),
    async (req: Request, res: Response) => {
      const file = (req as Request & { file?: { filename: string; mimetype?: string } })
        .file;
      if (!file) {
        res
          .status(400)
          .json({ error: 'multipart upload must include a "file" field' });
        return;
      }
      try {
        const id = await normalizeStill(file.filename);
        /*
         * Mirror to durable storage BEFORE replying, so the token we hand back
         * is one we can honour later. The media dir is a cache with a byte
         * budget — eviction used to mean the file was simply gone and the
         * client had to notice a failed render and re-upload. With a bucket
         * behind it, `ensureLocal` fetches it back instead.
         */
        await storage.put(join(mediaDir, id), file.mimetype || "application/octet-stream");
        void evictMedia(); // keep the store under budget; never blocks the reply
        res.json({ id: `upload:${id}` });
      } catch (err) {
        console.error("[orbit] upload normalize failed:", err);
        res
          .status(500)
          .json({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  );

  app.post(
    "/v1/render",
    rateLimit(RENDER_RATE_LIMIT, RATE_WINDOW_MS),
    async (req: Request, res: Response) => {
      const body = req.body as
        | { project?: VideoProject; output?: ExportOutput; async?: boolean }
        | undefined;
      const project = body?.project;
      if (
        !project ||
        (!Array.isArray(project.clips) && !Array.isArray(project.overlays))
      ) {
        res
          .status(400)
          .json({ error: "request body must be { project: VideoProject }" });
        return;
      }
      const srcs = collectClientSrcs(project);
      const bad = srcs.find((s) => typeof s !== "string" || !isClientSrc(s));
      if (bad !== undefined) {
        res
          .status(400)
          .json({
            error: `src must be an upload token or http(s) URL: ${bad}`,
          });
        return;
      }

      /*
       * Identity first, price second.
       *
       * A render is the most expensive thing this service does — minutes of
       * CPU and an output file it then has to store — so it is authenticated
       * whatever it costs. Guest-first still holds: a signed-out device has a
       * guest token and reaches this exactly as before. What no longer works
       * is reaching it with nothing.
       *
       * Metering stays OFF by default (`ORBIT_RENDER_COST`), and the account
       * is now resolved either way, which is also what binds the job below to
       * the caller who asked for it.
       */
      const account = await accountOf(req, res);
      if (!account) return;

      /*
       * Refuse a project whose media this server does not have, BEFORE taking
       * a render slot or charging for one. 409 rather than 400: the request is
       * well-formed and was valid when the client cached those tokens — the
       * server's copy simply expired underneath it, which is a conflict of
       * state, and it is fixable by re-uploading.
       */
      const missing = await missingUploads(project);
      if (missing.length > 0) {
        res.status(409).json({
          code: "missing_uploads",
          missing,
          error:
            `this server no longer has ${missing.length} uploaded file(s) — ` +
            `re-upload and render again`,
        });
        return;
      }

      if (RENDER_COST > 0) {
        if (!(await ledger.canAfford(account, RENDER_COST))) {
          res.status(402).json({
            error: "not enough credits to export",
            balance: await ledger.balance(account),
            cost: RENDER_COST,
          });
          return;
        }
      }

      // Charged only once the file exists. A failed encode the user never
      // received is not a render, and billing for it is indefensible.
      const settle = async (url: string) => {
        if (RENDER_COST > 0)
          await ledger.debit(account, RENDER_COST, "render").catch(() => undefined);
        return url;
      };

      /*
       * Opt-in, so both shipped clients keep the synchronous reply they expect.
       * `{ async: true }` returns an id straight away and the encode runs on:
       * nothing is holding a connection open for a minute of 1080p, which is
       * what every proxy in front of this eventually kills.
       */
      if (body?.async === true) {
        // Shared queue when there is one, so any replica can do the work; the
        // in-process registry otherwise, which is the single-box behaviour.
        if (queue) {
          const id = `job_${Date.now().toString(36)}_${randomBytes(9).toString("hex")}`;
          const job = await queue.enqueue(id, project, body?.output, account);
          res.status(202).json({ id: job.id, status: job.status });
          return;
        }
        const job = jobs.start(
          (markRunning, setProgress) =>
            render(project, body?.output, markRunning, setProgress).then(settle),
          account,
        );
        res.status(202).json({ id: job.id, status: job.status });
        return;
      }

      try {
        const url = await settle(await render(project, body?.output));
        res.json({ url });
      } catch (err) {
        if (err instanceof QueueFullError) {
          res
            .status(503)
            .json({ error: "the renderer is busy — try again in a moment" });
          return;
        }
        // The client's URL was the problem, not the server's state.
        if (err instanceof RemoteSrcError) {
          res.status(400).json({ error: err.message });
          return;
        }
        // Log the full failure server-side — the client only sees a summary, so
        // without this an ffmpeg error is effectively undebuggable.
        console.error(
          "[orbit] render failed:",
          err instanceof Error ? (err.stack ?? err.message) : err,
        );
        res.status(500).json({ error: clientMessage(err) });
      }
    },
  );

  /*
   * The worker loop.
   *
   * Every instance is BOTH an API server and a worker, which is what makes
   * "add a machine to add capacity" true without a second deployment to
   * operate. `ORBIT_WORKER=0` turns it off for an instance that should only
   * serve requests.
   *
   * It takes one job at a time and leans on `withRenderSlot` for the rest: the
   * concurrency cap already decides how much ffmpeg this box runs at once, and
   * a second, separate notion of worker count here could only disagree with it.
   *
   * Polling, not LISTEN/NOTIFY. A notification is lost if nobody is listening
   * at that instant, so a worker starting after an enqueue would sit idle next
   * to a full queue; the poll is what makes recovery automatic. The cost is one
   * indexed query per interval.
   */
  const WORKER_ID = `${process.pid}@${process.env.HOSTNAME ?? "local"}`;
  /** The job this process is encoding right now, so shutdown can hand it back. */
  let inFlight: string | null = null;
  const WORKER_POLL_MS = Math.max(
    250,
    envNumber("ORBIT_WORKER_POLL_MS", 2000),
  );

  if (queue && process.env.ORBIT_WORKER !== "0") {
    const q = queue;
    let stopping = false;
    const loop = async () => {
      while (!stopping) {
        let claimed: Awaited<ReturnType<typeof q.claim>> = null;
        try {
          claimed = await q.claim(WORKER_ID);
        } catch (err) {
          console.error("[orbit] queue poll failed:", err);
        }
        if (!claimed) {
          await new Promise((r) => setTimeout(r, WORKER_POLL_MS));
          continue;
        }
        const job = claimed;
        inFlight = job.id;
        // A long encode has to keep saying it is alive, or the stale sweep
        // hands its job to someone else and it gets rendered twice.
        const beat = setInterval(() => {
          void q.heartbeat(job.id, WORKER_ID).catch(() => undefined);
        }, 30_000);
        try {
          /*
           * Progress goes to the database, so it is rate-limited by time as
           * well as by the 1% steps the engine already applies — a long encode
           * would otherwise be a steady trickle of UPDATEs on a table every
           * worker in the cluster is polling.
           */
          let lastWrite = 0;
          const url = await render(
            job.project as VideoProject,
            job.output as ExportOutput | undefined,
            undefined,
            (fraction) => {
              const now = Date.now();
              if (fraction < 1 && now - lastWrite < 2_000) return;
              lastWrite = now;
              void q.setProgress(job.id, fraction, WORKER_ID).catch(() => undefined);
            },
          );
          await q.finish(job.id, url, WORKER_ID);
          /*
           * Charge here, not at enqueue. A queued render used to be free while
           * the synchronous one was billed — the debit lived in `settle`, which
           * only the in-process path ran. Same rule as everywhere else: only
           * once the file exists.
           */
          if (RENDER_COST > 0 && job.account)
            await ledger
              .debit(job.account, RENDER_COST, "render")
              .catch(() => undefined);
        } catch (err) {
          await q
            .fail(job.id, err instanceof Error ? err.message : String(err), WORKER_ID)
            .catch(() => undefined);
        } finally {
          clearInterval(beat);
          inFlight = null;
        }
      }
    };
    void loop();
    // Finished rows would otherwise accumulate forever.
    const sweeper = setInterval(
      () => void q.sweep(JOB_TTL_MS).catch(() => undefined),
      10 * 60_000,
    );
    sweeper.unref?.();

    /*
     * On the way out: stop taking work, and HAND BACK whatever was in flight.
     *
     * The encode itself dies with the process — there is no resuming an ffmpeg
     * that was killed — so the honest thing is to put the job back in the queue
     * for whoever is still up. Leaving it `running` means the client polls a
     * job nobody owns until the stale sweep notices it, which is fifteen
     * minutes of a render that looks alive and is not.
     */
    shutdownTasks.push(async () => {
      stopping = true;
      clearInterval(sweeper);
      if (inFlight) await q.release(inFlight, WORKER_ID).catch(() => undefined);
    });
  }

  /*
   * Poll a job started with `{ async: true }`.
   *
   * 404 covers both "never existed" and "finished long enough ago to be swept"
   * — the client cannot act differently on the two, and pretending to know
   * which would mean keeping every id forever.
   */
  app.get("/v1/render/:id", async (req: Request, res: Response) => {
    const account = await accountOf(req, res);
    if (!account) return;
    const job = queue
      ? await queue.get(req.params.id)
      : jobs.get(req.params.id);
    /*
     * Somebody else's job is a job you do not have. Answering 403 would confirm
     * the id exists, which is the one bit an enumerator wants — and the client
     * cannot act differently on "never existed", "swept" and "not yours"
     * anyway. All three are 404.
     */
    if (!job || (job.account !== undefined && job.account !== account)) {
      res.status(404).json({ error: "no such render job" });
      return;
    }
    res.json({
      id: job.id,
      status: job.status,
      url: job.url,
      error: job.error,
      // Absent until ffmpeg has said something, which is a different thing from
      // zero: the client shows an indeterminate bar for one and an empty bar
      // for the other.
      progress: job.progress,
      elapsedMs: (job.finishedAt ?? Date.now()) - job.createdAt,
    });
  });

  app.get("/v1/credits", async (req: Request, res: Response) => {
    const account = await accountOf(req, res);
    if (!account) return;
    res.json({ balance: await ledger.balance(account) });
  });

  /*
   * ---- fonts ----
   *
   * The bytes of a caption's typeface, so the WEB PREVIEW can embed it.
   *
   * This exists because an SVG loaded through `<img>` is a resource-isolated
   * document: it cannot see the page's `@font-face` rules or `document.fonts`.
   * Measured against a control, a page webfont rendered at exactly the fallback
   * width inside `<img>` — so the preview drew captions in a system face while
   * the export drew them in the chosen one, for as long as captions have
   * existed. The fix is to embed a subsetted face as a data URI, which the
   * browser can only do if it has the font.
   *
   * **Served from here rather than fetched from Google by the client, so both
   * ends use the same bytes.** The export resolves fonts through this exact
   * function, on this exact box; a client fetching `fonts.gstatic.com` itself
   * would be one Google release away from previewing a different cut of the
   * face than the render used, which is the class of drift this whole engine is
   * built to refuse.
   *
   * Mobile does not call this. Its captions are React Native `<Text>`, which
   * measures and draws with the real font already.
   */
  app.get(
    "/v1/fonts/:family",
    rateLimit(FONT_RATE_LIMIT, RATE_WINDOW_MS),
    requireAuth,
    async (req: Request, res: Response) => {
      const family = String(req.params.family ?? "");
      /*
       * Checked HERE as well as inside `resolveFonts`, and deliberately not
       * only there. This is the one place the family comes straight off a URL
       * path, so refusing early gives the caller a 400 that names the problem
       * instead of a 404 that looks like a missing font — and it keeps the
       * boundary visible at the edge where it matters.
       */
      if (!isSafeFontFamily(family)) {
        res.status(400).json({ error: "invalid font family", code: "bad_family" });
        return;
      }
      let resolved: Awaited<ReturnType<typeof resolveFonts>>;
      try {
        resolved = await resolveFonts([family]);
      } catch {
        res.status(502).json({ error: "font lookup failed", code: "font_unavailable", family });
        return;
      }
      const path = resolved.files[0];
      if (!path) {
        // The export would substitute a face for this family too, so saying so
        // lets the client fall back deliberately rather than silently.
        res.status(404).json({ error: "font unavailable", code: "font_unavailable", family });
        return;
      }
      try {
        const bytes = await readFile(path);
        res.set("Content-Type", "font/ttf");
        res.set("X-Content-Type-Options", "nosniff");
        // A family's bytes do not change under it; the client caches by family.
        res.set("Cache-Control", "public, max-age=31536000, immutable");
        res.send(bytes);
      } catch {
        res.status(404).json({ error: "font unavailable", code: "font_unavailable", family });
      }
    },
  );


  /*
   * ---- project sync ----
   *
   * Documents only; media travels as the `upload:` tokens the project already
   * carries (see project-store.ts for why, and for what that costs on local
   * disk).
   *
   * GUESTS ARE REFUSED, and that is the interesting decision. A guest token is
   * a real identity and these routes would work for one — but a guest has no
   * password, so the identity dies with the app's storage. Offering "your work
   * follows you" to someone whose account cannot outlive a reinstall would be a
   * promise we know is false. The 403 names the reason so the UI can say
   * exactly what to do about it.
   */
  const syncAccount = async (
    req: Request,
    res: Response,
  ): Promise<AccountId | null> => {
    if (!projects) {
      res.status(503).json({
        error: "project sync is not configured on this server",
        kind: "sync-unconfigured",
      });
      return null;
    }
    const header = req.header("Authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const user = token && auth ? await auth.adapter.verify(token) : null;
    if (!user) {
      res
        .status(401)
        .json({ error: "authentication required", kind: "unauthenticated" });
      return null;
    }
    if (user.guest) {
      res.status(403).json({
        error: "Sign in to sync your projects across devices.",
        kind: "guest",
      });
      return null;
    }
    return makeAccountId(LICENSE_KEY, user.endUserId);
  };

  /** What changed since the client last looked. `since` is ms, 0 for everything. */
  app.get("/v1/projects", async (req: Request, res: Response) => {
    const account = await syncAccount(req, res);
    if (!account) return;
    const since = Number(req.query.since ?? 0);
    res.json({
      projects: await projects!.list(account, Number.isFinite(since) ? since : 0),
      // So a client can store one watermark rather than tracking per row.
      now: Date.now(),
      /*
       * Media durability, reported rather than assumed. On local disk the
       * media dir is an evictable cache, so a project synced to another device
       * may arrive with its footage missing — the client should say so up
       * front instead of showing empty clips.
       */
      mediaDurable: storage.kind !== "local",
    });
  });

  app.get("/v1/projects/:id", async (req: Request, res: Response) => {
    const account = await syncAccount(req, res);
    if (!account) return;
    const row = await projects!.get(account, req.params.id);
    if (!row) {
      res.status(404).json({ error: "no such project" });
      return;
    }
    res.json(row);
  });

  app.put("/v1/projects/:id", async (req: Request, res: Response) => {
    const account = await syncAccount(req, res);
    if (!account) return;
    const body = req.body as Partial<SyncedProject> | undefined;
    if (!body || typeof body.updatedAt !== "number" || body.data === undefined) {
      res
        .status(400)
        .json({ error: "body must be { kind, name, updatedAt, data }" });
      return;
    }
    const result = await projects!.put(account, {
      id: req.params.id,
      kind: String(body.kind ?? "video"),
      name: String(body.name ?? "Untitled"),
      updatedAt: body.updatedAt,
      data: body.data,
    });
    if (result.stored) {
      res.json({ ok: true });
      return;
    }
    /*
     * 409 with the winner attached. The client asked to store something older
     * than what is here, and the useful answer is not "no" — it is "no, and
     * here is what you were about to overwrite", so it can keep both.
     */
    res.status(409).json({ error: "a newer version is stored", current: result.current });
  });

  app.delete("/v1/projects/:id", async (req: Request, res: Response) => {
    const account = await syncAccount(req, res);
    if (!account) return;
    await projects!.remove(account, req.params.id, Date.now());
    res.json({ ok: true });
  });

  // ---- self-hosted auth (register / login) ----
  // Only mounted when ORBIT_AUTH_PROVIDER=selfhosted. Managed providers
  // (clerk/supabase/firebase) sign in on the client and forward their token.
  if (auth?.selfHosted) {
    const selfHosted = auth.selfHosted;
    const creds = (req: Request) =>
      (req.body ?? {}) as { email?: string; password?: string };
    // Optional transactional email for password resets (Resend today). Null when
    // unconfigured — /v1/auth/forgot then answers 503 "email not configured".
    const mailer = emailSenderFromEnv(process.env);

    /*
     * Where the reset token is delivered.
     *
     * `EMAIL_RESET_URL_BASE` wins and can be anything — a deep link, a page on
     * your own site. Otherwise, if the service knows its own public address, it
     * links to the page it serves itself at `/reset`. Only with neither does it
     * fall back to emailing the raw token to paste into the app, which works
     * but is a poor last resort: the token is a ~300-character JWT and mail
     * clients wrap it.
     *
     * NEITHER IS DERIVED FROM THE REQUEST. Building a reset link out of the
     * `Host` header is the classic password-reset poisoning bug — an attacker
     * posts to `/v1/auth/forgot` with `Host: evil.example`, and the victim gets
     * a real, valid reset token pointed at the attacker's box. The public
     * address has to be something the operator stated.
     */
    const publicUrl = process.env.ORBIT_PUBLIC_URL?.trim().replace(/\/+$/, "");
    const resetUrlBase =
      process.env.EMAIL_RESET_URL_BASE?.trim() ||
      (publicUrl ? `${publicUrl}/reset` : undefined);

    /*
     * The reset page itself — served from this origin so the form and the
     * endpoint it posts to are the same host, with no CORS and no second
     * deployment. The body is a constant (the token is read client-side out of
     * the query string), so there is nothing to escape here.
     */
    app.get("/reset", (_req: Request, res: Response) => {
      res.set(RESET_PAGE_HEADERS).send(RESET_PAGE_HTML);
    });

    /*
     * A token for a device that has not signed in.
     *
     * This is what keeps "No Login Required" true now that nothing is
     * anonymous: the client asks once, stores the token, and every later
     * request is authenticated like any other. Rate-limited with the other
     * account-creating routes — a guest gets the free tier, so unlimited
     * issuance is unlimited free generation billed to whoever owns the
     * provider key.
     */
    app.post(
      "/v1/auth/guest",
      rateLimit(GUEST_RATE_LIMIT, RATE_WINDOW_MS),
      async (_req: Request, res: Response) => {
        const result = await selfHosted.issueGuest();
        const account = makeAccountId(LICENSE_KEY, result.user.endUserId);
        await seedFreeTier(account);
        res.json({
          token: result.token,
          user: result.user,
          balance: await ledger.balance(account),
        });
      },
    );

    app.post(
      "/v1/auth/register",
      rateLimit(AUTH_CREATE_RATE_LIMIT, RATE_WINDOW_MS),
      async (req: Request, res: Response) => {
      const { email, password } = creds(req);
      if (!email || !password) {
        res.status(400).json({ error: "email and password are required" });
        return;
      }
      try {
        const result = await selfHosted.register(email, password);
        const account = makeAccountId(LICENSE_KEY, result.user.endUserId);
        // Dev-configurable signup bonus (off by default) — the only place a new
        // account gets free credits under auth.
        if (result.isNew && SIGNUP_BONUS > 0)
          await ledger.credit(account, SIGNUP_BONUS, "signup-bonus");
        res.json({
          token: result.token,
          user: result.user,
          balance: await ledger.balance(account),
        });
      } catch (err) {
        if (err instanceof AuthError) {
          res
            .status(err.kind === "email-taken" ? 409 : 400)
            .json({ error: err.message, kind: err.kind });
          return;
        }
        res
          .status(500)
          .json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    app.post(
      "/v1/auth/login",
      rateLimit(AUTH_RATE_LIMIT, RATE_WINDOW_MS),
      async (req: Request, res: Response) => {
      const { email, password } = creds(req);
      if (!email || !password) {
        res.status(400).json({ error: "email and password are required" });
        return;
      }
      try {
        const result = await selfHosted.login(email, password);
        const account = makeAccountId(LICENSE_KEY, result.user.endUserId);
        res.json({
          token: result.token,
          user: result.user,
          balance: await ledger.balance(account),
        });
      } catch (err) {
        if (err instanceof AuthError) {
          res.status(401).json({ error: err.message, kind: err.kind });
          return;
        }
        res
          .status(500)
          .json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    // Request a password reset. Requires an email provider; without one we can't
    // deliver the token, so answer 503 rather than silently succeeding.
    app.post(
      "/v1/auth/forgot",
      rateLimit(AUTH_CREATE_RATE_LIMIT, RATE_WINDOW_MS),
      async (req: Request, res: Response) => {
      const { email } = creds(req);
      if (!email) {
        res.status(400).json({ error: "email is required" });
        return;
      }
      if (!mailer) {
        res.status(503).json({
          error: "email is not configured on this server",
          kind: "email-unconfigured",
        });
        return;
      }
      try {
        const reset = await selfHosted.requestReset(email);
        // Only actually send when the account exists — but always answer 200 with
        // the same body, so the response can't be used to probe which emails exist.
        if (reset) {
          const link = resetUrlBase
            ? `${resetUrlBase}${resetUrlBase.includes("?") ? "&" : "?"}token=${encodeURIComponent(reset.token)}`
            : undefined;
          try {
            await mailer.send(
              resetEmailMessage(reset.user.email!, link, reset.token),
            );
          } catch (sendErr) {
            /*
             * A send failure must NOT reach the caller, and this is not
             * politeness — a send is only attempted when the account exists, so
             * answering 500 here would tell an anonymous caller exactly which
             * addresses are registered, defeating the identical-response rule
             * three lines above. The operator's channel for this is the log.
             */
            console.error(
              JSON.stringify({
                t: new Date().toISOString(),
                event: "reset-email-failed",
                provider: mailer.provider,
                error:
                  sendErr instanceof Error ? sendErr.message : String(sendErr),
              }),
            );
          }
        }
        /*
         * `delivery` describes the SERVER, not the account — which is why it can
         * be said out loud here. The client needs it: "check your email for a
         * link" and "paste the code below" are different screens, and a client
         * that guesses wrong sends the user looking for something that was
         * never sent.
         */
        res.json({ ok: true, delivery: resetUrlBase ? "link" : "code" });
      } catch (err) {
        res
          .status(500)
          .json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    // Complete a reset with the emailed token + a new password; logs the user in.
    app.post(
      "/v1/auth/reset",
      rateLimit(AUTH_RATE_LIMIT, RATE_WINDOW_MS),
      async (req: Request, res: Response) => {
      const { token, password } = (req.body ?? {}) as {
        token?: string;
        password?: string;
      };
      if (!token || !password) {
        res.status(400).json({ error: "token and password are required" });
        return;
      }
      try {
        const result = await selfHosted.resetPassword(token, password);
        const account = makeAccountId(LICENSE_KEY, result.user.endUserId);
        res.json({
          token: result.token,
          user: result.user,
          balance: await ledger.balance(account),
        });
      } catch (err) {
        if (err instanceof AuthError) {
          res
            .status(err.kind === "invalid-token" ? 400 : 422)
            .json({ error: err.message, kind: err.kind });
          return;
        }
        res
          .status(500)
          .json({ error: err instanceof Error ? err.message : String(err) });
      }
    });
  }

  app.post("/v1/generate-image", async (req: Request, res: Response) => {
    const body = req.body as
      | { prompt?: string; width?: number; height?: number; model?: string }
      | undefined;
    if (!body?.prompt) {
      res.status(400).json({ error: "request body must be { prompt }" });
      return;
    }
    if (!process.env.RUNWAY_API_TOKEN) {
      res.status(503).json({ error: "server is missing RUNWAY_API_TOKEN" });
      return;
    }
    const account = await accountOf(req, res);
    if (!account) return;
    // Abort the (long-polling) generation if the client disconnects before we
    // respond — nothing is charged, since the service debits only on success.
    const ac = new AbortController();
    req.on("close", () => {
      if (!res.writableEnded) ac.abort();
    });
    try {
      const result = await gen.generateImage(account, {
        prompt: body.prompt,
        width: body.width,
        height: body.height,
        model: body.model,
        signal: ac.signal,
      });
      res.json({ url: result.url, balance: await ledger.balance(account) });
    } catch (err) {
      if (ac.signal.aborted) return; // client disconnected — nothing to send
      if (err instanceof InsufficientCreditsError) {
        res.status(402).json({
          error: "insufficient credits",
          balance: await ledger.balance(account),
        });
        return;
      }
      // The upstream AI provider rejected the request for billing/quota reasons
      // (e.g. free ElevenLabs plan, exhausted Runway credits) — surface a clear
      // 502 rather than a raw provider error. Distinct from our own 402.
      if (err instanceof ProviderError && err.upstreamStatus === 402) {
        res.status(502).json({
          error:
            "The AI provider rejected the request — its account is out of credits or needs a paid plan.",
        });
        return;
      }
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/v1/generate-video", async (req: Request, res: Response) => {
    const body = req.body as
      | {
          prompt?: string;
          width?: number;
          height?: number;
          durationSec?: number;
          image?: string;
          model?: string;
          audio?: boolean;
        }
      | undefined;
    if (!body?.prompt) {
      res.status(400).json({ error: "request body must be { prompt }" });
      return;
    }
    if (!process.env.RUNWAY_API_TOKEN) {
      res.status(503).json({ error: "server is missing RUNWAY_API_TOKEN" });
      return;
    }
    const account = await accountOf(req, res);
    if (!account) return;
    let image: string | undefined;
    try {
      image = await resolveProviderImage(body.image);
    } catch {
      res.status(400).json({ error: "invalid source image" });
      return;
    }
    const ac = new AbortController();
    req.on("close", () => {
      if (!res.writableEnded) ac.abort();
    });
    try {
      const result = await gen.generateVideo(account, {
        prompt: body.prompt,
        width: body.width,
        height: body.height,
        durationSec: body.durationSec,
        image,
        model: body.model,
        audio: body.audio,
        signal: ac.signal,
      });
      res.json({
        url: result.url,
        audioUrl: result.meta?.audioUrl,
        balance: await ledger.balance(account),
      });
    } catch (err) {
      if (ac.signal.aborted) return; // client disconnected — nothing to send
      if (err instanceof InsufficientCreditsError) {
        res.status(402).json({
          error: "insufficient credits",
          balance: await ledger.balance(account),
        });
        return;
      }
      // The upstream AI provider rejected the request for billing/quota reasons
      // (e.g. free ElevenLabs plan, exhausted Runway credits) — surface a clear
      // 502 rather than a raw provider error. Distinct from our own 402.
      if (err instanceof ProviderError && err.upstreamStatus === 402) {
        res.status(502).json({
          error:
            "The AI provider rejected the request — its account is out of credits or needs a paid plan.",
        });
        return;
      }
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/v1/tts", async (req: Request, res: Response) => {
    const body = req.body as
      | { text?: string; voice?: string; speed?: number }
      | undefined;
    if (!body?.text?.trim()) {
      res.status(400).json({ error: "request body must be { text }" });
      return;
    }
    if (!process.env.ELEVENLABS_API_KEY) {
      res.status(503).json({ error: "server is missing ELEVENLABS_API_KEY" });
      return;
    }
    const account = await accountOf(req, res);
    if (!account) return;
    const ac = new AbortController();
    req.on("close", () => {
      if (!res.writableEnded) ac.abort();
    });
    try {
      const result = await ttsGen.tts(account, {
        text: body.text,
        voice: body.voice,
        speed: body.speed,
        signal: ac.signal,
      });
      const url = await materializeAudio(result.url); // data URI → served /files URL
      res.json({ url, balance: await ledger.balance(account) });
    } catch (err) {
      if (ac.signal.aborted) return; // client disconnected — nothing to send
      if (err instanceof InsufficientCreditsError) {
        res.status(402).json({
          error: "insufficient credits",
          balance: await ledger.balance(account),
        });
        return;
      }
      // The upstream AI provider rejected the request for billing/quota reasons
      // (e.g. free ElevenLabs plan, exhausted Runway credits) — surface a clear
      // 502 rather than a raw provider error. Distinct from our own 402.
      if (err instanceof ProviderError && err.upstreamStatus === 402) {
        res.status(502).json({
          error:
            "The AI provider rejected the request — its account is out of credits or needs a paid plan.",
        });
        return;
      }
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /**
   * Speech → caption lines. The server half of auto-captions.
   *
   * Takes an `upload:` token rather than raw audio: the client has already
   * uploaded its media to render it, so captioning costs no second upload of
   * the same file, and the token goes through `resolveSrc` — the same boundary
   * every other src crosses.
   *
   * Metered like the other AI routes, and charged only on success. The grouping
   * into lines happens here rather than on the device so every client gets the
   * same captions from the same audio.
   */
  app.post("/v1/transcribe", async (req: Request, res: Response) => {
    const body = req.body as { src?: string; language?: string } | undefined;
    if (!body?.src || !isClientSrc(body.src)) {
      res
        .status(400)
        .json({ error: "request body must be { src: 'upload:<id>' }" });
      return;
    }
    if (!process.env.ELEVENLABS_API_KEY) {
      res.status(503).json({ error: "server is missing ELEVENLABS_API_KEY" });
      return;
    }
    const account = await accountOf(req, res);
    if (!account) return;
    if (!(await ledger.canAfford(account, TRANSCRIBE_COST))) {
      res.status(402).json({
        error: "insufficient credits",
        balance: await ledger.balance(account),
        cost: TRANSCRIBE_COST,
      });
      return;
    }

    const ac = new AbortController();
    req.on("close", () => {
      if (!res.writableEnded) ac.abort();
    });
    try {
      // ffmpeg is not involved: the model takes the container as uploaded, and
      // extracting the audio first would cost a transcode for no gain.
      const audio = await readFile(resolveSrc(body.src));
      const words = await elevenLabs.transcribe({
        audio: audio.buffer.slice(
          audio.byteOffset,
          audio.byteOffset + audio.byteLength,
        ) as ArrayBuffer,
        language: body.language,
        signal: ac.signal,
      });
      const lines = groupWords(words);
      await ledger
        .debit(account, TRANSCRIBE_COST, "transcribe")
        .catch(() => undefined);
      res.json({ lines, balance: await ledger.balance(account) });
    } catch (err) {
      if (ac.signal.aborted) return;
      if (err instanceof ProviderError && err.upstreamStatus === 402) {
        res.status(502).json({
          error:
            "The AI provider rejected the request — its account is out of credits or needs a paid plan.",
        });
        return;
      }
      /*
       * A key that exists but is not allowed to do THIS.
       *
       * ElevenLabs scopes keys per capability, so a key that generates speech
       * perfectly well can be missing `speech_to_text` — and the raw upstream
       * body was going straight to the user, who is not the person who can fix
       * it. Say what is wrong and who has to act.
       */
      if (
        err instanceof ProviderError &&
        (err.upstreamStatus === 401 || err.upstreamStatus === 403)
      ) {
        res.status(502).json({
          error:
            "This server's ELEVENLABS_API_KEY is not permitted to transcribe. Its key needs the speech_to_text permission.",
        });
        return;
      }
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ---- RevenueCat purchase webhook ----
  // Server-to-server: RevenueCat calls this when a purchase settles. Authenticated
  // by a shared secret (REVENUECAT_WEBHOOK_AUTH, set in the RevenueCat dashboard),
  // NOT the user bearer token. Credits the buyer's account by the pack size, once
  // per transaction (idempotent — RevenueCat may retry).
  app.post(
    "/v1/billing/webhook",
    rateLimit(WEBHOOK_RATE_LIMIT, RATE_WINDOW_MS),
    async (req: Request, res: Response) => {
    /*
     * FAIL CLOSED. This used to be `if (secret && …)`, so leaving
     * REVENUECAT_WEBHOOK_AUTH unset did not weaken the check — it removed it,
     * and the route became a public endpoint that mints credits. The product
     * ids it grants against are not secret either: they are App Store
     * identifiers that ship inside the mobile binary. An unconfigured secret is
     * a misconfiguration, and the only safe reading of one is "refuse", not
     * "accept everything".
     *
     * Truthiness rather than `??`, for the same reason `envNumber` exists: an
     * env var set to the empty string is unset in every way that matters and
     * `??` does not fire on it.
     */
    const secret = process.env.REVENUECAT_WEBHOOK_AUTH;
    if (!secret) {
      console.warn(
        JSON.stringify({
          t: new Date().toISOString(),
          evt: "webhook-unconfigured",
          msg: "REVENUECAT_WEBHOOK_AUTH is not set; refusing billing webhook",
        }),
      );
      res.status(503).json({ error: "webhook not configured" });
      return;
    }
    if (!secretsMatch(req.header("Authorization"), secret)) {
      res.status(401).json({ error: "invalid webhook signature" });
      return;
    }
    const event = (
      req.body as
        | {
            event?: {
              type?: string;
              app_user_id?: string;
              product_id?: string;
              transaction_id?: string;
              id?: string;
            };
          }
        | undefined
    )?.event;
    if (!event?.type) {
      res.status(400).json({ error: "missing event" });
      return;
    }
    // Only these event types represent a completed, credit-granting purchase.
    const GRANTING = new Set([
      "INITIAL_PURCHASE",
      "NON_RENEWING_PURCHASE",
      "RENEWAL",
    ]);
    const amount = event.product_id
      ? CREDIT_PACKS[event.product_id]
      : undefined;
    const txId = event.transaction_id ?? event.id;
    if (!GRANTING.has(event.type) || !event.app_user_id || !amount || !txId) {
      res.json({ ok: true, ignored: true }); // ack non-granting / unknown events so RevenueCat stops retrying
      return;
    }
    const account = makeAccountId(LICENSE_KEY, event.app_user_id);
    // One indexed row, not the account's whole history. RevenueCat retries, so
    // the check has to exist; it does not have to be O(everything this account
    // has ever done) on an id the caller supplies.
    const already = await ledger.findByMeta(account, "purchase", "txId", txId);
    if (!already)
      await ledger.credit(account, amount, "purchase", {
        txId,
        productId: event.product_id,
      });
    res.json({ ok: true, balance: await ledger.balance(account) });
    },
  );

  // Dev-only credit top-up (production replaces this with a payment webhook).
  if (process.env.ORBIT_DEV_TOPUP === "1") {
    app.post("/v1/credits/grant", async (req: Request, res: Response) => {
      const account = await accountOf(req, res);
      if (!account) return;
      const amount = Number(
        (req.body as { amount?: number } | undefined)?.amount ?? 100,
      );
      if (!Number.isFinite(amount) || amount <= 0) {
        res.status(400).json({ error: "amount must be a positive number" });
        return;
      }
      await ledger.credit(account, amount, "dev-topup");
      res.json({ balance: await ledger.balance(account) });
    });
  }

  /*
   * Exposed rather than wired to a signal here: `createServer` is also called
   * by the test suite, dozens of times in one process, and each call installing
   * its own SIGTERM listener would blow past Node's max-listeners warning and
   * leave handlers pointing at long-dead servers.
   */
  /*
   * Last, and unconditional: the synchronous render path spawns ffmpeg too.
   *
   * It runs AFTER the queue has handed its claim back, which is deliberate —
   * killing the encoder makes `runFFmpeg` reject, and the worker loop's catch
   * then calls `fail`, which the claim guard turns into a no-op because the job
   * is already back in the queue for someone who can actually finish it.
   */
  shutdownTasks.push(async () => {
    const killed = killLiveRenders();
    if (killed) console.log(`[orbit] stopped ${killed} encode(s) in flight`);
  });

  app.locals.shutdown = async (): Promise<void> => {
    for (const task of shutdownTasks) await task().catch(() => undefined);
  };

  return app;
}
