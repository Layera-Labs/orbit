/**
 * The two backends the editor can be handed.
 *
 * **Why these are re-declared here rather than imported from `@layera-labs/agentic`.**
 * The whole point of the split is that installing `@layera-labs/react` must not pull
 * the AI package in. A `import type` erases at build time, so a type-only
 * import would already achieve that for the BUNDLE — but it would leave
 * `@layera-labs/react`'s public `.d.ts` naming `@layera-labs/agentic`, and once that package
 * becomes an optional peer (the next step), every consumer who declined the AI
 * layer would fail `tsc` on a module specifier that resolves to nothing. So the
 * shapes live here, in the package that consumes them, and `@layera-labs/agentic`'s
 * `OrbitBackendAdapter` satisfies them structurally — TypeScript needs no
 * nominal link, and both sides are anchored to the same `@layera-labs/shared` types,
 * which is what actually keeps them from drifting.
 *
 * `CanvasAgentParams`/`CanvasAgentResponse` used to be the one exception —
 * type-imported straight from `@layera-labs/agentic`, on the argument that copying a
 * twelve-member action union here would drift. That argument was right and the
 * conclusion was wrong: a type-only import erases from the BUNDLE but survives
 * in the emitted `.d.ts`, so this module's declaration still named the AI
 * package, and `AiBackend` is reachable from `OrbitEditorProps.aiBackend`. A
 * consumer who declined the optional peer and ran `tsc` with
 * `skipLibCheck: false` therefore failed on a specifier resolving to nothing —
 * the editing SDK refusing to typecheck over an AI package they deliberately
 * did not install. The shapes now live in `@layera-labs/shared` alongside
 * `GenerateParams` and `ExportJob`, which both packages depend on
 * unconditionally, so nothing is copied and nothing can drift. `@layera-labs/agentic`
 * re-exports them, so its own public surface is unchanged.
 *
 * NOTHING in this file may name `@layera-labs/agentic`, in any import form.
 * `ai-optional.test.ts` asserts it.
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
  CanvasAgentParams,
  CanvasAgentResponse,
} from '@layera-labs/shared';

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
