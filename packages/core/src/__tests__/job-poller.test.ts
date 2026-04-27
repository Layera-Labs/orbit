import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExportJobPoller } from '../video-export/job-poller';
import type { ExportJob } from '@orbit/shared';

describe('ExportJobPoller', () => {
  let onStatus: ReturnType<typeof vi.fn>;
  let onError: ReturnType<typeof vi.fn>;
  let poller: ExportJobPoller;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    onStatus = vi.fn();
    onError = vi.fn();
    poller = new ExportJobPoller(onStatus, onError);
  });

  afterEach(() => {
    poller.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('calls onStatus via SSE when job updates', () => {
    const mockEventSource = {
      close: vi.fn(),
      onmessage: null as any,
      onerror: null as any,
    };
    vi.stubGlobal('EventSource', vi.fn(() => mockEventSource));

    poller.start('https://api.orbit.ai/events', 'https://api.orbit.ai/status');

    const job: ExportJob = {
      id: 'job-1',
      status: 'processing',
      progress: 0.5,
      url: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockEventSource.onmessage({ data: JSON.stringify(job) });
    expect(onStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 'job-1', status: 'processing' }));
  });

  it('stops SSE when job completes', () => {
    const mockEventSource = {
      close: vi.fn(),
      onmessage: null as any,
      onerror: null as any,
    };
    vi.stubGlobal('EventSource', vi.fn(() => mockEventSource));

    poller.start('https://api.orbit.ai/events', 'https://api.orbit.ai/status');

    const job: ExportJob = {
      id: 'job-1',
      status: 'done',
      progress: 1,
      url: 'https://cdn.orbit.ai/video.mp4',
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockEventSource.onmessage({ data: JSON.stringify(job) });
    expect(onStatus).toHaveBeenCalled();
    expect(mockEventSource.close).toHaveBeenCalled();
  });

  it('falls back to polling on SSE error', async () => {
    const mockEventSource = {
      close: vi.fn(),
      onmessage: null as any,
      onerror: null as any,
    };
    vi.stubGlobal('EventSource', vi.fn(() => mockEventSource));

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        id: 'job-1',
        status: 'processing',
        progress: 0.3,
        url: null,
        error: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    poller.start('https://api.orbit.ai/events', 'https://api.orbit.ai/status');

    // Trigger SSE error
    mockEventSource.onerror();

    // Fast-forward 2 seconds and flush promises
    await vi.advanceTimersByTimeAsync(2000);

    expect(mockFetch).toHaveBeenCalledWith('https://api.orbit.ai/status');
    expect(onStatus).toHaveBeenCalled();
  });

  it('stops polling when job completes', async () => {
    vi.stubGlobal('EventSource', vi.fn(() => {
      throw new Error('SSE not supported');
    }));

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        id: 'job-1',
        status: 'done',
        progress: 1,
        url: 'https://cdn.orbit.ai/video.mp4',
        error: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    poller.start('https://api.orbit.ai/events', 'https://api.orbit.ai/status');

    await vi.advanceTimersByTimeAsync(2000);
    expect(onStatus).toHaveBeenCalled();

    // Should have stopped polling after done
    await vi.advanceTimersByTimeAsync(4000);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('calls onError when poll fails', async () => {
    vi.stubGlobal('EventSource', vi.fn(() => {
      throw new Error('SSE not supported');
    }));

    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', mockFetch);

    poller.start('https://api.orbit.ai/events', 'https://api.orbit.ai/status');

    await vi.advanceTimersByTimeAsync(2000);

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('ignores parse errors in SSE messages', () => {
    const mockEventSource = {
      close: vi.fn(),
      onmessage: null as any,
      onerror: null as any,
    };
    vi.stubGlobal('EventSource', vi.fn(() => mockEventSource));

    poller.start('https://api.orbit.ai/events', 'https://api.orbit.ai/status');

    mockEventSource.onmessage({ data: 'not-json' });
    expect(onStatus).not.toHaveBeenCalled();
  });

  it('stops cleanly', () => {
    const mockEventSource = {
      close: vi.fn(),
      onmessage: null as any,
      onerror: null as any,
    };
    vi.stubGlobal('EventSource', vi.fn(() => mockEventSource));

    poller.start('https://api.orbit.ai/events', 'https://api.orbit.ai/status');
    poller.stop();

    expect(mockEventSource.close).toHaveBeenCalled();
  });
});
