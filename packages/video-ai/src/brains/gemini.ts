/**
 * Gemini brain — the built-in LLM that turns a prompt into a video template
 * spec, using Google's `@google/genai` SDK with JSON structured output.
 *
 * Reads the key from `opts.apiKey` or `GEMINI_API_KEY` / `GOOGLE_API_KEY`.
 * The SDK call is isolated here; verify the exact shape against your installed
 * `@google/genai` version if Google changes it.
 */
import { GoogleGenAI, Type } from '@google/genai';
import type { Brain, TemplateName, VideoSpec } from '../agent';

const SYSTEM = `You turn a short description into a vertical (9:16) short-form video.
Choose exactly ONE template and fill its text fields with punchy, concise copy.
- lyric_video: poems, lyrics, shayari, affirmations — 3 to 8 short lines (set "lines").
- caption_reel: sequential captions over the user's own footage (set "captions").
- quote_card: one short, shareable quote (set "quote", optional "author").
Produce text only; do not invent media (music or clips). Optionally set backgroundFrom/backgroundTo as hex colors.`;

/** Flat schema — the relevant fields per template; `template` discriminates. */
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    template: { type: Type.STRING, enum: ['lyric_video', 'caption_reel', 'quote_card'] },
    lines: { type: Type.ARRAY, items: { type: Type.STRING } },
    captions: { type: Type.ARRAY, items: { type: Type.STRING } },
    quote: { type: Type.STRING },
    author: { type: Type.STRING },
    backgroundFrom: { type: Type.STRING },
    backgroundTo: { type: Type.STRING },
  },
  required: ['template'],
};

export interface GeminiBrainOptions {
  apiKey?: string;
  /** Default `gemini-2.5-flash`. */
  model?: string;
}

export function createGeminiBrain(opts: GeminiBrainOptions = {}): Brain {
  const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  const ai = new GoogleGenAI({ apiKey });
  const model = opts.model ?? 'gemini-2.5-flash';

  return {
    async plan(prompt: string): Promise<VideoSpec> {
      const res = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      });
      const text = res.text ?? '{}';
      const parsed = JSON.parse(text) as Record<string, unknown> & { template?: string };
      if (!parsed.template) throw new Error('Gemini did not choose a video template');
      return { template: parsed.template as TemplateName, input: parsed };
    },
  };
}
