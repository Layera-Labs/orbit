/**
 * HTTP render service: wraps the headless `@orbit/video` engine so any client
 * (the iOS app, web, a webhook) can render a video server-side with ffmpeg.
 *
 * Endpoints:
 *   GET  /health
 *   POST /v1/upload   (multipart, field "file")  → { id }   store media, return an opaque token
 *   POST /v1/render   { project }                → { url }   render a VideoProject
 *   POST /v1/generate { prompt, music? }         → { url, template }   describe → video (needs GEMINI_API_KEY)
 *
 * Clients can't reach phone-local files, so they upload media first and reference
 * it in `clip.src` / `audio.src` as the returned `upload:<id>` token. `resolveSrc`
 * maps those tokens back to files INSIDE the media dir — a client can never put an
 * arbitrary filesystem path into ffmpeg. Rendered files are served from /files.
 * Production: license check (`@orbit/billing`), R2 storage + signed URLs, BullMQ.
 */
import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import multer from 'multer';
import { mkdir, mkdirSync } from 'node:fs';
import { mkdir as mkdirAsync } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { renderProject, type VideoProject } from '@orbit/video';
import { buildProjectFromSpec, createGeminiBrain, generateVideoSpec } from '@orbit/video-ai';
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

  async function render(project: VideoProject): Promise<string> {
    await mkdirAsync(outDir, { recursive: true });
    const name = `v_${++counter}_${Date.now()}.mp4`;
    await renderProject(project, { outputPath: join(outDir, name), resolveSrc });
    return `/files/${name}`;
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
    const project = (req.body as { project?: VideoProject } | undefined)?.project;
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
      res.json({ url: await render(project) });
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

  return app;
}
