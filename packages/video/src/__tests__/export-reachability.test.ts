/**
 * Compiled is not exported.
 *
 * `package-entries.test.ts` proves every declared SUBPATH is built. Nothing
 * proved the other half: that every symbol built into `dist/` can be named by
 * some specifier. `vite` emits one file per module under `src/`, so a function
 * can be present, typed, documented and covered by tests while being reachable
 * from no entry at all — the exports map admits only `.`, `./browser`, `./node`
 * and `./types`, and a bundler rejects a deep `@layera-labs/video/dist/x.js`
 * outright.
 *
 * In-workspace nothing notices, because every consumer here resolves the same
 * map and only imports what it happens to need. It surfaces the moment somebody
 * installs the tarball and reaches for something that is obviously in the
 * package — which is how `beta.2` shipped, and how `beta.3` shipped a karaoke
 * caption whose plate keys no outside caller could compute.
 *
 * So: every exported symbol is reachable, or it is listed below as deliberately
 * internal with a reason. There is no third state. Adding an export without
 * deciding which it is fails here, which is the entire point — the failure that
 * keeps happening is not "we chose wrong", it is "nobody chose".
 *
 * Source-level on purpose, exactly as `package-entries.test.ts` argues: a stale
 * `dist/` on a developer's disk cannot satisfy it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The four files named by `package.json#exports`. */
const ENTRIES = ['index', 'browser', 'node', 'types'];

/**
 * Symbols that are exported from their module but deliberately not from any
 * entry. Each needs a reason, because the reason is the thing that was missing
 * every time this went wrong.
 */
const INTERNAL: Record<string, { reason: string; symbols: string[] }> = {
  svg: {
    reason:
      'The injection guards. Promising them publicly would freeze the escaping ' +
      'rules of a security boundary as API; callers get a safe surface instead.',
    symbols: ['esc', 'num', 'col', 'fontFamily', 'assertNoExternalRefs'],
  },
  hdr: {
    reason:
      'HDR filter strings and the x265 params. `ffmpegSupportsHdr` on ./node is ' +
      'the supported way to ask, and it probes rather than assuming.',
    symbols: [
      'HDR_CONVERT_FILTER',
      'HDR_REQUIRED_FILTER',
      'HDR_UNSUPPORTED_MESSAGE',
      'HDR_X265_PARAMS',
      'supportsHdr',
    ],
  },
  render: {
    reason: 'Internals of the render loop. `renderProject` is the surface.',
    symbols: ['ffmpegErrorTail', 'parseEncodedSeconds'],
  },
  'font-metrics': {
    reason:
      'sfnt table plumbing. `parseFontMetrics` and `metricsFor` are the door; ' +
      'the table reader is free to change shape behind them.',
    symbols: ['SfntTable', 'TAG', 'readCmap', 'sfntTables'],
  },
};

/*
 * Comments are stripped before parsing, and that is not incidental: this file's
 * own subject matter lives inside comment-annotated export blocks. `browser.ts`
 * explains several re-exports with a `//` line BETWEEN the braces, and a parser
 * that splits the brace body on commas without stripping those reads the
 * comment's own commas as separators and concludes the symbol beneath it is
 * unreachable. That false positive cost a debugging round; leaving it in would
 * have made the test lie in the safe-looking direction.
 */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const DECL =
  /^export\s+(?:declare\s+)?(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm;
// Both quote styles: this package is not consistent about them, and matching
// only one silently marks a whole module's re-exports unreachable.
const REEXPORT = /export\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]\.\/([\w-]+)['"]/g;
const STAR = /export\s+\*\s+from\s*['"]\.\/([\w-]+)['"]/g;

const read = (mod: string) => strip(readFileSync(resolve(SRC, `${mod}.ts`), 'utf8'));
const declaredIn = (mod: string) => [...read(mod).matchAll(DECL)].map((m) => m[1]);

/** `module:symbol` pairs an outside consumer can name, following re-export chains. */
function reachable(): Set<string> {
  const found = new Set<string>();
  const seen = new Set<string>();
  const walk = (mod: string) => {
    if (seen.has(mod)) return;
    seen.add(mod);
    const src = read(mod);
    for (const m of src.matchAll(REEXPORT)) {
      for (const raw of m[1].split(',')) {
        // `type Foo` and `Foo as Bar` both name `Foo` in the source module.
        const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
        if (name) found.add(`${m[2]}:${name}`);
      }
      walk(m[2]);
    }
    for (const m of src.matchAll(STAR)) {
      for (const name of declaredIn(m[1])) found.add(`${m[1]}:${name}`);
      walk(m[1]);
    }
  };
  ENTRIES.forEach(walk);
  return found;
}

const modules = readdirSync(SRC)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
  .map((f) => f.replace(/\.ts$/, ''))
  .filter((m) => !ENTRIES.includes(m));

const REACHABLE = reachable();
const isInternal = (mod: string, sym: string) => INTERNAL[mod]?.symbols.includes(sym) ?? false;

describe('every exported symbol is reachable, or declared internal', () => {
  it('parsed a real package, so the checks below are not vacuous', () => {
    expect(modules.length).toBeGreaterThan(20);
    expect(REACHABLE.size).toBeGreaterThan(150);
  });

  it.each(modules)('%s exports nothing an outside consumer cannot name', (mod) => {
    const orphans = declaredIn(mod).filter(
      (sym) => !REACHABLE.has(`${mod}:${sym}`) && !isInternal(mod, sym),
    );
    expect(
      orphans,
      orphans.length
        ? `src/${mod}.ts exports ${orphans.join(', ')} but no entry re-exports them. ` +
            `Add them to browser.ts/node.ts, or list them in INTERNAL with a reason.`
        : '',
    ).toEqual([]);
  });
});

describe('the internal list stays honest', () => {
  /*
   * Both directions, because an allowlist rots in both. An entry naming a
   * symbol that no longer exists is a stale excuse, and one naming a symbol
   * that HAS since been exported quietly suppresses the check for it.
   */
  const entries = Object.entries(INTERNAL).flatMap(([mod, { symbols }]) =>
    symbols.map((sym) => [mod, sym] as const),
  );

  it.each(entries)('%s.%s still exists', (mod, sym) => {
    expect(declaredIn(mod)).toContain(sym);
  });

  it.each(entries)('%s.%s is still unreachable, so listing it still means something', (mod, sym) => {
    expect(REACHABLE.has(`${mod}:${sym}`)).toBe(false);
  });

  it('gives a reason for every module it excuses', () => {
    for (const [mod, { reason }] of Object.entries(INTERNAL)) {
      expect(reason.length, `${mod} needs a real reason`).toBeGreaterThan(40);
    }
  });
});
