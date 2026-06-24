/**
 * The AI wedge: "describe → video". Claude reads a prompt, picks one template
 * (via forced tool use), and fills its text fields; we validate the result and
 * build a `VideoProject` the engine renders. Live inference needs an Anthropic
 * API key (`ANTHROPIC_API_KEY`); the structure here is fully testable without
 * one by injecting a `client`.
 */
import Anthropic from '@anthropic-ai/sdk';
import {
  captionReel,
  lyricVideo,
  quoteCard,
  renderProject,
  type VideoProject,
} from '@orbit/video';
import { VIDEO_TOOLS } from './tools';

export type TemplateName = 'lyric_video' | 'caption_reel' | 'quote_card';

export interface VideoSpec {
  template: TemplateName;
  input: Record<string, unknown>;
}

/** The minimal slice of the Anthropic client we use — lets tests inject a fake. */
interface MessagesClient {
  messages: {
    create(params: Record<string, unknown>): Promise<{
      content: Array<{ type: string; name?: string; input?: unknown }>;
    }>;
  };
}

export interface AgentOptions {
  /** Anthropic API key. Falls back to `ANTHROPIC_API_KEY`. */
  apiKey?: string;
  /** Model id (default `claude-opus-4-8`). */
  model?: string;
  /** Inject a client (tests / custom config). */
  client?: MessagesClient;
}

const SYSTEM = `You turn a short description into a vertical (9:16) short-form video.
Choose exactly ONE template using the tools, and fill its text fields with punchy, concise copy.
- lyric_video: poems, lyrics, shayari, affirmations — 3 to 8 short lines.
- caption_reel: sequential captions over the user's own footage.
- quote_card: one short, shareable quote.
Do not invent media (music or video clips); produce text only. Always call exactly one tool.`;

/** Ask Claude to choose + fill a template for the prompt. */
export async function generateVideoSpec(prompt: string, opts: AgentOptions = {}): Promise<VideoSpec> {
  const client: MessagesClient =
    opts.client ?? (new Anthropic({ apiKey: opts.apiKey }) as unknown as MessagesClient);
  const res = await client.messages.create({
    model: opts.model ?? 'claude-opus-4-8',
    max_tokens: 1024,
    system: SYSTEM,
    tools: VIDEO_TOOLS,
    tool_choice: { type: 'any' },
    messages: [{ role: 'user', content: prompt }],
  });
  const tool = res.content.find((b) => b.type === 'tool_use' && !!b.name);
  if (!tool?.name) throw new Error('Model did not choose a video template');
  return { template: tool.name as TemplateName, input: (tool.input ?? {}) as Record<string, unknown> };
}

export interface MediaInputs {
  /** Audio track path/URL (required by lyric_video, optional elsewhere). */
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
      if (!media.music) throw new Error('lyric_video requires music');
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

export interface GenerateOptions extends AgentOptions, MediaInputs {
  outputPath: string;
  ffmpegPath?: string;
}

/** End-to-end: prompt → spec → project → rendered MP4. */
export async function generateVideoFromPrompt(
  prompt: string,
  opts: GenerateOptions,
): Promise<{ spec: VideoSpec; outputPath: string }> {
  const spec = await generateVideoSpec(prompt, opts);
  const project = buildProjectFromSpec(spec, opts);
  await renderProject(project, { outputPath: opts.outputPath, ffmpegPath: opts.ffmpegPath });
  return { spec, outputPath: opts.outputPath };
}
