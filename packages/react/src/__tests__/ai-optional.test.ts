/**
 * Guards the AI opt-in.
 *
 * `@orbit/agentic` is an OPTIONAL peer of this package. A host that wants the
 * image editor, the timeline and video EXPORT — all core editing — must be able
 * to install `@orbit/react`, render `<OrbitEditor>` and ship a bundle without
 * the AI layer resolving at all. Nothing in the type system says so: one
 * `import { OrbitBackendAdapter } from '@orbit/agentic'` added to any module
 * the main entry can reach puts it back, and the failure surfaces in someone
 * else's repo as an unresolved specifier at bundle time.
 *
 * So: walk the SOURCE import graph from `src/index.ts` and assert no RUNTIME
 * import of `@orbit/agentic` is reachable. Modelled on
 * `packages/video/src/__tests__/browser-safety.test.ts`, source rather than
 * `dist/` for the same reasons — it runs with no build step and it names the
 * file that introduced the edge.
 *
 * That is HALF the boundary, and for a while it was the only half we had.
 *
 * The other half is the TYPES. `import type` costs a consumer nothing at
 * runtime — it erases from the bundle entirely — but it does NOT erase from the
 * `.d.ts` TypeScript emits. `backends/types.ts` used to type-import
 * `CanvasAgentParams` from `@orbit/agentic`, `AiBackend` is named by
 * `OrbitEditorProps.aiBackend`, and so `dist/backends/types.d.ts` shipped
 * `import { CanvasAgentParams } from '@orbit/agentic'` on the MAIN entry's
 * declaration graph. A host who declined the optional peer and ran `tsc` with
 * `skipLibCheck: false` got `TS2307: Cannot find module '@orbit/agentic'` —
 * measured, not theorised — which is the editing SDK failing to typecheck over
 * an AI package they deliberately did not install.
 *
 * So this file now walks the graph TWICE, with two different definitions of an
 * edge:
 *   - runtime edges only (type imports stripped) — what a bundler pulls in;
 *   - every edge including type-only ones — what the emitted `.d.ts` names.
 * The main entry must be clean under BOTH. The `./agentic` subpath is held to
 * the runtime rule only: naming the AI package is the entire point of that
 * entry, and a host reaching for it has installed the peer by definition.
 *
 * The canvas-agent shapes now live in `@orbit/shared`, which both packages
 * depend on unconditionally, so nothing is copied and nothing drifts.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The AI package and anything under it. Never a runtime edge from `.`. */
const FORBIDDEN = /^@orbit\/agentic(\/|$)/;

/**
 * Every form that pulls another module in at RUNTIME.
 *
 * Copied deliberately from the video package's walker, blind spots and all
 * already closed: `import 'x'` for side effects has no `from`; `require('x')`
 * is legal in a `.ts`; `export … from 'y'` is covered by the `from` branch and
 * is how every barrel in this package is written, so it matters most.
 */
const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;

/**
 * `import type … from 'x'` / `export type … from 'x'` — erased by the compiler.
 *
 * `[^;]` rather than `[\s\S]`, and that is not cosmetic. A greedy-across-
 * statements version matches from a plain `export type X = string;` all the way
 * forward to the NEXT statement's `from '…'` and deletes a real runtime import
 * on the way — a blind spot precisely where this file is supposed to look.
 * Stopping at the statement terminator makes the match stay inside one
 * statement, while still spanning the newlines of a multi-line named import.
 */
const TYPE_ONLY = /\b(?:import|export)\s+type\b[^;]*?from\s*['"][^'"]+['"]/g;

/** Block comments, which in this package are long and quote module names. */
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;

/**
 * What a bundler would actually keep.
 *
 * Order matters: comments first (a doc comment explaining the rule must not
 * trip the rule), then type-only statements.
 *
 * An inline `import { type A, B } from 'x'` is deliberately NOT stripped. TypeScript
 * elides such an import when every binding turns out to be a type, so this is
 * stricter than the compiler — and stricter is the safe direction: the worst
 * case is a false failure someone fixes by writing `import type`, never a
 * runtime edge slipping past.
 */
function runtimeSource(source: string): string {
  return source.replace(BLOCK_COMMENT, '').replace(TYPE_ONLY, '');
}

