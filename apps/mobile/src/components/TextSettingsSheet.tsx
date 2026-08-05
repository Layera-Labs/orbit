/**
 * TextSettingsSheet — one bottom sheet for all caption styling, organised into
 * tabs (Text · Font · Size · Color · Stroke). Align + Bold are always-visible
 * header toggles. Each tab's body is a reusable component: the caption input,
 * `FontPickerBody`, the size sliders, `ColorPickerBody`, and `ShadowStrokeBody`.
 */
import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { font, mono, vela } from "../constants";
import type { TextAlign } from "../model/types";
import { useEditor } from "../store/editorStore";
import { VIcon, type VIconName } from "./VIcon";
import { VSlider } from "./VSlider";
import { FontPickerBody } from "./FontPickerSheet";
import { ColorPickerBody } from "./ColorSheet";
import { ShadowStrokeBody } from "./ShadowSheet";

const ALIGN_ORDER: TextAlign[] = ["left", "center", "right"];

export type TextSettingsTab = "text" | "font" | "size" | "color" | "stroke";
type Tab = TextSettingsTab;
const TABS: { key: Tab; label: string }[] = [
  { key: "text", label: "Text" },
  { key: "font", label: "Font" },
  { key: "size", label: "Size" },
  { key: "color", label: "Color" },
  { key: "stroke", label: "Stroke" },
];

/** Align header button whose glyph reflects the current alignment and pops on change. */
function AlignIcon({ align }: { align: TextAlign }) {
  const name: VIconName =
    align === "left"
      ? "alignLeft"
      : align === "right"
        ? "alignRight"
        : "alignCenter";
  const pop = useSharedValue(1);
  useEffect(() => {
    pop.value = 0.76;
    pop.value = withSpring(1, { damping: 12, stiffness: 320, mass: 0.55 });
  }, [align, pop]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
  }));
  return (
    <Animated.View style={animatedStyle}>
      <VIcon name={name} size={22} color={vela.ink2} />
    </Animated.View>
  );
}

