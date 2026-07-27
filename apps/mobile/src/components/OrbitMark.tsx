/**
 * OrbitMark — the Orbit brand glyph: a planet with a tilted orbit ring and a
 * single orbiting dot. Two-tone (ring vs body), so it lives here rather than in
 * the single-colour VIcon set.
 *
 * `animate` sends the dot around the ring. The motion is decorative only: the
 * dot's resting position IS its t=0 position, so if the animation never runs
 * (reduced motion, a stalled worklet, a screenshot pass) the mark still renders
 * complete and correct. Never gate anything on it.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Stop } from 'react-native-svg';
import { vela } from '../constants';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// The ring is an ellipse rx=10 ry=4.6 about (12,12), tilted -24°. A dot at
// parameter t therefore sits at that point rotated into the ring's own plane.
const RX = 10;
const RY = 4.6;
const COS = Math.cos((-24 * Math.PI) / 180);
const SIN = Math.sin((-24 * Math.PI) / 180);
const ORBIT_MS = 9000;

export function OrbitMark({
  size = 28,
  color = vela.accent,
  ring = vela.accent,
  ringOpacity = 0.55,
  animate = false,
  surface,
}: {
  size?: number;
  color?: string;
  ring?: string;
  ringOpacity?: number;
  /** Send the dot around the ring (hero use). Off by default so the nav and
   *  header marks stay still. */
  animate?: boolean;
  /** Background behind the mark. A moving dot crosses the ring stroke at every
   *  angle and merges into it; knocking the dot out in the surface colour keeps
   *  it reading as a body ON the orbit rather than a lump in the line. Only
   *  needed when `animate` is set — the resting position sits clear. */
  surface?: string;
}) {
  const t = useSharedValue(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (alive) setReduceMotion(on);
    });
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (!animate || reduceMotion) {
      t.value = 0;
      return;
    }
    t.value = withRepeat(
      withTiming(Math.PI * 2, { duration: ORBIT_MS, easing: Easing.linear }),
      -1,
      false,
    );
  }, [animate, reduceMotion, t]);

  // The dot is drawn TWICE — once under the planet and once over it — with only
  // the half matching its current side visible. That way it passes behind the
  // planet on the far side instead of carving a bite out of it with its
  // knockout stroke, and the mark reads as orbital rather than flat.
  const farProps = useAnimatedProps(() => {
    const s = Math.sin(t.value);
    const x = RX * Math.cos(t.value);
    const y = RY * s;
    return {
      cx: 12 + x * COS - y * SIN,
      cy: 12 + x * SIN + y * COS,
      r: 1.9 * (1 + 0.16 * s),
      opacity: s < 0 ? 1 : 0,
    };
  });
  const nearProps = useAnimatedProps(() => {
    const s = Math.sin(t.value);
    const x = RX * Math.cos(t.value);
    const y = RY * s;
    return {
      cx: 12 + x * COS - y * SIN,
      cy: 12 + x * SIN + y * COS,
      // Swell on the near half so the dot reads as travelling around the
      // planet rather than sliding across it.
      r: 1.9 * (1 + 0.16 * s),
      opacity: s >= 0 ? 1 : 0,
    };
  });

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Defs>
        <LinearGradient
          id="orbit-brand"
          x1="2"
          y1="3"
          x2="22"
          y2="21"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor={ring} />
          <Stop
            offset="1"
            stopColor={color === vela.accent ? vela.accent2 : color}
          />
        </LinearGradient>
      </Defs>
      <Ellipse
        cx={12}
        cy={12}
        rx={RX}
        ry={RY}
        stroke={ring}
        strokeOpacity={ringOpacity}
        strokeWidth={1.6}
        transform="rotate(-24 12 12)"
      />
      {/* far half — under the planet, so the planet occludes it */}
      {animate ? (
        <AnimatedCircle
          cx={20.8}
          cy={8.1}
          r={1.9}
          fill="url(#orbit-brand)"
          stroke={surface}
          strokeWidth={surface ? 1.4 : 0}
          animatedProps={farProps}
        />
      ) : null}
      <Circle cx={12} cy={12} r={3.1} fill="url(#orbit-brand)" />
      {/* near half — over the planet. When static this is the only dot, at rest. */}
      <AnimatedCircle
        cx={20.8}
        cy={8.1}
        r={1.9}
        fill="url(#orbit-brand)"
        stroke={animate ? surface : undefined}
        strokeWidth={animate && surface ? 1.4 : 0}
        animatedProps={animate ? nearProps : undefined}
      />
    </Svg>
  );
}
