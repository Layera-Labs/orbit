/**
 * Export: local media → upload tokens → `POST /v1/render` → an MP4.
 *
 * These two endpoints are NOT proxied through Next. `/v1/render` holds one
 * connection for as long as ffmpeg runs (up to ten minutes) and `/v1/upload`
 * streams files up to 500 MB — neither survives a serverless function, and
 * neither is authenticated anyway, so a proxy would buy nothing.
 */
import { collectClientSrcs } from './srcs';
import { getMedia, invalidateUploadTokens, setUploadToken } from '@/db/media';
import { mediaIdOf } from '@/db/schema';
import type { ExportOutput, VideoProject } from '@orbit/video/browser';

const BASE = process.env.NEXT_PUBLIC_ORBIT_RENDER_URL ?? 'http://localhost:8787';

export type ExportStage = 'uploading' | 'rendering' | 'downloading' | 'done';

export interface ExportProgress {
  stage: ExportStage;
  current?: number;
  total?: number;
}

export class ExportError extends Error {
  constructor(
    message: string,
    readonly kind: 'no-server' | 'rejected' | 'failed',
  ) {
    super(message);
  }
}

/** Upload one media row if it has no live token, and return that token. */
async function tokenFor(mediaId: string, signal?: AbortSignal): Promise<string> {
  const row = await getMedia(mediaId);
  if (!row) throw new ExportError(`missing local media ${mediaId}`, 'failed');
  if (row.uploadToken) return row.uploadToken;

  const form = new FormData();
  form.append('file', row.blob, row.name || mediaId);
  const res = await fetch(`${BASE}/v1/upload`, { method: 'POST', body: form, signal });
  if (!res.ok) throw new ExportError(`upload failed (HTTP ${res.status})`, 'failed');
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new ExportError('upload returned no id', 'failed');
  await setUploadToken(mediaId, data.id);
  return data.id;
}

/** Rewrite every `orbit-media:` src into an `upload:` token the server accepts. */
async function resolveProject(
  project: VideoProject,
  signal: AbortSignal | undefined,
  onProgress: (p: ExportProgress) => void,
): Promise<{ resolved: VideoProject; mediaIds: string[] }> {
  // `collectClientSrcs` is the server's own checklist of validated fields, so
  // using it here guarantees we swap exactly what it will inspect.
  const local = [...new Set(collectClientSrcs(project).filter((s): s is string => typeof s === 'string'))]
    .map((src) => ({ src, id: mediaIdOf(src) }))
    .filter((x): x is { src: string; id: string } => !!x.id);

  const map: Record<string, string> = {};
  let done = 0;
  for (const { src, id } of local) {
    onProgress({ stage: 'uploading', current: done, total: local.length });
    map[src] = await tokenFor(id, signal);
    done += 1;
  }

  const swap = (src: string) => map[src] ?? src;
  const resolved: VideoProject = {
    ...project,
    clips: (project.clips ?? []).map((c) => ({ ...c, src: swap(c.src) })),
    audio: (project.audio ?? []).map((a) => ({ ...a, src: swap(a.src) })),
    tracks: project.tracks?.map((t) => ({
      ...t,
      clips: t.clips.map((c) => ({ ...c, src: swap(c.src) })),
    })) as VideoProject['tracks'],
    background:
      project.background?.type === 'image'
        ? { ...project.background, src: swap(project.background.src) }
        : project.background,
  };

  return { resolved, mediaIds: local.map((x) => x.id) };
}

export interface ExportOptions {
  output?: ExportOutput;
  signal?: AbortSignal;
  onProgress?: (p: ExportProgress) => void;
}

/** Render a project and return a blob URL for the finished MP4. */
export async function exportProject(
  project: VideoProject,
  opts: ExportOptions = {},
): Promise<{ url: string; blob: Blob }> {
  const onProgress = opts.onProgress ?? (() => undefined);
  const { resolved, mediaIds } = await resolveProject(project, opts.signal, onProgress);

  onProgress({ stage: 'rendering' });
  let res: Response;
  try {
    res = await fetch(`${BASE}/v1/render`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: resolved, output: opts.output }),
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ExportError(
      `Could not reach the render service at ${BASE}. Is it running?`,
      'no-server',
    );
  }

  if (!res.ok) {
    // The service evicts its media directory oldest-first, so a token we cached
    // last week may be gone. Drop them and let the next attempt re-upload —
    // the mobile client caches forever and has exactly this bug.
    await invalidateUploadTokens(mediaIds);
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ExportError(
      body.error ?? `render failed (HTTP ${res.status})`,
      res.status === 400 ? 'rejected' : 'failed',
    );
  }

  const data = (await res.json()) as { url?: string };
  if (!data.url) throw new ExportError('render returned no url', 'failed');

  onProgress({ stage: 'downloading' });
  const file = await fetch(`${BASE}${data.url}`, { signal: opts.signal });
  const blob = await file.blob();
  onProgress({ stage: 'done' });
  return { url: URL.createObjectURL(blob), blob };
}
