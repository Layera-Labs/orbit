/**
 * Media store: blobs in, `orbit-media:<id>` srcs out.
 *
 * Object URLs are cached per id and revoked on `clearObjectUrls`, because a URL
 * created per render leaks a blob reference for the life of the document.
 */
import { db, newId } from './idb';
import { mediaIdOf, mediaSrc, type MediaOrigin, type MediaRow } from './schema';

const urls = new Map<string, string>();

export interface AddMediaInput {
  blob: Blob;
  name: string;
  origin: MediaOrigin;
  mime?: string;
  width?: number;
  height?: number;
  duration?: number;
  prompt?: string;
}

/** Store a blob and return its `orbit-media:` src. */
export async function addMedia(input: AddMediaInput): Promise<{ id: string; src: string }> {
  const id = newId('m');
  const row: MediaRow = {
    id,
    blob: input.blob,
    mime: input.mime ?? input.blob.type ?? 'application/octet-stream',
    name: input.name,
    origin: input.origin,
    width: input.width,
    height: input.height,
    duration: input.duration,
    prompt: input.prompt,
    createdAt: Date.now(),
  };
  await (await db()).put('media', row);
  return { id, src: mediaSrc(id) };
}

/**
 * Pull a remote asset into local storage.
 *
 * Two reasons, both load-bearing. Durability: the render service serves
 * generated files from a temp dir it evicts, so a URL we hold today 404s
 * tomorrow. And canvas tainting: drawing a cross-origin image into a canvas
 * poisons `toDataURL`, which would silently kill every thumbnail and poster
 * frame in the app.
 */
export async function importRemote(
  url: string,
  meta: Omit<AddMediaInput, 'blob' | 'name'> & { name?: string },
): Promise<{ id: string; src: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not fetch ${url} (HTTP ${res.status})`);
  const blob = await res.blob();
  const name = meta.name ?? url.split('/').pop() ?? 'asset';
  return addMedia({ ...meta, blob, name, mime: blob.type });
}

export async function getMedia(id: string): Promise<MediaRow | undefined> {
  return (await db()).get('media', id);
}

export async function listMedia(): Promise<MediaRow[]> {
  const rows = await (await db()).getAllFromIndex('media', 'createdAt');
  return rows.reverse();
}

export async function deleteMedia(id: string): Promise<void> {
  const url = urls.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urls.delete(id);
  }
  await (await db()).delete('media', id);
}

/** Persist an upload token so the next export can skip re-uploading. */
export async function setUploadToken(id: string, token: string): Promise<void> {
  const database = await db();
  const row = await database.get('media', id);
  if (!row) return;
  await database.put('media', { ...row, uploadToken: token, uploadedAt: Date.now() });
}

/**
 * Drop cached upload tokens for the given media.
 *
 * Called when a render fails: the service's media dir is evicted oldest-first,
 * so a stale token is the likeliest cause and re-uploading is the fix. The
 * mobile client caches tokens forever and has this exact bug.
 */
export async function invalidateUploadTokens(ids: string[]): Promise<void> {
  const database = await db();
  const tx = database.transaction('media', 'readwrite');
  await Promise.all(
    ids.map(async (id) => {
      const row = await tx.store.get(id);
      if (!row?.uploadToken) return;
      const { uploadToken: _t, uploadedAt: _a, ...rest } = row;
      await tx.store.put(rest as typeof row);
    }),
  );
  await tx.done;
}

/** A displayable URL for an `orbit-media:` src. Returns the input unchanged for http(s). */
export async function resolveSrc(src: string): Promise<string> {
  const id = mediaIdOf(src);
  if (!id) return src;
  const cached = urls.get(id);
  if (cached) return cached;
  const row = await getMedia(id);
  if (!row) return '';
  const url = URL.createObjectURL(row.blob);
  urls.set(id, url);
  return url;
}

/** Resolve many srcs at once into a lookup the renderer can use synchronously. */
export async function resolveAll(srcs: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(srcs)];
  const pairs = await Promise.all(unique.map(async (s) => [s, await resolveSrc(s)] as const));
  return Object.fromEntries(pairs.filter(([, url]) => url));
}

export function clearObjectUrls(): void {
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
}
