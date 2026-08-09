/**
 * A scene's `visual` string → an actual file the renderer can use.
 *
 * ## This is a step, not a fourth abstraction
 *
 * The Orbit plan rejects `resolveVisual` on the grounds that there are already
 * three asset abstractions and a fourth would be worse. That objection is right
 * about abstractions and does not apply here, because nothing below defines a
 * provider: it CONSUMES `AssetProvider` from `@layera-labs/shared`, the same
 * interface `PexelsProvider` already implements. What is added is the step
 * between "the planner said 'a glass of water on a windowsill'" and "a clip has
 * a src" — searching, CHOOSING, and fetching — and that step has to exist
 * somewhere regardless of how many provider interfaces there are.
 *
 * ## Choosing is the whole job
 *
 * Searching is one call and fetching is another. The part with judgement in it
 * is which of twenty results to use, and it is where an automatic video visibly
 * fails: a landscape shot dropped into a 9:16 frame keeps about a third of its
 * width, so a cover-fit shows a narrow vertical slice of the middle — usually
 * missing whatever the shot was of. That is not a rendering bug and nothing
 * downstream can repair it.
 *
 * So requirements are RELAXED IN A STATED ORDER rather than either failing or
 * being ignored, and every relaxation is reported. A caller that ends up with a
 * badly-cropped scene can see that it was the only thing the search returned.
 */
import type { Asset, AssetProvider } from '@layera-labs/shared';

export interface VisualWant {
  width: number;
  height: number;
  kind: 'image' | 'video';
  /**
   * The scene's MEASURED length, when it is known.
   *
   * A video shorter than its scene is the one compromise with no downstream
   * repair — the clip runs out and the tail is whatever the encoder does with
   * a source that ended. It is dropped last for that reason.
   */
  minDurationSec?: number;
}

/**
 * What had to be given up, in the order it was given up.
 *
 * Reported rather than swallowed for the same reason the planner reports its
 * rejections: a search that never returns anything vertical is a query problem,
 * and it is invisible if the fallback silently succeeds.
 */
export type Compromise = 'resolution' | 'aspect' | 'duration';

export interface Pick {
  asset: Asset;
  compromises: Compromise[];
}

/** Somewhere to put the bytes. The implementation owns its own caching. */
export interface AssetStore {
  /**
   * Fetch a remote asset and return a src the renderer understands.
   *
   * Expected to be idempotent per url — asked twice for the same one, it should
   * not download twice. How that is achieved is the implementation's business;
   * the pipeline has no opinion about disks or buckets.
   */
  fetch(url: string): Promise<string>;
}

/**
 * How far an asset's shape is from the frame's, as a symmetric ratio.
 *
 * A log, so that twice-as-wide and half-as-wide score the same — an ordinary
 * difference of ratios would call a 16:9 shot in a 9:16 frame far worse than
 * the reverse, when they are the same crop in opposite directions.
 */
export function aspectMismatch(asset: Asset, want: VisualWant): number {
  if (!asset.width || !asset.height) return Infinity;
  return Math.abs(Math.log(asset.width / asset.height / (want.width / want.height)));
}

/**
 * What fraction of the asset survives a cover-fit into the frame.
 *
 * This is the quantity that actually decides whether a crop is acceptable, and
 * it is worth computing rather than eyeballing a log. Cover-fit scales the
 * asset until it fills both dimensions and throws away the overflow on one
 * axis, so what is left of that axis is exactly the smaller of the two aspect
 * ratios over the larger.
 */
export function retainedFraction(asset: Asset, want: VisualWant): number {
  return Math.exp(-aspectMismatch(asset, want));
}

/**
 * How much of a shot may be cropped away before it stops being that shot.
 *
 * Measured against the real cases rather than picked as a round number:
 *
 *     4:5  into 9:16  keeps 70%   — a real crop, subject still there
 *     3:4  into 9:16  keeps 75%
 *     1:1  into 9:16  keeps 56%   — starting to lose the subject
 *     16:9 into 9:16  keeps 32%   — a narrow slice of the middle
 *
 * 0.62 draws the line between the second and third pair: the portrait-ish
 * shapes a vertical search actually returns are accepted, square and landscape
 * are treated as compromises. An earlier version of this used a bare 0.25 in
 * log space, which quietly rejected 4:5 AND 3:4 — both perfectly usable — while
 * the comment beside it claimed they passed.
 */
const MIN_RETAINED = 0.62;
const ASPECT_TOLERANCE = -Math.log(MIN_RETAINED);

