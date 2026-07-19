/**
 * HTTP render service: wraps the headless `@orbit/video` engine so any client
 * (the iOS app, web, a webhook) can render a video server-side with ffmpeg.
 *
 * Endpoints:
 *   GET  /health
 *   POST /v1/upload         (multipart, field "file") → { id }   store media, return an opaque token
 *   POST /v1/render         { project }               → { url }   render a VideoProject
 *   POST /v1/generate       { prompt, music? }         → { url, template }   describe → video (needs GEMINI_API_KEY)
 *   POST /v1/generate-image { prompt }                 → { url, balance }    generate an image, debit credits (needs RUNWAY_API_TOKEN)
 *   GET  /v1/credits                                   → { balance }         current account credit balance
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
import { mkdir as mkdirAsync } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { renderProject, type ExportOutput, type VideoProject } from '@orbit/video';
import { buildProjectFromSpec, createGeminiBrain, generateVideoSpec } from '@orbit/video-ai';
import { GenerationService, RunwayProvider } from '@orbit/video-gen';
import { InMemoryLedgerStore, InsufficientCreditsError, Ledger, type AccountId } from '@orbit/billing';
import { isClientSrc, makeResolveSrc } from './resolve.js';

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

  // ---- generation + credit metering (in-memory ledger; see header) ----
  const ledger = new Ledger(new InMemoryLedgerStore());
  const gen = new GenerationService(new RunwayProvider({ token: process.env.RUNWAY_API_TOKEN }), ledger);
  const FREE_CREDITS = Number(process.env.ORBIT_FREE_CREDITS ?? 100);
  const seeded = new Set<AccountId>();

  /** Resolve the account for a request and grant the free tier on first touch. */
  async function accountOf(req: Request): Promise<AccountId> {
    const raw = req.header('X-Orbit-Account');
    const account = (typeof raw === 'string' && raw.trim()) || 'demo';
    if (!seeded.has(account)) {
      seeded.add(account);
      if (FREE_CREDITS > 0) await ledger.credit(account, FREE_CREDITS, 'free-tier');
    }
    return account;
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

  app.post('/v1/generate', async (req: Request, res: Response) => {
    const body = req.body as { prompt?: string; music?: string } | undefined;
    if (!body?.prompt) {
      res.status(400).json({ error: 'request body must be { prompt }' });
      return;
    }
    const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
    if (!key) {
      res.status(503).json({ error: 'server is missing GEMINI_API_KEY (or GOOGLE_API_KEY)' });
      return;
    }
    try {
      const spec = await generateVideoSpec(body.prompt, createGeminiBrain({ apiKey: key }));
      const project = buildProjectFromSpec(spec, { music: body.music });
      res.json({ url: await render(project), template: spec.template });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/v1/credits', async (req: Request, res: Response) => {
    const account = await accountOf(req);
    res.json({ balance: await ledger.balance(account) });
  });

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
    const account = await accountOf(req);
    try {
      const result = await gen.generateImage(account, { prompt: body.prompt, width: body.width, height: body.height, model: body.model });
      res.json({ url: result.url, balance: await ledger.balance(account) });
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        res.status(402).json({ error: 'insufficient credits', balance: await ledger.balance(account) });
        return;
      }
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Dev-only credit top-up (production replaces this with a payment webhook).
  if (process.env.ORBIT_DEV_TOPUP === '1') {
    app.post('/v1/credits/grant', async (req: Request, res: Response) => {
      const account = await accountOf(req);
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
