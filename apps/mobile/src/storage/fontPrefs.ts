/**
 * Font preferences — the user's recently-used and favourited font families,
 * persisted as JSON in the document dir (same pattern as gen-history/settings).
 * Global across projects; drives the Font picker's Favourites / Recent sections.
 */
import { File, Paths } from 'expo-file-system';

export interface FontPrefs {
  recent: string[];
  favourites: string[];
}

const RECENT_MAX = 12;
const DEFAULTS: FontPrefs = { recent: [], favourites: [] };

function prefsFile(): File {
  return new File(Paths.document, 'font-prefs.json');
}

export function loadFontPrefs(): FontPrefs {
  try {
    const f = prefsFile();
    if (f.exists) {
      const data = JSON.parse(f.textSync()) as Partial<FontPrefs>;
      return {
        recent: Array.isArray(data.recent) ? data.recent : [],
        favourites: Array.isArray(data.favourites) ? data.favourites : [],
      };
    }
  } catch {
    // fall through to defaults
  }
  return { ...DEFAULTS };
}

function save(prefs: FontPrefs): void {
  try {
    prefsFile().write(JSON.stringify(prefs));
  } catch {
    // best-effort
  }
}

/** Record a family as most-recently-used (prepend, dedupe, cap). */
export function addRecentFont(family: string): FontPrefs {
  const prev = loadFontPrefs();
  const recent = [family, ...prev.recent.filter((f) => f !== family)].slice(0, RECENT_MAX);
  const next = { ...prev, recent };
  save(next);
  return next;
}

/** Toggle a family's favourite state. */
export function toggleFavourite(family: string): FontPrefs {
  const prev = loadFontPrefs();
  const has = prev.favourites.includes(family);
  const favourites = has ? prev.favourites.filter((f) => f !== family) : [family, ...prev.favourites];
  const next = { ...prev, favourites };
  save(next);
  return next;
}
