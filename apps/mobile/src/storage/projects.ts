/**
 * Project persistence on the device, using the expo-file-system v55 class API
 * (`File` / `Directory` / `Paths`). Projects are small JSON; imported media is
 * copied into `media/` so the project references stable URIs (picker URIs are
 * ephemeral). The whole `StoredProject` is written as one JSON file per project.
 */
import { Directory, File, Paths } from 'expo-file-system';
import type { VideoProject } from '../model/types';

export interface StoredProject {
  id: string;
  name: string;
  /** Epoch ms of last save — used to sort the project list. */
  updatedAt: number;
  /** Optional poster thumbnail URI (first clip frame). */
  posterUri?: string;
  /** Folder name this project belongs to (default "Default"). */
  folder?: string;
  /** Source-media length in seconds, keyed by media URI — used to clamp trims.
   *  App-only metadata; never sent to the render service. */
  mediaDurations?: Record<string, number>;
  project: VideoProject;
}

export const projectsDir = new Directory(Paths.document, 'projects');
export const mediaDir = new Directory(Paths.document, 'media');

export function ensureDirs(): void {
  if (!projectsDir.exists) projectsDir.create({ intermediates: true, idempotent: true });
  if (!mediaDir.exists) mediaDir.create({ intermediates: true, idempotent: true });
}

function projectFile(id: string): File {
  return new File(projectsDir, `${id}.json`);
}

const MEDIA_MARKER = '/Documents/media/';

/**
 * Rebase a stored media URI onto the CURRENT media directory. iOS assigns the
 * app a fresh container UUID on every install/update, so absolute `file://`
 * URIs saved into project JSON go stale — while the files themselves survive
 * (Documents is migrated). Rewriting by basename heals old projects on load;
 * without this, every app update "loses" all project media.
 */
export function rebaseMediaUri(uri: string): string {
  if (!uri.startsWith('file:')) return uri;
  const at = uri.indexOf(MEDIA_MARKER);
  if (at < 0) return uri;
  const name = uri.slice(at + MEDIA_MARKER.length);
  if (!name || name.includes('/')) return uri;
  const base = mediaDir.uri.endsWith('/') ? mediaDir.uri : `${mediaDir.uri}/`;
  return `${base}${name}`;
}

/** Deep-rewrite stale media URIs in a parsed StoredProject — string values and
 *  object keys alike (`mediaDurations` is keyed by media URI). */
function rebaseDeep<T>(value: T): T {
  if (typeof value === 'string') return rebaseMediaUri(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => rebaseDeep(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[rebaseMediaUri(k)] = rebaseDeep(v);
    return out as unknown as T;
  }
  return value;
}

/*
 * Deferred writes.
 *
 * `File.write` is SYNCHRONOUS, and the editor's `apply` runs on every pointer
 * event of a drag — so dragging a clip serialised the whole project and hit the
 * disk sixty times a second, on the JS thread, while the gesture was trying to
 * stay at sixty frames. History was already coalesced; the write was not.
 *
 * `saveProjectSoon` keeps the newest state and writes it once the edits stop.
 * The window is deliberately short: everything is in memory, so the only thing
 * at risk is the last fraction of a second if the app is killed outright —
 * `flushProjectSave` covers backgrounding, which is the case that actually
 * happens.
 */
const SAVE_DEBOUNCE_MS = 400;
let pending: StoredProject | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export function saveProject(p: StoredProject): void {
  // A direct write wins, but it must not land BEHIND a queued one for the same
  // project or the deferred copy would resurrect the state this call replaces.
  if (pending?.id === p.id) {
    pending = null;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }
  ensureDirs();
  projectFile(p.id).write(JSON.stringify(p));
}

/** Queue a write, replacing any still-pending one. Trailing edge only. */
export function saveProjectSoon(p: StoredProject): void {
  // A different project queued means we are switching away mid-window; that
  // one still deserves its write.
  if (pending && pending.id !== p.id) flushProjectSave();
  pending = p;
  if (!timer) timer = setTimeout(flushProjectSave, SAVE_DEBOUNCE_MS);
}

/** Write any queued project now. Safe to call when nothing is queued. */
export function flushProjectSave(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const p = pending;
  pending = null;
  if (p) saveProject(p);
}

export function loadProject(id: string): StoredProject | null {
  const file = projectFile(id);
  if (!file.exists) return null;
  try {
    return rebaseDeep(JSON.parse(file.textSync()) as StoredProject);
  } catch {
    return null;
  }
}

export function listProjects(): StoredProject[] {
  ensureDirs();
  const out: StoredProject[] = [];
  for (const entry of projectsDir.list()) {
    if (entry instanceof File && entry.name.endsWith('.json')) {
      try {
        out.push(rebaseDeep(JSON.parse(entry.textSync()) as StoredProject));
      } catch {
        // skip a corrupt project file rather than crashing the list
      }
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deleteProject(id: string): void {
  const file = projectFile(id);
  if (file.exists) file.delete();
}
