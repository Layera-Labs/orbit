/**
 * Floating quick-action bar (CapCut-style) shown over the timeline whenever a
 * clip/overlay is selected: Edit · Motion · Keyframe · Curve · Lock · Duplicate
 * · Delete · Ripple Delete. Styled in Vela's dark surface.
 */
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { font, vela } from "../constants";
import { VIcon, type VIconName } from "./VIcon";
import { OVERLAY_TRACK, useEditor } from "../store/editorStore";

interface Action {
  key: string;
  icon: VIconName;
  label: string;
  /** Full label for screen readers when `label` is abbreviated to fit. */
  a11y?: string;
  onPress: () => void;
  disabled?: boolean;
}

export function SelectionActionBar() {
  const selected = useEditor((s) => s.selected);
  const rippleDelete = useEditor((s) => s.rippleDelete);
  const removeSelected = useEditor((s) => s.removeSelected);
  const rippleDeleteSelected = useEditor((s) => s.rippleDeleteSelected);
  const duplicateSelected = useEditor((s) => s.duplicateSelected);
  const setPanel = useEditor((s) => s.setPanel);
  if (!selected) return null;

  const isText = selected.trackId === OVERLAY_TRACK;
  const actions: Action[] = [
    {
      key: "delete",
      icon: rippleDelete ? "rippleDelete" : "trash",
      // "Ripple delete" cannot fit an equal slot at this size, and a clipped
      // label reads as broken — the distinct icon carries the difference.
      label: rippleDelete ? "Ripple" : "Delete",
      a11y: rippleDelete ? "Ripple delete" : "Delete",
      onPress: rippleDelete ? rippleDeleteSelected : removeSelected,
    },
    {
      key: "edit",
      icon: "pencil",
      label: "Edit",
      onPress: isText ? () => setPanel("textedit") : () => setPanel("filter"),
    },
    {
      key: "motion",
      icon: "motion",
      label: "Motion",
      onPress: () => setPanel("motion"),
    },
    {
      key: "keyframe",
      icon: "keyframe",
      label: "Keyframe",
      onPress: () => setPanel("keyframe"),
    },
    // Curve = playback-speed remap; it has no meaning for a text caption.
    {
      key: "curve",
      icon: "curve",
      label: "Curve",
      disabled: isText,
      onPress: isText
        ? () =>
            Alert.alert(
              "Not available",
              "Speed curves apply to video and audio, not text.",
            )
        : () => setPanel("curve"),
    },
    {
      key: "duplicate",
      icon: "duplicate",
      label: "Duplicate",
      onPress: duplicateSelected,
    },
  ];

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Animated.View
        entering={FadeInDown.duration(170)}
        exiting={FadeOutDown.duration(120)}
        style={styles.bar}
      >
        <View style={styles.content}>
          {actions.map((a) => (
            <Pressable
              key={a.key}
              accessibilityRole="button"
              accessibilityLabel={a.a11y ?? a.label}
              accessibilityState={{ disabled: !!a.disabled }}
              style={styles.item}
              onPress={a.onPress}
            >
              <VIcon
                name={a.icon}
                size={18}
                color={a.disabled ? "rgba(255,255,255,0.42)" : "#fff"}
                strokeWidth={1.7}
              />
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={[
                  styles.label,
                  a.disabled && { color: "rgba(255,255,255,0.42)" },
                ]}
              >
                {a.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: -22,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 30,
  },
  bar: {
    width: "92%",
    backgroundColor: vela.accent,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: vela.accentDim,
    boxShadow: "0 5px 13px rgba(31,22,112,0.38)",
  },
  content: {
    width: "100%",
    flexDirection: "row",
    paddingHorizontal: 2,
    paddingVertical: 6,
  },
  // Every action gets an identical slot — a wider one for Delete made the gaps
  // between labels visibly uneven across the row.
  item: {
    minWidth: 0,
    height: 42,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  label: {
    color: "#fff",
    fontSize: 9,
    fontFamily: font.medium,
    textAlign: "center",
  },
});
