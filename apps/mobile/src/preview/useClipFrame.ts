/**
 * useClipFrame — decode a video clip to a Skia SkImage frame driven by the
 * editor transport. Built on `Skia.Video` because the stock `useVideo` skips
 * decoding while paused (its frame callback early-returns), so it can't show a
 * frame at a scrubbed playhead — the dominant editing state. This hook decodes:
 *   - while PLAYING: advances and presents frames at the clip framerate;
 *   - while PAUSED: seeks + presents ONE frame whenever the target time changes
 *     (frame-accurate scrubbing).
 * The decoder is leased from `mediaCache`, not opened here. Returns a
 * SharedValue to feed straight into <Image image={...}>.
 *
 * One consequence of the lease worth knowing: a pooled decoder arrives parked
 * at wherever it was last seeked, so the first `nextImage()` after a scrub can
 * return that older position before the new seek lands. It is always the SAME
 * media — the pool is keyed by uri — so what shows for a frame is a different
 * moment of this clip rather than a different clip, and the retry loop below
 * corrects it on the next tick.
 */
import { type SkImage } from '@shopify/react-native-skia';
import {
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useLeasedVideo } from './mediaCache';

export function useClipFrame(
  uri: string | null,
  playing: SharedValue<boolean>,
  /** desired SOURCE time in seconds: trimIn + (playhead - clip.start) */
  timeSV: SharedValue<number>,
): SharedValue<SkImage | null> {
  /*
   * Leased from a pool rather than opened here. Every visual layer is keyed by
   * clip id, so dragging the playhead across a cut unmounts this hook and
   * mounts a fresh one — and opening a decoder is expensive enough that it is
   * already kept off the UI thread on its own worklet runtime. Recrossing the
   * same cut used to pay that cost again in both directions; now it pays a
   * seek. The lease is exclusive: two layers sharing one decoder would fight
   * over its position, and this hook seeks on every scrub.
   */
  const video = useLeasedVideo(uri);

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
