/**
 * ColorSheet — a bottom-sheet colour picker (reanimated-color-picker), Vela
 * styled. Commits on finger-lift (onCompleteJS) to avoid flooding the store.
 * Reusable for any colour value; currently drives text-overlay colour.
 */
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import RNColorPicker, { HueSlider, Panel1, Preview, Swatches } from 'reanimated-color-picker';
import { font, vela } from './../constants';
import { VIcon } from './VIcon';

const SWATCHES = ['#ffffff', '#000000', '#6d4aff', '#2f7bff', '#f2c14e', '#ff5a5f', '#15b8a6', '#c04af0', '#ff8a3d', '#37b6f0'];

/** The picker itself — reused inline as the "Color" tab of Text Settings. */
export function ColorPickerBody({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <RNColorPicker value={value || '#ffffff'} onCompleteJS={({ hex }) => onChange(hex)} style={{ gap: 16 }}>
      <Preview hideInitialColor style={styles.preview} />
      <Panel1 style={styles.panel} />
      <HueSlider style={styles.hue} />
      <Swatches colors={SWATCHES} style={styles.swatches} swatchStyle={styles.swatch} />
    </RNColorPicker>
  );
}

export function ColorSheet({ value, onChange, onClose }: { value: string; onChange: (hex: string) => void; onClose: () => void }) {
  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>Color</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <VIcon name="check" size={24} color="#fff" />
            </Pressable>
          </View>
          <ColorPickerBody value={value} onChange={onChange} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
  sheet: { backgroundColor: vela.sheet, padding: 18, paddingBottom: 34, borderTopLeftRadius: 26, borderTopRightRadius: 26, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#fff', fontFamily: font.bold, fontSize: 17 },
  preview: { height: 40, borderRadius: 10 },
  panel: { height: 200, borderRadius: 14 },
  hue: { borderRadius: 10 },
  swatches: { marginTop: 4 },
  swatch: { borderRadius: 8, width: 30, height: 30 },
});
