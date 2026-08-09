/**
 * Project store.
 *
 * The host owns the project NAME — `@layera-labs/editor`'s TopBar keeps its title in
 * local component state and never writes it to the document, so reading a name
 * back out of the editor would always return "Untitled".
 */
import type { Document as OrbitDocument } from '@layera-labs/model';
import { createProject, type VideoProject } from '@layera-labs/video/browser';
import { db, newId } from './idb';
import type { ProjectKind, ProjectRow } from './schema';

export async function listProjects(): Promise<ProjectRow[]> {
  const rows = await (await db()).getAllFromIndex('projects', 'updatedAt');
  return rows.reverse();
}

export async function getProject(id: string): Promise<ProjectRow | undefined> {
  return (await db()).get('projects', id);
}

/**
 * Write a project.
 *
 * `updatedAt` defaults to now, which is what every EDIT wants. A caller may
 * pass one instead, and exactly one does: a sync pulling someone else's copy
 * has to keep the timestamp the server gave it. Stamping local time there makes
 * the freshly-pulled document look newer than the server's own, so the next
 * push sends it straight back — two devices then trade the same unchanged
 * project forever, each reporting work it did not do. It also silently diverged
 * from the phone, which preserves the server's value; two clients reconciling
 * by different rules against one server is how edits get lost.
 */
export async function saveProject(
  row: Omit<ProjectRow, 'createdAt' | 'updatedAt'> &
    Partial<Pick<ProjectRow, 'createdAt' | 'updatedAt'>>,
): Promise<void> {
  const database = await db();
  const existing = await database.get('projects', row.id);
  await database.put('projects', {
    ...existing,
    ...row,
    createdAt: existing?.createdAt ?? row.createdAt ?? Date.now(),
    updatedAt: row.updatedAt ?? Date.now(),
  } as ProjectRow);
}

export async function renameProject(id: string, name: string): Promise<void> {
  const database = await db();
  const row = await database.get('projects', id);
  if (!row) return;
  await database.put('projects', { ...row, name, updatedAt: Date.now() });
}

export async function setThumbnail(id: string, thumbnail: Blob): Promise<void> {
  const database = await db();
  const row = await database.get('projects', id);
  if (!row) return;
  // Not a content edit — leave `updatedAt` alone so a thumbnail refresh does not
  // reshuffle the bench.
  await database.put('projects', { ...row, thumbnail });
}

export async function deleteProject(id: string): Promise<void> {
  await (await db()).delete('projects', id);
}

export interface NewProjectOptions {
  kind: ProjectKind;
  name?: string;
  width?: number;
  height?: number;
}

/** Create and persist an empty project, returning its row. */
export async function createNewProject(opts: NewProjectOptions): Promise<ProjectRow> {
  const id = newId(opts.kind === 'image' ? 'img' : 'vid');
  const width = opts.width ?? (opts.kind === 'image' ? 1080 : 1080);
  const height = opts.height ?? (opts.kind === 'image' ? 1080 : 1920);
  const now = Date.now();

  const data: OrbitDocument | VideoProject =
    opts.kind === 'image'
      ? emptyDocument(id, width, height)
      : {
          ...createProject({ id, width, height }),
          schemaVersion: 2,
          // Start with the tracks shape. The legacy `clips` path exists only for
          // reading old files; nothing here should ever produce one.
          tracks: [{ id: newId('trk'), kind: 'visual', name: 'Main', clips: [] }],
        };

  const row: ProjectRow = {
    id,
    kind: opts.kind,
    name: opts.name ?? untitled(opts.kind),
    createdAt: now,
    updatedAt: now,
    data,
  };
  await (await db()).put('projects', row);
  return row;
}

function untitled(kind: ProjectKind): string {
  const stamp = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${kind === 'image' ? 'Image' : 'Video'} ${stamp}`;
}

function emptyDocument(id: string, width: number, height: number): OrbitDocument {
  return {
    id,
    schemaVersion: 2,
    width,
    height,
    unit: 'px',
    fonts: [],
    pages: [
      {
        id: newId('page'),
        width,
        height,
        background: { type: 'solid', color: '#ffffff' },
        children: [],
      },
    ],
  } as OrbitDocument;
}
