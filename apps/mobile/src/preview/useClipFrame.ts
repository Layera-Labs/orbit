/**
 * useClipFrame — decode a video clip to a Skia SkImage frame driven by the
 * editor transport. Built on `Skia.Video` because the stock `useVideo` skips
 * decoding while paused (its frame callback early-returns), so it can't show a
 * frame at a scrubbed playhead — the dominant editing state. This hook decodes:
 *   - while PLAYING: advances and presents frames at the clip framerate;
 *   - while PAUSED: seeks + presents ONE frame whenever the target time changes
 *     (frame-accurate scrubbing).
 * Loading mirrors the library's worklet-runtime pattern. Returns a SharedValue
 * to feed straight into <Image image={...}>.
 */
import { useCallback, useEffect, useState } from 'react';
import { Skia, type SkImage, type Video } from '@shopify/react-native-skia';
import {
  createWorkletRuntime,
  runOnJS,
  runOnRuntime,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

const loadRuntime = createWorkletRuntime('orbit-video-loader');

export function useClipFrame(
  uri: string | null,
  playing: SharedValue<boolean>,
  /** desired SOURCE time in seconds: trimIn + (playhead - clip.start) */
  timeSV: SharedValue<number>,
): SharedValue<SkImage | null> {
  const [video, setVideo] = useState<Video | null>(null);

  const load = useCallback((src: string) => {
    'worklet';
    const v = Skia.Video(src);
    runOnJS(setVideo)(v as Video);
  }, []);

  useEffect(() => {
    if (uri) runOnRuntime(loadRuntime, load)(uri);
    else setVideo(null);
    return () => setVideo(null);
  }, [uri, load]);

  const currentFrame = useSharedValue<SkImage | null>(null);
  const lastTs = useSharedValue(-1);
  const seekedTo = useSharedValue(-999);
  const pending = useSharedValue(true); // a decode is owed (seek just happened / first frame)

  const present = (img: SkImage | null) => {
    'worklet';
    if (!img) return false;
    if (currentFrame.value) currentFrame.value.dispose();
    currentFrame.value = img;
    return true;
  };

  useFrameCallback((info) => {
    'worklet';
    if (!video) return;
    const fr = video.framerate() || 30;
    const frameMs = 1000 / fr;

    if (playing.value) {
      if (lastTs.value === -1) {
        video.seek(timeSV.value); // (re)start from the desired time
        lastTs.value = info.timestamp;
        seekedTo.value = -999;
        present(video.nextImage());
        return;
      }
      const delta = info.timestamp - lastTs.value;
      if (delta >= frameMs) {
        present(video.nextImage());
        lastTs.value = info.timestamp;
      }
    } else {
      lastTs.value = -1;
      const t = timeSV.value;
      if (Math.abs(t - seekedTo.value) > 0.001) {
        // seek is async in the native decoder — request, then keep pulling frames
        video.seek(t);
        seekedTo.value = t;
        pending.value = true;
      }
      // retry nextImage() across frames until the seek lands a frame
      if (pending.value && present(video.nextImage())) {
        pending.value = false;
      }
    }
  });

  return currentFrame;
}
