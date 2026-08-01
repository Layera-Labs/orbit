/**
 * VSlider — a reusable interactive horizontal slider (Vela-styled), built on
 * gesture-handler. Used across the editor sheets for size, intensity, speed,
 * volume, opacity, etc. Reports values on the JS thread via onChange.
 *
 * **Three rules, all of them learned from the same crash** (2026-08-01). Touching
 * the music volume slider threw "Maximum update depth exceeded", and the knob
 * lagged behind the finger — one cause, two symptoms: a pan gesture delivers
 * move events far faster than a store write can absorb them, and every one of
 * those events was writing the project and re-rendering the editor.
 *
 * 1. **Values are QUANTIZED, and an unchanged value is not reported.** A finger
 *    crossing the track emits a couple of hundred move events; without a step
 *    that is a couple of hundred writes of values nobody can tell apart. The
 *    default is 1/200 of the range — invisibly fine — and callers that want a
 *    coarser feel (volume snaps to 5%) pass their own.
 * 2. **At most one report per frame.** Even deduped, a fast swipe crosses every
 *    bucket there is. The latest value is flushed on the next frame and the
 *    pending one is always flushed on release, so nothing is ever dropped —
 *    it is coalesced, not throttled.
 * 3. **The knob is drawn from the FINGER while it is down, not from `value`.**
 *    That is what makes it feel live: the position no longer waits for a store
 *    round-trip, which is exactly why it used to trail behind and appear to
 *    start from a stale place on the next drag.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { vela } from '../constants';
import { defaultStep, quantize } from './sliderValue';

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
  /** Defaults to 1/200 of the range. Pass one to snap to a coarser grid. */
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
  /** Where the finger is, while it is down. Null means "follow `value`". */
  const [drag, setDrag] = useState<number | null>(null);

  /*
   * Everything the gesture reads, behind one ref — so the gesture itself is
   * built ONCE. Built inline it was a new Gesture object on every render, so
   * GestureDetector tore down and re-attached its handler each time, and a
   * handler that sets state re-rendered into another new gesture.
   *
   * A ref rather than a dependency list, because every caller passes an inline
   * `onChange`: a memo keyed on it would be invalidated on every render, which
   * is that bug again with more ceremony.
   */
  const cfg = useRef({ w, min, max, step, disabled, onChange });
  useEffect(() => {
    cfg.current = { w, min, max, step, disabled, onChange };
  });

  const pending = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  /** Last value handed to `onChange` in this drag, so we do not repeat it. */
  const sent = useRef<number | null>(null);

  const flush = useCallback(() => {
    frame.current = null;
    const v = pending.current;
    pending.current = null;
    if (v === null) return;
    if (sent.current !== null && v === sent.current) return;
    sent.current = v;
    cfg.current.onChange(v);
  }, []);

  const move = useCallback(
    (x: number) => {
      const c = cfg.current;
      if (c.w <= 0 || c.disabled) return;
      const frac = Math.max(0, Math.min(1, x / c.w));
      const v = quantize(
        c.min + frac * (c.max - c.min),
        c.min,
        c.max,
        c.step ?? defaultStep(c.min, c.max),
      );
      // Immediate, and free when it has not moved a whole step: React bails out
      // of a re-render when the state is identical.
      setDrag(v);
      pending.current = v;
      if (frame.current === null) frame.current = requestAnimationFrame(flush);
    },
    [flush],
  );

  const end = useCallback(() => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    // The finger's last position must reach the caller even if it landed
    // between frames, or the value stops one step short of where you let go.
    flush();
    sent.current = null;
    setDrag(null);
  }, [flush]);

  // Nothing may outlive the component: a frame scheduled by the last move would
  // otherwise fire into an unmounted caller.
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin((e) => move(e.x))
        .onUpdate((e) => move(e.x))
        .onFinalize(() => end()),
    [move, end],
  );

  const shown = drag ?? value;
  const pct = max > min ? Math.max(0, Math.min(1, (shown - min) / (max - min))) : 0;
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
