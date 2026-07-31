/**
 * Whether the timeline is being scrolled BY THE USER right now.
 *
 * `Timeline` has two things that both want to own the scroll position: the
 * playhead (which scrolls the timeline to follow it) and the finger (which sets
 * the playhead from the scroll offset). Exactly one may drive at a time, and
 * this flag is the arbiter — which makes its lifecycle, not its value, the
 * thing that has to be right.
 *
 * It was wrong in one specific way. `onScrollEndDrag` fires when the FINGER
 * LIFTS, not when the content stops, so clearing the flag there handed control
 * back to the playhead while the scroll view was still gliding. For the whole
 * momentum phase `onScroll` then refused to move the playhead, and the sync
 * effect was free to call `scrollTo` with the stale value — so a flick scrubbed
 * and then snapped back to wherever the finger let go.
 *
 * The subtlety is that a flick which produces NO momentum never sends
 * `momentumBegin`/`momentumEnd` at all, so "stay active until momentum ends"
 * would strand the flag set forever — after which the playhead could never
 * scroll the timeline again. Hence the armed rest timer, and hence
 * `momentumBegin` disarming it: without that, a long glide would be cut short
 * by a timer that fired in the middle of it.
 *
 * Extracted from the component because it is a state machine with four inputs
 * and two of the transitions are only reachable through real gesture timing.
 */

export interface ScrollActivity {
  /** True while the finger or its momentum owns the scroll position. */
  readonly active: boolean;
  /** True while a rest timer is armed and would still be honoured. */
  readonly pendingRest: boolean;
}

export type ScrollEvent =
  /** A finger landed. */
  | "dragBegin"
  /** The finger lifted. A glide MAY follow; nothing here knows yet. */
  | "dragEnd"
  /** A glide actually started. */
  | "momentumBegin"
  /** The scroll view came to rest. */
  | "momentumEnd"
  /** The timer armed at `dragEnd` elapsed. */
  | "restTimer";

export const SCROLL_AT_REST: ScrollActivity = {
  active: false,
  pendingRest: false,
};

export function scrollActivity(
  state: ScrollActivity,
  event: ScrollEvent,
): ScrollActivity {
  switch (event) {
    case "dragBegin":
    case "momentumBegin":
      // Both mean "the scroll view is moving under its own control". Either
      // one disarms a pending rest timer: a glide has started, or the user has
      // grabbed the content again mid-glide, and in both cases a timer armed
      // at the previous lift must not fire into the middle of it.
      return { active: true, pendingRest: false };
    case "dragEnd":
      // Deliberately STILL ACTIVE. This is the fix — the content is very
      // likely still moving, and handing control back here is what caused the
      // snap-back.
      return { active: true, pendingRest: true };
    case "momentumEnd":
      return SCROLL_AT_REST;
    case "restTimer":
      // Only honoured if nothing has happened since it was armed. A timer that
      // fires after momentum began is stale.
      return state.pendingRest ? SCROLL_AT_REST : state;
  }
}

/**
 * Whether the playhead→scroll sync should issue a `scrollTo`.
 *
 * Skipping a move under half a pixel is not an optimisation: `onScroll` sets
 * the playhead, the playhead change re-runs the sync, and a `scrollTo` landing
 * mid-glide stops the deceleration dead. The guard is what stops the sync
 * interrupting the scroll that produced it.
 */
export function shouldSyncScroll(opts: {
  active: boolean;
  viewW: number;
  targetX: number;
  currentX: number;
}): boolean {
  if (opts.active || opts.viewW <= 0) return false;
  return Math.abs(opts.targetX - opts.currentX) >= 0.5;
}
