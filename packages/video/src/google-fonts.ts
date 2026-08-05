/**
 * Server-side font resolution for the render. resvg only loads system fonts by
 * default, so a caption's chosen family would fall back to something else in
 * the export. We find the family's TTF and hand the file to resvg via
 * `fontFiles`, so the export matches the preview.
 *
 * Resolution order, and the order is the point: **local directories first, disk
 * cache second, the network last.** A render that can be satisfied from disk
 * never makes a network call, which is what makes it reproducible.
 *
 * Three things here were bugs, and each one is the same bug wearing a different
 * coat — the export quietly stops matching the preview:
 *
 *   1. **Neither fetch had a timeout.** A hung request to Google stalled the
 *      render until the whole-render timeout killed it, turning a font lookup
 *      into a failed export.
 *   2. **Failure was silent.** `try {} catch { return null }` then
 *      `.filter(Boolean)` meant an unreachable Google produced a render in a
 *      DIFFERENT FONT with nothing anywhere saying so. That is the exact
 *      divergence the dual-render invariant exists to prevent, arriving through
 *      the one door that invariant does not watch. `resolveFonts` now reports
 *      `missing` and the caller surfaces it.
 *   3. **The cache lived in `os.tmpdir()`**, which dies with the container, so
 *      every cold worker re-downloaded every family. `ORBIT_FONT_CACHE_DIR`
 *      points it at a mounted volume; the default is unchanged.
 *
 * `ORBIT_FONT_NETWORK=0` turns the network off entirely. Tests and any render
 * that must be byte-reproducible set it, and then a family that is not on disk
 * is reported missing instead of being fetched from a moving target.
 */
import { existsSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_TIMEOUT_MS = 5_000;

function cacheDir(): string {
  return process.env.ORBIT_FONT_CACHE_DIR || join(tmpdir(), 'orbit-fonts');
}

/** Directories searched before the cache and before the network. */
function localDirs(): string[] {
  const raw = process.env.ORBIT_FONT_DIR;
  return raw ? raw.split(':').filter(Boolean) : [];
}

function networkAllowed(): boolean {
  // Truthiness, not `??`: an env var set to the empty string is unset in every
  // way that matters, and `?? ` does not fire on it. Same reason the email
  // sender reads its config this way.
  return process.env.ORBIT_FONT_NETWORK !== '0';
}

function timeoutMs(): number {
  const n = Number(process.env.ORBIT_FONT_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

/**
 * A font family name we are willing to turn into a filesystem path.
 *
 * This is a **security boundary, not a tidiness check.** A family arrives as
 * `TextOverlay.fontFamily` — JSON off the wire, typed `string` and validated by
 * nothing — and `findLocal` joins it onto a directory. A family of
 * `../../../etc/passwd` therefore escapes the font directory, and the result is
 * handed to resvg as a font file: an existence oracle for arbitrary paths at
 * best, and a parser pointed at an attacker-chosen file at worst. It is the
 * same class of hole `svg.ts` documents, arriving through a different door.
 *
 * Real family names are letters, digits, spaces and the occasional hyphen. No
 * separator, no dot, no traversal — matched positively rather than by
 * blacklisting `..`, because a blacklist has to be right about every encoding
 * and a whitelist only has to be right about font names.
 */
const SAFE_FAMILY = /^[A-Za-z0-9 _-]{1,64}$/;

export function isSafeFontFamily(family: string): boolean {
  return SAFE_FAMILY.test(family);
}

/** The filenames a family might plausibly be stored under, most specific first. */
function candidateNames(family: string): string[] {
  const bare = family.trim();
  const under = bare.replace(/\s+/g, '_');
  const tight = bare.replace(/\s+/g, '');
  const stems = [...new Set([bare, under, tight])];
  const out: string[] = [];
  for (const s of stems) for (const suffix of ['', '-Regular']) for (const ext of ['ttf', 'otf'])
    out.push(`${s}${suffix}.${ext}`);
  return out;
}

async function findLocal(family: string, dirs: string[]): Promise<string | null> {
  const names = candidateNames(family);
  for (const dir of dirs) {
    for (const name of names) {
      const p = join(dir, name);
      if (existsSync(p)) return p;
    }
    // Fall back to a case-insensitive scan, so a directory populated by hand
    // does not have to match our capitalisation exactly.
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }
    const want = new Set(names.map((n) => n.toLowerCase()));
    const hit = entries.find((e) => want.has(e.toLowerCase()));
    if (hit) return join(dir, hit);
  }
  return null;
}

/** Fetch with a real deadline. Without this a hung request stalls the render. */
async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs());
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function ttfUrl(family: string): Promise<string | null> {
  const fam = family.trim().replace(/\s+/g, '+');
  const res = await fetchWithTimeout(`https://fonts.googleapis.com/css2?family=${fam}`, {
    headers: { 'User-Agent': 'Mozilla/4.0' }, // old UA → TrueType URL
  });
  const css = await res.text();
  const m = css.match(/url\((https:[^)]+\.ttf)\)/);
  return m ? m[1] : null;
}

