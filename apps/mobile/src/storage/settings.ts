/** App-wide settings (currently just the render-server URL), persisted as JSON. */
import { File, Paths } from 'expo-file-system';
import { DEFAULT_SERVER } from '../constants';

export type ViewMode = 'list' | 'grid2' | 'grid3';

/** Editor preferences. Persisted so they survive a relaunch — a preference
 *  that resets every launch is not a preference. */
export interface EditorPrefs {
  /** Quick keeps the main track gapless; Pro allows free placement. */
  mainTrack: 'Quick' | 'Pro';
  /** Overlays and audio inside a main clip's span move/delete with it. */
  linkage: boolean;
  /** Canvas placement snaps to centre/thirds as well as edges. */
  snapping: boolean;
  /** Preview tick rate, fps. */
  previewFps: number;
}

export interface Settings {
  serverUrl: string;
  viewMode: ViewMode;
  /** When enabled, the editor's primary delete command closes the lane gap. */
  rippleDelete: boolean;
  prefs: EditorPrefs;
}

export const DEFAULT_PREFS: EditorPrefs = {
  mainTrack: 'Quick',
  linkage: true,
  snapping: false,
  previewFps: 30,
};

const DEFAULTS: Settings = {
  serverUrl: DEFAULT_SERVER,
  viewMode: 'list',
  rippleDelete: false,
  prefs: DEFAULT_PREFS,
};

function settingsFile(): File {
  return new File(Paths.document, 'settings.json');
}

export function loadSettings(): Settings {
  try {
    const f = settingsFile();
    if (f.exists) {
      const raw = JSON.parse(f.textSync()) as Partial<Settings>;
      // Merge `prefs` one level deep, so a pref added in a later build still
      // picks up its default instead of coming back undefined.
      return { ...DEFAULTS, ...raw, prefs: { ...DEFAULT_PREFS, ...(raw.prefs ?? {}) } };
    }
  } catch {
    // fall through to defaults
  }
  return { ...DEFAULTS };
}

export function saveSettings(s: Settings): void {
  try {
    settingsFile().write(JSON.stringify(s));
  } catch {
    // best-effort
  }
}
