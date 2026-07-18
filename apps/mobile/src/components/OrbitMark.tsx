/**
 * OrbitMark — the Orbit brand glyph: a planet with a tilted orbit ring and a
 * single orbiting dot. Two-tone (ring vs body), so it lives here rather than in
 * the single-colour VIcon set.
 */
import Svg, { Circle, Ellipse } from 'react-native-svg';
import { vela } from '../constants';

export function OrbitMark({
  size = 28,
  color = vela.accent,
  ring = vela.accent,
  ringOpacity = 0.55,
}: {
  size?: number;
  color?: string;
  ring?: string;
  ringOpacity?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Ellipse cx={12} cy={12} rx={10} ry={4.6} stroke={ring} strokeOpacity={ringOpacity} strokeWidth={1.6} transform="rotate(-24 12 12)" />
      <Circle cx={12} cy={12} r={3.1} fill={color} />
      <Circle cx={20.8} cy={8.1} r={1.9} fill={color} />
    </Svg>
  );
}
