/**
 * HTTP render service: wraps the headless `@orbit/video` engine so any client
 * (the iOS app, web, a webhook) can render a video server-side with ffmpeg.
 *
 * Endpoints:
 *   GET  /health
 *   POST /v1/render   { project }          → { url }   render a VideoProject
 *   POST /v1/generate { prompt, music? }   → { url, template }   describe → video (needs GEMINI_API_KEY)
 *
 * Rendered files are served from /files so clients play a URL (no need to hold
 * the request open or stream bytes). Production: validate the license key
 * (`@orbit/billing`), store output in R2 + return a signed URL, and queue long
 * renders (BullMQ) instead of rendering inline.
 */
import express, { type Express, type Request, type Response } from 'express';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderProject, type VideoProject } from '@orbit/video';
import { buildProjectFromSpec, createGeminiBrain, generateVideoSpec } from '@orbit/video-ai';

export function createServer(): Express {
  const app = express();
  app.use(express.json({ limit: '8mb' }));

  const outDir = join(tmpdir(), 'orbit-render-outputs');
  let counter = 0;

  // Serve rendered MP4s so clients can play them by URL.
  app.use('/files', express.static(outDir));

  async function render(project: VideoProject): Promise<string> {
    await mkdir(outDir, { recursive: true });
    const name = `v_${++counter}_${Date.now()}.mp4`;
    await renderProject(project, { outputPath: join(outDir, name) });
    return `/files/${name}`;
  }

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'orbit-render' });
  });

  app.post('/v1/render', async (req: Request, res: Response) => {
    const project = (req.body as { project?: VideoProject } | undefined)?.project;
    if (!project || (!Array.isArray(project.clips) && !Array.isArray(project.overlays))) {
      res.status(400).json({ error: 'request body must be { project: VideoProject }' });
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
