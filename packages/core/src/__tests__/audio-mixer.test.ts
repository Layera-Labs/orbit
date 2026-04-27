import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioMixer } from '../audio-mixer';

describe('AudioMixer', () => {
  let mixer: AudioMixer;

  beforeEach(() => {
    mixer = new AudioMixer();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws when no tracks provided', async () => {
    await expect(mixer.mix({ tracks: [], duration: 10 })).rejects.toThrow('No audio tracks to mix');
  });

  it('mixes a single track and returns WAV blob', async () => {
    const mockBuffer = {
      numberOfChannels: 2,
      sampleRate: 48000,
      length: 48000,
      duration: 1,
      getChannelData: vi.fn(() => new Float32Array(48000).fill(0)),
    };

    const mockOfflineContext = {
      decodeAudioData: vi.fn().mockResolvedValue(mockBuffer),
      createBufferSource: vi.fn(() => ({
        buffer: null,
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      })),
      createGain: vi.fn(() => ({
        gain: { value: 1 },
        connect: vi.fn(),
      })),
      destination: {},
      length: 480000,
      startRendering: vi.fn().mockResolvedValue(mockBuffer),
    };

    vi.stubGlobal('OfflineAudioContext', vi.fn(() => mockOfflineContext));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    }));

    const onProgress = vi.fn();
    const result = await mixer.mix({
      tracks: [
        {
          src: 'https://example.com/audio.mp3',
          volume: 0.8,
          muted: false,
          loop: false,
          trim: { start: 0, end: 10 },
        },
      ],
      duration: 10,
      onProgress,
    });

    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blob.type).toBe('audio/wav');
    expect(result.duration).toBe(10);
    expect(onProgress).toHaveBeenCalledWith(0.5);
    expect(onProgress).toHaveBeenCalledWith(0.9);
    expect(onProgress).toHaveBeenCalledWith(1);
  });

  it('skips muted tracks', async () => {
    const mockBuffer = {
      numberOfChannels: 2,
      sampleRate: 48000,
      length: 48000,
      duration: 1,
      getChannelData: vi.fn(() => new Float32Array(48000).fill(0)),
    };

    const mockOfflineContext = {
      decodeAudioData: vi.fn().mockResolvedValue(mockBuffer),
      createBufferSource: vi.fn(),
      createGain: vi.fn(),
      destination: {},
      length: 480000,
      startRendering: vi.fn().mockResolvedValue(mockBuffer),
    };

    vi.stubGlobal('OfflineAudioContext', vi.fn(() => mockOfflineContext));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    }));

    await mixer.mix({
      tracks: [
        {
          src: 'https://example.com/audio.mp3',
          volume: 1,
          muted: true,
          loop: false,
          trim: { start: 0, end: 10 },
        },
      ],
      duration: 10,
    });

    expect(mockOfflineContext.createBufferSource).not.toHaveBeenCalled();
  });

  it('aborts when signal is triggered', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      mixer.mix({
        tracks: [
          {
            src: 'https://example.com/audio.mp3',
            volume: 1,
            muted: false,
            loop: false,
            trim: { start: 0, end: 10 },
          },
        ],
        duration: 10,
        signal: controller.signal,
      })
    ).rejects.toThrow('Mix aborted');
  });

  it('handles fetch failure gracefully', async () => {
    const mockBuffer = {
      numberOfChannels: 2,
      sampleRate: 48000,
      length: 48000,
      duration: 1,
      getChannelData: vi.fn(() => new Float32Array(48000).fill(0)),
    };

    const mockOfflineContext = {
      decodeAudioData: vi.fn().mockResolvedValue(mockBuffer),
      createBufferSource: vi.fn(),
      createGain: vi.fn(),
      destination: {},
      length: 480000,
      startRendering: vi.fn().mockResolvedValue(mockBuffer),
    };

    vi.stubGlobal('OfflineAudioContext', vi.fn(() => mockOfflineContext));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }));

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await mixer.mix({
      tracks: [
        {
          src: 'https://example.com/missing.mp3',
          volume: 1,
          muted: false,
          loop: false,
          trim: { start: 0, end: 10 },
        },
      ],
      duration: 10,
    });

    expect(result.blob).toBeInstanceOf(Blob);
    expect(consoleSpy).toHaveBeenCalled();
  });
});
