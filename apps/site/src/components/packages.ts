/**
 * The published package set, and the edges between its members.
 *
 * These are not a marketing selection. Every node below is a package this
 * repo actually publishes, and every edge is a real entry in that package's
 * `dependencies` or `peerDependencies` — read off the manifests rather than
 * drawn from memory, which is the only reason a diagram like this is worth
 * showing at all. `apps/site/src/components/__tests__/packages.test.ts` reads
 * the manifests back and fails if this file drifts from them.
 *
 * `col` is dependency depth (0 = depends on nothing else here) and `y` is a
 * hand-set row, because a force layout would put the two halves of the SDK
 * wherever the maths landed and the point of the picture is that they are two
 * distinct halves.
 */

export type Tier = 'engine' | 'v2' | 'v1';

export interface Pkg {
  /** The name after the `@layera-labs/orbit-` prefix, which the graph states once. */
  id: string;
  role: string;
  col: number;
  y: number;
  tier: Tier;
}

export const PACKAGES: Pkg[] = [
  // The engine. Depends on nothing, which is the whole reason it can be the
  // thing both previews and the encoder agree through.
  { id: 'video', role: 'Effect maths, the ffmpeg arg builder, and the frame ops both previews draw.', col: 0, y: 52, tier: 'engine' },

  // v2 — the current web SDK.
  { id: 'model', role: 'The document: a Valtio store, history, and the ops that mutate it.', col: 0, y: 150, tier: 'v2' },
  { id: 'render', role: 'Draws that document with react-konva.', col: 1, y: 120, tier: 'v2' },
  { id: 'providers', role: 'Where assets, fonts and AI come from. A registry you fill in.', col: 1, y: 180, tier: 'v2' },
  { id: 'editor', role: 'The assembled React editor: panels, inspectors, the canvas.', col: 2, y: 150, tier: 'v2' },

  // v1 — feature-complete, documented, and in maintenance.
  { id: 'shared', role: 'Types and helpers the v1 half is built on.', col: 0, y: 300, tier: 'v1' },
  { id: 'ui', role: 'v1 primitives.', col: 1, y: 252, tier: 'v1' },
  { id: 'effects', role: 'v1 filters and adjustments.', col: 1, y: 312, tier: 'v1' },
  { id: 'agentic', role: 'The AI layer. An optional peer — v1 builds and runs without it.', col: 1, y: 372, tier: 'v1' },
  { id: 'core', role: 'The v1 canvas engine.', col: 2, y: 300, tier: 'v1' },
  { id: 'react', role: 'The v1 React bindings.', col: 3, y: 312, tier: 'v1' },
  { id: 'next', role: 'v1 wired for the Next App Router.', col: 4, y: 312, tier: 'v1' },
];

/** `[from, to]` — `from` depends on `to`. */
export const EDGES: [string, string][] = [
  ['render', 'model'],
  ['providers', 'model'],
  ['editor', 'model'],
  ['editor', 'providers'],
  ['editor', 'render'],

  ['core', 'effects'],
  ['core', 'shared'],
  ['react', 'core'],
  ['react', 'effects'],
  ['react', 'shared'],
  ['react', 'ui'],
  ['react', 'agentic'],
  ['next', 'react'],
  ['ui', 'shared'],
  ['effects', 'shared'],
  ['agentic', 'shared'],
];

/*
 * Geometry. A node is drawn as a RULE with its name above it — not a box —
 * and a connector runs from the right end of one rule to the left end of the
 * next. So a column's x is where its rules begin, `NODE_W` is how long they
 * are, and the gap between (`COL_X[n+1] - COL_X[n] - NODE_W`) is the space the
 * connectors have to turn in.
 */
export const COL_X = [64, 268, 472, 676, 880];
export const NODE_W = 150;
export const VIEW_W = 1060;
export const VIEW_H = 430;
