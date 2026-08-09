/**
 * Agentic types
 *
 * The canvas-agent shapes moved to `@orbit/shared` and are re-exported from
 * here, so this package's public surface is unchanged for anyone already
 * writing `import type { CanvasAgentParams } from '@orbit/agentic'`.
 *
 * Why they had to move: `@orbit/react` NAMES them — `AiBackend.runCanvasAgent`
 * is reachable from `OrbitEditorProps` — while this package is only an OPTIONAL
 * peer of it. A type-only import erases from the bundle but survives in the
 * emitted `.d.ts`, so a consumer who took the editor and declined the AI layer
 * failed `tsc` (with `skipLibCheck: false`) on a specifier resolving to
 * nothing. `@orbit/shared` is a real dependency of both packages, which is what
 * makes it the one place both can point at.
 *
 * What deliberately did NOT move is below: `AgenticConfig` and this package's
 * `ModelProvider`. They configure the AI CLIENT, `@orbit/react` never names
 * either, and moving `ModelProvider` would in fact break things — `@orbit/shared`
 * already exports a DIFFERENT type of that name (a wider union including the
 * flux models), so relocating this one would either collide on the barrel or
 * silently widen what this package has always meant by it.
 */

export type {
  AgenticCanvasAction,
  CanvasAgentParams,
  CanvasAgentResponse,
} from '@orbit/shared';

export type ModelProvider = 'gpt-4o' | 'gemini-pro';

export interface AgenticConfig {
  apiKey: string;
  backendUrl: string;
  defaultModel?: ModelProvider;
}