const cache = new Map<string, string>();

async function download(family: string): Promise<string | null> {
  const dir = cacheDir();
  const path = join(dir, `${family.replace(/[^a-z0-9]+/gi, '_')}.ttf`);
  if (existsSync(path)) return path;
  if (!networkAllowed()) return null;
  const url = await ttfUrl(family);
  if (!url) return null;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return null;
  await mkdir(dir, { recursive: true });
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
  return path;
}

/** What a font lookup actually produced, including what it failed to find. */
export interface FontResolution {
  /** Local font file paths to hand resvg's `fontFiles`. */
  files: string[];
  /**
   * Which file answered which family.
   *
   * `files` alone is enough for resvg, which matches by the name inside the
   * font. It is not enough for the caller that has to EMBED a family's bytes in
   * a caption's SVG, which needs to know which of them to read.
   */
  byFamily: Map<string, string>;
  /**
   * Families that could not be resolved. resvg will substitute another face for
   * these, so the export WILL NOT match the preview — the caller is expected to
   * report this rather than let it pass silently.
   */
  missing: string[];
}

export interface ResolveFontOptions {
  /** Searched before the cache and before the network. Adds to `ORBIT_FONT_DIR`. */
  fontDirs?: string[];
  /** Default true, or false when `ORBIT_FONT_NETWORK=0`. */
  network?: boolean;
}

/**
 * Resolve the given families to local font files.
 *
 * Families containing `_` are skipped: that is how a bundled/system face is
 * named at the call sites, and asking Google for one returns nothing.
 */
export async function resolveFonts(
  families: Iterable<string>,
  opts: ResolveFontOptions = {},
): Promise<FontResolution> {
  const dirs = [...(opts.fontDirs ?? []), ...localDirs()];
  const allowNetwork = opts.network ?? networkAllowed();
  const files: string[] = [];
  const missing: string[] = [];
  const byFamily = new Map<string, string>();

  /*
   * Three outcomes, and the difference between the last two matters.
   *
   * `_` marks a bundled/system face at the call sites, so those are skipped
   * SILENTLY — they are not missing, and reporting them would cry wolf on every
   * render that uses one. A family that fails `isSafeFontFamily` is a different
   * thing entirely: it is either an attack or a corrupt project, and it must be
   * reported rather than quietly dropped, which is the whole reason this
   * function returns `missing` at all.
   */
  const wanted: string[] = [];
  for (const f of new Set(families)) {
    if (!f || f.includes('_')) continue;
    if (isSafeFontFamily(f)) wanted.push(f);
    else missing.push(f);
  }

  await Promise.all(
    wanted.map(async (family) => {
      const memo = cache.get(family);
      if (memo) {
        files.push(memo);
        byFamily.set(family, memo);
        return;
      }
      let path: string | null = null;
      try {
        path = await findLocal(family, dirs);
        if (!path && (allowNetwork || existsSync(join(cacheDir(), `${family.replace(/[^a-z0-9]+/gi, '_')}.ttf`))))
          path = await download(family);
      } catch {
        path = null; // network/disk failure — reported as missing below
      }
      if (path) {
        cache.set(family, path);
        files.push(path);
        byFamily.set(family, path);
      } else {
        missing.push(family);
      }
    }),
  );

  return { files, missing, byFamily };
}

/** Reset the in-process memo. Tests need this; nothing else should call it. */
export function clearFontCache(): void {
  cache.clear();
}