function resolveRelative(fromFile: string, spec: string): string | null {
  // A `.js` specifier resolves to the `.ts`/`.tsx` beside it (NodeNext style).
  const bare = spec.replace(/\.js$/, '');
  const base = resolve(dirname(fromFile), bare);
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    base,
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Every file reachable from `entry`, plus every bare specifier seen.
 *
 * `mode: 'runtime'` strips type-only statements first, so the graph is what a
 * bundler keeps. `mode: 'types'` keeps them, so the graph is what the emitted
 * `.d.ts` files name — a superset, and the one that decides whether a consumer
 * without the optional peer can run `tsc`.
 */
function walk(
  entry: string,
  mode: 'runtime' | 'types' = 'runtime',
): { files: Set<string>; bare: Map<string, string[]> } {
  const files = new Set<string>();
  const bare = new Map<string, string[]>();
  const queue = [entry];

  while (queue.length) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    const raw = readFileSync(file, 'utf8');
    // Comments come out either way: a doc comment quoting an import must never
    // trip the rule it is documenting.
    const source = mode === 'runtime' ? runtimeSource(raw) : raw.replace(BLOCK_COMMENT, '');
    for (const match of source.matchAll(SPECIFIER)) {
      const spec = match[1];
      if (spec.startsWith('.')) {
        const next = resolveRelative(file, spec);
        if (next) queue.push(next);
        continue;
      }
      bare.set(spec, [...(bare.get(spec) ?? []), file]);
    }
  }
  return { files, bare };
}

function offenders(bare: Map<string, string[]>): string[] {
  return [...bare.entries()]
    .filter(([spec]) => FORBIDDEN.test(spec))
    .map(([spec, importers]) => `${spec} (from ${importers.join(', ')})`);
}

describe('the main entry never needs the AI package at runtime', () => {
  const { files, bare } = walk(resolve(SRC, 'index.ts'));

  it('actually traverses the graph', () => {
    // Without this the assertions below could pass on an empty walk.
    expect(files.size).toBeGreaterThan(20);
    expect([...files].some((f) => f.endsWith('/OrbitEditor.tsx'))).toBe(true);
    // The export modal is the module that made this a problem in the first
    // place: it used to construct an agentic client purely to render an MP4.
    expect([...files].some((f) => f.endsWith('/VideoExportModal.tsx'))).toBe(true);
  });

  it('imports no value from @orbit/agentic', () => {
    expect(offenders(bare)).toEqual([]);
  });

  it('still reaches the AI-adjacent modules, so this is not passing by absence', () => {
    /*
     * `OrbitEditor` renders `AgenticPanel`, which imports both of these for
     * their VALUES. So they are genuinely in the main entry's runtime graph
     * while being the modules most likely to reach for the AI package, which is
     * the configuration this test exists to keep honest: if a refactor cut them
     * out, the assertion above would go green for the wrong reason and stay
     * green the day someone put a value import back.
     */
    for (const typed of ['/agentic/actions.ts', '/hooks/useOrbitAgentic.ts']) {
      expect([...files].some((f) => f.endsWith(typed))).toBe(true);
    }
  });

  it('does not reach `backends/types.ts` at all, because every edge to it is type-only', () => {
    /*
     * Worth stating rather than leaving implicit: that module is imported ONLY
     * as `import type` — by `index.ts`, `OrbitEditor.tsx` and three components.
     * Its absence from THIS graph is the walker agreeing with the compiler, not
     * the walker losing an edge — the suite below reaches it, from the same
     * entry, once type edges count.
     */
    expect([...files].some((f) => f.endsWith('/backends/types.ts'))).toBe(false);
  });
});

/**
 * The type half, which the runtime walk above cannot see.
 *
 * This is the assertion that would have caught the gap that shipped: every edge
 * counts here, type-only included, because every one of them survives into the
 * `.d.ts` the consumer's `tsc` reads.
 */
