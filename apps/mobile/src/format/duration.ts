/**
 * How long a piece of audio is, said one way.
 *
 * The Stock tab lists the same track in two sheets — the Library sheet's grid
 * and the audio drawer's rows — and they were formatting it separately: one
 * rounded the seconds and one floored them, so a 177.6s track read `2:58` in
 * one and `2:57` in the other. Small, and exactly the kind of thing that makes
 * a user doubt the number rather than the label.
 *
 * `0:00` is refused rather than printed. Sound effects are routinely under a
 * second, and the Audio category is mostly made of them — a column of `0:00`
 * says the app failed to read the file, when what it actually knows is 400ms.
 *
 * There are two older copies of this in `MediaLibraryScreen` and
 * `MediaPickScreen`. They format a video clip's length in a corner badge, where
 * neither the sub-second nor the missing case can arise; they are not folded in
 * here because that is a different surface's decision, not because they agree.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'Audio';
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${rest}`;
}
