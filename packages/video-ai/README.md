# @layera-labs/orbit-video-ai

The AI wedge — **"describe → video"**. Claude reads a prompt, picks one of the
`@layera-labs/orbit-video` templates (via forced tool use), and fills its text fields; the
result is validated and rendered to an MP4.

```ts
import { generateVideoFromPrompt } from '@layera-labs/orbit-video-ai';

// Needs ANTHROPIC_API_KEY in the environment (billed per token).
const { spec, outputPath } = await generateVideoFromPrompt(
  'a wistful 4-line shayari about the moon',
  { music: './assets/lofi.mp3', outputPath: './out.mp4' },
);
console.log(spec.template, '→', outputPath);
```

- **Media is caller-supplied.** The model produces *text* only (lines, captions,
  quotes, colors); you pass `music` / `clip`. This keeps generation reliable and
  avoids hallucinated assets. (Generative media — TTS, AI b-roll — is a later step.)
- **Constrained output.** Each template is a tool with a typed schema; Claude must
  call exactly one, so the output is always a valid template spec.
- **Testable without a key.** `generateVideoSpec` and `buildProjectFromSpec` are
  unit-tested by injecting a mock client (see `src/__tests__`). Live inference is
  the only part that needs `ANTHROPIC_API_KEY`.

Lower-level entry points: `generateVideoSpec(prompt, opts)` → `{ template, input }`,
and `buildProjectFromSpec(spec, media)` → a `VideoProject` you can render yourself.
