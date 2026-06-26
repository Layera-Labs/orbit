/**
 * Export pipeline client. Phone media lives as local file:// URIs the server
 * can't read, so we (1) upload each unique local file → get an `upload:<id>`
 * token, (2) build a resolved project that references those tokens, (3) POST it
 * to /v1/render, then (4) download the resulting MP4 and save it to Photos.
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import type { VideoProject } from '../model/types';

/** localUri → upload token, so re-exports don't re-upload unchanged media. */
const uploadCache = new Map<string, string>();

export interface ExportProgress {
  stage: 'uploading' | 'rendering' | 'downloading' | 'saving';
  current?: number;
  total?: number;
}

function isLocal(src: string): boolean {
  return src.startsWith('file:') || src.startsWith('/');
}

function guessType(uri: string): string {
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'mov':
      return 'video/quicktime';
    case 'mp4':
      return 'video/mp4';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'm4a':
    case 'aac':
      return 'audio/mp4';
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    default:
      return 'application/octet-stream';
  }
}

export async function uploadMedia(base: string, localUri: string): Promise<string> {
  const cached = uploadCache.get(localUri);
  if (cached) return cached;
  const form = new FormData();
  const name = localUri.split('/').pop() || 'file';
  form.append('file', { uri: localUri, name, type: guessType(localUri) } as unknown as Blob);
  const res = await fetch(`${base}/v1/upload`, { method: 'POST', body: form });
  const data = (await res.json()) as { id?: string; error?: string };
  if (!res.ok || !data.id) throw new Error(data.error ?? `upload failed (HTTP ${res.status})`);
  uploadCache.set(localUri, data.id);
  return data.id;
}

/** Upload local media, build a resolved project, render it; returns the MP4 URL. */
export async function exportProject(
  base: string,
  project: VideoProject,
  onProgress?: (p: ExportProgress) => void,
): Promise<string> {
  const cleanBase = base.replace(/\/+$/, '');

  const localSrcs = new Set<string>();
  for (const t of project.tracks ?? []) for (const c of t.clips) if (isLocal(c.src)) localSrcs.add(c.src);
  for (const c of project.clips) if (isLocal(c.src)) localSrcs.add(c.src);
  for (const a of project.audio) if (isLocal(a.src)) localSrcs.add(a.src);

  const tokens = new Map<string, string>();
  let i = 0;
  for (const src of localSrcs) {
    onProgress?.({ stage: 'uploading', current: ++i, total: localSrcs.size });
    tokens.set(src, await uploadMedia(cleanBase, src));
  }
  const swap = (src: string) => (isLocal(src) ? tokens.get(src)! : src);

  const resolved: VideoProject = {
    ...project,
    clips: project.clips.map((c) => ({ ...c, src: swap(c.src) })),
    audio: project.audio.map((a) => ({ ...a, src: swap(a.src) })),
    tracks: project.tracks?.map((t) =>
      t.kind === 'visual'
        ? { ...t, clips: t.clips.map((c) => ({ ...c, src: swap(c.src) })) }
        : { ...t, clips: t.clips.map((c) => ({ ...c, src: swap(c.src) })) },
    ),
  };

  onProgress?.({ stage: 'rendering' });
  const res = await fetch(`${cleanBase}/v1/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ project: resolved }),
  });
  const data = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? `render failed (HTTP ${res.status})`);
  return `${cleanBase}${data.url}`;
}

/** Download the rendered MP4 and save it to the device photo library.
 *  Returns the local file URI. */
export async function downloadToPhotos(
  fullUrl: string,
  stamp: number,
  onProgress?: (p: ExportProgress) => void,
): Promise<string> {
  onProgress?.({ stage: 'downloading' });
  const dest = new File(new Directory(Paths.cache), `orbit_export_${stamp}.mp4`);
  if (dest.exists) dest.delete();
  const file = await File.downloadFileAsync(fullUrl, dest);

  onProgress?.({ stage: 'saving' });
  const perm = await MediaLibrary.requestPermissionsAsync();
  if (perm.granted) await MediaLibrary.saveToLibraryAsync(file.uri);
  return file.uri;
}
