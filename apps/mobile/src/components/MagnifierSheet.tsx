import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { font, vela } from "../constants";
import type { ClipMagnifier, EffectRegionShape } from "../model/types";
import { effectsTarget, useEditor } from "../store/editorStore";
import { BottomSheet } from "./BottomSheet";
import { VIcon } from "./VIcon";
import { VSlider } from "./VSlider";

const SHAPES: { id: EffectRegionShape; label: string; radius: number }[] = [
  { id: "circle", label: "Round", radius: 18 },
  { id: "rectangle", label: "Square", radius: 3 },
  { id: "rounded", label: "Soft", radius: 10 },
  { id: "diamond", label: "Diamond", radius: 4 },
];
const COLORS = [
  "#ffffff",
  "#111111",
  "#5b4dff",
  "#3b82f6",
  "#22b8a7",
  "#ff5c66",
  "#f5c451",
];
const DEFAULT_MAGNIFIER: ClipMagnifier = {
  shape: "circle",
  cx: 0.5,
  cy: 0.5,
  rx: 0.22,
  ry: 0.22,
  opacity: 1,
  zoom: 2,
  borderWidth: 0.012,
  borderColor: "#ffffff",
};

export function MagnifierSheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const applyClipMagnifier = useEditor((s) => s.applyClipMagnifier);
  const target = effectsTarget();
  const [effect, setEffect] = useState<ClipMagnifier>(
    target?.clip.magnifier ?? DEFAULT_MAGNIFIER,
  );
  // The sheet previews the default lens live, which means it MUTATES the clip
  // on open. So backing out has to restore what the clip had before — otherwise
  // just looking at this sheet permanently applies a magnifier.
  const original = useRef(target?.clip.magnifier);
  const committed = useRef(false);
  const commit = () => {
    committed.current = true;
    setPanel(null);
  };
  const cancel = () => {
    if (!committed.current) applyClipMagnifier(original.current);
    setPanel(null);
  };
  const patch = (value: Partial<ClipMagnifier>) => {
    const next = { ...effect, ...value };
    setEffect(next);
    applyClipMagnifier(next);
  };
  useEffect(() => {
    if (target && !target.clip.magnifier) applyClipMagnifier(effect);
    // Apply the default lens once when a fresh Magnifier sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.clip.id]);

  return (
    <BottomSheet onClose={cancel} dim="#0005" style={styles.sheet}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Magnifier</Text>
          <Text style={styles.subtitle}>
            Focus attention with a movable lens
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Apply magnifier"
          onPress={commit}
          style={styles.done}
        >
          <VIcon name="check" size={20} color="#fff" />
        </Pressable>
      </View>
      {!target ? (
        <View style={styles.noTarget}>
          <VIcon name="search" size={25} color={vela.lightMuted} />
          <Text style={styles.noTargetText}>
            Select an image or video clip before adding a magnifier.
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <Text style={styles.sectionTitle}>Lens shape</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.shapeRow}
          >
            {SHAPES.map((item) => {
              const selected = effect.shape === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => patch({ shape: item.id })}
                  style={styles.shapeItem}
                >
                  <View
                    style={[styles.shapeTile, selected && styles.shapeTileOn]}
                  >
                    <View
                      style={[
                        styles.shape,
                        { borderRadius: item.radius },
                        item.id === "diamond" && styles.diamond,
                        selected && styles.shapeOn,
                      ]}
                    />
                  </View>
                  <Text
                    style={[styles.shapeLabel, selected && styles.shapeLabelOn]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.sectionTitle}>Border color</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.colors}
          >
            {COLORS.map((color) => (
              <Pressable
                accessibilityLabel={`Use ${color} border`}
                key={color}
                onPress={() => patch({ borderColor: color })}
                style={[
                  styles.color,
                  { backgroundColor: color },
                  effect.borderColor === color && styles.colorOn,
                ]}
              />
            ))}
          </ScrollView>

          <Control
            label="Zoom"
            display={`${effect.zoom.toFixed(1)}×`}
            value={effect.zoom}
            min={1.1}
            max={4}
            onChange={(zoom) => patch({ zoom })}
          />
          <Control
            label="Lens size"
            value={effect.rx * 2}
            min={0.2}
            max={0.9}
            onChange={(value) => patch({ rx: value / 2, ry: value / 2 })}
          />
          <Control
            label="Border"
            value={effect.borderWidth}
            min={0}
            max={0.05}
            onChange={(borderWidth) => patch({ borderWidth })}
          />
          <Control
            label="Opacity"
            value={effect.opacity}
            onChange={(opacity) => patch({ opacity })}
          />
          <View style={styles.positionRow}>
            <View style={styles.positionControl}>
              <Control
                label="Horizontal"
                value={effect.cx}
                onChange={(cx) => patch({ cx })}
              />
            </View>
            <View style={styles.positionControl}>
              <Control
                label="Vertical"
                value={effect.cy}
                onChange={(cy) => patch({ cy })}
              />
            </View>
          </View>
          <Pressable
            onPress={() => {
              applyClipMagnifier(undefined);
              commit();
            }}
            style={styles.clear}
          >
            <Text style={styles.clearText}>Remove magnifier</Text>
          </Pressable>
        </ScrollView>
      )}
    </BottomSheet>
  );
}

function Control({
  label,
  display,
  value,
  min = 0,
  max = 1,
  onChange,
}: {
  label: string;
  display?: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.control}>
      <View style={styles.controlHead}>
        <Text style={styles.sectionTitle}>{label}</Text>
        <Text style={styles.value}>{display ?? Math.round(value * 100)}</Text>
      </View>
      <VSlider value={value} min={min} max={max} onChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 22,
    gap: 16,
    backgroundColor: vela.lightCard,
    maxHeight: "80%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerCopy: { flex: 1 },
  title: { color: vela.ink, fontFamily: font.extrabold, fontSize: 22 },
  subtitle: { color: vela.lightMuted, fontFamily: font.medium, fontSize: 12.5 },
  done: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: vela.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  noTarget: {
    minHeight: 150,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 24,
    backgroundColor: vela.lightSurface,
  },
  noTargetText: {
    maxWidth: 260,
    textAlign: "center",
    color: vela.ink3,
    fontFamily: font.medium,
    fontSize: 14,
  },
  content: { gap: 14, paddingBottom: 4 },
  sectionTitle: { color: vela.ink2, fontFamily: font.bold, fontSize: 13.5 },
  shapeRow: { gap: 10, paddingRight: 18 },
  shapeItem: { width: 72, alignItems: "center", gap: 6 },
  shapeTile: {
    width: 72,
    height: 58,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "transparent",
    backgroundColor: vela.lightSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  shapeTileOn: { borderColor: vela.accent, backgroundColor: vela.accentSoft },
  shape: {
    width: 26,
    height: 26,
    borderWidth: 3,
    borderColor: vela.lightMuted,
  },
  shapeOn: { borderColor: vela.accent },
  diamond: { transform: [{ rotate: "45deg" }], width: 22, height: 22 },
  shapeLabel: { color: vela.ink3, fontFamily: font.semibold, fontSize: 11.5 },
  shapeLabelOn: { color: vela.accent },
  colors: { gap: 10, paddingVertical: 2, paddingRight: 18 },
  color: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#d7d9e2",
  },
  colorOn: { borderWidth: 3, borderColor: vela.accent },
  control: {
    gap: 8,
    padding: 13,
    borderRadius: 15,
    backgroundColor: vela.lightSurface,
  },
  controlHead: { flexDirection: "row", justifyContent: "space-between" },
  value: {
    color: vela.accent,
    fontFamily: font.bold,
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
  positionRow: { flexDirection: "row", gap: 10 },
  positionControl: { flex: 1 },
  clear: {
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: vela.lightSurface,
  },
  clearText: { color: vela.ink2, fontFamily: font.bold, fontSize: 14 },
});
