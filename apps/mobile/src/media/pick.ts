/**
 * Pickers that import device media into the current project. They copy the
 * chosen files into the app's media dir, build track clips, and push them into
 * the editor store (videos/images append to the main track; audio goes to an
 * audio track). Use `getState()` so they can run outside React.
 */
import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { newId } from '../model/editor-ops';
import type { AudioTrackClip, VisualTrackClip } from '../model/types';
import { copyIntoMedia, extFromUri, videoThumbnail } from '../storage/media';
import { addHistory } from '../storage/genHistory';
import { useEditor } from '../store/editorStore';

const DEFAULT_IMAGE_DUR = 4; // seconds
const FALLBACK_VIDEO_DUR = 5; // seconds, when the picker omits duration

/** Pick one or more videos/images and append them to the main track. */
export async function pickAndAddMedia(): Promise<void> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Permission needed', 'Allow photo library access to import media.');
    return;
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    allowsMultipleSelection: true,
    quality: 1,
  });
  if (res.canceled) return;

  const clips: VisualTrackClip[] = [];
  let firstPoster: { uri: string; isVideo: boolean } | null = null;
  for (const asset of res.assets) {
    const isVideo = asset.type === 'video';
    try {
      const src = copyIntoMedia(asset.uri, isVideo ? 'mp4' : 'jpg');
      if (isVideo) {
        const dur = asset.duration && asset.duration > 0 ? asset.duration / 1000 : FALLBACK_VIDEO_DUR;
        useEditor.getState().setMediaDuration(src, dur);
        if (!useEditor.getState().sourceDims && asset.width && asset.height) {
          useEditor.getState().setSourceDims(asset.width, asset.height);
        }
        clips.push({ id: newId('v'), type: 'video', src, start: 0, duration: dur, trimIn: 0, volume: 1 });
        addHistory({ kind: 'video', source: 'upload', url: src, durationSec: dur });
      } else {
        clips.push({ id: newId('img'), type: 'image', src, start: 0, duration: DEFAULT_IMAGE_DUR });
        addHistory({ kind: 'image', source: 'upload', url: src });
      }
      if (!firstPoster) firstPoster = { uri: src, isVideo };
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
    }
  }
  if (!clips.length) return;

  const hadClips = (useEditor.getState().project?.tracks ?? []).some((t) => t.clips.length > 0);
  useEditor.getState().importVisual(clips);
  if (!hadClips && firstPoster) {
    const poster = firstPoster.isVideo ? await videoThumbnail(firstPoster.uri, 0) : firstPoster.uri;
    if (poster) useEditor.getState().setPoster(poster);
  }
}

/** Pick video/images and add them on a NEW overlay track (PiP / sticker). */
export async function pickAndAddOverlay(): Promise<void> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Permission needed', 'Allow photo library access to import media.');
    return;
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    allowsMultipleSelection: true,
    quality: 1,
  });
  if (res.canceled) return;

  const clips: VisualTrackClip[] = [];
  for (const asset of res.assets) {
    const isVideo = asset.type === 'video';
    try {
      const src = copyIntoMedia(asset.uri, isVideo ? 'mp4' : 'jpg');
      if (isVideo) {
        const dur = asset.duration && asset.duration > 0 ? asset.duration / 1000 : FALLBACK_VIDEO_DUR;
        useEditor.getState().setMediaDuration(src, dur);
        clips.push({ id: newId('v'), type: 'video', src, start: 0, duration: dur, trimIn: 0, volume: 1 });
      } else {
        clips.push({ id: newId('img'), type: 'image', src, start: 0, duration: DEFAULT_IMAGE_DUR });
      }
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
    }
  }
  if (clips.length) useEditor.getState().importOverlay(clips);
}

/** Pick an audio file and add it as a track. */
export async function pickAndAddAudio(): Promise<void> {
  const res = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.length) return;
  const asset = res.assets[0];
  try {
    const fallbackExt = extFromUri(asset.name ?? '', 'm4a');
    const src = copyIntoMedia(asset.uri, fallbackExt);
    const audio: AudioTrackClip = { id: newId('a'), src, start: 0, duration: 0, volume: 0.8 };
    useEditor.getState().importAudio(audio);
  } catch (e) {
    Alert.alert('Audio import failed', e instanceof Error ? e.message : String(e));
  }
}
