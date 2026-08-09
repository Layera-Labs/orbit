/**
 * `@layera-labs/react/agentic` — the AI half, behind a door you have to open.
 *
 * `useOrbitAgentic` used to sit on the main barrel (`src/hooks/index.ts`, which
 * `src/index.ts` re-exports wholesale), so `import { … } from '@layera-labs/react'`
 * handed it to every consumer whether or not they had an AI layer at all. That
 * made the opt-in true-by-accident: nothing in the package's SHAPE said the AI
 * surface was separable, only the current state of its imports did.
 *
 * So it lives here instead. The rule this entry exists to enforce: the AI
 * surface is reached through this subpath, never through the package name.
 * `@layera-labs/agentic` is an OPTIONAL peer (see this package's `package.json`) — a
 * host that declined it still installs, builds, bundles AND TYPECHECKS
 * `@layera-labs/react`, and simply never imports this module.
 *
 * This entry is the one place where naming `@layera-labs/agentic` would be
 * legitimate, because depending on it here is the point. As of the
 * `@layera-labs/shared` move nothing under it needs to: the canvas-agent types come
 * from `@layera-labs/shared` now, which is why the whole package — subpath included
 * — is currently free of the specifier.
 *
 * `src/__tests__/ai-optional.test.ts` walks the main entry's import graph and
 * fails if a RUNTIME import of `@layera-labs/agentic` reappears there, and separately
 * fails if the main entry's TYPES name it.
 */

export { useOrbitAgentic } from '../hooks/useOrbitAgentic';
export type {
  AgenticTool,
  AgenticGenerateState,
  UseOrbitAgenticOptions,
} from '../hooks/useOrbitAgentic';
export type { AiBackend } from '../backends/types';
