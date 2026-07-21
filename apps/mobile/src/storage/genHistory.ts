/**
 * AI generation history — a small local list of past results, persisted as JSON
 * (same document-dir pattern as settings). Records hold the remote result URL so
 * they can be re-inserted via the store's insert-from-URL actions. Results live
 * on the render server's ephemeral storage, so an older URL may 404 — the UI
 * treats that as "expired" rather than an error.
 */
import { File, Paths } from 'expo-file-system';

export interface GenRecord {
  id: string;
  kind: 'image' | 'video';
  url: string;
  audioUrl?: string;
  durationSec?: number;
  prompt: string;
  createdAt: number;
}

const MAX = 40;

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
