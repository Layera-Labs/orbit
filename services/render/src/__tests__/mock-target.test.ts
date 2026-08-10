// @vitest-environment node
//
// Every `vi.mock` in this directory has to name the specifier `server.ts`
// actually imports.
//
// `vi.mock('x')` for an `x` nobody imports is a NO-OP, and vitest says nothing
// about it. When `@layera-labs/orbit-video` was split and the service moved to
// `@layera-labs/orbit-video/node`, all seven suites here kept mocking the old name — so
// `renderProject` was suddenly the real one, spawning real ffmpeg, in seven
// test files. Exactly ONE of them noticed, because only one drives a render far
// enough to care; the other six carried on passing while their stub did
// nothing at all.
//
// That is the worst kind of test failure: not a red suite, but a green one that
// has quietly stopped testing what it says. So this asserts the agreement
// directly, once, instead of relying on some future suite happening to exercise
// the path.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(resolve(HERE, '../server.ts'), 'utf8');

/** Which `@layera-labs/orbit-*` specifiers `server.ts` really imports from. */
const imported = new Set(
  [...server.matchAll(/from\s*["'](@layera-labs\/[^"']+)["']/g)].map((m) => m[1]),
);

/** Every `vi.mock('@layera-labs/orbit-…')` across the suites in this directory. */
const SELF = 'mock-target.test.ts';

const mocks = readdirSync(HERE)
  // Not itself: the prose above contains the very pattern being matched, and a
  // scanner that reads its own explanation reports it as a violation.
  .filter((f) => f.endsWith('.test.ts') && f !== SELF)
  .flatMap((f) =>
    [
      ...readFileSync(resolve(HERE, f), 'utf8').matchAll(
        /vi\.mock\(\s*["'](@layera-labs\/[^"']+)["']/g,
      ),
    ].map((m) => ({ file: f, spec: m[1] })),
  );

describe('the suites mock what the server imports', () => {
  it('found both sides, so the check below is not vacuous', () => {
    expect(imported.size).toBeGreaterThan(2);
    expect(mocks.length).toBeGreaterThan(3);
  });

  it('names a specifier server.ts imports', () => {
    const stray = mocks
      .filter((m) => !imported.has(m.spec))
      .map((m) => `${m.file} mocks ${m.spec}, which server.ts does not import`);
    expect(stray).toEqual([]);
  });

  it('mocks the render entry, not the browser one', () => {
    // The specific swap that happened. `@layera-labs/orbit-video` is browser-only now and
    // carries no `renderProject` at all, so mocking it would leave the real
    // one in place while looking entirely correct at the call site.
    expect(imported.has('@layera-labs/orbit-video/node')).toBe(true);
    expect([...imported]).not.toContain('@layera-labs/orbit-video');
  });
});
