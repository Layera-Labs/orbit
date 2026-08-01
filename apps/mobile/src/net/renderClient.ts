/**
 * Export pipeline client. Phone media lives as local file:// URIs the server
 * can't read, so we (1) upload each unique local file → get an `upload:<id>`
 * token, (2) build a resolved project that references those tokens, (3) POST it
 * to /v1/render, then (4) download the resulting MP4 and save it to Photos.
 *
 * Every hop carries a bearer token now — a guest one when the device has not
 * signed in, so exporting still needs no account. Upload and render used to be
 * open, which made them free storage and free CPU for anyone with the URL.
 */
import { Directory, File, Paths } from 'expo-file-system';
import { authHeaders, discardIfGuest } from './session';
import * as MediaLibrary from 'expo-media-library';
import type { ExportOutput, VideoProject } from '../model/types';

/**
 * localUri → upload token, so re-exports don't re-upload unchanged media.
 *
 * Keyed by SERVER as well as by file. A token names a file in one server's
 * media dir and means nothing anywhere else, so sharing this map across
 * servers sent tokens minted against a dev Mac to a production box, which
 * could only ever fail. Changing the render server in Settings now starts with
 * a clean slate instead.
 */
const uploadCache = new Map<string, string>();

/** Trailing slashes are normalised away, so one server is never two keys. */
const serverKey = (base: string) => base.replace(/\/+$/, "");
const cacheKey = (base: string, localUri: string) =>
  `${serverKey(base)}\n${localUri}`;

/**
 * Drop tokens the server has told us it no longer holds.
 *
 * The media dir is a cache with a byte budget, so a token is not durable —
 * eviction, a redeploy, a fresh volume. Without this the map kept handing back
 * the same dead token for the life of the process, so every export failed
 * identically and the only way out was restarting the app.
 */
/**
 * The server has media we referenced but no longer holds. Recoverable by
 * re-uploading, so it is its own type rather than a string match on a message.
 */
class StaleUploads extends Error {}

function forgetUploads(base: string, tokens: readonly string[]): void {
  const dead = new Set(tokens);
  const prefix = `${serverKey(base)}\n`;
  for (const [key, token] of uploadCache) {
    if (dead.has(token) && key.startsWith(prefix)) uploadCache.delete(key);
  }
}

export interface ExportProgress {
  stage: 'uploading' | 'rendering' | 'downloading' | 'saving';
  current?: number;
  total?: number;
  /**
   * How far through this stage, 0..1, when the stage can actually say.
   *
   * Undefined means unmeasured, not zero — the render stage reports nothing
   * until ffmpeg has encoded its first frames, and a bar has to show those two
   * states differently or it sits at 0% looking stuck.
   */
  fraction?: number;
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
  const cached = uploadCache.get(cacheKey(base, localUri));
  if (cached) return cached;
  const form = new FormData();
  const name = localUri.split('/').pop() || 'file';
  form.append('file', { uri: localUri, name, type: guessType(localUri) } as unknown as Blob);
  const send = async () =>
    fetch(`${base}/v1/upload`, {
      method: 'POST',
      headers: await authHeaders(base),
      body: form,
    });
  // Uploading used to need no token at all, which made this a free public file
  // host for anyone who found the URL.
  let res = await send();
  // A stale guest token is not something the user can act on, and there is no
  // account to send them to — take a fresh one and try once.
  if (res.status === 401 && (await discardIfGuest())) res = await send();
  const data = (await res.json()) as { id?: string; error?: string };
  if (!res.ok || !data.id) throw new Error(data.error ?? `upload failed (HTTP ${res.status})`);
  uploadCache.set(cacheKey(base, localUri), data.id);
  return data.id;
}

/** Upload local media, build a resolved project, render it; returns the MP4 URL. */
export async function exportProject(
  base: string,
  project: VideoProject,
  onProgress?: (p: ExportProgress) => void,
  output?: ExportOutput,
): Promise<string> {
  const cleanBase = base.replace(/\/+$/, '');

  const localSrcs = new Set<string>();
  for (const t of project.tracks ?? []) for (const c of t.clips) if (isLocal(c.src)) localSrcs.add(c.src);
  for (const c of project.clips) if (isLocal(c.src)) localSrcs.add(c.src);
  for (const a of project.audio) if (isLocal(a.src)) localSrcs.add(a.src);
  if (project.background?.type === 'image' && isLocal(project.background.src)) localSrcs.add(project.background.src);

  const attempt = async (): Promise<string> => {
  const tokens = new Map<string, string>();
  let i = 0;
  for (const src of localSrcs) {
    onProgress?.({ stage: 'uploading', current: ++i, total: localSrcs.size });
    tokens.set(src, await uploadMedia(cleanBase, src));
  }
  const swap = (src: string) => (isLocal(src) ? tokens.get(src)! : src);

  const resolved: VideoProject = {
    ...project,
    background: project.background?.type === 'image' ? { ...project.background, src: swap(project.background.src) } : project.background,
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
    headers: { 'content-type': 'application/json', ...(await authHeaders(cleanBase)) },
    // Ask for a job rather than holding one connection open for the whole
    // encode — on a phone that connection also has to survive the radio
    // dozing, a handover, and every proxy between here and the box.
    body: JSON.stringify({ project: resolved, output, async: true }),
  });
  const data = (await res.json()) as {
    id?: string;
    url?: string;
    error?: string;
    code?: string;
    missing?: string[];
  };
  /*
   * The server holds none of these files any more — it says so before encoding
   * anything, and names them. Forget those tokens and let the caller try once
   * more; the upload loop above will mint fresh ones for exactly the media
   * that went missing and reuse the rest.
   */
  if (res.status === 409 && data.code === 'missing_uploads') {
    forgetUploads(cleanBase, data.missing ?? []);
    throw new StaleUploads(data.error ?? 'uploaded media expired on the server');
  }
  if (!res.ok) throw new Error(data.error ?? `render failed (HTTP ${res.status})`);
  // A server from before the job API answers with the url outright.
  const url = data.id ? await awaitJob(cleanBase, data.id, onProgress) : data.url;
  if (!url) throw new Error('render returned no url');
  // Absolute once output storage is a bucket; still relative on local disk.
  return /^https?:\/\//.test(url) ? url : `${cleanBase}${url}`;
  };

  try {
    return await attempt();
  } catch (err) {
    /*
     * Exactly one retry, and only for this. The tokens are gone from the cache
     * now, so the second pass re-uploads rather than repeating itself — which
     * also means a second failure is a real one and must surface. Retrying
     * anything else here would re-upload every file on any transient error.
     */
    if (!(err instanceof StaleUploads)) throw err;
    return await attempt();
  }
}

/**
 * Poll a render job until it settles, backing off 500ms → 4s.
 *
 * The poll used to report nothing at all, so the whole encode — by far the
 * longest part of an export — showed one unchanging line. Each reply now
 * forwards whatever the server measured.
 */
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
    if (res.status === 404) throw new Error('the render job expired before it was collected');
    const job = (await res.json()) as {
      status: string;
      url?: string;
      error?: string;
      progress?: number;
    };
    if (job.status === 'error') throw new Error(job.error ?? 'render failed');
    if (job.status === 'done' && job.url) return job.url;
    onProgress?.({
      stage: 'rendering',
      // A server that predates this simply omits it, and the bar stays
      // indeterminate — which is what it did for every server until now.
      fraction: typeof job.progress === 'number' ? job.progress : undefined,
    });
  }
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
