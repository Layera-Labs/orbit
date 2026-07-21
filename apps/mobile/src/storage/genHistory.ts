/**
 * The Library — a local list of the user's media, persisted as JSON (same
 * document-dir pattern as settings). Holds two kinds of records, global across
 * projects:
 *   - `source: 'ai'`     — a generated result; `url` is a remote render-server
 *     URL (may 404 once the server cleans up — the UI shows "expired").
 *   - `source: 'upload'` — a device import; `url` is a LOCAL `file://` path
 *     already copied into the app's media dir (stable).
 * Re-insertion branches on `source` (download-from-URL vs use the local file).
 */
import { File, Paths } from 'expo-file-system';

export interface GenRecord {
  id: string;
  kind: 'image' | 'video';
  /** Where the asset came from — decides how it's re-inserted. */
  source: 'ai' | 'upload';
  /** Remote URL (ai) or local file:// path (upload). */
  url: string;
  audioUrl?: string;
  durationSec?: number;
  /** The generation prompt (ai only). */
  prompt?: string;
  createdAt: number;
}

const MAX = 60;

function historyFile(): File {
  return new File(Paths.document, 'gen-history.json');
}

export function loadHistory(): GenRecord[] {
  try {
    const f = historyFile();
    if (f.exists) {
      const data = JSON.parse(f.textSync()) as GenRecord[];
      if (Array.isArray(data)) return data;
    }
  } catch {
    // fall through to empty
  }
  return [];
}

function save(records: GenRecord[]): void {
  try {
    historyFile().write(JSON.stringify(records.slice(0, MAX)));
  } catch {
    // best-effort
  }
}

/** Prepend a new record (newest first) and persist. Returns the updated list. */
export function addHistory(rec: Omit<GenRecord, 'id' | 'createdAt'>): GenRecord[] {
  const full: GenRecord = { ...rec, id: `g_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, createdAt: Date.now() };
  const next = [full, ...loadHistory()].slice(0, MAX);
  save(next);
  return next;
}

export function clearHistory(): void {
  save([]);
}
