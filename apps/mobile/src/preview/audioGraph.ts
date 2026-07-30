/**
 * Sound for the timeline preview.
 *
 * Until now the mobile preview was silent — not a bug in any one feature, just
 * absent: there was no `expo-audio` anywhere near `Preview.tsx`, and Skia's
 * video decoder only ever produces frames, never audio. So you could add music,
 * see it on the timeline, hear nothing while editing, and only find out what it
 * sounded like after an export. The export was never silent: `buildMultiTrackArgs`
 * has always mixed every audio clip.
 *
 * This is a port of the web engine's `AudioGraph` (`apps/web/src/video/engine/
 * audio.ts`), which had solved the same problem with WebAudio. The design is
 * the part worth keeping, not the API: one player per clip, held open, and
 * re-positioned against the project clock every tick rather than "scheduled".
 * Scheduling assumes playback starts at zero and runs to the end; an editor
 * gets scrubbed, paused mid-clip and restarted from anywhere.
 *
 * Gain comes from the same `sampleVolume` the export bakes into its `volume`
 * expression, so a fade drawn on the timeline sounds here like it will sound in
 * the file.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import type { AudioTrackClip, VideoProject, VisualTrack } from "../model/types";
import { clipGainAt } from "./curve";

/**
 * Anything the preview can make a sound out of.
 *
 * Music clips and the sound belonging to a video clip are the same problem —
 * a file, a window on the timeline, an offset into the source and a gain — so
 * they go through one graph rather than two that drift. `speed` is what a video
 * clip adds: `AudioTrackClip` has no such field and simply leaves it undefined.
 */
export interface PreviewAudioClip {
  id: string;
  src: string;
  start: number;
  duration: number;
  trimIn?: number;
  volume?: number;
  volumeCurve?: AudioTrackClip["volumeCurve"];
  speed?: number;
}

/**
 * How far a player may drift before it is seeked back.
 *
 * Every correction is audible — expo-audio's `seekTo` is not gapless — so the
 * threshold has to be wide enough that ordinary jitter never triggers it. The
 * web engine settled on the same 200ms for the same reason.
 */
const DRIFT_TOLERANCE_SEC = 0.2;

interface Voice {
  player: AudioPlayer;
  clip: PreviewAudioClip;
  /** What we last set the volume to, so we only cross the bridge on a change. */
  gain: number;
}

export class PreviewAudio {
  private voices = new Map<string, Voice>();
  private ready = false;

  constructor() {
    /*
     * Play even when the ringer switch is off. An editor whose preview is
     * silent because of a hardware switch reads as broken, and the user has
     * explicitly pressed play.
     */
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    this.ready = true;
  }

  /**
   * Match the live set of clips: open a player for anything new, drop anything
   * gone. Existing players are kept — reopening one on every edit would stutter
   * playback each time an unrelated clip moved.
   */
  sync(clips: PreviewAudioClip[], resolve: (src: string) => string): void {
    if (!this.ready) return;
    const keep = new Set<string>();
    for (const clip of clips) {
      keep.add(clip.id);
      const existing = this.voices.get(clip.id);
      if (existing) {
        // Same clip, possibly moved or retrimmed: keep the player, take the
        // new geometry.
        existing.clip = clip;
        continue;
      }
      try {
        const player = createAudioPlayer({ uri: resolve(clip.src) });
        this.voices.set(clip.id, { player, clip, gain: -1 });
      } catch {
        // A missing file must not take the preview down with it. The clip is
        // simply inaudible, exactly as it is today.
      }
    }
    for (const [id, voice] of [...this.voices]) {
      if (keep.has(id)) continue;
      this.release(voice);
      this.voices.delete(id);
    }
  }

  /** Put every voice where timeline second `t` says it should be. */
  update(t: number, playing: boolean): void {
    for (const voice of this.voices.values()) {
      const { player, clip } = voice;
      const end = clip.start + clip.duration;
      const live = t >= clip.start && t <= end;

      if (!live || !playing) {
        if (player.playing) {
          try {
            player.pause();
          } catch {
            /* player already torn down */
          }
        }
        if (!live) continue;
      }

      const local = t - clip.start;
      const speed = clip.speed && clip.speed > 0 ? clip.speed : 1;
      // A clip played at 2× covers two source seconds per timeline second, so
      // the position in the FILE runs at `speed`, not at 1.
      const want = (clip.trimIn ?? 0) + local * speed;
      try {
        if (speed !== 1 && player.playbackRate !== speed) {
          player.setPlaybackRate(speed);
        }
        if (Math.abs(player.currentTime - want) > DRIFT_TOLERANCE_SEC) {
          player.seekTo(want);
        }
        if (playing && !player.playing) player.play();

        const gain = clipGainAt(clip, clip.duration > 0 ? local / clip.duration : 0);
        // Only write on a real change: this runs at the preview frame rate, and
        // the setter crosses into native every time.
        if (Math.abs(gain - voice.gain) > 0.01) {
          player.volume = gain;
          voice.gain = gain;
        }
      } catch {
        /* a player disposed underneath us */
      }
    }
  }

  /** Stop everything, keeping the players open for the next play. */
  pause(): void {
    for (const { player } of this.voices.values()) {
      try {
        if (player.playing) player.pause();
      } catch {
        /* already gone */
      }
    }
  }

  /** Tear the whole graph down. */
  dispose(): void {
    for (const voice of this.voices.values()) this.release(voice);
    this.voices.clear();
  }

  private release(voice: Voice): void {
    try {
      voice.player.pause();
      voice.player.remove();
    } catch {
      /* already gone */
    }
  }
}

/**
 * Everything on the project that should make a sound: the audio tracks, plus
 * each video clip's own audio.
 *
 * The second half matters as much as the first. Skia decodes video for frames
 * only, so a clip with dialogue on it played silently in the preview and
 * arrived with sound in the export — `buildMultiTrackArgs` gives every visual
 * clip's stream its own chain into the mix. A muted clip is skipped here for
 * the same reason the export skips it.
 */
export function previewAudioOf(project: Partial<VideoProject>): PreviewAudioClip[] {
  const tracks = project.tracks ?? [];
  const music = tracks
    .filter((t) => t.kind === "audio")
    .flatMap((t) => (t as { clips: AudioTrackClip[] }).clips);

  const fromVideo = tracks
    .filter((t): t is VisualTrack => t.kind === "visual")
    .flatMap((t) => t.clips)
    .filter((c) => c.type === "video" && !c.muted)
    .map((c) => ({
      // Namespaced, because a visual clip's id already belongs to a Skia
      // decoder and the two must not share a voice.
      id: `v:${c.id}`,
      src: c.src,
      start: c.start,
      duration: c.duration,
      trimIn: c.trimIn,
      volume: c.volume,
      volumeCurve: c.volumeCurve,
      speed: c.speed,
    }));

  return [...music, ...fromVideo];
}
