import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { font, vela } from "../constants";
import { OrbitMark } from "./OrbitMark";
import { VIcon, type VIconName } from "./VIcon";

interface HeaderAction {
  icon: VIconName;
  label: string;
  onPress: () => void;
  prominent?: boolean;
}

export function AppHeader({
  title,
  brand = false,
  dark = false,
  leading,
  actions = [],
  trailing,
}: {
  title?: string;
  brand?: boolean;
  dark?: boolean;
  leading?: HeaderAction;
  actions?: HeaderAction[];
  /** Custom trailing content (e.g. a credit pill) rendered after `actions`,
   *  for the one-off cases a plain icon button can't express. */
  trailing?: ReactNode;
}) {
  const ink = dark ? vela.textLight : vela.ink;
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.left}>
          {leading ? <HeaderButton action={leading} dark={dark} /> : null}
          {brand ? (
            <View style={styles.brand}>
              <OrbitMark size={28} ringOpacity={0.8} />
              <Text style={[styles.brandText, { color: ink }]}>orbit</Text>
            </View>
          ) : (
            <Text style={[styles.title, { color: ink }]}>{title}</Text>
          )}
        </View>
        <View style={styles.actions}>
          {actions.map((action) => (
            <HeaderButton key={action.label} action={action} dark={dark} />
          ))}
          {trailing}
        </View>
      </View>
    </View>
  );
}

function HeaderButton({
  action,
  dark,
}: {
  action: HeaderAction;
  dark: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      hitSlop={8}
      onPress={action.onPress}
      style={({ pressed }) => [
        styles.action,
        dark ? styles.actionDark : styles.actionLight,
        action.prominent && styles.actionProminent,
        pressed && { opacity: 0.72 },
      ]}
    >
      <VIcon
        name={action.icon}
        size={18}
        color={action.prominent ? "#fff" : dark ? vela.textLight : vela.ink2}
        strokeWidth={2}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 90,
    paddingTop: 48,
    paddingHorizontal: 20,
    paddingBottom: 6,
    zIndex: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 36,
  },
  left: { flexDirection: "row", alignItems: "center", gap: 9, flex: 1 },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandText: { fontFamily: font.extrabold, fontSize: 21, letterSpacing: -0.55 },
  title: { fontFamily: font.extrabold, fontSize: 20, letterSpacing: -0.3 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  action: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  // Contained circles so header actions read as buttons, not floating glyphs.
  actionLight: { backgroundColor: vela.lightCard, borderColor: vela.lightBorder },
  actionDark: { backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.14)" },
  actionProminent: { backgroundColor: vela.accent, borderColor: "transparent" },
});
