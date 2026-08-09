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
 * The one difference from that walker, and the whole subtlety here: `import
 * type` is FINE. Three modules still type-import agentic's own domain types
 * (`backends/types.ts`, `agentic/actions.ts`, `hooks/useOrbitAgentic.ts`)
 * because copying a twelve-member action union would drift. Those erase
 * entirely at build time and cost a consumer nothing at runtime. A value import
 * of the same specifier does not. This file has to tell them apart.
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

/** Every file reachable from `entry` at runtime, plus every bare specifier seen. */
function walk(entry: string): { files: Set<string>; bare: Map<string, string[]> } {
  const files = new Set<string>();
  const bare = new Map<string, string[]>();
  const queue = [entry];

  while (queue.length) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    const source = runtimeSource(readFileSync(file, 'utf8'));
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

  it('still reaches the modules that type-import it, so this is not passing by absence', () => {
    /*
     * `OrbitEditor` renders `AgenticPanel`, which imports both of these for
     * their VALUES. So they are genuinely in the main entry's runtime graph
     * while type-importing `@orbit/agentic`, which is the exact configuration
     * this test exists to keep honest: if a refactor cut them out, the
     * assertion above would go green for the wrong reason and stay green the
     * day someone put a value import back.
     */
    for (const typed of ['/agentic/actions.ts', '/hooks/useOrbitAgentic.ts']) {
      expect([...files].some((f) => f.endsWith(typed))).toBe(true);
    }
  });

  it('does not reach `backends/types.ts` at all, because every edge to it is type-only', () => {
    /*
     * Worth stating rather than leaving implicit. That module is the one whose
     * `.d.ts` names `@orbit/agentic`, and it is imported ONLY as
     * `import type` — by `index.ts`, `OrbitEditor.tsx` and three components.
     * Its absence from this graph is the walker agreeing with the compiler,
     * not the walker losing an edge: the file exists and the type import in it
     * is real.
     */
    expect([...files].some((f) => f.endsWith('/backends/types.ts'))).toBe(false);
    const types = readFileSync(resolve(SRC, 'backends/types.ts'), 'utf8');
    expect(types).toMatch(/import type \{[^}]*\} from '@orbit\/agentic'/);
    expect(offenders(walk(resolve(SRC, 'backends/types.ts')).bare)).toEqual([]);
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

  it('passes on the same graph once the import is type-only', () => {
    const dir = mkdtempSync(join(tmpdir(), 'orbit-ai-optional-'));
    writeFileSync(join(dir, 'entry.ts'), `export * from './leaf';\n`);
    writeFileSync(
      join(dir, 'leaf.ts'),
      `import type { CanvasAgentParams } from '@orbit/agentic';\nexport type P = CanvasAgentParams;\n`,
    );
    expect(offenders(walk(join(dir, 'entry.ts')).bare)).toEqual([]);
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
