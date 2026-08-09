/**
 * `@orbit/react/agentic` — the AI half, behind a door you have to open.
 *
 * `useOrbitAgentic` used to sit on the main barrel (`src/hooks/index.ts`, which
 * `src/index.ts` re-exports wholesale), so `import { … } from '@orbit/react'`
 * handed it to every consumer whether or not they had an AI layer at all. That
 * made the opt-in true-by-accident: nothing in the package's SHAPE said the AI
 * surface was separable, only the current state of its imports did.
 *
 * So it lives here instead. The rule this entry exists to enforce: anything
 * whose public types come from `@orbit/agentic` is reached through this
 * subpath, never through the package name. `@orbit/agentic` is an OPTIONAL peer
 * (see this package's `package.json`) — a host that declined it still installs,
 * builds and bundles `@orbit/react`, and simply never imports this module.
 *
 * `src/__tests__/ai-optional.test.ts` walks the main entry's import graph and
 * fails if a RUNTIME import of `@orbit/agentic` ever reappears there.
 */

export { useOrbitAgentic } from '../hooks/useOrbitAgentic';
export type {
  AgenticTool,
  AgenticGenerateState,
  UseOrbitAgenticOptions,
} from '../hooks/useOrbitAgentic';
export type { AiBackend } from '../backends/types';
