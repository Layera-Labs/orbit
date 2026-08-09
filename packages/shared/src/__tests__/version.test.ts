import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ORBIT_VERSION } from '../version';

/**
 * `src/version.ts` is generated from `package.json` by `scripts/gen-version.mjs`
 * at the front of the build, and committed so a clean checkout can typecheck and
 * test without building first. Committing a generated file re-opens the exact
 * hole the generator closed — a stale copy nobody rebuilt, or one somebody
 * edited — so this closes it from the other side.
 *
 * It reads the manifest off disk rather than importing it, because a JSON import
 * would put the whole thing in this package's bundle graph. See the generator's
 * header for why that matters here.
 */
describe('ORBIT_VERSION', () => {
  it('is exactly the version in package.json', () => {
    // Located from the working directory, not `import.meta.url`: the suite runs
    // in the jsdom environment, where `import.meta.url` is an http URL that
    // `fileURLToPath` rejects. Vitest is invoked from the repository root by the
    // root script and from this package by its own, so both are tried.
    const manifest = ['packages/shared/package.json', 'package.json']
      .map((p) => resolve(process.cwd(), p))
      .find((p) => existsSync(p) && JSON.parse(readFileSync(p, 'utf8')).name === '@layera-labs/shared');

    expect(manifest).toBeTruthy();
    const pkg = JSON.parse(readFileSync(manifest as string, 'utf8')) as { version?: unknown };

    expect(typeof pkg.version).toBe('string');
    expect(ORBIT_VERSION).toBe(pkg.version);
  });
});
