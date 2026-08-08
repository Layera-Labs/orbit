/**
 * Guards the browser/node split.
 *
 * `@orbit/video/browser` exists so a web bundle can use the timeline model and
 * the effect math without resolving `node:child_process` or the native resvg
 * addon. Nothing enforces that at the type level — one stray `import` in
 * `filters.ts` silently breaks every web consumer, and the failure shows up as
 * an inscrutable bundler error in a different repo.
 *
 * So: walk the SOURCE import graph and assert it stays clean. Source rather
 * than `dist/` deliberately — this runs without a build step, and it points at
 * the file that actually introduced the import.
 *
 * TWO entries are walked, not one. `./browser` has always been guarded; the
 * DEFAULT entry (`index.ts`) is the one a bundler reaches by following the
 * package name, and it is now browser-safe too. Guarding only the explicit
 * subpath would leave the reachable-by-accident one unguarded, which is the
 * wrong way round.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Bare specifiers that must never appear in the browser graph. */
const FORBIDDEN = [/^node:/, /^@resvg\//, /^fs$/, /^path$/, /^os$/, /^child_process$/];

/**
 * Every form that pulls another module in.
 *
 * Three of these were blind spots and each one is a way to import a node
 * builtin without this test noticing:
 *   - `import 'x'` for side effects has no `from`.
 *   - `require('x')` is legal in a `.ts` file compiled to CJS.
 *   - `export … from 'y'` is covered by the `from` branch, and is how both
 *     entry files are written, so it is the most important of all.
 */
const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;

function resolveRelative(fromFile: string, spec: string): string | null {
  /*
   * A `.js` specifier resolves to the `.ts` beside it.
   *
   * This file's own package writes `./types.js` in `srt.ts` and `captions.ts` —
   * NodeNext style, where the emitted extension is written in the source. The
   * walker used to try `types.js.ts`, `types.js/index.ts` and `types.js`, find
   * none of them, and return null — silently dropping the edge. A node-only
   * module imported that way was invisible to this entire test.
   */
  const bare = spec.replace(/\.js$/, '');
  const base = resolve(dirname(fromFile), bare);
  for (const candidate of [`${base}.ts`, `${base}/index.ts`, `${base}.tsx`, base]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Every file reachable from `entry`, plus every bare specifier encountered. */
function walk(entry: string): { files: Set<string>; bare: Map<string, string[]> } {
  const files = new Set<string>();
  const bare = new Map<string, string[]>();
  const queue = [entry];

  while (queue.length) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    const source = readFileSync(file, 'utf8');
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

describe('browser entry stays browser-safe', () => {
  const { files, bare } = walk(resolve(SRC, 'browser.ts'));

  it('reaches the pure modules it is supposed to', () => {
    // Sanity: if the walker silently resolved nothing, the assertions below
    // would pass vacuously. Prove it actually traversed the graph.
    expect(files.size).toBeGreaterThan(10);
    expect([...files].some((f) => f.endsWith('/frame.ts'))).toBe(true);
    expect([...files].some((f) => f.endsWith('/ffmpeg.ts'))).toBe(true);
  });

  it('pulls in no node builtin or native addon', () => {
    const offenders = [...bare.entries()]
      .filter(([spec]) => FORBIDDEN.some((re) => re.test(spec)))
      .map(([spec, importers]) => `${spec} (from ${importers.join(', ')})`);
    expect(offenders).toEqual([]);
  });

  it('never reaches the node-only modules', () => {
    for (const nodeOnly of ['/render.ts', '/raster.ts', '/google-fonts.ts', '/node.ts']) {
      expect([...files].some((f) => f.endsWith(nodeOnly))).toBe(false);
    }
  });

  it('would catch a node import if one were added', () => {
    // Mutation check on the checker itself: the node entry MUST trip it.
    const nodeGraph = walk(resolve(SRC, 'node.ts'));
    const offenders = [...nodeGraph.bare.keys()].filter((spec) =>
      FORBIDDEN.some((re) => re.test(spec)),
    );
    expect(offenders.length).toBeGreaterThan(0);
  });
});

/**
 * The DEFAULT entry, which is the one that matters most in practice.
 *
 * `apps/web` imports `@orbit/video/browser` by convention, but nothing forces
 * it to — and a new consumer, or a copied snippet, reaches for the package name
 * first. Until this entry was flipped to `export * from './browser'` that was a
 * bundle carrying `node:child_process` and a native addon.
 *
 * The assertions are deliberately the SAME ones as above rather than a
 * weakened set: two entries, one standard.
 */
describe('the default entry stays browser-safe too', () => {
  const { files, bare } = walk(resolve(SRC, 'index.ts'));

  it('actually traverses the graph', () => {
    expect(files.size).toBeGreaterThan(10);
    expect([...files].some((f) => f.endsWith('/frame.ts'))).toBe(true);
  });

  it('pulls in no node builtin or native addon', () => {
    const offenders = [...bare.entries()]
      .filter(([spec]) => FORBIDDEN.some((re) => re.test(spec)))
      .map(([spec, importers]) => `${spec} (from ${importers.join(', ')})`);
    expect(offenders).toEqual([]);
  });

  it('never reaches the node-only modules', () => {
    for (const nodeOnly of ['/render.ts', '/raster.ts', '/google-fonts.ts', '/node.ts']) {
      expect([...files].some((f) => f.endsWith(nodeOnly))).toBe(false);
    }
  });

  it('reaches exactly what ./browser reaches, and nothing besides', () => {
    /*
     * `.` IS `./browser`, so their graphs must match — not merely both be
     * clean. A default entry that had quietly grown one extra re-export would
     * satisfy every assertion above while serving a different package from the
     * subpath, and the two would drift apart from there.
     *
     * The only permitted difference is `index.ts` itself, which is in its own
     * graph and not in the other's.
     */
    const browser = walk(resolve(SRC, 'browser.ts'));
    const extra = [...files].filter((f) => !browser.files.has(f));
    expect(extra).toEqual([resolve(SRC, 'index.ts')]);
    expect([...browser.files].filter((f) => !files.has(f))).toEqual([]);
  });
});

/**
 * The walker's own blind spots, closed.
 *
 * Each of these is a real way to reach a module that the previous regex or
 * resolver missed entirely — so a node builtin imported that way would have
 * been invisible to every assertion in this file.
 */
describe('the walker sees every form of import', () => {
  it('follows a `.js` specifier to the `.ts` beside it', () => {
    // `srt.ts` writes `./types.js`. The old resolver dropped that edge.
    const graph = walk(resolve(SRC, 'srt.ts'));
    expect([...graph.files].some((f) => f.endsWith('/types.ts'))).toBe(true);
  });

  it('records a bare side-effect import, which has no `from`', () => {
    expect([...'import "node:fs";'.matchAll(SPECIFIER)].map((m) => m[1])).toEqual(['node:fs']);
  });

  it('records a `require`', () => {
    expect([...'const x = require("node:os");'.matchAll(SPECIFIER)].map((m) => m[1])).toEqual([
      'node:os',
    ]);
  });

  it('still records the ordinary forms', () => {
    const src = `import a from './a';\nexport * from './b';\nconst c = await import('./c');`;
    expect([...src.matchAll(SPECIFIER)].map((m) => m[1]).sort()).toEqual(['./a', './b', './c']);
  });
});
