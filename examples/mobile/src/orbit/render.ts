/**
 * Export: upload, render, download, save.
 *
 * The service cannot read a phone's `file://` URIs, so an export is four hops
 * rather than one:
 *
 *   1. POST each unique local file to `/v1/upload` → an `upload:<token>`
 *   2. rewrite the project so its `src` fields name those tokens
 *   3. POST it to `/v1/render` as a JOB, and poll until it settles
 *   4. download the MP4 and save it to the photo library
 *
 * Step 3 asks for a job (`async: true`) rather than holding one connection open
 * for the whole encode. On a phone that connection also has to survive the
 * radio dozing, a network handover, and every proxy between here and the box.
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { authHeaders, discardIfGuest } from './session';
import { absoluteUrl } from './server';
import type { ExportOutput, VideoProject } from './types';

export interface ExportProgress {
  stage: 'uploading' | 'rendering' | 'downloading' | 'saving';
  /** 1-based file index and count, during `uploading`. */
  current?: number;
  total?: number;
  /**
   * How far through the encode, 0..1, when the server can say.
   *
   * Undefined means unmeasured, not zero — ffmpeg reports nothing until it has
   * encoded its first frames, and a bar has to show those two states
   * differently or it sits at 0% looking stuck.
   */
  fraction?: number;
}

const isLocal = (src: string): boolean => src.startsWith('file:') || src.startsWith('/');

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
    case 'heic':
      return 'image/heic';
    default:
      return 'application/octet-stream';
  }
}

/**
 * localUri → upload token, so a re-export does not re-upload unchanged media.
 *
 * Keyed by SERVICE as well as by file: a token names a file in one service's
 * media directory and means nothing anywhere else, so a cache shared across
 * servers sends tokens minted against a dev Mac to a production box, which can
 * only ever fail.
 *
 * The real app also invalidates this when the service reports a token it no
 * longer holds (`409 missing_uploads` — the media directory is a cache with a
 * byte budget, so a token is not durable) and retries the export exactly once.
 * This example lets that surface as a failure instead, because the recovery is
 * more interesting than the upload it demonstrates.
 */
const uploads = new Map<string, string>();

export async function uploadMedia(base: string, localUri: string): Promise<string> {
  const key = `${base}\n${localUri}`;
  const cached = uploads.get(key);
  if (cached) return cached;

  const name = localUri.split('/').pop() || 'file';
  const form = () => {
    const f = new FormData();
    // React Native accepts this shape in place of a Blob and streams the file
    // from disk. `content-type` is deliberately never set on the request: the
    // runtime writes the multipart boundary itself, and stating one strips it.
    f.append('file', { uri: localUri, name, type: guessType(localUri) } as unknown as Blob);
    return f;
  };

  const send = async () =>
    fetch(`${base}/v1/upload`, {
      method: 'POST',
      headers: await authHeaders(base),
      body: form(),
    });

  let res = await send();
  if (res.status === 401 && (await discardIfGuest())) res = await send();

  const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!res.ok || !data.id) throw new Error(data.error ?? `Upload failed (HTTP ${res.status}).`);
  uploads.set(key, data.id);
  return data.id;
}

/** Every distinct on-device file the project references. */
export function localSources(project: VideoProject): string[] {
  const seen = new Set<string>();
  for (const t of project.tracks) for (const c of t.clips) if (isLocal(c.src)) seen.add(c.src);
  if (project.background.type === 'image' && isLocal(project.background.src))
    seen.add(project.background.src);
  return [...seen];
}

/** Rewrite every local `src` to the upload token that now stands for it. */
export function withUploadedSources(
  project: VideoProject,
  tokens: ReadonlyMap<string, string>,
): VideoProject {
  const swap = (src: string) => (isLocal(src) ? (tokens.get(src) ?? src) : src);
  return {
    ...project,
    background:
      project.background.type === 'image'
        ? { ...project.background, src: swap(project.background.src) }
        : project.background,
    tracks: project.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => ({ ...c, src: swap(c.src) })) })),
  } as VideoProject;
}

/** Upload, render, and return the finished MP4's absolute URL. */
export async function exportProject(
  base: string,
  project: VideoProject,
  output?: ExportOutput,
  onProgress?: (p: ExportProgress) => void,
): Promise<string> {
  const sources = localSources(project);
  const tokens = new Map<string, string>();
  let i = 0;
  for (const src of sources) {
    /*
     * A file count, not a byte fraction. `fetch` cannot report upload progress
     * in React Native — only XHR can, which is what the real app uses so a
     * 200 MB video does not look like a hung request. Counting files is the
     * honest thing to show when bytes are unmeasurable; a bar frozen at 0% is
     * not.
     */
    onProgress?.({ stage: 'uploading', current: ++i, total: sources.length });
    tokens.set(src, await uploadMedia(base, src));
  }

  onProgress?.({ stage: 'rendering' });
  const res = await fetch(`${base}/v1/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders(base)) },
    body: JSON.stringify({ project: withUploadedSources(project, tokens), output, async: true }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    url?: string;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error ?? `Render failed (HTTP ${res.status}).`);

  // A service predating the job API answers with the url outright.
  const url = data.id ? await awaitJob(base, data.id, onProgress) : data.url;
  if (!url) throw new Error('The render returned no url.');
  return absoluteUrl(base, url);
}

async function awaitJob(
  base: string,
  id: string,
  onProgress?: (p: ExportProgress) => void,
): Promise<string> {
  let wait = 500;
  for (;;) {
    await new Promise((r) => setTimeout(r, wait));
    wait = Math.min(wait * 1.5, 4000);
    const res = await fetch(`${base}/v1/render/${id}`, { headers: await authHeaders(base) });
    if (res.status === 404) throw new Error('The render job expired before it was collected.');
    const job = (await res.json()) as {
      status: string;
      url?: string;
      error?: string;
      progress?: number;
    };
    if (job.status === 'error') throw new Error(job.error ?? 'The render failed.');
    if (job.status === 'done' && job.url) return job.url;
    onProgress?.({
      stage: 'rendering',
      // A service that predates progress reporting omits it, and the bar stays
      // indeterminate rather than claiming zero.
      fraction: typeof job.progress === 'number' ? job.progress : undefined,
    });
  }
}

/** Download the MP4 and save it to the photo library. Returns the local URI. */
export async function saveToPhotos(
  url: string,
  onProgress?: (p: ExportProgress) => void,
): Promise<string> {
  onProgress?.({ stage: 'downloading' });
  const dest = new File(new Directory(Paths.cache), `orbit-example-${Date.now()}.mp4`);
  if (dest.exists) dest.delete();
  const file = await File.downloadFileAsync(url, dest);

  onProgress?.({ stage: 'saving' });
  const perm = await MediaLibrary.requestPermissionsAsync();
  // A refusal is not an export failure — the file is downloaded and playable.
  if (perm.granted) await MediaLibrary.saveToLibraryAsync(file.uri);
  return file.uri;
}
