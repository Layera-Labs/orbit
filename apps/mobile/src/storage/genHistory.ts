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
import { rebaseMediaUri } from './projects';

export interface GenRecord {
  id: string;
  kind: 'image' | 'video';
  /** Where the asset came from — decides how it's re-inserted. */
  source: 'ai' | 'upload';
  /** Remote URL (ai) or local file:// path (upload). */
  url: string;
  audioUrl?: string;
  durationSec?: number;
  /**
   * Local poster for a video record. Videos have no frame to show until one is
   * extracted, and extraction is async and can fail — without a stored poster
   * every tile started as a grey placeholder and re-extracted on every sheet
   * open, for the life of the record.
   */
  thumbUri?: string;
  /** The generation prompt (ai only). */
  prompt?: string;
  createdAt: number;
}

const MAX = 60;

function historyFile(): File {
  return new File(Paths.document, 'gen-history.json');
}

function isLocal(uri: string | undefined): uri is string {
  return !!uri && uri.startsWith('file:');
}

function exists(uri: string): boolean {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

/**
 * Load, heal and prune.
 *
 * Every local `url` here is an ABSOLUTE path into the app's Documents
 * container, and iOS hands the app a fresh container UUID on every install — so
 * these go stale exactly the way project media does. `rebaseMediaUri` already
 * exists for that (see `projects.ts`) but was only ever applied to projects, so
 * the Library and Upload grids pointed at dead paths: `<Image>` failed
 * silently, nothing painted, and the tile's own background showed through as a
 * blank grey box.
 *
 * A record whose file is gone even after rebasing is dropped rather than kept,
 * because keeping it guarantees a permanently blank tile. Writing back only
 * when something actually changed keeps this a read in the common case.
 */
export function loadHistory(): GenRecord[] {
  try {
    const f = historyFile();
    if (!f.exists) return [];
    const data = JSON.parse(f.textSync()) as GenRecord[];
    if (!Array.isArray(data)) return [];

    let changed = false;
    const healed: GenRecord[] = [];
    for (const raw of data) {
      if (!raw || typeof raw.url !== 'string') {
        changed = true;
        continue;
      }
      const url = rebaseMediaUri(raw.url);
      const thumbUri = raw.thumbUri ? rebaseMediaUri(raw.thumbUri) : undefined;
      if (url !== raw.url || thumbUri !== raw.thumbUri) changed = true;
      if (isLocal(url) && !exists(url)) {
        changed = true;
        continue;
      }
      // A missing poster is not a reason to drop the record — the video is
      // still there and the tile falls back to its icon.
      const poster = isLocal(thumbUri) && !exists(thumbUri) ? undefined : thumbUri;
      if (poster !== raw.thumbUri) changed = true;
      healed.push({ ...raw, url, thumbUri: poster });
    }
    if (changed) save(healed);
    return healed;
  } catch {
    return [];
  }
}

/** Attach a poster to an existing record (videos, once a frame is extracted). */
export function setHistoryThumb(id: string, thumbUri: string): GenRecord[] {
  const next = loadHistory().map((r) => (r.id === id ? { ...r, thumbUri } : r));
  save(next);
  return next;
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
