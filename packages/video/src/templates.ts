/**
 * Built-in video templates: turn simple inputs into a `VideoProject` the engine
 * renders. This is the "template" half of the wedge — and the same shape an AI
 * layer will later fill in ("describe → template inputs → timeline").
 */
import { createProject } from './project';
import type { Background, TextOverlay, VideoProject } from './types';

const DEFAULTS = { width: 1080, height: 1920, fps: 30 };

export interface CaptionReelInput {
  /** Base video clip source. */
  clip: string;
  captions: string[];
  /** Seconds each caption is shown (default 2.5). */
  perCaption?: number;
  /** Trim the clip to this length (default = total caption time). */
  clipDuration?: number;
  music?: string;
  musicVolume?: number;
  width?: number;
  height?: number;
  fps?: number;
}

/** Footage with captions appearing one after another (e.g. a talking-head reel). */
export function captionReel(input: CaptionReelInput): VideoProject {
  const per = input.perCaption ?? 2.5;
  const height = input.height ?? DEFAULTS.height;
  const total = input.clipDuration ?? Math.max(per, input.captions.length * per);
  const overlays: TextOverlay[] = input.captions.map((text, i) => ({
    id: `caption-${i}`,
    type: 'text',
    text,
    start: i * per,
    end: Math.min(total, (i + 1) * per),
    x: 0.5,
    y: 0.82,
    fontSize: Math.round(height * 0.045),
    color: '#ffffff',
    align: 'center',
    bold: true,
    box: { color: '#000000', opacity: 0.45, padding: Math.round(height * 0.012) },
    animation: 'fade',
  }));
  return createProject({
    width: input.width ?? DEFAULTS.width,
    height,
    fps: input.fps ?? DEFAULTS.fps,
    clips: [{ id: 'clip', type: 'video', src: input.clip, start: 0, duration: total, volume: 0.4 }],
    overlays,
    audio: input.music ? [{ id: 'music', src: input.music, start: 0, volume: input.musicVolume ?? 0.8 }] : [],
  });
}

export interface LyricVideoInput {
  lines: string[];
  /** Seconds each line is shown (default 2.5). */
  perLine?: number;
  background?: Background;
  music: string;
  musicVolume?: number;
  width?: number;
  height?: number;
  fps?: number;
}

/** Lyrics/shayari lines over a gradient with music — no footage needed. */
export function lyricVideo(input: LyricVideoInput): VideoProject {
  const per = input.perLine ?? 2.5;
  const height = input.height ?? DEFAULTS.height;
  const total = Math.max(per, input.lines.length * per);
  const overlays: TextOverlay[] = input.lines.map((text, i) => ({
    id: `line-${i}`,
    type: 'text',
    text,
    start: i * per,
    end: (i + 1) * per,
    x: 0.5,
    y: 0.5,
    fontSize: Math.round(height * 0.06),
    color: '#ffffff',
    align: 'center',
    bold: true,
    animation: 'fade',
  }));
  return createProject({
    width: input.width ?? DEFAULTS.width,
    height,
    fps: input.fps ?? DEFAULTS.fps,
    background: input.background ?? { type: 'gradient', from: '#1e3a8a', to: '#9333ea', angle: 160 },
    clips: [],
    overlays,
    audio: [{ id: 'music', src: input.music, start: 0, duration: total, volume: input.musicVolume ?? 1 }],
  });
}

export interface QuoteCardInput {
  quote: string;
  author?: string;
  background?: Background;
  duration?: number;
  music?: string;
  musicVolume?: number;
  width?: number;
  height?: number;
  fps?: number;
}

/** A centered quote (+ optional author) over a background — short and shareable. */
export function quoteCard(input: QuoteCardInput): VideoProject {
  const height = input.height ?? DEFAULTS.height;
  const duration = input.duration ?? 5;
  const overlays: TextOverlay[] = [
    {
      id: 'quote',
      type: 'text',
      text: `“${input.quote}”`,
      start: 0,
      end: duration,
      x: 0.5,
      y: 0.45,
      fontSize: Math.round(height * 0.05),
      color: '#ffffff',
      align: 'center',
      bold: true,
      animation: 'fade',
    },
  ];
  if (input.author) {
    overlays.push({
      id: 'author',
      type: 'text',
      text: `— ${input.author}`,
      start: 0.4,
      end: duration,
      x: 0.5,
      y: 0.62,
      fontSize: Math.round(height * 0.03),
      color: '#e5e7eb',
      align: 'center',
      animation: 'fade',
    });
  }
  return createProject({
    width: input.width ?? DEFAULTS.width,
    height,
    fps: input.fps ?? DEFAULTS.fps,
    background: input.background ?? { type: 'gradient', from: '#0f172a', to: '#334155', angle: 180 },
    clips: [],
    overlays,
    audio: input.music ? [{ id: 'music', src: input.music, start: 0, duration, volume: input.musicVolume ?? 1 }] : [],
  });
}

/** Template directory (for pickers and the future AI layer). */
export const TEMPLATE_LIST = [
  { id: 'caption-reel', name: 'Caption Reel', description: 'Footage with sequential captions.' },
  { id: 'lyric-video', name: 'Lyric Video', description: 'Lyrics over a gradient with music.' },
  { id: 'quote-card', name: 'Quote Card', description: 'A centered quote and author.' },
] as const;

export type TemplateId = (typeof TEMPLATE_LIST)[number]['id'];
