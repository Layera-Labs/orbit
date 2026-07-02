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
import { useEditor } from '../store/editorStore';
import type { VisualTrackClip } from '../model/types';
import { triggerUnsplashDownload, type StockItem } from './stock';

const STOCK_IMAGE_DUR = 4;
const STOCK_VIDEO_FALLBACK_DUR = 5;

const STICKER_DUR = 4;

/** Download a remote sticker/emoji PNG and add it as a centered square overlay. */
export async function addStickerFromUrl(url: string): Promise<void> {
  try {
    const src = await downloadToMedia(url, 'png');
    const p = useEditor.getState().project;
    const ar = p ? p.width / p.height : 1080 / 1920;
    const w = 0.3;
    const h = w * ar; // keep it square in pixels regardless of canvas aspect
    const clip: VisualTrackClip = { id: newId('img'), type: 'image', src, start: 0, duration: STICKER_DUR, rect: { x: (1 - w) / 2, y: (1 - h) / 2, w, h } };
    useEditor.getState().importOverlay([clip]);
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
