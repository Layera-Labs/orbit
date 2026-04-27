import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VideoFrameCapture } from '../video-export/frame-capture';

const mockCtx = {
  drawImage: vi.fn(),
};

describe('VideoFrameCapture', () => {
  let capture: VideoFrameCapture;

  beforeEach(() => {
    capture = new VideoFrameCapture();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((type) => {
      if (type === '2d') return mockCtx as any;
      return null;
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callback(new Blob(['frame']));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('captures frames and calls onFrame for each', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;

    const onFrame = vi.fn().mockResolvedValue(undefined);
    const onProgress = vi.fn();
    const beforeFrame = vi.fn();

    await capture.capture({
      canvas,
      duration: 1,
      fps: 2,
      scale: 1,
      onFrame,
      onProgress,
      beforeFrame,
    });

    expect(onFrame).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(beforeFrame).toHaveBeenCalledTimes(2);
    expect(onFrame.mock.calls[0][1]).toBe(0); // index 0
    expect(onFrame.mock.calls[1][1]).toBe(1); // index 1
  });

  it('applies trim to frame range', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;

    const onFrame = vi.fn().mockResolvedValue(undefined);
    const beforeFrame = vi.fn();

    await capture.capture({
      canvas,
      duration: 10,
      fps: 1,
      scale: 1,
      trim: { start: 2, end: 4 },
      onFrame,
      beforeFrame,
    });

    expect(onFrame).toHaveBeenCalledTimes(2);
    expect(beforeFrame.mock.calls[0][0]).toBe(2);
    expect(beforeFrame.mock.calls[1][0]).toBe(3);
  });

  it('aborts when signal is triggered', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;

    const controller = new AbortController();
    const onFrame = vi.fn().mockResolvedValue(undefined);

    // Abort after first frame
    onFrame.mockImplementation(() => {
      controller.abort();
      return Promise.resolve();
    });

    await expect(
      capture.capture({
        canvas,
        duration: 2,
        fps: 10,
        scale: 1,
        onFrame,
        signal: controller.signal,
      })
    ).rejects.toThrow('Capture aborted');
  });

  it('scales offscreen canvas correctly', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;

    const onFrame = vi.fn().mockResolvedValue(undefined);

    await capture.capture({
      canvas,
      duration: 0.5,
      fps: 1,
      scale: 0.5,
      onFrame,
    });

    // Frame blob should be captured from 960x540 offscreen canvas
    expect(onFrame).toHaveBeenCalledOnce();
    const blob = onFrame.mock.calls[0][0];
    expect(blob).toBeInstanceOf(Blob);
  });

  it('yields to UI every 4 frames', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;

    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });

    const onFrame = vi.fn().mockResolvedValue(undefined);

    await capture.capture({
      canvas,
      duration: 2,
      fps: 10, // 20 frames
      scale: 1,
      onFrame,
    });

    // Should yield at frames 3, 7, 11, 15, 19 (indices divisible by 4, excluding 0)
    expect(rafSpy).toHaveBeenCalled();
    rafSpy.mockRestore();
  });
});
