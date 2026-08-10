/**
 * `usePreview` — the compositor bound to a component.
 *
 * One rAF loop, one clock, one media pool, one audio graph, torn down together.
 * Separate from `./preview` because it is the only part that imports React: a
 * consumer driving the canvas from its own loop, or from a framework that is
 * not React, should never have to resolve it. React is an OPTIONAL peer for
 * exactly that reason — the same arrangement `@layera-labs/react/agentic` uses
 * for its AI layer.
 *
 * The two things it cannot know — how to turn a project's src scheme into a URL
 * the browser can load, and where the caption font bytes come from — arrive as
 * `PreviewDeps`. See `preview/usePreview.ts` for why neither is defaulted.
 */
export { usePreview, visualClipsOf } from './preview/usePreview';
export type { PreviewApi, PreviewDeps } from './preview/usePreview';
