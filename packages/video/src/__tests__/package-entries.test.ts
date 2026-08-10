/**
 * The three places that have to agree about what this package exports.
 *
 * `package.json#exports` says a subpath resolves to `./dist/<name>.js`.
 * `vite.config.ts` decides which files rollup actually emits.
 * `src/<name>.ts` is the source they both refer to.
 *
 * Nothing tied them together, and the gap has a nasty shape. Adding `./node`
 * to the manifest and pointing it at `dist/node.js` LOOKED complete: the source
 * existed, `vite-plugin-dts` walks `src` and emitted `node.d.ts`, so the whole
 * workspace typechecked — while rollup emitted no `node.js` at all, because
 * `node.ts` had stopped being reachable from any build entry. A published
 * package would have shipped a subpath with types and no runtime, and the
 * failure would surface as a module-not-found in someone else's app.
 *
 * So this asserts the agreement at the SOURCE level, which needs no build and
 * so cannot be satisfied by a stale `dist/` sitting on a developer's disk.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, '../..');
const SRC = resolve(PKG_ROOT, 'src');

const manifest = JSON.parse(readFileSync(resolve(PKG_ROOT, 'package.json'), 'utf8')) as {
  exports: Record<string, { types?: string; import?: string; default?: string } | string>;
};
const viteConfig = readFileSync(resolve(PKG_ROOT, 'vite.config.ts'), 'utf8');

/** Subpaths that name a bundled module — everything except `./package.json`. */
const subpaths = Object.entries(manifest.exports).filter(
  ([key, value]) => key !== './package.json' && typeof value === 'object',
) as [string, { types: string; import: string; default: string }][];

/**
 * `index: resolve(__dirname, 'src/index.ts')` → `index`.
 *
 * The key may be quoted: a subpath like `preview-react` is not a valid bare JS
 * identifier, so rollup's entry map has to quote it. Matching only bare keys
 * silently dropped such an entry from this set, which would have made the check
 * below pass by finding nothing rather than by finding agreement.
 */
const buildEntries = new Set(
  [
    ...viteConfig.matchAll(
      /^\s*'?([\w-]+)'?:\s*resolve\(__dirname,\s*'src\/([\w-]+)\.ts'\)/gm,
    ),
  ].map((m) => m[1]),
);

describe('every exported subpath is actually built', () => {
  it('finds the subpaths and the entries, so the checks below are not vacuous', () => {
    expect(subpaths.length).toBeGreaterThanOrEqual(4);
    expect(buildEntries.size).toBeGreaterThanOrEqual(4);
  });

  it.each(subpaths)('%s has a source file, and a build entry that emits it', (key, target) => {
    // `./browser` → `browser`; `.` → `index`, the default entry's own name.
    const name = key === '.' ? 'index' : key.replace(/^\.\//, '');

    expect(existsSync(resolve(SRC, `${name}.ts`)), `src/${name}.ts is missing`).toBe(true);
    expect(target.import, `${key} should point at dist/${name}.js`).toBe(`./dist/${name}.js`);
    expect(target.types, `${key} should point at dist/${name}.d.ts`).toBe(`./dist/${name}.d.ts`);
    /*
     * The one that actually broke. `vite-plugin-dts` emits a `.d.ts` for every
     * file under `src` whether or not rollup bundles it, so a missing entry
     * costs you the runtime and leaves the types behind to hide it.
     */
    expect(buildEntries.has(name), `vite.config.ts has no build entry for ${name}`).toBe(true);
  });

  it('builds nothing it does not export', () => {
    // The other direction. An entry with no subpath is dead weight in the
    // published tarball, and usually means a rename landed on one side only.
    const exported = new Set(
      subpaths.map(([key]) => (key === '.' ? 'index' : key.replace(/^\.\//, ''))),
    );
    expect([...buildEntries].filter((e) => !exported.has(e))).toEqual([]);
  });
});
