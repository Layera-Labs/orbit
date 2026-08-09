/**
 * Four primitives, which is all three screens need.
 *
 * There is exactly ONE button. The usual filled-primary-beside-outlined-ghost
 * pair is a template, and a screen that needs two equally-weighted actions
 * almost always needed one action and a link.
 */
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { c, s, type } from '../theme';

export function Screen({
  title,
  lede,
  children,
  footer,
}: {
  title: string;
  lede: string;
  children: ReactNode;
  /** Pinned below the scroll, so the action does not wander with the content. */
  footer?: ReactNode;
}) {
  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={type.title}>{title}</Text>
        <Text style={[type.body, { marginTop: 6, marginBottom: s.gutter }]}>{lede}</Text>
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  disabled,
  busy,
  tone = 'accent',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** `quiet` is for a secondary action that is genuinely secondary. */
  tone?: 'accent' | 'quiet';
}) {
  const off = disabled || busy;
  // One colour for the spinner AND the label. A busy button is dimmed, so an
  // ink-coloured spinner sitting on the dimmed fill is dark on dark and simply
  // does not appear at the moment it is most needed.
  const fg = off ? c.muted : tone === 'accent' ? c.ink : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      onPress={onPress}
      disabled={off}
      // A pressed state that changes the FILL, not the position. A button that
      // hops upward under the thumb is a tic, not feedback.
      style={({ pressed }) => [
        styles.button,
        tone === 'accent' ? styles.buttonAccent : styles.buttonQuiet,
        pressed && !off ? styles.buttonPressed : null,
        off ? styles.buttonOff : null,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={fg} style={{ marginRight: 8 }} /> : null}
      {/* A disabled label is DIMMER, never faded to the edge of legibility.
          Dropping opacity until the text half-vanishes is how a control ends
          up unreadable rather than merely inactive. */}
      <Text style={[styles.buttonLabel, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

/** A short line of trouble, stated plainly. Never a modal. */
export function Notice({ text, tone = 'danger' }: { text: string; tone?: 'danger' | 'muted' }) {
  return (
    <Text style={[type.body, { color: tone === 'danger' ? c.danger : c.faint, marginTop: s.gap }]}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.ink },
  scroll: { padding: s.gutter, paddingBottom: s.gutter * 2 },
  footer: {
    padding: s.gutter,
    paddingTop: s.gap,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.edge,
    backgroundColor: c.ink,
  },
  card: {
    backgroundColor: c.panel,
    borderRadius: s.radius,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.edge,
    padding: s.gutter - 4,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    borderRadius: s.radius,
  },
  buttonAccent: { backgroundColor: c.accent },
  buttonQuiet: {
    backgroundColor: c.raised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.edge,
  },
  buttonPressed: { opacity: 0.82 },
  buttonOff: { backgroundColor: c.raised },
  buttonLabel: { fontSize: 16, fontWeight: '600' },
});