/** Cover-fit without upscaling: both dimensions must already reach the frame. */
function coversFrame(asset: Asset, want: VisualWant): boolean {
  return (asset.width ?? 0) >= want.width && (asset.height ?? 0) >= want.height;
}

function longEnough(asset: Asset, want: VisualWant): boolean {
  if (want.minDurationSec == null) return true;
  return (asset.duration ?? 0) >= want.minDurationSec;
}

/**
 * Choose one of the search results, giving up as little as possible.
 *
 * The relaxation order is a claim about which failure looks worst, and it is
 * the reverse of what you might guess:
 *
 *  - RESOLUTION goes first. An upscaled shot is soft, and soft is the mildest
 *    of the three — the frame is still full and the subject is still centred.
 *  - ASPECT goes second. A badly-cropped shot is a real editorial failure, but
 *    it is continuous: something is on screen for the whole scene.
 *  - DURATION goes last, because it is the only one that leaves a HOLE. A video
 *    shorter than its scene runs out, and no later stage can fill that. There
 *    is no looping in the engine, and inventing one here would be a rendering
 *    feature wearing a resolver's clothes.
 *
 * Returns null when nothing of the right kind came back at all — which is a
 * different problem (a query that found nothing) and belongs to the caller.
 */
export function pickAsset(assets: Asset[], want: VisualWant): Pick | null {
  const ofKind = assets.filter((a) => a.type === want.kind);
  if (!ofKind.length) return null;

  const requirements: { name: Compromise; ok: (a: Asset) => boolean }[] = [
    { name: 'resolution', ok: (a) => coversFrame(a, want) },
    { name: 'aspect', ok: (a) => aspectMismatch(a, want) <= ASPECT_TOLERANCE },
    { name: 'duration', ok: (a) => longEnough(a, want) },
  ];

  const compromises: Compromise[] = [];
  // Drop one at a time from the front, so the last requirement standing is the
  // one that matters most.
  for (let drop = 0; drop <= requirements.length; drop++) {
    const active = requirements.slice(drop);
    const survivors = ofKind.filter((a) => active.every((r) => r.ok(a)));
    if (survivors.length) return { asset: best(survivors, want), compromises };
    if (drop < requirements.length) compromises.push(requirements[drop].name);
  }

  /* Nothing satisfied even an empty requirement set, which cannot happen —
     but returning the first result beats returning null and losing the scene. */
  return { asset: ofKind[0], compromises };
}

/**
 * Among assets that all qualify: closest shape first, then SMALLEST.
 *
 * Smallest rather than largest, deliberately. Everything here is downscaled
 * into the frame anyway, so the extra pixels of a 4K master buy nothing and
 * cost a download on every scene of every generation.
 */
function best(assets: Asset[], want: VisualWant): Asset {
  return [...assets].sort((a, b) => {
    const shape = aspectMismatch(a, want) - aspectMismatch(b, want);
    if (Math.abs(shape) > 1e-9) return shape;
    return pixels(a) - pixels(b);
  })[0];
}

const pixels = (a: Asset): number => (a.width ?? 0) * (a.height ?? 0);

export interface ResolveDeps {
  provider: AssetProvider;
  store: AssetStore;
}

export interface ResolvedVisual {
  /** What a clip's `src` becomes. */
  src: string;
  type: 'image' | 'video';
  asset: Asset;
  compromises: Compromise[];
}

export class NoVisualError extends Error {
  query: string;
  constructor(query: string) {
    super(`the search returned nothing usable for: ${query}`);
    this.name = 'NoVisualError';
    this.query = query;
  }
}

/**
 * Search, choose, fetch.
 *
 * `orientation` is passed to the provider as well as being scored here. Asking
 * narrows what comes back, which is strictly better than filtering twenty
 * landscape results down to none — but it is a hint that providers honour
 * unevenly, so the scoring has to stand on its own regardless.
 */
export async function resolveVisual(
  deps: ResolveDeps,
  query: string,
  want: VisualWant,
): Promise<ResolvedVisual> {
  const assets = await deps.provider.search(query, {
    perPage: 20,
    orientation:
      want.width === want.height
        ? 'squarish'
        : want.width > want.height
          ? 'landscape'
          : 'portrait',
  });
  const chosen = pickAsset(assets, want);
  if (!chosen) throw new NoVisualError(query);
  return {
    src: await deps.store.fetch(chosen.asset.src),
    type: want.kind,
    asset: chosen.asset,
    compromises: chosen.compromises,
  };
}
