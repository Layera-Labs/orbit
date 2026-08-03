/**
 * The AI tab's shimmer — one clock, shared by the mark and its label.
 *
 * The mark already carries a gradient, so the honest motion is to make the
 * LIGHT travel across it rather than to bolt something on: nothing appears,
 * nothing disappears, nothing scales, and the glyph is fully drawn at every
 * frame. That matters beyond taste — the one motion rule this codebase treats
 * as absolute is that content is never gated on an animation running, and a
 * sweep across an already-painted mark cannot violate it even if the animation
 * never starts.
 *
 * Deliberately not the alternatives. A pulsing glow behind the tile is the
 * stock "AI" badge and is named slop twice over (a glow, and a box lighting up
 * from inside). A scale or lift is the hover-boop in a different costume. A
 * spin turns the gradient with the glyph, so the light would ride along and
 * nothing would actually shimmer.
 *
 * **One shared value, passed to both**, rather than a loop inside each. Two
 * independent `withRepeat`s drift apart within a minute or two, and the whole
 * effect is that a single light crosses the icon and the word together.
 */
import { useEffect } from 'react';
import {
  cancelAnimation,
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { vela } from '../constants';

/**
 * Brand accent into a warm amber, and the ONE gradient in either drawer rail.
 *
 * Not indigo-into-purple: that pairing is the most recognisable machine-made
 * colour move there is, which makes it the worst possible choice for the
 * control that says "made by a machine". Lives here rather than in each rail so
 * the two cannot drift apart.
 */
export const AI_GRADIENT = ['#5b4bff', '#ffb347'];

/** The inactive label's ordinary colour, and the faintest tint of the sweep on it. */
const MUTED = vela.lightMuted;
const MUTED_TINT = '#8b83c4';

/** One pass of the light, in ms. Slow enough to read as a sheen, not a blink. */
const SWEEP_MS = 2400;

/**
 * 0 → 1 → 0, forever. `0.5` is the resting value, which is why reduced motion
 * simply stops here: mid-sweep is the frame where the ramp sits across the
 * middle of the glyph, so the static mark is the good-looking one rather than
 * whichever end the loop happened to start from.
 */
export function useAiShimmer(): SharedValue<number> {
  const t = useSharedValue(0.5);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      t.value = 0.5;
      return;
    }
    t.value = 0;
    t.value = withRepeat(
      withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.sin) }),
      -1,
      // Reverse rather than restart: a wrap would snap the light back across
      // the glyph every cycle, which is the one thing that would draw the eye.
      true,
    );
    return () => cancelAnimation(t);
  }, [reduced, t]);

  return t;
}

/**
 * The AI tab's label, travelling on the same light as its mark.
 *
 * The colour range is NOT the gradient's two ends when the tab is inactive. A
 * rail is a legend — grey label means "not selected", coloured means selected —
 * and a permanently indigo-to-amber word would read as chosen at all times. So
 * inactive it travels between its ordinary muted grey and a faint cool tint,
 * which is the same light passing over the word without claiming a state it
 * does not have. Selected, it gets the full ramp, because then the colour IS
 * the state.
 */
export function useAiLabelStyle(t: SharedValue<number>, active: boolean) {
  return useAnimatedStyle(() => ({
    color: interpolateColor(
      t.value,
      [0, 1],
      active ? [AI_GRADIENT[0], AI_GRADIENT[1]] : [MUTED, MUTED_TINT],
    ),
  }));
}
