/**
 * Guards the browser/node split.
 *
 * `@orbit/video/browser` exists so a web bundle can use the timeline model and
 * the effect math without resolving `node:child_process` or the native resvg
 * addon. Nothing enforces that at the type level — one stray `import` in
 * `filters.ts` silently breaks every web consumer, and the failure shows up as
 * an inscrutable bundler error in a different repo.
 *
 * So: walk the SOURCE import graph from `browser.ts` and assert it stays clean.
 * Source rather than `dist/` deliberately — this runs without a build step, and
 * it points at the file that actually introduced the import.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Bare specifiers that must never appear in the browser graph. */
const FORBIDDEN = [/^node:/, /^@resvg\//, /^fs$/, /^path$/, /^os$/, /^child_process$/];

/** `import x from 'y'`, `export * from 'y'`, `import('y')` — specifier only. */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*)['"]([^'"]+)['"]/g;

function resolveRelative(fromFile: string, spec: string): string | null {
  const base = resolve(dirname(fromFile), spec);
  for (const candidate of [`${base}.ts`, `${base}/index.ts`, base]) {
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
