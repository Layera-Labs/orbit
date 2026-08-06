/**
 * Audio playback for the preview.
 *
 * One `AudioContext`; each audio-bearing source gets its own element routed
 * through a `GainNode`. Gain comes from `sampleVolume` in `@orbit/video` — the
 * same function the export bakes into its `volume` expression — so a fade drawn
 * on the timeline sounds the same here as in the rendered file.
 *
 * Note the mobile Skia preview has no audio at all. Web being ahead is a
 * capability difference, not drift, precisely because the gain maths is shared.
 */
import { curvePoints, sampleVolume, type AudioTrackClip } from '@orbit/video/browser';

interface Voice {
  el: HTMLAudioElement;
  gain: GainNode;
  clip: AudioTrackClip;
}

export class AudioGraph {
  private ctx: AudioContext | null = null;
  private voices = new Map<string, Voice>();

  private context(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
    }
    return this.ctx;
  }

  /** Build/refresh a voice per audio clip. `urls` maps a clip src to a blob URL. */
  sync(clips: AudioTrackClip[], urls: Record<string, string>): void {
    const ctx = this.context();
    if (!ctx) return;
    const keep = new Set<string>();

    for (const clip of clips) {
      const url = urls[clip.src];
      if (!url) continue;
      keep.add(clip.id);
      const existing = this.voices.get(clip.id);
      if (existing) {
        existing.clip = clip;
        continue;
      }
      const el = new Audio(url);
      el.crossOrigin = 'anonymous';
      el.preload = 'auto';
      const source = ctx.createMediaElementSource(el);
      const gain = ctx.createGain();
      source.connect(gain).connect(ctx.destination);
      this.voices.set(clip.id, { el, gain, clip });
    }

    for (const [id, voice] of this.voices) {
      if (keep.has(id)) continue;
      voice.el.pause();
      voice.gain.disconnect();
      this.voices.delete(id);
    }
  }

  /** Position every voice for timeline time `t`. */
  update(t: number, playing: boolean): void {
    const ctx = this.context();
    if (!ctx) return;
    if (playing && ctx.state === 'suspended') void ctx.resume();

    for (const { el, gain, clip } of this.voices.values()) {
      const end = clip.start + clip.duration;
      const live = t >= clip.start && t <= end;

      if (!live || !playing) {
        if (!el.paused) el.pause();
        if (!live) continue;
      }

      const local = t - clip.start;
      const want = (clip.trimIn ?? 0) + local;
      if (Math.abs(el.currentTime - want) > 0.2) el.currentTime = want;
      if (playing && el.paused) void el.play().catch(() => undefined);

      const p = clip.duration > 0 ? local / clip.duration : 0;
      /*
       * `curvePoints` materializes a stored envelope against the clip's own
       * PLATEAU. Passing 1 instead would play a ducked bed at unity here while
       * the exported file plays it at the level the user set — the divergence
       * this whole shape exists to make impossible.
       */
      const pts = curvePoints(clip.volumeCurve, clip.duration, clip.volume ?? 1);
      const volume = pts
        ? sampleVolume(pts, p)
        : (clip.volume ?? 1);
      gain.gain.setTargetAtTime(Math.max(0, volume), ctx.currentTime, 0.01);
    }
  }

  pause(): void {
    for (const { el } of this.voices.values()) el.pause();
  }

  destroy(): void {
    this.pause();
    for (const { gain } of this.voices.values()) gain.disconnect();
    this.voices.clear();
    void this.ctx?.close();
    this.ctx = null;
  }
}
