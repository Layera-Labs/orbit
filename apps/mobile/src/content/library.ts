/**
 * Add a library content item (emoji / sticker) to the timeline: download the
 * CDN PNG into the project media (so it uploads + exports like any image), then
 * drop it as a centered, square overlay clip. Reuses the overlay pipeline, so
 * it's dual-rendered (Skia preview + ffmpeg overlay) with zero engine work.
 */
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { newId } from '../model/editor-ops';
import { copyIntoMedia, downloadToMedia } from '../storage/media';
import { addAudioHistory } from '../storage/audioHistory';
import { useEditor } from '../store/editorStore';
import type { VisualTrackClip } from '../model/types';
import { triggerUnsplashDownload, type StockItem } from './stock';
import type { CcItem } from './openverse';
import { resolveModuleToMedia } from './assets';

const STOCK_IMAGE_DUR = 4;
const STOCK_VIDEO_FALLBACK_DUR = 5;

const STICKER_DUR = 4;

/** Add an already-resolved sticker/emoji media file as a centered square overlay. */
function addStickerFromSrc(src: string): void {
  const p = useEditor.getState().project;
  const ar = p ? p.width / p.height : 1080 / 1920;
  const w = 0.3;
  const h = w * ar; // keep it square in pixels regardless of canvas aspect
  const clip: VisualTrackClip = { id: newId('img'), type: 'image', src, start: 0, duration: STICKER_DUR, rect: { x: (1 - w) / 2, y: (1 - h) / 2, w, h } };
  useEditor.getState().importOverlay([clip]);
}

/** Download a remote sticker/emoji PNG and add it as a centered square overlay. */
export async function addStickerFromUrl(url: string): Promise<void> {
  try {
    addStickerFromSrc(await downloadToMedia(url, 'png'));
  } catch (e) {
    Alert.alert('Add failed', e instanceof Error ? e.message : String(e));
  }
}

/** Add a bundled (offline) sticker/emoji require() module as a centered overlay. */
export async function addBundledSticker(module: number): Promise<void> {
  try {
    addStickerFromSrc(await resolveModuleToMedia(module, 'png'));
  } catch (e) {
    Alert.alert('Add failed', e instanceof Error ? e.message : String(e));
  }
}

/** Add a bundled sound effect as an audio clip starting at the playhead. */
export async function addBundledSfx(module: number, dur: number): Promise<void> {
  try {
    const src = await resolveModuleToMedia(module, 'wav');
    const st = useEditor.getState();
    st.importAudio({ id: newId('a'), src, start: st.playheadSec, duration: Math.max(0.1, dur), volume: 1 });
  } catch (e) {
    Alert.alert('Add failed', e instanceof Error ? e.message : String(e));
  }
}

/** Download a remote image and set it as the project background. */
export async function setBackgroundFromUrl(url: string): Promise<void> {
  try {
    const src = await downloadToMedia(url, 'jpg');
    useEditor.getState().applyBackground({ type: 'image', src });
  } catch (e) {
    Alert.alert('Background failed', e instanceof Error ? e.message : String(e));
  }
}

/** Set a bundled (offline) image background from a require() module. */
export async function setBundledBackground(module: number): Promise<void> {
  try {
    const src = await resolveModuleToMedia(module, 'jpg');
    useEditor.getState().applyBackground({ type: 'image', src });
  } catch (e) {
    Alert.alert('Background failed', e instanceof Error ? e.message : String(e));
  }
}

/** Add a stock image/video to the main track (downloads it into media first). */
export async function addStockItem(item: StockItem): Promise<void> {
  try {
    void triggerUnsplashDownload(item); // Unsplash ToS — fire and forget
    if (item.kind === 'video') {
      const src = await downloadToMedia(item.full, 'mp4');
      const duration = item.duration && item.duration > 0 ? item.duration : STOCK_VIDEO_FALLBACK_DUR;
      useEditor.getState().setMediaDuration(src, duration);
      useEditor.getState().importVisual([{ id: newId('v'), type: 'video', src, start: 0, duration, trimIn: 0, volume: 1 }]);
    } else {
      const src = await downloadToMedia(item.full, 'jpg');
      useEditor.getState().importVisual([{ id: newId('img'), type: 'image', src, start: 0, duration: STOCK_IMAGE_DUR }]);
    }
  } catch (e) {
    Alert.alert('Add failed', e instanceof Error ? e.message : String(e));
  }
}

/**
 * Add a CC0 item from the Stock tab, wherever it belongs.
 *
 * One entry point rather than four, because the category is already the thing
 * the user chose — an image goes on the main track, a background goes behind
 * everything, and both audio kinds go on an audio track at the playhead. Making
 * each caller re-derive that is how the same item ends up landing in two
 * different places from two different sheets.
 */
export async function addCcItem(item: CcItem): Promise<boolean> {
  try {
    if (item.category === 'background') {
      useEditor.getState().applyBackground({ type: 'image', src: await downloadToMedia(item.url, 'jpg') });
      return true;
    }
    if (item.kind === 'image') {
      const src = await downloadToMedia(item.url, 'jpg');
      useEditor.getState().importVisual([{ id: newId('img'), type: 'image', src, start: 0, duration: STOCK_IMAGE_DUR }]);
      return true;
    }
    const src = await downloadToMedia(item.url, 'mp3');
    const st = useEditor.getState();
    /*
     * `searchCc` refuses an audio item with no duration, so this is a real
     * number off the record and never a default standing in for one.
     */
    const duration = Math.max(0.1, item.durationSec ?? 0);
    st.importAudio({ id: newId('a'), src, start: st.playheadSec, duration, volume: 1 });
    /*
     * Kept in the audio library too, so a track used once is reachable from the
     * Library tab without spending another of the day's 200 searches on finding
     * it again.
     */
    addAudioHistory({ name: item.title, url: src, source: 'stock', durationSec: duration });
    return true;
  } catch (e) {
    Alert.alert('Add failed', e instanceof Error ? e.message : String(e));
    /*
     * Answered rather than swallowed, because a caller may have a next step. The
     * audio drawer opens the clip editor on what it just added, and doing that
     * after a failed download opens it on nothing.
     */
    return false;
  }
}

/** Pick a photo from the library and set it as the project background. */
export async function setBackgroundFromPhoto(): Promise<void> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Permission needed', 'Allow photo library access to use a photo background.');
    return;
  }
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (res.canceled || !res.assets?.length) return;
  try {
    const src = copyIntoMedia(res.assets[0].uri, 'jpg');
    useEditor.getState().applyBackground({ type: 'image', src });
  } catch (e) {
    Alert.alert('Background failed', e instanceof Error ? e.message : String(e));
  }
}
