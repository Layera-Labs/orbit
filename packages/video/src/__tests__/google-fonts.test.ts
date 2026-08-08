/**
 * Font resolution, and specifically the part that used to be silent.
 *
 * The old `fontFilesFor` returned `string[]`, so "we found three of your four
 * fonts" and "we found all four" were the same value with a different length,
 * and no caller could tell them apart. A render whose font could not be fetched
 * came out in a substitute face and reported success. These tests exist to keep
 * that failure mode dead.
 *
 * Every case here runs with the network OFF, which is also the point: the
 * resolver has to be answerable from disk alone, or renders are not
 * reproducible.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearFontCache, isSafeFontFamily, resolveFonts } from '../google-fonts';

function fontDir(files: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'orbit-font-test-'));
  for (const f of files) writeFileSync(join(dir, f), 'not a real font, never parsed here');
  return dir;
}

afterEach(() => {
  clearFontCache();
  delete process.env.ORBIT_FONT_NETWORK;
});

describe('resolveFonts', () => {
  it('reports a family it cannot find instead of dropping it', async () => {
    const r = await resolveFonts(['Definitely Not A Font'], { network: false });
    expect(r.files).toEqual([]);
    expect(r.missing).toEqual(['Definitely Not A Font']);
  });

  it('finds a family in a local directory, with no network', async () => {
    const dir = fontDir(['Inter.ttf']);
    const r = await resolveFonts(['Inter'], { fontDirs: [dir], network: false });
    expect(r.missing).toEqual([]);
    expect(r.files).toEqual([join(dir, 'Inter.ttf')]);
  });

  it('accepts the naming variants a font directory actually uses', async () => {
    // Google ships `Noto_Sans.ttf`, a designer ships `NotoSans-Regular.otf`.
    // Both are the same request and neither should need a rename to work.
    const a = fontDir(['Noto_Sans.ttf']);
    const b = fontDir(['NotoSans-Regular.otf']);
    expect((await resolveFonts(['Noto Sans'], { fontDirs: [a], network: false })).missing).toEqual([]);
    clearFontCache();
    expect((await resolveFonts(['Noto Sans'], { fontDirs: [b], network: false })).missing).toEqual([]);
  });

  it('separates the found from the missing in one call', async () => {
    const dir = fontDir(['Inter.ttf']);
    const r = await resolveFonts(['Inter', 'Nonexistent Face'], { fontDirs: [dir], network: false });
    expect(r.files).toHaveLength(1);
    expect(r.missing).toEqual(['Nonexistent Face']);
  });

  it('skips bundled/system names rather than reporting them missing', async () => {
    // A family containing `_` is how the call sites name a face that is already
    // present. Asking Google for one returns nothing, and reporting it as
    // missing would cry wolf on every render that uses one.
    const r = await resolveFonts(['System_Default'], { network: false });
    expect(r.files).toEqual([]);
    expect(r.missing).toEqual([]);
  });

  it('honours ORBIT_FONT_NETWORK=0 without an explicit option', async () => {
    process.env.ORBIT_FONT_NETWORK = '0';
    const r = await resolveFonts(['Definitely Not A Font']);
    expect(r.missing).toEqual(['Definitely Not A Font']);
  });

  /*
   * A family name reaches this function as `TextOverlay.fontFamily` — JSON off
   * the wire, typed `string`, validated by nothing — and ends up in a path
   * join. These are the security tests for that boundary.
   */
  describe('refuses a family name it would have to treat as a path', () => {
    const hostile = [
      '../../../etc/passwd',
      '..\\..\\windows\\system32\\drivers\\etc\\hosts',
      '/etc/shadow',
      'Inter/../../../../etc/passwd',
      'a'.repeat(200),
    ];

    it('never resolves one to a file', async () => {
      for (const family of hostile) {
        const r = await resolveFonts([family], { fontDirs: [fontDir([])], network: false });
        expect(r.files, family).toEqual([]);
      }
    });

    it('reports it rather than dropping it silently', async () => {
      // Silent is how the old code behaved and is what `missing` exists to end.
      const r = await resolveFonts(['../../../etc/passwd'], { network: false });
      expect(r.missing).toEqual(['../../../etc/passwd']);
    });

    it('still accepts the names real fonts actually have', async () => {
      for (const family of ['Inter', 'Noto Sans', 'PT Sans-Caption', 'Roboto Mono']) {
        expect(isSafeFontFamily(family), family).toBe(true);
      }
    });
  });

  it('de-duplicates families so one file is not loaded twice', async () => {
    const dir = fontDir(['Inter.ttf']);
    const r = await resolveFonts(['Inter', 'Inter', 'Inter'], { fontDirs: [dir], network: false });
    expect(r.files).toHaveLength(1);
  });
});