describe("the main entry's TYPES never name the AI package either", () => {
  const { files, bare } = walk(resolve(SRC, 'index.ts'), 'types');

  it('reaches strictly more than the runtime walk, including `backends/types.ts`', () => {
    // Without this the assertion below could pass because the walk found
    // nothing — and `backends/types.ts` specifically is the module whose
    // `.d.ts` named `@orbit/agentic`, so it MUST be in scope here.
    const runtimeFiles = walk(resolve(SRC, 'index.ts')).files;
    expect(files.size).toBeGreaterThan(runtimeFiles.size);
    expect([...files].some((f) => f.endsWith('/backends/types.ts'))).toBe(true);
  });

  it('names @orbit/agentic in no import form at all', () => {
    expect(offenders(bare)).toEqual([]);
  });

  it('gets the canvas-agent shapes from @orbit/shared, a real dependency', () => {
    /*
     * The positive half of the claim. `@orbit/shared` is a `dependencies` entry,
     * not an optional peer, so naming it in a `.d.ts` always resolves — which is
     * the whole reason the shapes were moved there rather than copied here.
     */
    const types = readFileSync(resolve(SRC, 'backends/types.ts'), 'utf8');
    expect(types).toMatch(/CanvasAgentParams[\s\S]*?\} from '@orbit\/shared'/);
    expect(types).not.toMatch(/@orbit\/agentic'/);
    const pkg = JSON.parse(readFileSync(resolve(SRC, '../package.json'), 'utf8'));
    expect(pkg.dependencies['@orbit/shared']).toBeDefined();
  });
});

describe('the AI surface ships from the subpath, not the package name', () => {
  it('is not on the main barrel', () => {
    // `src/index.ts` re-exports `./hooks` wholesale, so both files count.
    const barrels = [resolve(SRC, 'index.ts'), resolve(SRC, 'hooks/index.ts')].map((f) =>
      runtimeSource(readFileSync(f, 'utf8')),
    );
    for (const barrel of barrels) {
      expect(barrel).not.toMatch(/export\s*\{[^}]*\buseOrbitAgentic\b/);
    }
  });

  it('is on `@orbit/react/agentic`, and that entry resolves', () => {
    const entry = resolve(SRC, 'agentic/index.ts');
    expect(existsSync(entry)).toBe(true);
    expect(readFileSync(entry, 'utf8')).toMatch(/export\s*\{\s*useOrbitAgentic\s*\}/);

    // The `exports` map has to point at what the build emits, or the subpath is
    // types with no runtime behind them — which is exactly what `./headless`
    // was before this change.
    const pkg = JSON.parse(readFileSync(resolve(SRC, '../package.json'), 'utf8'));
    expect(pkg.exports['./agentic']).toEqual({
      types: './dist/agentic/index.d.ts',
      import: './dist/agentic/index.js',
    });
    const vite = readFileSync(resolve(SRC, '../vite.config.ts'), 'utf8');
    expect(vite).toContain(`'agentic/index'`);
  });

  it('declares @orbit/agentic as an optional peer, never a dependency', () => {
    const pkg = JSON.parse(readFileSync(resolve(SRC, '../package.json'), 'utf8'));
    expect(pkg.dependencies['@orbit/agentic']).toBeUndefined();
    expect(pkg.peerDependencies['@orbit/agentic']).toBeDefined();
    expect(pkg.peerDependenciesMeta['@orbit/agentic'].optional).toBe(true);
    // And it must still RESOLVE here, or the type-only imports above stop
    // compiling in this workspace. That is what the devDependency is for.
    expect(pkg.devDependencies['@orbit/agentic']).toBeDefined();
  });
});

/**
 * The walker's own correctness, proven rather than assumed.
 *
 * Every assertion above is of the form "nothing bad was found", which is what a
 * broken checker reports too. These build graphs that MUST trip it.
 */
