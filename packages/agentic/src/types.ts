/**
 * Agentic types
 *
 * The canvas-agent shapes moved to `@layera-labs/shared` and are re-exported from
 * here, so this package's public surface is unchanged for anyone already
 * writing `import type { CanvasAgentParams } from '@layera-labs/agentic'`.
 *
 * Why they had to move: `@layera-labs/react` NAMES them — `AiBackend.runCanvasAgent`
 * is reachable from `OrbitEditorProps` — while this package is only an OPTIONAL
 * peer of it. A type-only import erases from the bundle but survives in the
 * emitted `.d.ts`, so a consumer who took the editor and declined the AI layer
 * failed `tsc` (with `skipLibCheck: false`) on a specifier resolving to
 * nothing. `@layera-labs/shared` is a real dependency of both packages, which is what
 * makes it the one place both can point at.
 *
 * What deliberately did NOT move is below: `AgenticConfig` and this package's
 * `ModelProvider`. They configure the AI CLIENT, `@layera-labs/react` never names
 * either, and moving `ModelProvider` would in fact break things — `@layera-labs/shared`
 * already exports a DIFFERENT type of that name (a wider union including the
 * flux models), so relocating this one would either collide on the barrel or
 * silently widen what this package has always meant by it.
 */

export type {
  AgenticCanvasAction,
  CanvasAgentParams,
  CanvasAgentResponse,
} from '@layera-labs/shared';

export type ModelProvider = 'gpt-4o' | 'gemini-pro';

export interface AgenticConfig {
  apiKey: string;
  backendUrl: string;
  defaultModel?: ModelProvider;
}
