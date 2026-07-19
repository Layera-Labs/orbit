/** App-wide settings (currently just the render-server URL), persisted as JSON. */
import { File, Paths } from 'expo-file-system';
import { DEFAULT_SERVER } from '../constants';

export type ViewMode = 'list' | 'grid2' | 'grid3';

export interface Settings {
  serverUrl: string;
  viewMode: ViewMode;
}

const DEFAULTS: Settings = { serverUrl: DEFAULT_SERVER, viewMode: 'list' };

function settingsFile(): File {
  return new File(Paths.document, 'settings.json');
}

export function loadSettings(): Settings {
  try {
    const f = settingsFile();
    if (f.exists) return { ...DEFAULTS, ...(JSON.parse(f.textSync()) as Partial<Settings>) };
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
