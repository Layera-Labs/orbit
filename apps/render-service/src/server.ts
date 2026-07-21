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
import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import multer from 'multer';
import { mkdir, mkdirSync } from 'node:fs';
import { mkdir as mkdirAsync, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { renderProject, type ExportOutput, type VideoProject } from '@orbit/video';
import { ElevenLabsProvider, GenerationService, RunwayProvider } from '@orbit/video-gen';
import { InMemoryLedgerStore, InsufficientCreditsError, Ledger, makeAccountId, type AccountId, type LedgerStore } from '@orbit/billing';
import { authFromEnv, AuthError, type UserStore } from '@orbit/auth';
import { isClientSrc, makeResolveSrc } from './resolve.js';
import { PgLedgerStore, PgUserStore, makePgPool } from './pg-store.js';
import { InMemoryUserStore } from './user-store.js';

export function createServer(): Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '8mb' }));

  const outDir = join(tmpdir(), 'orbit-render-outputs');
  const mediaDir = join(tmpdir(), 'orbit-render-media');
  mkdirSync(outDir, { recursive: true });
  mkdirSync(mediaDir, { recursive: true });
  const resolveSrc = makeResolveSrc(mediaDir);
  let counter = 0;
  let mediaCounter = 0;

  /**
   * Turn a client-supplied source image into something the generation provider
   * can consume for image→video. `data:`/`http(s)` pass through; an
   * `upload:<id>` token (from /v1/upload) is read from the media dir and inlined
   * as a data URI (the provider can't fetch our private upload store, and in dev
   * it can't reach localhost). Throws on anything else.
   */
  async function resolveProviderImage(image?: string): Promise<string | undefined> {
    if (!image) return undefined;
    if (/^data:/.test(image) || /^https?:\/\//.test(image)) return image;
    const path = resolveSrc(image); // throws if the token escapes the media dir
    const buf = await readFile(path);
    const ext = extname(path).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  }

  /** Write a base64 audio data URI to the served output dir, returning its
   *  /files URL; pass through anything already fetchable. */
  async function materializeAudio(url: string): Promise<string> {
    const m = /^data:audio\/[\w.+-]+;base64,(.*)$/s.exec(url);
    if (!m) return url;
    await mkdirAsync(outDir, { recursive: true });
    const name = `tts_${++counter}_${Date.now()}.mp3`;
    await writeFile(join(outDir, name), Buffer.from(m[1], 'base64'));
    return `/files/${name}`;
  }

  // Serve rendered MP4s so clients can play them by URL.
  app.use('/files', express.static(outDir));

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => mkdir(mediaDir, { recursive: true }, (e) => cb(e, mediaDir)),
      filename: (_req, file, cb) => cb(null, `u_${++mediaCounter}_${Date.now()}${extname(file.originalname) || '.bin'}`),
    }),
    limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  });

  async function render(project: VideoProject, output?: ExportOutput): Promise<string> {
    await mkdirAsync(outDir, { recursive: true });
    const name = `v_${++counter}_${Date.now()}.mp4`;
    await renderProject(project, { outputPath: join(outDir, name), resolveSrc, output });
    return `/files/${name}`;
  }

  // ---- generation + credit metering ----
  // Durable storage is Postgres (Neon / Supabase / any Postgres URL) via
  // DATABASE_URL — credits + self-hosted users live in the database, never on a
  // local disk. Without DATABASE_URL storage is in-memory and EPHEMERAL, for
  // automated tests and throwaway local runs only.
  let ledgerStore: LedgerStore;
  let userStore: UserStore;
  if (process.env.DATABASE_URL) {
    const pool = makePgPool(process.env.DATABASE_URL);
    ledgerStore = new PgLedgerStore(pool);
    userStore = new PgUserStore(pool);
  } else {
    console.warn('[orbit] no DATABASE_URL — using in-memory storage (ephemeral; credits and accounts reset on restart)');
    ledgerStore = new InMemoryLedgerStore();
    userStore = new InMemoryUserStore();
  }
  const ledger = new Ledger(ledgerStore);
  const gen = new GenerationService(new RunwayProvider({ token: process.env.RUNWAY_API_TOKEN }), ledger);
  // TTS runs through a separate provider (ElevenLabs) but the same metered ledger.
  const ttsGen = new GenerationService(
    new ElevenLabsProvider({ apiKey: process.env.ELEVENLABS_API_KEY, voiceId: process.env.ELEVENLABS_VOICE_ID, model: process.env.ELEVENLABS_MODEL }),
    ledger,
  );
  const FREE_CREDITS = Number(process.env.ORBIT_FREE_CREDITS ?? 100);
  const seeded = new Set<AccountId>();

  // ---- auth (pluggable) ----
  // When ORBIT_AUTH_PROVIDER is set, AI/credit routes require a verified bearer
  // token and the account is `licenseKey:endUserId`. When unset, auth is disabled
  // and we fall back to the anonymous per-device account (local/dev).
  const auth = authFromEnv(process.env, { userStore });
  const LICENSE_KEY = process.env.ORBIT_LICENSE_KEY ?? 'orbit';
  const SIGNUP_BONUS = Number(process.env.ORBIT_SIGNUP_BONUS ?? 0);

  // ---- purchases: RevenueCat product id → credits granted ----
  // Override with ORBIT_CREDIT_PACKS (JSON, e.g. {"credits_500":550}). The store
  // product ids must match what's configured in RevenueCat / the app stores.
  const DEFAULT_CREDIT_PACKS: Record<string, number> = { credits_100: 100, credits_500: 550, credits_1200: 1400 };
  const CREDIT_PACKS: Record<string, number> = (() => {
    try {
      return process.env.ORBIT_CREDIT_PACKS ? { ...DEFAULT_CREDIT_PACKS, ...(JSON.parse(process.env.ORBIT_CREDIT_PACKS) as Record<string, number>) } : DEFAULT_CREDIT_PACKS;
    } catch {
      return DEFAULT_CREDIT_PACKS;
    }
  })();

  /** Anonymous account (auth disabled): grant the free tier once per account. */
  async function anonAccount(req: Request): Promise<AccountId> {
    const raw = req.header('X-Orbit-Account');
    const account = (typeof raw === 'string' && raw.trim()) || 'demo';
    if (!seeded.has(account)) {
      seeded.add(account);
      // Idempotent across restarts: only grant if this account never got the
      // free tier before (the in-memory Set alone would re-grant every boot on a
      // persistent DB).
      if (FREE_CREDITS > 0) {
        const granted = (await ledger.history(account)).some((e) => e.reason === 'free-tier');
        if (!granted) await ledger.credit(account, FREE_CREDITS, 'free-tier');
      }
    }
    return account;
  }

  /**
   * Resolve the billing account for a request. With auth enabled, verifies the
   * bearer token (401 + returns null if missing/invalid). With auth disabled,
   * uses the anonymous account. Callers must `return` when this returns null.
   */
  async function accountOf(req: Request, res: Response): Promise<AccountId | null> {
    if (!auth) return anonAccount(req);
    const header = req.header('Authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const user = token ? await auth.adapter.verify(token) : null;
    if (!user) {
      res.status(401).json({ error: 'authentication required' });
      return null;
    }
    return makeAccountId(LICENSE_KEY, user.endUserId);
  }

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'orbit-render' });
  });

  app.post('/v1/upload', upload.single('file'), (req: Request, res: Response) => {
    const file = (req as Request & { file?: { filename: string } }).file;
    if (!file) {
      res.status(400).json({ error: 'multipart upload must include a "file" field' });
      return;
    }
    res.json({ id: `upload:${file.filename}` });
  });

  app.post('/v1/render', async (req: Request, res: Response) => {
    const body = req.body as { project?: VideoProject; output?: ExportOutput } | undefined;
    const project = body?.project;
    if (!project || (!Array.isArray(project.clips) && !Array.isArray(project.overlays))) {
      res.status(400).json({ error: 'request body must be { project: VideoProject }' });
      return;
    }
    const srcs = [...(project.clips ?? []).map((c) => c.src), ...(project.audio ?? []).map((a) => a.src)];
    const bad = srcs.find((s) => !isClientSrc(s));
    if (bad !== undefined) {
      res.status(400).json({ error: `src must be an upload token or http(s) URL: ${bad}` });
      return;
    }
    try {
      res.json({ url: await render(project, body?.output) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/v1/credits', async (req: Request, res: Response) => {
    const account = await accountOf(req, res);
    if (!account) return;
    res.json({ balance: await ledger.balance(account) });
  });

  // ---- self-hosted auth (register / login) ----
  // Only mounted when ORBIT_AUTH_PROVIDER=selfhosted. Managed providers
  // (clerk/supabase/firebase) sign in on the client and forward their token.
  if (auth?.selfHosted) {
    const selfHosted = auth.selfHosted;
    const creds = (req: Request) => (req.body ?? {}) as { email?: string; password?: string };

    app.post('/v1/auth/register', async (req: Request, res: Response) => {
      const { email, password } = creds(req);
      if (!email || !password) {
        res.status(400).json({ error: 'email and password are required' });
        return;
      }
      try {
        const result = await selfHosted.register(email, password);
        const account = makeAccountId(LICENSE_KEY, result.user.endUserId);
        // Dev-configurable signup bonus (off by default) — the only place a new
        // account gets free credits under auth.
        if (result.isNew && SIGNUP_BONUS > 0) await ledger.credit(account, SIGNUP_BONUS, 'signup-bonus');
        res.json({ token: result.token, user: result.user, balance: await ledger.balance(account) });
      } catch (err) {
        if (err instanceof AuthError) {
          res.status(err.kind === 'email-taken' ? 409 : 400).json({ error: err.message, kind: err.kind });
          return;
        }
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    app.post('/v1/auth/login', async (req: Request, res: Response) => {
      const { email, password } = creds(req);
      if (!email || !password) {
        res.status(400).json({ error: 'email and password are required' });
        return;
      }
      try {
        const result = await selfHosted.login(email, password);
        const account = makeAccountId(LICENSE_KEY, result.user.endUserId);
        res.json({ token: result.token, user: result.user, balance: await ledger.balance(account) });
      } catch (err) {
        if (err instanceof AuthError) {
          res.status(401).json({ error: err.message, kind: err.kind });
          return;
        }
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });
  }

  app.post('/v1/generate-image', async (req: Request, res: Response) => {
    const body = req.body as { prompt?: string; width?: number; height?: number; model?: string } | undefined;
    if (!body?.prompt) {
      res.status(400).json({ error: 'request body must be { prompt }' });
      return;
    }
    if (!process.env.RUNWAY_API_TOKEN) {
      res.status(503).json({ error: 'server is missing RUNWAY_API_TOKEN' });
      return;
    }
    const account = await accountOf(req, res);
    if (!account) return;
    // Abort the (long-polling) generation if the client disconnects before we
    // respond — nothing is charged, since the service debits only on success.
    const ac = new AbortController();
    req.on('close', () => { if (!res.writableEnded) ac.abort(); });
    try {
      const result = await gen.generateImage(account, { prompt: body.prompt, width: body.width, height: body.height, model: body.model, signal: ac.signal });
      res.json({ url: result.url, balance: await ledger.balance(account) });
    } catch (err) {
      if (ac.signal.aborted) return; // client disconnected — nothing to send
      if (err instanceof InsufficientCreditsError) {
        res.status(402).json({ error: 'insufficient credits', balance: await ledger.balance(account) });
        return;
      }
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/v1/generate-video', async (req: Request, res: Response) => {
    const body = req.body as { prompt?: string; width?: number; height?: number; durationSec?: number; image?: string; model?: string; audio?: boolean } | undefined;
    if (!body?.prompt) {
      res.status(400).json({ error: 'request body must be { prompt }' });
      return;
    }
    if (!process.env.RUNWAY_API_TOKEN) {
      res.status(503).json({ error: 'server is missing RUNWAY_API_TOKEN' });
      return;
    }
    const account = await accountOf(req, res);
    if (!account) return;
    let image: string | undefined;
    try {
      image = await resolveProviderImage(body.image);
    } catch {
      res.status(400).json({ error: 'invalid source image' });
      return;
    }
    const ac = new AbortController();
    req.on('close', () => { if (!res.writableEnded) ac.abort(); });
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
      res.json({ url: result.url, audioUrl: result.meta?.audioUrl, balance: await ledger.balance(account) });
    } catch (err) {
      if (ac.signal.aborted) return; // client disconnected — nothing to send
      if (err instanceof InsufficientCreditsError) {
        res.status(402).json({ error: 'insufficient credits', balance: await ledger.balance(account) });
        return;
      }
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/v1/tts', async (req: Request, res: Response) => {
    const body = req.body as { text?: string; voice?: string } | undefined;
    if (!body?.text?.trim()) {
      res.status(400).json({ error: 'request body must be { text }' });
      return;
    }
    if (!process.env.ELEVENLABS_API_KEY) {
      res.status(503).json({ error: 'server is missing ELEVENLABS_API_KEY' });
      return;
    }
    const account = await accountOf(req, res);
    if (!account) return;
    const ac = new AbortController();
    req.on('close', () => { if (!res.writableEnded) ac.abort(); });
    try {
      const result = await ttsGen.tts(account, { text: body.text, voice: body.voice, signal: ac.signal });
      const url = await materializeAudio(result.url); // data URI → served /files URL
      res.json({ url, balance: await ledger.balance(account) });
    } catch (err) {
      if (ac.signal.aborted) return; // client disconnected — nothing to send
      if (err instanceof InsufficientCreditsError) {
        res.status(402).json({ error: 'insufficient credits', balance: await ledger.balance(account) });
        return;
      }
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ---- RevenueCat purchase webhook ----
  // Server-to-server: RevenueCat calls this when a purchase settles. Authenticated
  // by a shared secret (REVENUECAT_WEBHOOK_AUTH, set in the RevenueCat dashboard),
  // NOT the user bearer token. Credits the buyer's account by the pack size, once
  // per transaction (idempotent — RevenueCat may retry).
  app.post('/v1/billing/webhook', async (req: Request, res: Response) => {
    const secret = process.env.REVENUECAT_WEBHOOK_AUTH;
    if (secret && req.header('Authorization') !== secret) {
      res.status(401).json({ error: 'invalid webhook signature' });
      return;
    }
    const event = (req.body as { event?: { type?: string; app_user_id?: string; product_id?: string; transaction_id?: string; id?: string } } | undefined)?.event;
    if (!event?.type) {
      res.status(400).json({ error: 'missing event' });
      return;
    }
    // Only these event types represent a completed, credit-granting purchase.
    const GRANTING = new Set(['INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE', 'RENEWAL']);
    const amount = event.product_id ? CREDIT_PACKS[event.product_id] : undefined;
    const txId = event.transaction_id ?? event.id;
    if (!GRANTING.has(event.type) || !event.app_user_id || !amount || !txId) {
      res.json({ ok: true, ignored: true }); // ack non-granting / unknown events so RevenueCat stops retrying
      return;
    }
    const account = makeAccountId(LICENSE_KEY, event.app_user_id);
    const already = (await ledger.history(account)).some((e) => e.reason === 'purchase' && (e.meta as { txId?: string } | undefined)?.txId === txId);
    if (!already) await ledger.credit(account, amount, 'purchase', { txId, productId: event.product_id });
    res.json({ ok: true, balance: await ledger.balance(account) });
  });

  // Dev-only credit top-up (production replaces this with a payment webhook).
  if (process.env.ORBIT_DEV_TOPUP === '1') {
    app.post('/v1/credits/grant', async (req: Request, res: Response) => {
      const account = await accountOf(req, res);
      if (!account) return;
      const amount = Number((req.body as { amount?: number } | undefined)?.amount ?? 100);
      if (!Number.isFinite(amount) || amount <= 0) {
        res.status(400).json({ error: 'amount must be a positive number' });
        return;
      }
      await ledger.credit(account, amount, 'dev-topup');
      res.json({ balance: await ledger.balance(account) });
    });
  }

  return app;
}
