import type Anthropic from '@anthropic-ai/sdk';

/**
 * One tool per video template. Claude is forced to call exactly one (via
 * `tool_choice: { type: 'any' }`); the tool it picks selects the template and
 * its arguments fill that template's *text* fields. Media (music/footage) is
 * supplied by the caller, never invented by the model.
 */
export const VIDEO_TOOLS: Anthropic.Tool[] = [
  {
    name: 'lyric_video',
    description:
      'A lyric/quote video: short text lines shown one at a time over a gradient background with music. Best for poems, lyrics, shayari, or affirmations. No footage needed.',
    input_schema: {
      type: 'object',
      properties: {
        lines: {
          type: 'array',
          items: { type: 'string' },
          description: 'The lines shown in sequence (aim for 3–8 short, punchy lines).',
        },
        perLine: { type: 'number', description: 'Seconds each line is shown (optional, default 2.5).' },
        backgroundFrom: { type: 'string', description: 'Gradient start color as hex (optional).' },
        backgroundTo: { type: 'string', description: 'Gradient end color as hex (optional).' },
      },
      required: ['lines'],
    },
  },
  {
    name: 'caption_reel',
    description:
      "Captions shown one after another over the user's provided video clip. Best when the user has footage and wants sequential captions.",
    input_schema: {
      type: 'object',
      properties: {
        captions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Caption lines shown in sequence.',
        },
        perCaption: { type: 'number', description: 'Seconds each caption is shown (optional).' },
      },
      required: ['captions'],
    },
  },
  {
    name: 'quote_card',
    description:
      'A single centered quote with an optional author over a background. Best for one short, shareable quote.',
    input_schema: {
      type: 'object',
      properties: {
        quote: { type: 'string', description: 'The quote text.' },
        author: { type: 'string', description: 'Attribution (optional).' },
      },
      required: ['quote'],
    },
  },
];
