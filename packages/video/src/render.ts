import { spawn } from 'node:child_process';
import { buildFFmpegArgs, type BuildFFmpegOptions } from './ffmpeg';
import type { VideoProject } from './types';

export interface RenderOptions extends BuildFFmpegOptions {
  /** ffmpeg binary path (default: `ffmpeg` on PATH). Production ships its own. */
  ffmpegPath?: string;
  /** Receives raw ffmpeg stderr chunks (progress lives here). */
  onProgress?: (chunk: string) => void;
}

/**
 * Render a project to `opts.outputPath` by spawning ffmpeg. Resolves with the
 * output path on success, rejects with the tail of stderr on failure.
 */
export function renderProject(project: VideoProject, opts: RenderOptions): Promise<string> {
  const args = buildFFmpegArgs(project, opts);
  const bin = opts.ffmpegPath ?? 'ffmpeg';
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => {
      const s = d.toString();
      stderr += s;
      opts.onProgress?.(s);
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve(opts.outputPath);
      else reject(new Error(`ffmpeg exited with code ${code}\n${stderr.slice(-2000)}`));
    });
  });
}