export function TextSettingsSheet({
  initialTab = "text",
}: {
  initialTab?: TextSettingsTab;
}) {
  const setPanel = useEditor((s) => s.setPanel);
  const selected = useEditor((s) => s.selected);
  const editSelectedText = useEditor((s) => s.editSelectedText);
  const updateOverlay = useEditor((s) => s.updateSelectedOverlay);
  const ov = useEditor((s) =>
    s.project?.overlays.find((o) => o.id === selected?.clipId),
  );
  const projW = useEditor((s) => s.project?.width ?? 1080);

  const [tab, setTab] = useState<Tab>(initialTab);
  const [text, setText] = useState(ov?.text ?? "");
  const inputRef = useRef<TextInput>(null);
  const close = () => setPanel(null);
  const onChangeText = (t: string) => {
    setText(t);
    editSelectedText(t);
  };

  const color = ov?.color ?? "#ffffff";
  const fontSize = ov?.fontSize ?? Math.round(projW * 0.07);
  const align = ov?.align ?? "center";
  const bold = ov?.bold ?? false;
  const letterSpacing = ov?.letterSpacing ?? 0;
  const lineHeight = ov?.lineHeight ?? 1.25;
  // Clamped to 1: a caption authored on a wider project and opened here would
  // otherwise put the slider past its own track.
  const wrapFrac = ov?.maxWidth ? Math.min(1, ov.maxWidth / projW) : 0;
  const cycleAlign = () =>
    updateOverlay({ align: ALIGN_ORDER[(ALIGN_ORDER.indexOf(align) + 1) % 3] });

  /*
   * The other tabs hold a fixed set of controls and get a fixed height, so the
   * sheet does not resize as you move between them. The TEXT tab does not: its
   * field grows with what you type, and reserving three lines for a one-line
   * caption left a slab of empty sheet between the field and the keyboard.
   * `undefined` lets it size to its content, and the input's own min/max keep
   * it between one line and a scrollable five.
   */
  const bodyH =
    tab === "text"
      ? undefined
      : tab === "size"
        ? // Three 52pt rows sat in 210; Wrap is a fourth, so +52. Stated rather
          // than measured because the tab heights are fixed on purpose, and
          // rounding it up would open an empty band under the last slider.
          262
        : tab === "color"
          ? 324
          : 380;

  return (
    <Modal transparent visible animationType="slide" onRequestClose={close}>
      {/*
        * The `KeyboardAvoidingView` IS the bottom-anchored container, and that
        * is the whole fix. It used to sit INSIDE the sheet with no flex, while
        * the sheet was anchored by a `flex-end` backdrop above it — so
        * `behavior="padding"` had nothing to push: the padding grew inside a
        * box whose bottom edge was already pinned to the bottom of the screen,
        * behind the keyboard. The text field was focused and taking input, and
        * you could not see it.
        *
        * Every other sheet in this app already had it this way round
        * (`InputSheet`, `TtsSheet`, `AuthSheet`, `AiGenerateModal` all give the
        * KAV `flex: 1`); this one was the odd one out.
        */}
      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
        style={styles.backdrop}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <Pressable style={styles.sheet} onPress={() => {}}>
            {/* Header: title + align + bold + done */}
            <View style={styles.header}>
              <Text style={styles.title}>Text</Text>
              <View style={styles.headerActions}>
                <Pressable onPress={cycleAlign} hitSlop={8}>
                  <AlignIcon align={align} />
                </Pressable>
                <Pressable
                  onPress={() => updateOverlay({ bold: !bold })}
                  hitSlop={8}
                >
                  <VIcon
                    name="style"
                    size={22}
                    color={bold ? vela.accent : vela.ink3}
                  />
                </Pressable>
                <View style={styles.headDivider} />
                <Pressable onPress={close} hitSlop={8} style={styles.done}>
                  <VIcon
                    name="check"
                    size={21}
                    color={vela.accent}
                    strokeWidth={2.7}
                  />
                </Pressable>
              </View>
            </View>

            {/* Tab bar */}
            <View style={styles.tabs}>
              {TABS.map((t) => (
                <Pressable
                  key={t.key}
                  onPress={() => setTab(t.key)}
                  style={styles.tab}
                >
                  <Text
                    style={[styles.tabText, tab === t.key && styles.tabTextOn]}
                  >
                    {t.label}
                  </Text>
                  {tab === t.key ? <View style={styles.tabUnderline} /> : null}
                </Pressable>
              ))}
            </View>

            {/* Body */}
            <Animated.View
              key={tab}
             
             
              style={[styles.body, { height: bodyH }]}
            >
              {tab === "text" ? (
                <View style={styles.inputRow}>
                  <TextInput
                    ref={inputRef}
                    value={text}
                    onChangeText={onChangeText}
                    autoFocus
                    multiline
                    placeholder="Input title"
                    placeholderTextColor={vela.muted2}
                    style={styles.input}
                  />
                  <Pressable
                    onPress={() => onChangeText("")}
                    hitSlop={8}
                    style={styles.trash}
                  >
                    <VIcon name="trash" size={18} color="#fff" />
                  </Pressable>
                </View>
              ) : tab === "font" ? (
                <FontPickerBody
                  value={ov?.fontFamily}
                  onChange={(family) => updateOverlay({ fontFamily: family })}
                />
              ) : tab === "size" ? (
                <View>
                  <SizeRow
                    label="Size"
                    value={Math.round(fontSize)}
                    fmt={String(Math.round(fontSize))}
                  >
                    <VSlider
                      value={fontSize}
                      min={16}
                      max={Math.round(projW * 0.3)}
                      step={2}
                      onChange={(v) =>
                        updateOverlay({ fontSize: Math.round(v) })
                      }
                    />
                  </SizeRow>
                  <SizeRow
                    label="Spacing"
                    value={letterSpacing}
                    fmt={String(Math.round(letterSpacing))}
                  >
                    <VSlider
                      value={letterSpacing}
                      min={0}
                      max={20}
                      step={1}
                      onChange={(v) =>
                        updateOverlay({ letterSpacing: Math.round(v) })
                      }
                    />
                  </SizeRow>
                  <SizeRow
                    label="Line"
                    value={lineHeight}
                    fmt={lineHeight.toFixed(2)}
                  >
                    <VSlider
                      value={lineHeight}
                      min={1}
                      max={2}
                      step={0.05}
                      onChange={(v) =>
                        updateOverlay({ lineHeight: Math.round(v * 100) / 100 })
                      }
                    />
                  </SizeRow>
                  {/*
                    * Where the caption breaks. Shown as a share of the frame
                    * because nobody reasons about a caption in pixels of a
                    * 1080-wide master, but STORED in output pixels — the same
                    * units as Size and Spacing above, and the units the export
                    * measures in, so the break lands in the same place there.
                    *
                    * The bottom of the track is Off, and Off clears the field
                    * rather than storing the frame's own width: with no width
                    * the caption breaks only where a new line was typed, which
                    * is what every caption written before this control did.
                    */}
                  <SizeRow
                    label="Wrap"
                    value={wrapFrac}
                    fmt={wrapFrac > 0 ? `${Math.round(wrapFrac * 100)}%` : "Off"}
                  >
                    <VSlider
                      value={wrapFrac}
                      min={0}
                      max={1}
                      step={0.05}
                      onChange={(v) =>
                        updateOverlay({
                          maxWidth:
                            v > 0 ? Math.round(v * projW) : undefined,
                        })
                      }
                    />
                  </SizeRow>
                </View>
              ) : tab === "color" ? (
                <ColorPickerBody
                  value={color}
                  onChange={(hex) => updateOverlay({ color: hex })}
                />
              ) : (
                <ShadowStrokeBody
                  shadow={ov?.shadow}
                  stroke={ov?.stroke}
                  onChange={updateOverlay}
                />
              )}
            </Animated.View>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SizeRow({
  label,
  fmt,
  children,
}: {
  label: string;
  value: number;
  fmt: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sizeRow}>
      <Text style={styles.sizeLabel}>{label}</Text>
      <View style={{ flex: 1 }}>{children}</View>
      <Text style={styles.sizeVal}>{fmt}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#0006", justifyContent: "flex-end" },
  sheet: {
    maxHeight: "88%",
    backgroundColor: vela.lightCard,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 28,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderCurve: "continuous",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { color: vela.ink, fontFamily: font.extrabold, fontSize: 20 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 18 },
  done: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: vela.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  headDivider: { width: 1, height: 20, backgroundColor: vela.lightBorder },
  tabs: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
    borderBottomWidth: 1,
    borderBottomColor: vela.lightBorder,
  },
  tab: { paddingVertical: 10, paddingHorizontal: 8, alignItems: "center" },
  tabText: {
    color: vela.lightMuted,
    fontFamily: font.semibold,
    fontSize: 13.5,
  },
  tabTextOn: { color: vela.accent, fontFamily: font.bold },
  tabUnderline: {
    position: "absolute",
    bottom: -1,
    left: 8,
    right: 8,
    height: 2,
    borderRadius: 1,
    backgroundColor: vela.accent,
  },
  body: { paddingTop: 12, paddingBottom: 4 },
  inputRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  input: {
    flex: 1,
    color: vela.ink,
    fontSize: 17,
    fontFamily: font.medium,
    // One line to start, five before it scrolls — enough to see a caption
    // whole without holding the sheet open over dead space.
    minHeight: 40,
    maxHeight: 132,
    textAlignVertical: "top",
  },
  trash: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: vela.ink2,
  },
  sizeRow: { flexDirection: "row", alignItems: "center", gap: 12, height: 52 },
  sizeLabel: {
    color: vela.ink2,
    fontSize: 14,
    fontFamily: font.semibold,
    minWidth: 62,
  },
  sizeVal: {
    color: vela.ink2,
    fontFamily: mono.regular,
    fontSize: 13,
    minWidth: 40,
    textAlign: "right",
  },
});
