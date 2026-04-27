import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GifEncoder } from '../video-export/gif-encoder';

const mockEncode = vi.fn().mockResolvedValue(new Uint8Array([0x47, 0x49, 0x46]));

vi.mock('modern-gif', () => ({
  encode: (...args: any[]) => mockEncode(...args),
}));

describe('GifEncoder', () => {
  let encoder: GifEncoder;
  let mockCtx: any;

  beforeEach(() => {
    encoder = new GifEncoder();

    mockCtx = {
      drawImage: vi.fn(),
      getImageData: vi.fn().mockReturnValue({
        data: new Uint8ClampedArray(100),
        width: 50,
        height: 50,
      }),
    };

    // Mock ALL canvas getContext calls globally
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((type) => {
      if (type === '2d') return mockCtx;
      return null;
    });

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });

    mockEncode.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns limits', () => {
    expect(encoder.getLimits()).toEqual({ maxDuration: 5, maxFps: 15 });
  });

  it('encodes frames into GIF blob', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;

    const onProgress = vi.fn();
    const blob = await encoder.encode({
      canvas,
      duration: 1,
      fps: 2,
      scale: 0.5,
      onProgress,
    });

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/gif');
    expect(onProgress).toHaveBeenCalled();
    expect(mockEncode).toHaveBeenCalledOnce();
    const encodeArgs = mockEncode.mock.calls[0][0];
    expect(encodeArgs.width).toBe(50);
    expect(encodeArgs.height).toBe(50);
    expect(encodeArgs.frames).toHaveLength(2);
    expect(encodeArgs.frames[0].delay).toBe(500);
  });

  it('clamps duration to max', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;

    await encoder.encode({
      canvas,
      duration: 10,
      fps: 15,
      scale: 0.5,
    });

    const encodeArgs = mockEncode.mock.calls[0][0];
    expect(encodeArgs.frames.length).toBeLessThanOrEqual(75);
  });

  it('clamps fps to max', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;

    await encoder.encode({
      canvas,
      duration: 1,
      fps: 60,
      scale: 0.5,
    });

    const encodeArgs = mockEncode.mock.calls[0][0];
    expect(encodeArgs.frames.length).toBeLessThanOrEqual(15);
  });

  it('respects trim', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;

    await encoder.encode({
      canvas,
      duration: 10,
      fps: 10,
      scale: 0.5,
      trim: { start: 2, end: 3 },
    });

    const encodeArgs = mockEncode.mock.calls[0][0];
    expect(encodeArgs.frames.length).toBe(10);
  });

  it('aborts when signal is triggered', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;

    const controller = new AbortController();
    controller.abort();

    await expect(
      encoder.encode({
        canvas,
        duration: 2,
        fps: 10,
        scale: 0.5,
        signal: controller.signal,
      })
    ).rejects.toThrow('GIF encode aborted');
  });
});
