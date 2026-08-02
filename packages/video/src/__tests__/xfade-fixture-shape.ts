/**
 * The shape of the measured-xfade fixture, shared by the probe that writes it
 * and the tests that read it.
 *
 * It is a separate module so the always-on tests never import the probe (which
 * shells out to ffmpeg), and so the sampling geometry has exactly one
 * definition — a fixture recorded on one lattice and read on another is not
 * evidence about anything.
 */
import { join } from 'node:path';

export const FIXTURE_PATH = join(__dirname, 'fixtures', 'xfade-probe.json');

export const PROBE = {
  /**
   * 64×64. Small enough that a whole row is a cheap fixture, big enough that
   * the `(int)((1-p)*w)` rounding a wipe's edge obeys is still visible to the
   * pixel.
   */
  size: 64,
  fps: 30,
  /** Each clip's length; the pair overlap by `overlapSec` of it. */
  clipSec: 1,
  overlapSec: 0.5,
  /**
   * Which frames OF THE TRANSITION to keep, out of the 15 it spans. `p` is
   * `frame / 15` — 0, 1/3, 2/3 and the last one before the window closes.
   *
   * The two ends are not sampled because they are not interesting: at `p = 0`
   * the picture is clip A, and the frame at `offset + duration` is already
   * entirely clip B (the window is half-open, measured).
   */
  frames: [0, 5, 10, 14],
} as const;

/**
 * The three lines sampled out of each frame, as flat pixel indices.
 *
 * A centre row and a centre column pin every axis-aligned family — a wipe's
 * edge, a slide's offset, a squeeze's scale — to the pixel. The main diagonal
 * is what catches the `diag*` and `radial` families, which an axis-aligned
 * cross reads as almost nothing.
 */
export function lineOffsets(size: number): number[][] {
  const mid = size >> 1;
  const row: number[] = [];
  const col: number[] = [];
  const diag: number[] = [];
  for (let k = 0; k < size; k++) {
    row.push(mid * size + k);
    col.push(k * size + mid);
    diag.push(k * size + k);
  }
  return [row, col, diag];
}

export interface ProbeFixture {
  /** The ffmpeg the numbers came from. They are not claimed to hold on others. */
  ffmpeg: string;
  size: number;
  fps: number;
  clipSec: number;
  overlapSec: number;
  frames: readonly number[];
  /** family → base64 of `frames × 3 lines × size` packed RGB triples. */
  samples: Record<string, string>;
  /**
   * family → how far the real filtergraph lands from the bare filter, per
   * channel: the largest single difference and the mean over every sample.
   *
   * Neither is a bug budget. `max` is what compositing the finished run in
   * 4:2:0 — like every other layer in this engine — costs on the ONE pixel
   * column a hard edge lands in, where the two pictures differ by most of the
   * range; it reaches ~108 on the sliding families and ~5 on the blending
   * ones, which is exactly the split you would predict. `mean` is the number
   * worth asserting on, because a wrong `offset` or a mis-sized pad is not a
   * boundary artefact — it moves every pixel at once.
   */
  tolerance: Record<string, { max: number; mean: number }>;
}
