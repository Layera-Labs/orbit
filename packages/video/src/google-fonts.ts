/**
 * Server-side Google Font embedding for the render. resvg only loads system
 * fonts by default, so a caption's chosen Google family would fall back to a
 * default in the export. We download the family's TTF (CSS API with an old
 * User-Agent → TrueType URL, mirroring the mobile loader) and hand the file to
 * resvg via `fontFiles`, so the export matches the preview. Downloads are cached
 * on disk by family.
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CACHE_DIR = join(tmpdir(), 'orbit-fonts');
const cache = new Map<string, string>();

async function ttfUrl(family: string): Promise<string | null> {
  const fam = family.trim().replace(/\s+/g, '+');
  const res = await fetch(`https://fonts.googleapis.com/css2?family=${fam}`, {
    headers: { 'User-Agent': 'Mozilla/4.0' }, // old UA → TrueType URL
  });
  const css = await res.text();
  const m = css.match(/url\((https:[^)]+\.ttf)\)/);
  return m ? m[1] : null;
}

async function downloadFont(family: string): Promise<string | null> {
  const cached = cache.get(family);
  if (cached) return cached;
  try {
    const url = await ttfUrl(family);
    if (!url) return null;
    await mkdir(CACHE_DIR, { recursive: true });
    const path = join(CACHE_DIR, `${family.replace(/[^a-z0-9]+/gi, '_')}.ttf`);
    if (!existsSync(path)) {
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      await writeFile(path, buf);
    }
    cache.set(family, path);
    return path;
  } catch {
    return null;
  }
}

/**
 * Download the TTFs for the given families (skips bundled/system names) and
 * return the local file paths to pass to resvg's `fontFiles`.
 */
export async function fontFilesFor(families: Iterable<string>): Promise<string[]> {
  const wanted = [...new Set(families)].filter((f) => f && !f.includes('_'));
  const paths = await Promise.all(wanted.map(downloadFont));
  return paths.filter((p): p is string => !!p);
}
