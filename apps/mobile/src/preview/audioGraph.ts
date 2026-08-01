/**
 * Sound for the timeline preview.
 *
 * Ported from `expo-audio` to a real Web Audio graph
 * (`react-native-audio-api`) on 2026-08-01, for one reason: **gain above 1**.
 * `expo-audio`'s `player.volume` is a 0–1 property that saturates in the native
 * player, so a clip set to 200% — or 500%, once the ceiling moved — sounded
 * exactly like 100% here while ffmpeg rendered the real boost. A `GainNode`'s
 * `gain` has no upper bound, so the preview can finally be as loud as the file.
 *
 * That swap forced a different shape. An `expo-audio` player can SEEK, so the
 * old graph held one open per clip and re-positioned it against the project
 * clock every tick. A Web Audio `AudioBufferSourceNode` cannot: it is one-shot,
 * started once with an offset and a duration, and immovable afterwards. So this
 * ARMS — on play, and again whenever the playhead jumps somewhere the running
 * sources cannot follow — and otherwise leaves them running and only moves the
 * gain. `audioSchedule.ts` holds that arithmetic, and is where it is tested.
 *
 * What did not change: gain still comes from the same `clipGainAt` the export
 * bakes into its `volume` expression, so a fade drawn on the timeline sounds
 * here like it will sound in the file. And the export was never silent —
 * `buildMultiTrackArgs` has always mixed every audio clip.
 */
import type {
  AudioBuffer,
  AudioBufferSourceNode,
  AudioContext as AudioContextType,
  GainNode,
} from "react-native-audio-api";
import type { AudioTrackClip, VideoProject, VisualTrack } from "../model/types";
import { clipGainAt } from "./curve";
import { needsRearm, scheduleAt, speedOf } from "./audioSchedule";

/**
 * The native module, loaded lazily and allowed to be absent.
 *
 * A STATIC import of `react-native-audio-api` throws at module-evaluation time
 * when the native side is not in the installed binary — "Failed to install
 * react-native-audio-api: The native module could not be found" — which takes
 * the whole app down before any component renders. That is not hypothetical:
 * `ios/` is gitignored and rebuilt on demand, so every JS bundle that reaches a
 * binary built before this dependency landed hits exactly that, and a guard
 * inside the constructor is far too late to help.
 *
 * So the module is required on FIRST USE and a failure degrades to a silent
 * preview — which is what the editor did before this file existed at all.
 * Cached in both directions so a missing module is not re-required on every
 * mount.
 */
type AudioApi = typeof import("react-native-audio-api");
let api: AudioApi | null | undefined;

function audioApi(): AudioApi | null {
  if (api !== undefined) return api;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    api = require("react-native-audio-api") as AudioApi;
  } catch {
    api = null;
    console.warn(
      "[orbit] native audio module missing — preview audio is off until the app is rebuilt",
    );
  }
  return api;
}

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

/** Decoded files, shared across voices and across mounts. */
const buffers = new Map<string, Promise<AudioBuffer | null>>();

interface Voice {
  clip: PreviewAudioClip;
  /** Resolved file uri, so a re-`sync` can tell a changed src from a moved clip. */
  uri: string;
  /** Per-clip gain. Lives for the voice; sources come and go beneath it. */
  gain: GainNode;
  /** The currently sounding source, if any. One-shot: replaced, never moved. */
  source: AudioBufferSourceNode | null;
  buffer: AudioBuffer | null;
  /** Last value written to `gain.gain`, so we only touch it on a real change. */
  lastGain: number;
}

export class PreviewAudio {
  private ctx: AudioContextType | null = null;
  private voices = new Map<string, Voice>();
  /** Timeline second the running sources were armed from, and when. */
  private armedT = 0;
  private armedAt = 0;
  private playing = false;

  constructor() {
    const audio = audioApi();
    if (!audio) return;
    try {
      /*
       * Play even when the ringer switch is off. An editor whose preview is
       * silent because of a hardware switch reads as broken, and the user has
       * explicitly pressed play.
       */
      audio.AudioManager.setAudioSessionOptions({
        iosCategory: "playback",
        iosMode: "default",
      });
      void audio.AudioManager.setAudioSessionActivity(true).catch(() => {});
      this.ctx = new audio.AudioContext();
    } catch {
      // A bad session must not take the editor down; the preview is simply
      // silent, as it was before this existed at all.
      this.ctx = null;
    }
  }

