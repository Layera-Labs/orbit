/**
 * The AI wedge: "describe → video". A pluggable `Brain` (an LLM) turns a prompt
 * into a template choice + filled fields; we validate it and build a
 * `VideoProject` the engine renders. The brain is an interface, so the LLM
 * provider is swappable (Gemini is the built-in — see `brains/gemini.ts`).
 *
 * Media stays caller-supplied (the brain produces text only, never assets).
 */
import {
  captionReel,
  lyricVideo,
  quoteCard,
  renderProject,
  type VideoProject,
} from '@orbit/video';

export type TemplateName = 'lyric_video' | 'caption_reel' | 'quote_card';

export interface VideoSpec {
  template: TemplateName;
  input: Record<string, unknown>;
}

/** A pluggable LLM brain: prompt → template choice + filled text fields. */
export interface Brain {
  plan(prompt: string): Promise<VideoSpec>;
}

/** Ask the brain to choose + fill a template for the prompt. */
export function generateVideoSpec(prompt: string, brain: Brain): Promise<VideoSpec> {
  return brain.plan(prompt);
}

export interface MediaInputs {
  /** Audio track (optional for lyric/quote, none = silent). */
  music?: string;
  /** Base video clip (required by caption_reel). */
  clip?: string;
  width?: number;
  height?: number;
  fps?: number;
}

/** Turn a spec + caller-supplied media into a renderable `VideoProject`. */
export function buildProjectFromSpec(spec: VideoSpec, media: MediaInputs = {}): VideoProject {
  const i = spec.input as Record<string, any>;
  const dims = { width: media.width, height: media.height, fps: media.fps };
  switch (spec.template) {
    case 'lyric_video': {
      if (!Array.isArray(i.lines) || i.lines.length === 0) throw new Error('lyric_video requires non-empty lines');
      const background =
        i.backgroundFrom && i.backgroundTo
          ? ({ type: 'gradient', from: i.backgroundFrom, to: i.backgroundTo } as const)
          : undefined;
      return lyricVideo({ lines: i.lines, perLine: i.perLine, music: media.music, background, ...dims });
    }
    case 'caption_reel': {
      if (!Array.isArray(i.captions) || i.captions.length === 0) throw new Error('caption_reel requires non-empty captions');
      if (!media.clip) throw new Error('caption_reel requires a video clip');
      return captionReel({ clip: media.clip, captions: i.captions, perCaption: i.perCaption, music: media.music, ...dims });
    }
    case 'quote_card': {
      if (!i.quote) throw new Error('quote_card requires a quote');
      return quoteCard({ quote: i.quote, author: i.author, music: media.music, ...dims });
    }
    default:
      throw new Error(`Unknown template: ${spec.template}`);
  }
}

export interface GenerateOptions extends MediaInputs {
  brain: Brain;
  outputPath: string;
  ffmpegPath?: string;
}

/** End-to-end: prompt → (brain) spec → project → rendered MP4. */
export async function generateVideoFromPrompt(
  prompt: string,
  opts: GenerateOptions,
): Promise<{ spec: VideoSpec; outputPath: string }> {
  const spec = await opts.brain.plan(prompt);
  const project = buildProjectFromSpec(spec, opts);
  await renderProject(project, { outputPath: opts.outputPath, ffmpegPath: opts.ffmpegPath });
  return { spec, outputPath: opts.outputPath };
}
