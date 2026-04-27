/**
 * GifEncoder — Client-side GIF export using modern-gif
 * Limited to 5s max at 15fps for performance
 */

export interface GifEncodeOptions {
  canvas: HTMLCanvasElement;
  duration: number;
  fps?: number;
  scale?: number;
  trim?: { start: number; end: number };
  onProgress?: (frame: number, total: number) => void;
  signal?: AbortSignal;
}

export class GifEncoder {
  private readonly MAX_DURATION = 5;
  private readonly MAX_FPS = 15;

  async encode(options: GifEncodeOptions): Promise<Blob> {
    const { canvas, duration, fps = 15, scale = 0.5, trim, onProgress, signal } = options;

    // Clamp to limits
    const effectiveDuration = Math.min((trim?.end ?? duration) - (trim?.start ?? 0), this.MAX_DURATION);
    const effectiveFps = Math.min(fps, this.MAX_FPS);
    const totalFrames = Math.ceil(effectiveDuration * effectiveFps);

    const offscreen = document.createElement('canvas');
    offscreen.width = Math.round(canvas.width * scale);
    offscreen.height = Math.round(canvas.height * scale);
    const ctx = offscreen.getContext('2d')!;

    // Collect frames as ImageData (GIF encoder needs this)
    const frames: ImageData[] = [];

    for (let i = 0; i < totalFrames; i++) {
      if (signal?.aborted) throw new Error('GIF encode aborted');

      // Simple capture (no video sync for GIF — use current canvas state)
      ctx.drawImage(canvas, 0, 0, offscreen.width, offscreen.height);
      frames.push(ctx.getImageData(0, 0, offscreen.width, offscreen.height));

      onProgress?.(i + 1, totalFrames);

      if (i % 4 === 0) {
        await new Promise((r) => requestAnimationFrame(r));
      }
    }

    // Use dynamic import for modern-gif
    const { encode } = await import('modern-gif');

    const gif = await encode({
      width: offscreen.width,
      height: offscreen.height,
      frames: frames.map((frame) => ({
        data: frame.data,
        delay: Math.round(1000 / effectiveFps),
      })),
    });

    return new Blob([gif], { type: 'image/gif' });
  }

  getLimits(): { maxDuration: number; maxFps: number } {
    return { maxDuration: this.MAX_DURATION, maxFps: this.MAX_FPS };
  }
}
