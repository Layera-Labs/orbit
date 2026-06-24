import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFFmpegArgs, type BuildFFmpegOptions } from './ffmpeg';
import { backgroundToSVG } from './background-svg';
import { overlayToSVG } from './overlay-svg';
import { rasterizeSVG } from './raster';
import type { VideoProject } from './types';

export interface RenderOptions extends Omit<BuildFFmpegOptions, 'overlayImages'> {
  /** ffmpeg binary path (default: `ffmpeg` on PATH). Production ships its own. */
  ffmpegPath?: string;
  /** Receives raw ffmpeg stderr chunks (progress lives here). */
  onProgress?: (chunk: string) => void;
}

/**
 * Render a project to `opts.outputPath`: rasterize each text overlay to a PNG,
 * then spawn ffmpeg to composite + encode. Resolves with the output path.
 */
export async function renderProject(project: VideoProject, opts: RenderOptions): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'orbit-video-'));
  try {
    // Clip-less projects (lyric/quote videos) render their background as the base.
    let baseImage: string | undefined;
    if (project.clips.length === 0) {
      baseImage = join(dir, 'background.png');
      await writeFile(baseImage, rasterizeSVG(backgroundToSVG(project.background, project.width, project.height)));
    }
    const overlayImages: Record<string, string> = {};
    for (const overlay of project.overlays) {
      if (overlay.type !== 'text') continue;
      const png = rasterizeSVG(overlayToSVG(overlay, project.width, project.height));
      const path = join(dir, `${overlay.id}.png`);
      await writeFile(path, png);
      overlayImages[overlay.id] = path;
    }
    const args = buildFFmpegArgs(project, { ...opts, overlayImages, baseImage });
    await runFFmpeg(opts.ffmpegPath ?? 'ffmpeg', args, opts.onProgress);
    return opts.outputPath;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runFFmpeg(bin: string, args: string[], onProgress?: (s: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => {
      const s = d.toString();
      stderr += s;
      onProgress?.(s);
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}\n${stderr.slice(-2000)}`));
    });
  });
}
