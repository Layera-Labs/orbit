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

export function saveProject(p: StoredProject): void {
  ensureDirs();
  projectFile(p.id).write(JSON.stringify(p));
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
