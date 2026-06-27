/**
 * User-saved templates: a project structure (no media) the user can re-apply to
 * spin up new projects. Stored as JSON, one file each, beside `projects/`.
 */
import { Directory, File, Paths } from 'expo-file-system';
import type { VideoProject } from '../model/types';

export interface StoredTemplate {
  id: string;
  name: string;
  createdAt: number;
  project: VideoProject;
}

const templatesDir = new Directory(Paths.document, 'templates');

function ensureDir(): void {
  if (!templatesDir.exists) templatesDir.create({ intermediates: true, idempotent: true });
}

export function saveUserTemplate(t: StoredTemplate): void {
  ensureDir();
  new File(templatesDir, `${t.id}.json`).write(JSON.stringify(t));
}

export function listUserTemplates(): StoredTemplate[] {
  ensureDir();
  const out: StoredTemplate[] = [];
  for (const entry of templatesDir.list()) {
    if (entry instanceof File && entry.name.endsWith('.json')) {
      try {
        out.push(JSON.parse(entry.textSync()) as StoredTemplate);
      } catch {
        // skip corrupt template file
      }
    }
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export function deleteUserTemplate(id: string): void {
  const file = new File(templatesDir, `${id}.json`);
  if (file.exists) file.delete();
}