  /**
   * Match the live set of clips: open a gain for anything new, drop anything
   * gone, and start decoding files we have not seen.
   *
   * Geometry changes (a move, a retrim) keep the voice — it is the same sound
   * in a new place, and re-arming is what repositions it. A changed `src` is a
   * different sound and gets a new voice.
   */
  sync(clips: PreviewAudioClip[], resolve: (src: string) => string): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const keep = new Set<string>();
    for (const clip of clips) {
      keep.add(clip.id);
      const uri = resolve(clip.src);
      const existing = this.voices.get(clip.id);
      if (existing && existing.uri === uri) {
        existing.clip = clip;
        continue;
      }
      if (existing) this.release(existing);
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      const voice: Voice = { clip, uri, gain, source: null, buffer: null, lastGain: -1 };
      this.voices.set(clip.id, voice);
      void this.load(voice, uri);
    }
    for (const [id, voice] of [...this.voices]) {
      if (keep.has(id)) continue;
      this.release(voice);
      this.voices.delete(id);
    }
  }

  /**
   * Decode a file once and hand the buffer to the voice.
   *
   * Cached by uri across voices AND across mounts, because two clips of one
   * song are the common case and decoding is neither cheap nor free in memory.
   * A failure caches as `null`: a file that cannot be decoded will not decode
   * on the next tick either, and retrying it every sync is a busy loop.
   */
  private async load(voice: Voice, uri: string): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    let pending = buffers.get(uri);
    if (!pending) {
      pending = ctx.decodeAudioData(uri).catch(() => null);
      buffers.set(uri, pending);
    }
    const buffer = await pending;
    // The voice may have been released while this was in flight.
    if (!buffer || this.voices.get(voice.clip.id) !== voice) return;
    voice.buffer = buffer;
    /*
     * Arm THIS voice if the transport is already running. Without it, a clip
     * whose file lands mid-playback stays silent until the next seek — which is
     * exactly what happens when you press play the instant a project opens.
     */
    if (this.playing) {
      const t = this.armedT + (ctx.currentTime - this.armedAt);
      this.armVoice(voice, t);
    }
  }

  /** Put every voice where timeline second `t` says it should be. */
  update(t: number, playing: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;

    if (!playing) {
      if (this.playing) this.stopAll();
      this.playing = false;
      // Gains still track the playhead while paused, so scrubbing to a quiet
      // part and pressing play does not start loud and then duck.
      this.writeGains(t);
      return;
    }

    const started = !this.playing;
    const jumped =
      !started && needsRearm(t, this.armedT, this.armedAt, ctx.currentTime);
    if (started || jumped) {
      this.stopAll();
      this.playing = true;
      this.armedT = t;
      this.armedAt = ctx.currentTime;
      for (const voice of this.voices.values()) this.armVoice(voice, t);
    }
    this.writeGains(t);
  }

  /** Start one voice from timeline second `t`, if it has anything to play. */
  private armVoice(voice: Voice, t: number): void {
    const ctx = this.ctx;
    if (!ctx || !voice.buffer) return;
    const plan = scheduleAt(voice.clip, t);
    if (!plan) return;
    try {
      const source = ctx.createBufferSource();
      source.buffer = voice.buffer;
      source.playbackRate.value = speedOf(voice.clip);
      source.connect(voice.gain);
      source.start(ctx.currentTime + plan.delay, plan.offset, plan.duration);
      voice.source = source;
    } catch {
      // A source that will not start leaves the clip silent rather than
      // throwing out of the render loop.
    }
  }

  private writeGains(t: number): void {
    for (const voice of this.voices.values()) {
      const { clip } = voice;
      const local = t - clip.start;
      const p = clip.duration > 0 ? local / clip.duration : 0;
      /*
       * NO CLAMP TO 1. This is the whole point of the port: a GainNode's gain
       * is unbounded, so 200% and 500% are as loud here as ffmpeg renders them.
       * Outside its own window a clip contributes nothing — the source is not
       * running, and zero keeps it from bleeding if one is.
       */
      const gain = local >= 0 && local <= clip.duration ? clipGainAt(clip, p) : 0;
      // Only write on a real change: this runs at the preview frame rate.
      if (Math.abs(gain - voice.lastGain) > 0.005) {
        voice.gain.gain.value = gain;
        voice.lastGain = gain;
      }
    }
  }

  private stopAll(): void {
    for (const voice of this.voices.values()) this.stopSource(voice);
  }

  private stopSource(voice: Voice): void {
    if (!voice.source) return;
    try {
      voice.source.stop();
      voice.source.disconnect();
    } catch {
      // Already finished on its own: a source stops itself at the end of the
      // duration it was given.
    }
    voice.source = null;
  }

  /** Stop everything, keeping the decoded buffers for the next play. */
  pause(): void {
    this.stopAll();
    this.playing = false;
  }

  /** Tear the whole graph down. */
  dispose(): void {
    for (const voice of this.voices.values()) this.release(voice);
    this.voices.clear();
    this.playing = false;
    try {
      void this.ctx?.close();
    } catch {
      /* already closed */
    }
    this.ctx = null;
  }

  private release(voice: Voice): void {
    this.stopSource(voice);
    try {
      voice.gain.disconnect();
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
