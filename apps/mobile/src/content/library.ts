/**
 * Add a library content item (emoji / sticker) to the timeline: download the
 * CDN PNG into the project media (so it uploads + exports like any image), then
 * drop it as a centered, square overlay clip. Reuses the overlay pipeline, so
 * it's dual-rendered (Skia preview + ffmpeg overlay) with zero engine work.
 */
import { Alert } from 'react-native';
import { newId } from '../model/editor-ops';
import { downloadToMedia } from '../storage/media';
import { useEditor } from '../store/editorStore';
import type { VisualTrackClip } from '../model/types';

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
