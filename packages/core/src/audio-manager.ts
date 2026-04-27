/**
 * AudioManager — Manages audio layer playback, mixing, and sync with video timeline
 */

export interface AudioTrack {
  id: string;
  element: HTMLAudioElement;
  volume: number;
  muted: boolean;
  loop: boolean;
  trimStart: number;
  trimEnd: number;
  duration: number;
}

export class AudioManager {
  private tracks: Map<string, AudioTrack> = new Map();
  private masterTime: number = 0;
  private isPlaying: boolean = false;
  private animationFrameId: number | null = null;
  private lastTimestamp: number = 0;
  private onTimeUpdate?: (time: number) => void;
  private maxDuration: number = 60;

  constructor(options?: { onTimeUpdate?: (time: number) => void }) {
    this.onTimeUpdate = options?.onTimeUpdate;
  }

  async addTrack(id: string, src: string, options?: {
    volume?: number;
    muted?: boolean;
    loop?: boolean;
    trim?: { start: number; end: number };
  }): Promise<void> {
    // Remove existing track with same ID
    this.removeTrack(id);

    const audio = new Audio(src);
    audio.crossOrigin = 'anonymous';

    await new Promise<void>((resolve, reject) => {
      audio.addEventListener('canplaythrough', () => resolve(), { once: true });
      audio.addEventListener('error', () => reject(new Error(`Failed to load audio: ${src}`)), { once: true });
      // Fallback if already loaded
      if (audio.readyState >= 4) resolve();
    });

    const duration = audio.duration || 0;
    const trim = options?.trim;

    const track: AudioTrack = {
      id,
      element: audio,
      volume: options?.volume ?? 1,
      muted: options?.muted ?? false,
      loop: options?.loop ?? false,
      trimStart: trim?.start ?? 0,
      trimEnd: trim?.end ?? duration,
      duration,
    };

    this.tracks.set(id, track);
    this.applyTrackSettings(track);
    this.updateMaxDuration();
  }

  removeTrack(id: string): void {
    const track = this.tracks.get(id);
    if (track) {
      track.element.pause();
      track.element.src = '';
      this.tracks.delete(id);
      this.updateMaxDuration();
    }
  }

  updateTrack(id: string, updates: Partial<Omit<AudioTrack, 'id' | 'element' | 'duration'>>): void {
    const track = this.tracks.get(id);
    if (!track) return;

    if (updates.volume !== undefined) track.volume = updates.volume;
    if (updates.muted !== undefined) track.muted = updates.muted;
    if (updates.loop !== undefined) track.loop = updates.loop;
    if (updates.trimStart !== undefined) track.trimStart = updates.trimStart;
    if (updates.trimEnd !== undefined) track.trimEnd = updates.trimEnd;

    this.applyTrackSettings(track);
  }

  private applyTrackSettings(track: AudioTrack): void {
    track.element.volume = track.muted ? 0 : track.volume;
    track.element.loop = track.loop;
  }

  private updateMaxDuration(): void {
    const durations = Array.from(this.tracks.values()).map((t) => t.trimEnd - t.trimStart);
    this.maxDuration = durations.length > 0 ? Math.max(...durations) : 60;
  }

  getMaxDuration(): number {
    return this.maxDuration;
  }

  getTrackIds(): string[] {
    return Array.from(this.tracks.keys());
  }

  getTrack(id: string): AudioTrack | undefined {
    return this.tracks.get(id);
  }

  play(): void {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.lastTimestamp = performance.now();

    // Sync all tracks to current time
    this.seek(this.masterTime);

    // Start all tracks
    for (const track of this.tracks.values()) {
      const effectiveTime = this.masterTime + track.trimStart;
      if (effectiveTime >= track.trimStart && effectiveTime < track.trimEnd) {
        track.element.currentTime = effectiveTime;
        track.element.play().catch(() => {
          // Auto-play policy may block; ignore
        });
      }
    }

    this.startPlaybackLoop();
  }

  pause(): void {
    this.isPlaying = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    for (const track of this.tracks.values()) {
      track.element.pause();
    }
  }

  seek(time: number): void {
    this.masterTime = Math.max(0, Math.min(time, this.maxDuration));

    for (const track of this.tracks.values()) {
      const effectiveTime = this.masterTime + track.trimStart;
      track.element.currentTime = Math.min(effectiveTime, track.duration);

      if (this.isPlaying) {
        if (this.masterTime >= 0 && this.masterTime <= (track.trimEnd - track.trimStart)) {
          track.element.play().catch(() => {});
        } else {
          track.element.pause();
        }
      }
    }

    this.onTimeUpdate?.(this.masterTime);
  }

  private startPlaybackLoop(): void {
    const loop = (timestamp: number) => {
      if (!this.isPlaying) return;

      const delta = (timestamp - this.lastTimestamp) / 1000;
      this.lastTimestamp = timestamp;
      this.masterTime += delta;

      // Check if we hit the end
      if (this.masterTime >= this.maxDuration) {
        this.pause();
        this.masterTime = 0;
        this.onTimeUpdate?.(0);
        return;
      }

      // Monitor individual tracks for loop/trim boundaries
      for (const track of this.tracks.values()) {
        const trackDuration = track.trimEnd - track.trimStart;
        const trackPosition = this.masterTime;

        if (track.loop && trackPosition >= trackDuration) {
          // Loop back
          track.element.currentTime = track.trimStart;
          track.element.play().catch(() => {});
        } else if (trackPosition > trackDuration && !track.loop) {
          track.element.pause();
        }
      }

      this.onTimeUpdate?.(this.masterTime);
      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  isAudioPlaying(): boolean {
    return this.isPlaying;
  }

  getCurrentTime(): number {
    return this.masterTime;
  }

  destroy(): void {
    this.pause();
    for (const track of this.tracks.values()) {
      track.element.pause();
      track.element.src = '';
    }
    this.tracks.clear();
  }
}
