/**
 * Google Fonts on demand. The full family list comes from Google's metadata
 * endpoint; a chosen family's TTF is fetched from the CSS API (woff2 by default,
 * so we send an old User-Agent to get a TrueType URL that expo-font can load)
 * and registered at runtime under its family name. The server mirrors this to
 * embed the same font in the export (packages/video/google-fonts.ts).
 */
import { useEffect, useState } from 'react';
import * as Font from 'expo-font';
import { Directory, File, Paths } from 'expo-file-system';

/** Shown first / used as the offline fallback list. */
export const POPULAR_FONTS = [
  'Roboto', 'Open Sans', 'Montserrat', 'Lato', 'Poppins', 'Inter', 'Oswald', 'Raleway',
  'Playfair Display', 'Pacifico', 'Bebas Neue', 'Dancing Script', 'Lobster', 'Anton',
  'Caveat', 'Permanent Marker', 'Archivo', 'Nunito', 'Merriweather', 'Bangers',
  'Righteous', 'Abril Fatface', 'Comfortaa', 'Shadows Into Light', 'Satisfy',
  'Sacramento', 'Great Vibes', 'Cinzel', 'Josefin Sans', 'Quicksand',
];

/** Bundled families (already available; never need downloading). */
export const BUNDLED_FONTS = new Set([
  'HankenGrotesk_400Regular', 'HankenGrotesk_500Medium', 'HankenGrotesk_600SemiBold',
  'HankenGrotesk_700Bold', 'HankenGrotesk_800ExtraBold',
  'JetBrainsMono_400Regular', 'JetBrainsMono_500Medium', 'JetBrainsMono_700Bold',
]);

let listCache: string[] | null = null;

export async function fetchGoogleFonts(): Promise<string[]> {
  if (listCache) return listCache;
  try {
    const res = await fetch('https://fonts.google.com/metadata/fonts');
    const json = (await res.json()) as { familyMetadataList?: Array<{ family?: string }> };
    const fams = (json.familyMetadataList ?? []).map((f) => f.family).filter((f): f is string => !!f);
    listCache = fams.length ? fams : POPULAR_FONTS;
  } catch {
    listCache = POPULAR_FONTS;
  }
  return listCache;
}

async function ttfUrl(family: string): Promise<string | null> {
  const fam = family.trim().replace(/\s+/g, '+');
  const css = await fetch(`https://fonts.googleapis.com/css2?family=${fam}`, {
    headers: { 'User-Agent': 'Mozilla/4.0' }, // old UA → TrueType URL
  }).then((r) => r.text());
  const m = css.match(/url\((https:[^)]+\.ttf)\)/);
  return m ? m[1] : null;
}

const loaded = new Set<string>();
const loading = new Map<string, Promise<boolean>>();

// A monotonically-increasing version bumped whenever a new font finishes
// loading. Components key their styled text by it so captions REMOUNT when a
// font lands — iOS caches a font-name miss if a <Text> renders before its font
// is ready, and a remount forces a fresh lookup.
let version = 0;
const listeners = new Set<() => void>();
function bump() {
  version += 1;
  listeners.forEach((l) => l());
}

/** Re-render + remount caption text when fonts finish loading. */
export function useFontsVersion(): number {
  const [, setV] = useState(version);
  useEffect(() => {
    const l = () => setV(version);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return version;
}

export function isFontLoaded(family: string): boolean {
  return BUNDLED_FONTS.has(family) || loaded.has(family);
}

/** Pre-load any non-bundled families a (re)opened project references. */
export function ensureFontsLoaded(families: Iterable<string>): void {
  for (const f of new Set(families)) {
    if (f && !isFontLoaded(f)) void loadGoogleFont(f);
  }
}

/** Download (if needed) + register a Google font under its family name. */
export function loadGoogleFont(family: string): Promise<boolean> {
  if (isFontLoaded(family)) return Promise.resolve(true);
  const existing = loading.get(family);
  if (existing) return existing;
  const p = (async () => {
    try {
      const url = await ttfUrl(family);
      if (!url) return false;
      // expo-font's loadAsync no-ops on remote URLs (iOS), so download to a local
      // file first and register that.
      const dir = new Directory(Paths.cache, 'fonts');
      if (!dir.exists) dir.create();
      let file = new File(dir, `${family.replace(/[^a-z0-9]+/gi, '_')}.ttf`);
      if (!file.exists) file = await File.downloadFileAsync(url, file);
      await Font.loadAsync({ [family]: file.uri });
      loaded.add(family);
      bump();
      return true;
    } catch {
      return false;
    }
  })();
  loading.set(family, p);
  return p;
}
