export {
  generateVideoSpec,
  buildProjectFromSpec,
  generateVideoFromPrompt,
} from './agent';
export type {
  Brain,
  VideoSpec,
  TemplateName,
  MediaInputs,
  GenerateOptions,
} from './agent';
export { createGeminiBrain } from './brains/gemini';
export type { GeminiBrainOptions } from './brains/gemini';
