import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { font, vela } from "../constants";
import type { ClipMosaic, EffectRegionShape } from "../model/types";
import { effectsTarget, useEditor } from "../store/editorStore";
import { BottomSheet } from "./BottomSheet";
import { VIcon } from "./VIcon";
import { VSlider } from "./VSlider";

const PATTERNS = [
  { id: "mosaic", label: "Mosaic", icon: "grid" },
  { id: "triangle", label: "Triangle", icon: "keyframe" },
  { id: "hexagon", label: "Hexagon", icon: "motion" },
  { id: "blur", label: "Blur", icon: "opacity" },
] as const;

const SHAPES: { id: EffectRegionShape; radius: number }[] = [
  { id: "rectangle", radius: 4 },
  { id: "circle", radius: 18 },
  { id: "rounded", radius: 10 },
  { id: "diamond", radius: 5 },
];

const DEFAULT_MOSAIC: ClipMosaic = {
  pattern: "mosaic",
  shape: "rectangle",
  cx: 0.5,
  cy: 0.5,
  rx: 0.25,
  ry: 0.2,
  amount: 0.35,
  opacity: 1,
};

export function MosaicSheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const applyClipMosaic = useEditor((s) => s.applyClipMosaic);
  const target = effectsTarget();
  const [effect, setEffect] = useState<ClipMosaic>(
    target?.clip.mosaic ?? DEFAULT_MOSAIC,
  );
  // The sheet previews the default region live, which means it MUTATES the clip
  // on open. So backing out has to restore what the clip had before — otherwise
  // just looking at this sheet permanently applies a mosaic.
  const original = useRef(target?.clip.mosaic);
  const committed = useRef(false);
  const commit = () => {
    committed.current = true;
    setPanel(null);
  };
  const cancel = () => {
    if (!committed.current) applyClipMosaic(original.current);
    setPanel(null);
  };
  const patch = (value: Partial<ClipMosaic>) => {
    const next = { ...effect, ...value };
    setEffect(next);
    applyClipMosaic(next);
  };
  useEffect(() => {
    if (target && !target.clip.mosaic) applyClipMosaic(effect);
    // Apply the default region once when a fresh Mosaic sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.clip.id]);

  return (
    <BottomSheet onClose={cancel} dim="#0005" style={styles.sheet}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Mosaic</Text>
          <Text style={styles.subtitle}>
            Obscure a movable region of the selected visual
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Apply mosaic"
          onPress={commit}
          style={styles.done}
        >
          <VIcon name="check" size={20} color="#fff" />
        </Pressable>
      </View>

      {!target ? (
        <View style={styles.noTarget}>
          <VIcon name="video" size={23} color={vela.lightMuted} />
          <Text style={styles.noTargetText}>
            Select an image or video clip before applying Mosaic.
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.patternRow}
          >
            {PATTERNS.map((item) => {
              const selected = item.id === effect.pattern;
              return (
                <Pressable
                  accessibilityState={{ selected }}
                  key={item.id}
                  onPress={() => patch({ pattern: item.id })}
                  style={styles.pattern}
                >
                  <View
                    style={[
                      styles.patternPreview,
                      selected && styles.patternPreviewOn,
                    ]}
                  >
                    <VIcon
                      name={item.icon}
                      size={27}
                      color={selected ? vela.accent : vela.ink3}
                    />
                  </View>
                  <Text
                    style={[
                      styles.patternLabel,
                      selected && styles.patternLabelOn,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Mask shape</Text>
            <View style={styles.shapeRow}>
              {SHAPES.map((item) => {
                const selected = item.id === effect.shape;
                return (
                  <Pressable
                    accessibilityLabel={`${item.id} mosaic shape`}
                    accessibilityState={{ selected }}
                    key={item.id}
                    onPress={() => patch({ shape: item.id })}
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
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Control
            label="Effect strength"
            value={effect.amount}
            onChange={(amount) => patch({ amount })}
          />
          <Control
            label="Mask size"
            value={effect.rx * 2}
            min={0.2}
            max={0.9}
            onChange={(value) => patch({ rx: value / 2, ry: value / 2 })}
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
              applyClipMosaic(undefined);
              commit();
            }}
            style={styles.clear}
          >
            <Text style={styles.clearText}>Remove mosaic</Text>
          </Pressable>
        </ScrollView>
      )}
    </BottomSheet>
  );
}

function Control({
  label,
  value,
  min = 0,
  max = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.control}>
      <View style={styles.controlHead}>
        <Text style={styles.sectionTitle}>{label}</Text>
        <Text style={styles.value}>{Math.round(value * 100)}</Text>
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
    maxHeight: "78%",
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
  content: { gap: 16, paddingBottom: 4 },
  patternRow: { gap: 10, paddingRight: 18 },
  pattern: { width: 76, alignItems: "center", gap: 6 },
  patternPreview: {
    width: 76,
    height: 62,
    borderRadius: 16,
    backgroundColor: vela.lightSurface,
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  patternPreviewOn: {
    borderColor: vela.accent,
    backgroundColor: vela.accentSoft,
  },
  patternLabel: { color: vela.ink3, fontFamily: font.semibold, fontSize: 11.5 },
  patternLabelOn: { color: vela.accent },
  section: { gap: 9 },
  sectionTitle: { color: vela.ink2, fontFamily: font.bold, fontSize: 13.5 },
  shapeRow: { flexDirection: "row", gap: 9 },
  shapeTile: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    backgroundColor: vela.lightSurface,
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  shapeTileOn: { borderColor: vela.accent, backgroundColor: vela.accentSoft },
  shape: { width: 24, height: 24, backgroundColor: vela.lightMuted },
  shapeOn: { backgroundColor: vela.accent },
  diamond: { transform: [{ rotate: "45deg" }], width: 20, height: 20 },
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
