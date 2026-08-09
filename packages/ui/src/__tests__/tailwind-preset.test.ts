import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { darkTheme } from '../themes/dark';
import { lightTheme } from '../themes/light';

/**
 * A preset that covers most of the class names is still broken — the one it
 * misses renders as nothing, silently, in whatever component uses it. So rather
 * than list the names by hand (a second copy, drifting the moment a component
 * gains a utility) these read them out of the components and out of the themes,
 * and check the preset joins the two.
 *
 * Three things can go wrong and all three are checked: a class the components
 * emit that the preset does not define; a preset entry pointing at a custom
 * property no theme sets; and the two themes disagreeing about which properties
 * exist, which would make one of them half-styled.
 */

/**
 * Located from the working directory rather than `import.meta.url`: the suite
 * runs in the jsdom environment, where `import.meta.url` is an http URL and
 * neither `fileURLToPath` nor `createRequire` accepts it. Vitest is invoked
 * from the repository root by the root script and from this package by its own,
 * so both are tried.
 */
const pkgDir = ['packages/ui', '.']
  .map((d) => resolve(process.cwd(), d))
  .find((d) => existsSync(join(d, 'tailwind.preset.cjs')));

if (!pkgDir) throw new Error('cannot locate packages/ui from ' + process.cwd());

const require = createRequire(join(pkgDir, 'noop.cjs'));
const preset = require(join(pkgDir, 'tailwind.preset.cjs')) as {
  theme: { extend: Record<string, unknown> };
};

const srcDir = join(pkgDir, 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === '__tests__' ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

const source = sourceFiles(srcDir)
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

/**
 * Which part of the theme a given utility prefix reads from. Tailwind resolves
 * `p-`/`px-`/`gap-`/`space-`/`top-` and friends from `spacing`, so they all
 * point there; `ring-`/`border-`/`text-`/`bg-` resolve from `colors`.
 */
const SCALES: Array<{ scale: string; prefixes: string[] }> = [
  {
    scale: 'colors',
    prefixes: [
      'bg', 'text', 'border', 'border-t', 'border-b', 'border-l', 'border-r',
      'ring', 'fill', 'stroke', 'divide', 'outline', 'placeholder', 'caret',
    ],
  },
  {
    scale: 'spacing',
    prefixes: [
      'p', 'px', 'py', 'pt', 'pb', 'pl', 'pr',
      'm', 'mx', 'my', 'mt', 'mb', 'ml', 'mr',
      'gap', 'gap-x', 'gap-y', 'space-x', 'space-y',
      'top', 'bottom', 'left', 'right', 'inset',
    ],
  },
  { scale: 'borderRadius', prefixes: ['rounded'] },
  { scale: 'boxShadow', prefixes: ['shadow'] },
  { scale: 'zIndex', prefixes: ['z'] },
  { scale: 'transitionDuration', prefixes: ['duration'] },
  { scale: 'transitionTimingFunction', prefixes: ['ease'] },
  { scale: 'fontSize', prefixes: ['text'] },
  { scale: 'fontFamily', prefixes: ['font'] },
  { scale: 'animation', prefixes: ['animate'] },
  { scale: 'width', prefixes: ['w', 'min-w', 'max-w'] },
  { scale: 'height', prefixes: ['h', 'min-h', 'max-h'] },
];

/** `orbit.accent-hover` and `orbit-accent-hover` both name one key. */
function keysOf(scale: string): Set<string> {
  const value = preset.theme.extend[scale] as Record<string, unknown> | undefined;
  const keys = new Set<string>();
  for (const [k, v] of Object.entries(value ?? {})) {
    if (k === 'orbit' && v && typeof v === 'object' && !Array.isArray(v)) {
      for (const nested of Object.keys(v as Record<string, unknown>)) {
        keys.add(nested === 'DEFAULT' ? 'orbit' : `orbit-${nested}`);
      }
    } else {
      keys.add(k);
    }
  }
  return keys;
}

/** Every `<prefix>-orbit-<name>` literal in the components, variants stripped. */
function emittedClasses(): string[] {
  const found = new Set<string>();
  for (const raw of source.match(/[a-zA-Z0-9:_\-[\]]*\borbit-[a-zA-Z0-9-]+/g) ?? []) {
    // Strip `hover:`, `focus-visible:`, and arbitrary variants like
    // `[&::-webkit-slider-thumb]:` down to the bare utility.
    const bare = raw.slice(raw.lastIndexOf(':') + 1);
    if (bare.startsWith('--')) continue; // a CSS custom property, not a class
    if (!bare.includes('-orbit-')) continue; // e.g. the theme id `orbit-dark`
    found.add(bare);
  }
  return [...found].sort();
}

describe('tailwind preset', () => {
  const classes = emittedClasses();

  it('finds the class names to check (guards the extractor itself)', () => {
    expect(classes.length).toBeGreaterThan(40);
    expect(classes).toContain('bg-orbit-accent');
    expect(classes).toContain('text-orbit-text');
    expect(classes).toContain('animate-orbit-spin');
  });

  it('defines every orbit class the components emit', () => {
    const unresolved = classes.filter((cls) => {
      const at = cls.indexOf('-orbit-');
      const prefix = cls.slice(0, at);
      const key = cls.slice(at + 1);
      return !SCALES.some(
        ({ scale, prefixes }) => prefixes.includes(prefix) && keysOf(scale).has(key),
      );
    });
    expect(unresolved).toEqual([]);
  });

  it('references only custom properties the themes actually define', () => {
    const defined = new Set(Object.keys(darkTheme.variables));
    const referenced = new Set(
      JSON.stringify(preset.theme.extend).match(/--orbit-[a-z0-9-]+/g) ?? [],
    );
    expect([...referenced].filter((v) => !defined.has(v)).sort()).toEqual([]);
  });

  it('has both themes defining the same properties', () => {
    expect(Object.keys(lightTheme.variables).sort()).toEqual(
      Object.keys(darkTheme.variables).sort(),
    );
  });

  it('maps the names that are not a mechanical transform', () => {
    const colors = (preset.theme.extend.colors as { orbit: Record<string, string> }).orbit;
    // These three are the ones a reasonable person would get wrong by guessing.
    expect(colors.text).toBe('var(--orbit-text-primary)');
    expect(colors.panel).toBe('var(--orbit-panel-bg)');
    expect(colors.hover).toBe('var(--orbit-hover-bg)');
  });
});
