/**
 * Media helpers: copy picked files into the app's stable `media/` dir (picker
 * URIs are ephemeral) and generate video thumbnails for the timeline / posters.
 */
import { File } from 'expo-file-system';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { newId } from '../model/editor-ops';
import { ensureDirs, mediaDir } from './projects';

export function extFromUri(uri: string, fallback: string): string {
  const path = uri.split('?')[0];
  const slash = path.lastIndexOf('/');
  const dot = path.lastIndexOf('.');
  if (dot > slash && dot >= 0) {
    const ext = path.slice(dot + 1).toLowerCase();
    if (ext.length >= 1 && ext.length <= 5) return ext;
  }
  return fallback;
}

/** Copy a picked file into the media dir; returns the stable `file://` URI. */
export function copyIntoMedia(srcUri: string, fallbackExt: string): string {
  ensureDirs();
  const ext = extFromUri(srcUri, fallbackExt);
  const dest = new File(mediaDir, `${newId('m')}.${ext}`);
  new File(srcUri).copy(dest);
  return dest.uri;
}

/** Download a remote asset (CDN sticker/emoji/bg) into the media dir; returns its `file://` URI. */
export async function downloadToMedia(url: string, fallbackExt: string): Promise<string> {
  ensureDirs();
  const ext = extFromUri(url, fallbackExt);
  const dest = new File(mediaDir, `${newId('m')}.${ext}`);
  await File.downloadFileAsync(url, dest);
  return dest.uri;
}

/**
 * A src as something that can actually be loaded.
 *
 * Media srcs are stored two ways in this app and always have been: a `file://`
 * URI from `copyIntoMedia`, or a bare path from anything that took a clip's
 * `src` at face value. `<Image>` and Skia both need the URI form and both fail
 * SILENTLY on the bare one, so the difference shows up as a blank rectangle
 * with no error anywhere — which is exactly how it reached the export screen,
 * the projects list and the home screen at once via `posterUri`.
 */
export function toFileUri(p: string): string;
export function toFileUri(p: string | null | undefined): string | null;
export function toFileUri(p?: string | null): string | null {
  if (!p) return null;
  return p.startsWith('http') || p.startsWith('file:') ? p : `file://${p}`;
}

/**
 * Whether a local file is really there. Never throws — a malformed URI, a
 * remote one, or a path in a container this install no longer owns all just
 * mean "no".
 */
export function fileExists(uri: string | undefined | null): boolean {
  if (!uri || !uri.startsWith('file:')) return false;
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

/** Best-effort thumbnail for a video at `timeSec`; undefined on failure. */
export async function videoThumbnail(uri: string, timeSec = 0): Promise<string | undefined> {
  try {
    const { uri: thumb } = await VideoThumbnails.getThumbnailAsync(uri, {
      time: Math.max(0, timeSec) * 1000,
    });
    return thumb;
  } catch {
    return undefined;
  }
}
