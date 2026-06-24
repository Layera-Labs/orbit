/**
 * HTTP render service: wraps the headless `@orbit/video` engine so any client
 * (the iOS app, web, a webhook) can POST a video project and get back an MP4.
 * The render runs server-side with ffmpeg — the reliable export spine.
 *
 * Production additions (documented, not wired here): validate the license key
 * (`@orbit/billing`), store output in R2 and return a signed URL instead of the
 * bytes, and queue long renders (BullMQ) rather than holding the request open.
 */
import express, { type Express, type Request, type Response } from 'express';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderProject, type VideoProject } from '@orbit/video';

export function createServer(): Express {
  const app = express();
  app.use(express.json({ limit: '8mb' }));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'orbit-render' });
  });

  app.post('/v1/render', async (req: Request, res: Response) => {
    const project = (req.body as { project?: VideoProject } | undefined)?.project;
    if (!project || (!Array.isArray(project.clips) && !Array.isArray(project.overlays))) {
      res.status(400).json({ error: 'request body must be { project: VideoProject }' });
      return;
    }
    const dir = await mkdtemp(join(tmpdir(), 'orbit-render-'));
    const out = join(dir, 'out.mp4');
    try {
      await renderProject(project, { outputPath: out });
      const buf = await readFile(out);
      res.setHeader('content-type', 'video/mp4');
      res.send(buf);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  return app;
}
