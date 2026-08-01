/** Palette-first colour selection with an optional advanced custom picker. */
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import RNColorPicker, { HueSlider, Panel1 } from 'reanimated-color-picker';
import Animated from 'react-native-reanimated';
import { font, mono, vela } from '../constants';
import { addCustomColor, loadCustomColors } from '../storage/colorPrefs';
import { VIcon } from './VIcon';

const PALETTE = [
  '#ffffff', '#111217', '#5b4bff', '#8b5cf6', '#3478f6', '#34aadc',
  '#14b8a6', '#35c759', '#f6c344', '#ff9f0a', '#ff5b57', '#ff375f',
  '#d946ef', '#8e8e93', '#6b4f3a',
];

function normalizeHex(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : '#ffffff';
}

/** Reused inline by Text Settings and in stand-alone colour sheets. */
export function ColorPickerBody({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState(() => normalizeHex(value));
  const [customColors, setCustomColors] = useState(() => loadCustomColors());
  const selected = normalizeHex(value);

  useEffect(() => setDraft(selected), [selected]);

  function pick(color: string) {
    setDraft(color);
    onChange(color);
  }

  function saveCustom() {
    const color = normalizeHex(draft);
    setCustomColors(addCustomColor(color));
    onChange(color);
    setCustomOpen(false);
  }

  const colors = [...customColors, ...PALETTE.filter((color) => !customColors.includes(color))];

  return (
    <Animated.View style={styles.body}>
      <View style={styles.selectedRow}>
        <View style={[styles.selectedColor, { backgroundColor: selected }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.selectedLabel}>Selected color</Text>
          <Text style={styles.selectedHex}>{selected.toUpperCase()}</Text>
        </View>
        {customOpen ? (
          <Pressable accessibilityRole='button' onPress={() => setCustomOpen(false)} hitSlop={8}>
            <Text style={styles.cancelCustom}>Palette</Text>
          </Pressable>
        ) : null}
      </View>

      {!customOpen ? <Animated.View style={styles.paletteGrid}>
        <Pressable accessibilityRole='button' accessibilityLabel='Create custom color' style={styles.swatchWrap} onPress={() => setCustomOpen(true)}>
          <LinearGradient colors={['#ff375f', '#ffcc00', '#30d158', '#32ade6', '#5b4bff', '#bf5af2']} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={styles.customSwatch}>
            <View style={styles.customPlus}>
              <VIcon name='plus' size={17} color='#fff' strokeWidth={2.8} />
            </View>
          </LinearGradient>
          <Text style={styles.customLabel}>Custom</Text>
        </Pressable>
        {colors.map((color, index) => {
          const active = selected === color.toLowerCase();
          return (
            <Animated.View key={color}>
              <Pressable accessibilityRole='button' accessibilityLabel={`Use ${color}`} accessibilityState={{ selected: active }} style={[styles.swatch, { backgroundColor: color }, color === '#ffffff' && styles.whiteSwatch, active && styles.swatchOn]} onPress={() => pick(color)}>
                {active ? <VIcon name='check' size={18} color={color === '#ffffff' ? vela.accent : '#fff'} strokeWidth={3} /> : null}
              </Pressable>
            </Animated.View>
          );
        })}
      </Animated.View> : null}

      {customOpen ? (
        <Animated.View style={styles.customPicker}>
          <RNColorPicker value={draft} onCompleteJS={({ hex }) => setDraft(normalizeHex(hex))} style={styles.pickerInner}>
            <Panel1 style={styles.panel} />
            <HueSlider style={styles.hue} />
          </RNColorPicker>
          <Pressable accessibilityRole='button' style={styles.addColorButton} onPress={saveCustom}>
            <View style={[styles.addColorDot, { backgroundColor: draft }]} />
            <Text style={styles.addColorText}>Add custom color</Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

export function ColorSheet({ value, onChange, onClose }: { value: string; onChange: (hex: string) => void; onClose: () => void }) {
  return (
    <Modal transparent visible animationType='slide' onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>Color</Text>
            <Pressable accessibilityRole='button' accessibilityLabel='Done' onPress={onClose} hitSlop={10} style={styles.done}>
              <VIcon name='check' size={21} color={vela.accent} strokeWidth={2.7} />
            </Pressable>
          </View>
          <ColorPickerBody value={value} onChange={onChange} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0006', justifyContent: 'flex-end' },
  sheet: { maxHeight: '86%', backgroundColor: vela.lightCard, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 34, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderCurve: 'continuous', gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: vela.ink, fontFamily: font.extrabold, fontSize: 20 },
  done: { width: 36, height: 36, borderRadius: 12, backgroundColor: vela.accentSoft, alignItems: 'center', justifyContent: 'center' },
  body: { gap: 14 },
  selectedRow: { height: 52, borderRadius: 14, backgroundColor: vela.lightSurface, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
  selectedColor: { width: 30, height: 30, borderRadius: 9, borderWidth: 1, borderColor: vela.lightBorder },
  selectedLabel: { color: vela.lightMuted, fontFamily: font.medium, fontSize: 11 },
  selectedHex: { color: vela.ink2, fontFamily: mono.bold, fontSize: 13, marginTop: 1 },
  cancelCustom: { color: vela.accent, fontFamily: font.bold, fontSize: 12.5 },
  paletteGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' },
  swatchWrap: { width: 46, alignItems: 'center', gap: 3 },
  customSwatch: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  customPlus: { width: 25, height: 25, borderRadius: 13, backgroundColor: '#0004', alignItems: 'center', justifyContent: 'center' },
  customLabel: { color: vela.lightMuted, fontFamily: font.semibold, fontSize: 8.5 },
  swatch: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: 'transparent' },
  swatchOn: { borderColor: vela.accent, transform: [{ scale: 1.06 }] },
  whiteSwatch: { borderColor: vela.lightBorder },
  customPicker: { gap: 12 },
  pickerInner: { gap: 12 },
  panel: { height: 148, borderRadius: 16 },
  hue: { height: 28, borderRadius: 14 },
  addColorButton: { height: 46, borderRadius: 14, backgroundColor: vela.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  addColorDot: { width: 20, height: 20, borderRadius: 7, borderWidth: 2, borderColor: '#fff' },
  addColorText: { color: '#fff', fontFamily: font.bold, fontSize: 14 },
});