describe('the walker would catch a runtime import if one were added', () => {
  it('fails on a synthetic entry that imports the AI package for a value', () => {
    const dir = mkdtempSync(join(tmpdir(), 'orbit-ai-optional-'));
    writeFileSync(join(dir, 'entry.ts'), `export * from './leaf';\n`);
    writeFileSync(
      join(dir, 'leaf.ts'),
      `import { OrbitBackendAdapter } from '@orbit/agentic';\nexport const a = OrbitBackendAdapter;\n`,
    );
    const graph = walk(join(dir, 'entry.ts'));

    // It followed the relative edge...
    expect([...graph.files].some((f) => f.endsWith('/leaf.ts'))).toBe(true);
    // ...and reported the specifier the real assertions look for.
    expect(offenders(graph.bare)).toHaveLength(1);
  });

  it('passes on the same graph once the import is type-only — and the TYPE walk still fails it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'orbit-ai-optional-'));
    writeFileSync(join(dir, 'entry.ts'), `export * from './leaf';\n`);
    writeFileSync(
      join(dir, 'leaf.ts'),
      `import type { CanvasAgentParams } from '@orbit/agentic';\nexport type P = CanvasAgentParams;\n`,
    );
    // The bundler is happy...
    expect(offenders(walk(join(dir, 'entry.ts')).bare)).toEqual([]);
    // ...and the consumer's `tsc` is not. This is exactly the shape of the gap
    // that shipped in `backends/types.ts`, and the reason for the second mode.
    expect(offenders(walk(join(dir, 'entry.ts'), 'types').bare)).toHaveLength(1);
  });

  it("the type walk follows edges the runtime walk drops, so it cannot miss a hop", () => {
    /*
     * A type-only edge to a module that itself names the AI package. The
     * runtime walk never even opens `leaf.ts`; the type walk must.
     */
    const dir = mkdtempSync(join(tmpdir(), 'orbit-ai-optional-'));
    writeFileSync(join(dir, 'entry.ts'), `export type { P } from './leaf';\n`);
    writeFileSync(
      join(dir, 'leaf.ts'),
      `import type { CanvasAgentParams } from '@orbit/agentic';\nexport type P = CanvasAgentParams;\n`,
    );
    expect([...walk(join(dir, 'entry.ts')).files].some((f) => f.endsWith('/leaf.ts'))).toBe(false);
    expect([...walk(join(dir, 'entry.ts'), 'types').files].some((f) => f.endsWith('/leaf.ts'))).toBe(
      true,
    );
    expect(offenders(walk(join(dir, 'entry.ts'), 'types').bare)).toHaveLength(1);
  });

  it('sees every form of runtime import', () => {
    const seen = (src: string) => [...runtimeSource(src).matchAll(SPECIFIER)].map((m) => m[1]);
    expect(seen(`import '@orbit/agentic';`)).toEqual(['@orbit/agentic']);
    expect(seen(`const x = require('@orbit/agentic');`)).toEqual(['@orbit/agentic']);
    expect(seen(`const x = await import('@orbit/agentic');`)).toEqual(['@orbit/agentic']);
    expect(seen(`export { X } from '@orbit/agentic';`)).toEqual(['@orbit/agentic']);
    expect(seen(`export * from '@orbit/agentic';`)).toEqual(['@orbit/agentic']);
    expect(seen(`import X from '@orbit/agentic';`)).toEqual(['@orbit/agentic']);
  });

  it('erases only the type-only forms, and is not fooled by a comment', () => {
    const seen = (src: string) => [...runtimeSource(src).matchAll(SPECIFIER)].map((m) => m[1]);
    expect(seen(`import type { A } from '@orbit/agentic';`)).toEqual([]);
    expect(seen(`export type { A } from '@orbit/agentic';`)).toEqual([]);
    // A doc comment quoting a real import statement must not fail the build.
    expect(seen(`/* never write: import { A } from '@orbit/agentic'; */`)).toEqual([]);
    // Stripping one type-only statement must not swallow the next real one.
    expect(
      seen(`import type { A } from '@orbit/agentic';\nimport { B } from '@orbit/agentic';`),
    ).toEqual(['@orbit/agentic']);
    // A multi-line type-only import is still erased whole.
    expect(seen(`import type {\n  A,\n  B,\n} from '@orbit/agentic';`)).toEqual([]);
    // And a local `export type` alias must not swallow the import after it.
    expect(seen(`export type X = string;\nimport { B } from '@orbit/agentic';`)).toEqual([
      '@orbit/agentic',
    ]);
  });

  it('follows a `.js` specifier and a directory index, as this package writes them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'orbit-ai-optional-'));
    writeFileSync(join(dir, 'entry.ts'), `export * from './leaf.js';\n`);
    writeFileSync(join(dir, 'leaf.ts'), `import '@orbit/agentic';\n`);
    expect(offenders(walk(join(dir, 'entry.ts')).bare)).toHaveLength(1);
  });
});
