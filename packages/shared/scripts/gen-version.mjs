/**
 * Writes `src/version.ts` from `package.json`.
 *
 * `ORBIT_VERSION` used to be typed by hand, and by the time anyone looked it
 * said `0.0.1` inside a package published at `1.0.0-beta.2` — two orders of
 * release out of date, with nothing anywhere to notice. A constant that has to
 * be kept in step with a manifest by remembering to is not a constant, it is a
 * bug with a release schedule.
 *
 * The manifest is the only version that is ever true, so it is the only one
 * written by a human. This runs at the front of the package's build. The
 * generated file is committed so `tsc --noEmit` and Vitest work on a clean
 * checkout without a build first, and `version.test.ts` fails the suite if that
 * committed copy is stale — so the two ways this could drift (nobody rebuilt,
 * or somebody edited the generated file) are both caught rather than shipped.
 *
 * It stays a build step rather than `import pkg from '../package.json'` because
 * this package must remain safe to bundle for a browser: a JSON import puts the
 * whole manifest — dependency ranges, scripts, internal notes — into every
 * consumer's bundle, and `rootDir: ./src` would have to be widened to allow it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkgUrl = new URL('../package.json', import.meta.url);
const outUrl = new URL('../src/version.ts', import.meta.url);

const { version } = JSON.parse(readFileSync(pkgUrl, 'utf8'));
if (typeof version !== 'string' || version.length === 0) {
  throw new Error('packages/shared/package.json has no "version" to generate from');
}

const contents = `/**
 * GENERATED FILE — do not edit.
 *
 * Written by \`scripts/gen-version.mjs\` from this package's \`package.json\` at
 * the start of every build. Change the version in the manifest; this follows.
 * \`src/__tests__/version.test.ts\` fails if this copy falls behind.
 */

/** The version of \`@layera-labs/orbit-shared\` this build was cut from. */
export const ORBIT_VERSION = '${version}';
`;

const existing = (() => {
  try {
    return readFileSync(outUrl, 'utf8');
  } catch {
    return null;
  }
})();

if (existing !== contents) {
  writeFileSync(outUrl, contents);
  console.log(`gen-version: wrote ${fileURLToPath(outUrl)} (${version})`);
}
