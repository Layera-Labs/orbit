/**
 * The two backends the editor can be handed.
 *
 * **Why these are re-declared here rather than imported from `@orbit/agentic`.**
 * The whole point of the split is that installing `@orbit/react` must not pull
 * the AI package in. A `import type` erases at build time, so a type-only
 * import would already achieve that for the BUNDLE — but it would leave
 * `@orbit/react`'s public `.d.ts` naming `@orbit/agentic`, and once that package
 * becomes an optional peer (the next step), every consumer who declined the AI
 * layer would fail `tsc` on a module specifier that resolves to nothing. So the
 * shapes live here, in the package that consumes them, and `@orbit/agentic`'s
 * `OrbitBackendAdapter` satisfies them structurally — TypeScript needs no
 * nominal link, and both sides are anchored to the same `@orbit/shared` types,
 * which is what actually keeps them from drifting.
 *
 * The one exception is `CanvasAgentParams`/`CanvasAgentResponse` below: those
 * are agentic's own domain types, `@orbit/react`'s `agentic/actions.ts` already
 * type-imports from that package, and copying a twelve-member action union here
 * WOULD drift. They stay a type-only import, and they sit on the AI half only.
 */

import type {
  GenerateParams,
  InpaintParams,
  OutpaintParams,
  LightingParams,
  ImageToImageParams,
  VideoGenerateParams,
  AudioGenerateParams,
  GeneratedAsset,
  VideoExportOptions,
  ExportJob,
  ExportInitResponse,
  ExportListResponse,
} from '@orbit/shared';
import type { CanvasAgentParams, CanvasAgentResponse } from '@orbit/agentic';

/**
 * Rendering a project to a file. Core editing, not AI: it is what the
 * transitions and filters an editor already applied get written into.
 */
export interface ExportBackend {
  initVideoExport(params: VideoExportOptions): Promise<ExportInitResponse>;
  markExportReady(jobId: string): Promise<void>;
  getExportStatus(jobId: string): Promise<ExportJob>;
  retryExport(jobId: string): Promise<{ newJobId: string }>;
  cancelExport(jobId: string): Promise<void>;
  listExports(options?: { limit?: number; offset?: number }): Promise<ExportListResponse>;
  getExportEventsUrl(jobId: string): string;
}

/** Generating pictures, video and audio. The half that is genuinely optional. */
export interface AiBackend {
  generateImage(params: GenerateParams): Promise<GeneratedAsset>;
  inpaint(params: InpaintParams): Promise<GeneratedAsset>;
  outpaint(params: OutpaintParams): Promise<GeneratedAsset>;
  adjustLighting(params: LightingParams): Promise<GeneratedAsset>;
  imageToImage(params: ImageToImageParams): Promise<GeneratedAsset>;
  generateVideo(params: VideoGenerateParams): Promise<GeneratedAsset>;
  generateAudio(params: AudioGenerateParams): Promise<GeneratedAsset>;
  runCanvasAgent(params: CanvasAgentParams): Promise<CanvasAgentResponse>;
}
