/**
 * VSlider — a reusable interactive horizontal slider (Vela-styled), built on
 * gesture-handler. Used across the editor sheets for size, intensity, speed,
 * volume, opacity, etc. Reports values on the JS thread via onChange.
 */
import { useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { vela } from '../constants';

export function VSlider({
  value,
  min,
  max,
  step,
  onChange,
  fill = vela.accent,
  disabled = false,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  fill?: string;
  /**
   * Greyed and inert. It still shows its value: a control that is temporarily
   * not applicable should say what it will go back to, not go blank.
   */
  disabled?: boolean;
}) {
  const [w, setW] = useState(0);

  const set = (x: number) => {
    if (w <= 0 || disabled) return;
    const frac = Math.max(0, Math.min(1, x / w));
    let v = min + frac * (max - min);
    if (step) v = Math.round(v / step) * step;
    onChange(Math.max(min, Math.min(max, v)));
  };

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onBegin((e) => set(e.x))
    .onUpdate((e) => set(e.x));

  const pct = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;
  const paint = disabled ? vela.lightMuted3 : fill;

  return (
    <GestureDetector gesture={pan}>
      <View
        style={[styles.hit, disabled && styles.off]}
        onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
      >
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: paint }]} />
        </View>
        <View style={[styles.knob, { left: `${pct * 100}%`, borderColor: paint }]} />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  hit: { height: 40, justifyContent: 'center' },
  off: { opacity: 0.55 },
  track: { height: 6, borderRadius: 3, backgroundColor: vela.lightBorder, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  // White knob with a self-colored (fill) ring + a tight downward shadow.
  knob: {
    position: 'absolute',
    top: '50%',
    marginTop: -11,
    marginLeft: -11,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
