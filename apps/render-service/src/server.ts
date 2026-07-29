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
 *   POST /v1/billing/webhook { event }                 → { ok }              RevenueCat purchase → grant credits (shared-secret auth)
 *
 * Clients can't reach phone-local files, so they upload media first and reference
 * it in `clip.src` / `audio.src` as the returned `upload:<id>` token. `resolveSrc`
 * maps those tokens back to files INSIDE the media dir — a client can never put an
 * arbitrary filesystem path into ffmpeg. Rendered files are served from /files.
 *
 * Generation is credit-metered via `@orbit/billing`: each account (the
 * `X-Orbit-Account` header) is granted `ORBIT_FREE_CREDITS` on first touch, and a
 * `generate_image` debits 10 credits — only on a successful generation. This ships
 * an IN-MEMORY ledger for local/dev use. A production deployment swaps
 * `InMemoryLedgerStore` for a DB-backed `LedgerStore`, adds license/account auth,
 * replaces the dev `/v1/credits/grant` with its own payment webhook, and prices
 * credits (e.g. 100 = $5) in its own billing — Orbit only meters consumption.
 */
import cors from "cors";
import express, { type Express, type Request, type Response } from "express";
import multer from "multer";
import { spawn } from "node:child_process";
import { mkdir, mkdirSync } from "node:fs";
import {
  mkdir as mkdirAsync,
  readFile,
  readdir,
  rm as rmAsync,
  stat as statAsync,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import {
  renderProject,
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
import { collectClientSrcs, isClientSrc, makeResolveSrc } from "./resolve.js";
import { RemoteSrcError, fetchRemoteTo } from "./remote.js";
import { PgLedgerStore, PgUserStore, makePgPool } from "./pg-store.js";
import { InMemoryUserStore } from "./user-store.js";
import { emailSenderFromEnv } from "./email.js";
import { JobRegistry, JOB_TTL_MS } from "./jobs.js";
import { PgJobQueue } from "./job-queue.js";
import { storageFromEnv } from "./storage.js";

/** Per-file upload cap, and the total media-store budget before eviction. */
const MAX_UPLOAD_BYTES = Number(
  process.env.ORBIT_MAX_UPLOAD_BYTES ?? 500 * 1024 * 1024,
);
const MAX_MEDIA_BYTES = Number(
  process.env.ORBIT_MAX_MEDIA_BYTES ?? 5 * 1024 * 1024 * 1024,
);
/**
 * The same budget for finished renders.
 *
 * Uploads have been evicted since the audit; outputs never were, so on local
 * disk the directory grew without limit until the volume filled — a slow, total
 * outage with no signal until it lands. With S3 configured the local copy is
 * only a staging file and this bound matters even more.
 */
const MAX_OUTPUT_BYTES = Number(
  process.env.ORBIT_MAX_OUTPUT_BYTES ?? 5 * 1024 * 1024 * 1024,
);
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

/** Requests per IP per window for the two unauthenticated, expensive endpoints. */
const RATE_WINDOW_MS = Number(process.env.ORBIT_RATE_WINDOW_MS ?? 60_000);
const UPLOAD_RATE_LIMIT = Number(process.env.ORBIT_UPLOAD_RATE_LIMIT ?? 60);
const RENDER_RATE_LIMIT = Number(process.env.ORBIT_RENDER_RATE_LIMIT ?? 10);
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
const AUTH_RATE_LIMIT = Number(process.env.ORBIT_AUTH_RATE_LIMIT ?? 20);
const AUTH_CREATE_RATE_LIMIT = Number(process.env.ORBIT_AUTH_CREATE_RATE_LIMIT ?? 5);

export function createServer(): Express {
  const app = express();
  app.use(cors());
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
  app.use("/files", express.static(outDir));

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
    Number(process.env.ORBIT_MAX_CONCURRENT_RENDERS ?? 2),
  );
  const MAX_QUEUED_RENDERS = Math.max(
    0,
    Number(process.env.ORBIT_MAX_QUEUED_RENDERS ?? 8),
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

  async function render(
    project: VideoProject,
    output?: ExportOutput,
    /** Called once a render slot is actually held — see `JobRegistry.start`. */
    onStart?: () => void,
  ): Promise<string> {
    await mkdirAsync(outDir, { recursive: true });
    await ensureLocal(project);
    const name = `v_${++counter}_${Date.now()}.mp4`;
    const path = join(outDir, name);
    const safe = await localizeProject(project);
    await withRenderSlot(() => {
      onStart?.();
      return renderProject(safe, { outputPath: path, resolveSrc, output });
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
  if (process.env.DATABASE_URL) {
    const pool = makePgPool(process.env.DATABASE_URL);
    ledgerStore = new PgLedgerStore(pool);
    userStore = new PgUserStore(pool);
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
  const FREE_CREDITS = Number(process.env.ORBIT_FREE_CREDITS ?? 100);
  /** Credits an export costs. 0 (the default) leaves rendering unmetered. */
  const RENDER_COST = Math.max(0, Number(process.env.ORBIT_RENDER_COST ?? 0));
  /** Credits a transcription costs. Priced like TTS: one pass over the audio. */
  const TRANSCRIBE_COST = Math.max(
    0,
    Number(process.env.ORBIT_TRANSCRIBE_COST ?? 5),
  );
  const seeded = new Set<AccountId>();

  // ---- auth (pluggable) ----
  // When ORBIT_AUTH_PROVIDER is set, AI/credit routes require a verified bearer
  // token and the account is `licenseKey:endUserId`. When unset, auth is disabled
  // and we fall back to the anonymous per-device account (local/dev).
  const auth = authFromEnv(process.env, { userStore });
  const LICENSE_KEY = process.env.ORBIT_LICENSE_KEY ?? "orbit";
  const SIGNUP_BONUS = Number(process.env.ORBIT_SIGNUP_BONUS ?? 0);

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

  /** Anonymous account (auth disabled): grant the free tier once per account. */
  async function anonAccount(req: Request): Promise<AccountId> {
    const raw = req.header("X-Orbit-Account");
    const account = (typeof raw === "string" && raw.trim()) || "demo";
    if (!seeded.has(account)) {
      seeded.add(account);
      // Idempotent across restarts: only grant if this account never got the
      // free tier before (the in-memory Set alone would re-grant every boot on a
      // persistent DB).
      if (FREE_CREDITS > 0) {
        const granted = (await ledger.history(account)).some(
          (e) => e.reason === "free-tier",
        );
        if (!granted) await ledger.credit(account, FREE_CREDITS, "free-tier");
      }
    }
    return account;
  }

  /**
   * Resolve the billing account for a request. With auth enabled, verifies the
   * bearer token (401 + returns null if missing/invalid). With auth disabled,
   * uses the anonymous account. Callers must `return` when this returns null.
   */
  async function accountOf(
    req: Request,
    res: Response,
  ): Promise<AccountId | null> {
    if (!auth) return anonAccount(req);
    const header = req.header("Authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const user = token ? await auth.adapter.verify(token) : null;
    if (!user) {
      res.status(401).json({ error: "authentication required" });
      return null;
    }
    return makeAccountId(LICENSE_KEY, user.endUserId);
  }

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
    res.json({
      ok: true,
      service: "orbit-render",
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
       * Metering, OFF by default and deliberately so.
       *
       * The app is guest-first ("No Login Required" on onboarding), so this
       * route cannot start demanding a token — that was settled, and this does
       * not reopen it. What it adds is the ability to PRICE a render for
       * deployments that need one: set ORBIT_RENDER_COST and exports draw on
       * the same ledger the AI routes use, resolved through the same
       * `accountOf` (a verified user where auth is configured, the anonymous
       * per-device account otherwise). Left at 0, every byte of this is inert
       * and the route behaves exactly as before.
       */
      let account: AccountId | null = null;
      if (RENDER_COST > 0) {
        account = await accountOf(req, res);
        if (!account) return;
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
        if (account)
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
          const id = `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
          const job = await queue.enqueue(id, project, body?.output);
          res.status(202).json({ id: job.id, status: job.status });
          return;
        }
        const job = jobs.start((markRunning) =>
          render(project, body?.output, markRunning).then(settle),
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
  const WORKER_POLL_MS = Math.max(
    250,
    Number(process.env.ORBIT_WORKER_POLL_MS ?? 2000),
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
        // A long encode has to keep saying it is alive, or the stale sweep
        // hands its job to someone else and it gets rendered twice.
        const beat = setInterval(() => {
          void q.heartbeat(job.id).catch(() => undefined);
        }, 30_000);
        try {
          const url = await render(
            job.project as VideoProject,
            job.output as ExportOutput | undefined,
          );
          await q.finish(job.id, url);
        } catch (err) {
          await q
            .fail(job.id, err instanceof Error ? err.message : String(err))
            .catch(() => undefined);
        } finally {
          clearInterval(beat);
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
    process.once("SIGTERM", () => {
      stopping = true;
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
    const job = queue
      ? await queue.get(req.params.id)
      : jobs.get(req.params.id);
    if (!job) {
      res.status(404).json({ error: "no such render job" });
      return;
    }
    res.json({
      id: job.id,
      status: job.status,
      url: job.url,
      error: job.error,
      elapsedMs: (job.finishedAt ?? Date.now()) - job.createdAt,
    });
  });

  app.get("/v1/credits", async (req: Request, res: Response) => {
    const account = await accountOf(req, res);
    if (!account) return;
    res.json({ balance: await ledger.balance(account) });
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
    // Where the reset token is delivered: a deep link / web page base if set, else
    // the token is emailed for the user to paste into the app's reset screen.
    const resetUrlBase = process.env.EMAIL_RESET_URL_BASE; // e.g. "orbit://reset" or "https://…/reset"

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
          await mailer.send({
            to: reset.user.email!,
            subject: "Reset your Orbit password",
            text:
              `You asked to reset your Orbit password.\n\n` +
              (link
                ? `Open this link to continue:\n${link}\n\n`
                : `Enter this code in the app to continue:\n\n${reset.token}\n\n`) +
              `This link expires in 1 hour. If you didn't request it, you can ignore this email.`,
          });
        }
        res.json({ ok: true });
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
  app.post("/v1/billing/webhook", async (req: Request, res: Response) => {
    const secret = process.env.REVENUECAT_WEBHOOK_AUTH;
    if (secret && req.header("Authorization") !== secret) {
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
    const already = (await ledger.history(account)).some(
      (e) =>
        e.reason === "purchase" &&
        (e.meta as { txId?: string } | undefined)?.txId === txId,
    );
    if (!already)
      await ledger.credit(account, amount, "purchase", {
        txId,
        productId: event.product_id,
      });
    res.json({ ok: true, balance: await ledger.balance(account) });
  });

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

  return app;
}
