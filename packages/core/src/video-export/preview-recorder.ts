/**
 * PreviewRecorder — Records canvas preview using MediaRecorder + captureStream
 * Outputs WebM for instant review before export
 */

export interface PreviewOptions {
  canvas: HTMLCanvasElement;
  duration: number;
  fps?: number;
  trim?: { start: number; end: number };
  onBlob?: (blob: Blob) => void;
}

export class PreviewRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  start(options: PreviewOptions): void {
    const { canvas, duration, fps = 30, trim } = options;
    const stream = canvas.captureStream(fps);

    this.chunks = [];
    this.recorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
    });

    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    this.recorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: 'video/webm' });
      options.onBlob?.(blob);
    };

    const captureDuration = ((trim?.end ?? duration) - (trim?.start ?? 0)) * 1000;

    this.recorder.start();
    this.timer = setTimeout(() => {
      this.stop();
    }, captureDuration);
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop();
    }
  }

  isRecording(): boolean {
    return this.recorder?.state === 'recording' || false;
  }
}
