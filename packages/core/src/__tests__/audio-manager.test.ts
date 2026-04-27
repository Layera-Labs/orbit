import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioManager } from '../audio-manager';

describe('AudioManager', () => {
  let manager: AudioManager;
  let mockAudioElements: Map<string, any>;

  beforeEach(() => {
    mockAudioElements = new Map();

    // Mock HTMLAudioElement
    vi.stubGlobal('Audio', vi.fn((src: string) => {
      const el = {
        src,
        crossOrigin: '',
        volume: 1,
        muted: false,
        loop: false,
        currentTime: 0,
        duration: 30,
        readyState: 4,
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        addEventListener: vi.fn((event: string, handler: Function) => {
          if (event === 'canplaythrough') {
            // Simulate immediate load
            setTimeout(() => handler(), 0);
          }
        }),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
      mockAudioElements.set(src, el);
      return el;
    }));

    manager = new AudioManager();
  });

  afterEach(() => {
    manager.destroy();
    vi.restoreAllMocks();
  });

  it('adds a track and returns its ID', async () => {
    await manager.addTrack('track-1', 'https://example.com/audio.mp3');
    expect(manager.getTrackIds()).toContain('track-1');
    const track = manager.getTrack('track-1');
    expect(track).toBeDefined();
    expect(track!.volume).toBe(1);
    expect(track!.muted).toBe(false);
  });

  it('adds track with options', async () => {
    await manager.addTrack('track-1', 'https://example.com/audio.mp3', {
      volume: 0.5,
      muted: true,
      loop: true,
      trim: { start: 5, end: 20 },
    });

    const track = manager.getTrack('track-1');
    expect(track!.volume).toBe(0.5);
    expect(track!.muted).toBe(true);
    expect(track!.loop).toBe(true);
    expect(track!.trimStart).toBe(5);
    expect(track!.trimEnd).toBe(20);
  });

  it('removes a track', async () => {
    await manager.addTrack('track-1', 'https://example.com/audio.mp3');
    manager.removeTrack('track-1');
    expect(manager.getTrackIds()).not.toContain('track-1');
  });

  it('updates track settings', async () => {
    await manager.addTrack('track-1', 'https://example.com/audio.mp3');
    manager.updateTrack('track-1', { volume: 0.3, muted: true });

    const track = manager.getTrack('track-1');
    expect(track!.volume).toBe(0.3);
    expect(track!.muted).toBe(true);

    const mockEl = mockAudioElements.get('https://example.com/audio.mp3');
    expect(mockEl.volume).toBe(0); // muted → 0
  });

  it('calculates max duration from trim ranges', async () => {
    await manager.addTrack('track-1', 'https://example.com/audio1.mp3', {
      trim: { start: 0, end: 10 },
    });
    await manager.addTrack('track-2', 'https://example.com/audio2.mp3', {
      trim: { start: 0, end: 25 },
    });

    expect(manager.getMaxDuration()).toBe(25);
  });

  it('starts playback and syncs tracks', async () => {
    await manager.addTrack('track-1', 'https://example.com/audio.mp3');
    manager.play();

    expect(manager.isAudioPlaying()).toBe(true);
    const mockEl = mockAudioElements.get('https://example.com/audio.mp3');
    expect(mockEl.play).toHaveBeenCalled();
  });

  it('pauses all tracks', async () => {
    await manager.addTrack('track-1', 'https://example.com/audio.mp3');
    manager.play();
    manager.pause();

    expect(manager.isAudioPlaying()).toBe(false);
    const mockEl = mockAudioElements.get('https://example.com/audio.mp3');
    expect(mockEl.pause).toHaveBeenCalled();
  });

  it('seeks to time and updates currentTime', async () => {
    await manager.addTrack('track-1', 'https://example.com/audio.mp3', {
      trim: { start: 2, end: 20 },
    });
    manager.seek(5);

    expect(manager.getCurrentTime()).toBe(5);
    const mockEl = mockAudioElements.get('https://example.com/audio.mp3');
    expect(mockEl.currentTime).toBe(7); // 5 + trimStart 2
  });

  it('calls onTimeUpdate during playback', async () => {
    const onTimeUpdate = vi.fn();
    manager = new AudioManager({ onTimeUpdate });

    await manager.addTrack('track-1', 'https://example.com/audio.mp3');
    manager.seek(3);

    expect(onTimeUpdate).toHaveBeenCalledWith(3);
  });

  it('replaces track with same ID', async () => {
    await manager.addTrack('track-1', 'https://example.com/audio1.mp3');
    const firstEl = mockAudioElements.get('https://example.com/audio1.mp3');

    await manager.addTrack('track-1', 'https://example.com/audio2.mp3');
    expect(manager.getTrackIds()).toHaveLength(1);
    expect(firstEl.pause).toHaveBeenCalled();
  });

  it('handles load errors', async () => {
    vi.stubGlobal('Audio', vi.fn(() => {
      const el = {
        src: '',
        crossOrigin: '',
        play: vi.fn(),
        pause: vi.fn(),
        addEventListener: vi.fn((event: string, handler: Function) => {
          if (event === 'error') {
            setTimeout(() => handler(), 0);
          }
        }),
        removeEventListener: vi.fn(),
      };
      return el;
    }));

    await expect(
      manager.addTrack('track-1', 'https://example.com/bad.mp3')
    ).rejects.toThrow('Failed to load audio');
  });
});
