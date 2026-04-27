import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PreviewRecorder } from '../video-export/preview-recorder';

describe('PreviewRecorder', () => {
  let recorder: PreviewRecorder;
  let mockMediaRecorder: any;
  let mockStream: any;

  beforeEach(() => {
    recorder = new PreviewRecorder();

    mockMediaRecorder = {
      state: 'inactive',
      start: vi.fn(function () { this.state = 'recording'; }),
      stop: vi.fn(function () {
        this.state = 'inactive';
        if (this.onstop) this.onstop();
      }),
      ondataavailable: null as any,
      onstop: null as any,
    };

    mockStream = { getTracks: vi.fn(() => []) };

    vi.stubGlobal('MediaRecorder', vi.fn(() => mockMediaRecorder));

    HTMLCanvasElement.prototype.captureStream = vi.fn(() => mockStream) as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts recording and calls onBlob on stop', () => {
    const onBlob = vi.fn();
    const canvas = document.createElement('canvas');

    recorder.start({ canvas, duration: 1, fps: 30, onBlob });

    expect(MediaRecorder).toHaveBeenCalledWith(mockStream, {
      mimeType: 'video/webm;codecs=vp9',
    });
    expect(mockMediaRecorder.start).toHaveBeenCalled();
    expect(recorder.isRecording()).toBe(true);

    // Simulate data
    mockMediaRecorder.ondataavailable({ data: new Blob(['chunk1']) });
    mockMediaRecorder.ondataavailable({ data: new Blob(['chunk2']) });

    // Simulate stop
    mockMediaRecorder.stop();

    expect(onBlob).toHaveBeenCalledOnce();
    const blob = onBlob.mock.calls[0][0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('video/webm');
  });

  it('respects trim', () => {
    vi.useFakeTimers();
    const canvas = document.createElement('canvas');

    recorder.start({
      canvas,
      duration: 10,
      fps: 30,
      trim: { start: 2, end: 4 },
    });

    expect(mockMediaRecorder.start).toHaveBeenCalled();

    // Should stop after 2 seconds (4-2)
    vi.advanceTimersByTime(2000);
    expect(mockMediaRecorder.stop).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('stops manually', () => {
    const canvas = document.createElement('canvas');
    recorder.start({ canvas, duration: 5, fps: 30 });
    expect(recorder.isRecording()).toBe(true);

    recorder.stop();
    expect(mockMediaRecorder.stop).toHaveBeenCalled();
  });

  it('does not double-stop', () => {
    const canvas = document.createElement('canvas');
    recorder.start({ canvas, duration: 5, fps: 30 });

    recorder.stop();
    recorder.stop();
    expect(mockMediaRecorder.stop).toHaveBeenCalledTimes(1);
  });

  it('returns false for isRecording when not started', () => {
    expect(recorder.isRecording()).toBe(false);
  });
});
