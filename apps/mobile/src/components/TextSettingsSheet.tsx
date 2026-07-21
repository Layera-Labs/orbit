/**
 * TextSettingsSheet — one bottom sheet for all caption styling, organised into
 * tabs (Text · Font · Size · Color · Stroke). Align + Bold are always-visible
 * header toggles. Each tab's body is a reusable component: the caption input,
 * `FontPickerBody`, the size sliders, `ColorPickerBody`, and `ShadowStrokeBody`.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { font, mono, vela } from '../constants';
import type { TextAlign } from '../model/types';
import { useEditor } from '../store/editorStore';
import { VIcon, type VIconName } from './VIcon';
import { VSlider } from './VSlider';
import { FontPickerBody } from './FontPickerSheet';
import { ColorPickerBody } from './ColorSheet';
import { ShadowStrokeBody } from './ShadowSheet';

const ALIGN_ORDER: TextAlign[] = ['left', 'center', 'right'];

type Tab = 'text' | 'font' | 'size' | 'color' | 'stroke';
const TABS: { key: Tab; label: string }[] = [
  { key: 'text', label: 'Text' },
  { key: 'font', label: 'Font' },
  { key: 'size', label: 'Size' },
  { key: 'color', label: 'Color' },
  { key: 'stroke', label: 'Stroke' },
];

/** Align header button whose glyph reflects the current alignment and pops on change. */
function AlignIcon({ align }: { align: TextAlign }) {
  const name: VIconName = align === 'left' ? 'alignLeft' : align === 'right' ? 'alignRight' : 'alignCenter';
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    pop.setValue(0.7);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, damping: 11, stiffness: 320, mass: 0.6 }).start();
  }, [align, pop]);
  return (
    <Animated.View style={{ transform: [{ scale: pop }] }}>
      <VIcon name={name} size={22} color={vela.textLight} />
    </Animated.View>
  );
}

export function TextSettingsSheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const selected = useEditor((s) => s.selected);
  const editSelectedText = useEditor((s) => s.editSelectedText);
  const updateOverlay = useEditor((s) => s.updateSelectedOverlay);
  const ov = useEditor((s) => s.project?.overlays.find((o) => o.id === selected?.clipId));
  const projW = useEditor((s) => s.project?.width ?? 1080);

  const [tab, setTab] = useState<Tab>('text');
  const [text, setText] = useState(ov?.text ?? '');
  const inputRef = useRef<TextInput>(null);
  const close = () => setPanel(null);
  const onChangeText = (t: string) => {
    setText(t);
    editSelectedText(t);
  };

  const color = ov?.color ?? '#ffffff';
  const fontSize = ov?.fontSize ?? Math.round(projW * 0.07);
  const align = ov?.align ?? 'center';
  const bold = ov?.bold ?? false;
  const letterSpacing = ov?.letterSpacing ?? 0;
  const lineHeight = ov?.lineHeight ?? 1.25;
  const cycleAlign = () => updateOverlay({ align: ALIGN_ORDER[(ALIGN_ORDER.indexOf(align) + 1) % 3] });

  const bodyH = tab === 'text' ? 150 : tab === 'size' ? 210 : 380;

  return (
    <Modal transparent visible animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            {/* Header: title + align + bold + done */}
            <View style={styles.header}>
              <Text style={styles.title}>Text</Text>
              <View style={styles.headerActions}>
                <Pressable onPress={cycleAlign} hitSlop={8}><AlignIcon align={align} /></Pressable>
                <Pressable onPress={() => updateOverlay({ bold: !bold })} hitSlop={8}>
                  <VIcon name="style" size={22} color={bold ? vela.accent : vela.textLight} />
                </Pressable>
                <View style={styles.headDivider} />
                <Pressable onPress={close} hitSlop={8}><VIcon name="check" size={24} color="#fff" /></Pressable>
              </View>
            </View>

            {/* Tab bar */}
            <View style={styles.tabs}>
              {TABS.map((t) => (
                <Pressable key={t.key} onPress={() => setTab(t.key)} style={styles.tab}>
                  <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]}>{t.label}</Text>
                  {tab === t.key ? <View style={styles.tabUnderline} /> : null}
                </Pressable>
              ))}
            </View>

            {/* Body */}
            <View style={[styles.body, { height: bodyH }]}>
              {tab === 'text' ? (
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
                  <Pressable onPress={() => onChangeText('')} hitSlop={8} style={styles.trash}>
                    <VIcon name="trash" size={22} color={vela.muted} />
                  </Pressable>
                </View>
              ) : tab === 'font' ? (
                <FontPickerBody value={ov?.fontFamily} onChange={(family) => updateOverlay({ fontFamily: family })} />
              ) : tab === 'size' ? (
                <View>
                  <SizeRow label="Size" value={Math.round(fontSize)} fmt={String(Math.round(fontSize))}>
                    <VSlider value={fontSize} min={16} max={Math.round(projW * 0.3)} step={2} onChange={(v) => updateOverlay({ fontSize: Math.round(v) })} />
                  </SizeRow>
                  <SizeRow label="Spacing" value={letterSpacing} fmt={String(Math.round(letterSpacing))}>
                    <VSlider value={letterSpacing} min={0} max={20} step={1} onChange={(v) => updateOverlay({ letterSpacing: Math.round(v) })} />
                  </SizeRow>
                  <SizeRow label="Line" value={lineHeight} fmt={lineHeight.toFixed(2)}>
                    <VSlider value={lineHeight} min={1} max={2} step={0.05} onChange={(v) => updateOverlay({ lineHeight: Math.round(v * 100) / 100 })} />
                  </SizeRow>
                </View>
              ) : tab === 'color' ? (
                <ColorPickerBody value={color} onChange={(hex) => updateOverlay({ color: hex })} />
              ) : (
                <ShadowStrokeBody shadow={ov?.shadow} stroke={ov?.stroke} onChange={updateOverlay} />
              )}
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function SizeRow({ label, fmt, children }: { label: string; value: number; fmt: string; children: React.ReactNode }) {
  return (
    <View style={styles.sizeRow}>
      <Text style={styles.sizeLabel}>{label}</Text>
      <View style={{ flex: 1 }}>{children}</View>
      <Text style={styles.sizeVal}>{fmt}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
  sheet: { backgroundColor: vela.sheet, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 28, borderTopLeftRadius: 26, borderTopRightRadius: 26 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#fff', fontFamily: font.bold, fontSize: 17 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  headDivider: { width: 1, height: 20, backgroundColor: vela.divider },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 14, borderBottomWidth: 1, borderBottomColor: vela.card2 },
  tab: { paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center' },
  tabText: { color: vela.muted, fontFamily: font.semibold, fontSize: 14.5 },
  tabTextOn: { color: '#fff' },
  tabUnderline: { position: 'absolute', bottom: -1, left: 8, right: 8, height: 2, borderRadius: 1, backgroundColor: vela.accent },
  body: { paddingTop: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  input: { flex: 1, color: '#fff', fontSize: 18, fontFamily: font.medium, minHeight: 120, textAlignVertical: 'top' },
  trash: { paddingTop: 4 },
  sizeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 52 },
  sizeLabel: { color: '#fff', fontSize: 14, fontFamily: font.medium, minWidth: 62 },
  sizeVal: { color: '#fff', fontFamily: mono.regular, fontSize: 14, minWidth: 40, textAlign: 'right' },
});
