/**
 * VideoFrameCapture — Captures canvas frames at exact timestamps for video export
 * Streams frames immediately (no memory buffering)
 */

export interface FrameCaptureOptions {
  canvas: HTMLCanvasElement;
  duration: number; // seconds
  fps: number;
  scale: number;
  trim?: { start: number; end: number };
  onFrame: (blob: Blob, index: number, total: number) => Promise<void>;
  onProgress?: (frame: number, total: number) => void;
  beforeFrame?: (time: number) => void | Promise<void>;
  signal?: AbortSignal;
}

export class VideoFrameCapture {
  async capture(options: FrameCaptureOptions): Promise<void> {
    const { canvas, duration, fps, scale, trim, onFrame, onProgress, signal } = options;

    const startTime = trim?.start ?? 0;
    const endTime = trim?.end ?? duration;
    const captureDuration = endTime - startTime;
    const totalFrames = Math.ceil(captureDuration * fps);
    const frameInterval = 1 / fps;

    const offscreen = document.createElement('canvas');
    offscreen.width = Math.round(canvas.width * scale);
    offscreen.height = Math.round(canvas.height * scale);
    const ctx = offscreen.getContext('2d');
    if (!ctx) throw new Error('Failed to create offscreen canvas context');

    for (let i = 0; i < totalFrames; i++) {
      if (signal?.aborted) throw new Error('Capture aborted');

      const time = startTime + i * frameInterval;

      // Allow caller to prepare frame (e.g. apply transitions)
      if (options.beforeFrame) {
        await options.beforeFrame(time);
      }

      // Seek all video elements on the canvas to this time
      await this.seekVideoLayers(canvas, time);

      // Capture frame
      ctx.drawImage(canvas, 0, 0, offscreen.width, offscreen.height);

      // Convert to blob
      const blob = await new Promise<Blob>((resolve) => {
        offscreen.toBlob((b) => resolve(b!), 'image/png', 1);
      });

      // Upload immediately
      await onFrame(blob, i, totalFrames);

      onProgress?.(i + 1, totalFrames);

      // Allow UI to breathe
      if (i % 4 === 0) {
        await new Promise((r) => requestAnimationFrame(r));
      }
    }
  }

  private async seekVideoLayers(canvas: HTMLCanvasElement, time: number): Promise<void> {
    // Find all video elements under the canvas container
    const container = canvas.parentElement;
    if (!container) return;

    const videos = container.querySelectorAll('video');
    const promises: Promise<void>[] = [];

    for (const video of videos) {
      if (video.readyState >= 2) {
        promises.push(
          new Promise<void>((resolve) => {
            const onSeeked = () => {
              video.removeEventListener('seeked', onSeeked);
              resolve();
            };
            video.addEventListener('seeked', onSeeked);
            video.currentTime = Math.min(time, video.duration || 0);
            // Fallback if seeked doesn't fire
            setTimeout(() => {
              video.removeEventListener('seeked', onSeeked);
              resolve();
            }, 100);
          })
        );
      }
    }

    await Promise.all(promises);
  }
}
