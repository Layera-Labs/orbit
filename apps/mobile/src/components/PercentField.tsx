/**
 * The percentage beside a slider, made typeable.
 *
 * A slider is the wrong instrument for an exact number: the volume track now
 * spans 0–500%, so a whole step of the finger is several percent and landing on
 * 140 by dragging is luck. This is the same value as a field — tap it, type it,
 * done — and it stays a readout the rest of the time, so nothing on screen
 * gained a control it did not need.
 *
 * **It commits on blur, on Done, and on unmount — never per keystroke.** Reading
 * the field as you type means "1" is a real value on the way to "150", which
 * would drop the clip to 1% and, with a fade on it, rescale the curve to match.
 * The unmount case is the one that is easy to miss: a number pad has no return
 * key, and tapping the sheet's ✓ or the backdrop tears the field down without
 * ever blurring it — so without that flush, typing a number and closing the
 * sheet would throw the number away.
 *
 * `parsePercent` refuses an empty or unparseable field rather than coercing it:
 * `Number("")` is 0, and reading a cleared field as "mute this clip" is not
 * helpfulness.
 */
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { mono, r, sp, vela } from "../constants";
import { parsePercent } from "./sliderValue";

export function PercentField({
  value,
  min,
  max,
  step = 5,
  onCommit,
  disabled = false,
  label = "Value",
}: {
  /** The current value as a fraction — 1 is 100%. */
  value: number;
  /** Bounds, also as fractions. */
  min: number;
  max: number;
  /** Grid to snap a typed number to, in whole percent. */
  step?: number;
  onCommit: (v: number) => void;
  disabled?: boolean;
  /** Names the field for VoiceOver, e.g. "Volume". */
  label?: string;
}) {
  const input = useRef<TextInput>(null);
  /** The text being typed. Null means "show the value". */
  const [text, setText] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  const pct = Math.round(value * 100);
  const shown = text ?? String(pct);

  /*
   * Everything the unmount flush needs, kept current. It cannot read state or
   * props from the cleanup — those are captured at the effect's own render.
   */
  const live = useRef({ text, value, min, max, step, onCommit });
  useEffect(() => {
    live.current = { text, value, min, max, step, onCommit };
  });

  const commit = (typed: string | null) => {
    const c = live.current;
    if (typed === null) return;
    const next = parsePercent(typed, c.min * 100, c.max * 100, c.step);
    // A rejected field falls back to the value it already had, which is on
    // screen again the moment `text` clears — there is nothing to tell the user
    // that they cannot already see.
    if (next === null || next === c.value) return;
    c.onCommit(next);
  };

  useEffect(
    () => () => {
      commit(live.current.text);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${pct} percent`}
      onPress={() => !disabled && input.current?.focus()}
      style={[s.field, focused && s.on, disabled && s.off]}
    >
      <TextInput
        ref={input}
        style={[s.input, disabled && s.dim]}
        value={shown}
        editable={!disabled}
        keyboardType="number-pad"
        returnKeyType="done"
        selectTextOnFocus
        maxLength={4}
        onFocus={() => {
          setFocused(true);
          setText(String(pct));
        }}
        onChangeText={setText}
        onBlur={() => {
          const typed = text;
          setText(null);
          setFocused(false);
          commit(typed);
        }}
        onSubmitEditing={() => input.current?.blur()}
      />
      <Text style={[s.suffix, disabled && s.dim]}>%</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
    paddingLeft: sp.sm,
    paddingRight: 7,
    height: 32,
    borderRadius: r.sm,
    borderCurve: "continuous",
    backgroundColor: vela.lightSurface,
    // A field, not a chip: the edge only appears while it is taking input, and
    // it is the accent already on the slider beside it.
    borderWidth: 1,
    borderColor: "transparent",
  },
  on: { backgroundColor: vela.lightCard, borderColor: vela.accent },
  off: { opacity: 0.55 },
  // Mono, and a stated width: the digits change as the slider moves, and a
  // proportional face makes the whole row jitter as they change width.
  input: {
    minWidth: 34,
    padding: 0,
    textAlign: "right",
    color: vela.ink,
    fontFamily: mono.regular,
    fontSize: 14,
  },
  suffix: { color: vela.lightMuted, fontFamily: mono.regular, fontSize: 14 },
  dim: { color: vela.lightMuted3 },
});
