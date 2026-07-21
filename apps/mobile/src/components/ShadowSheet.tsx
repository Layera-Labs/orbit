/**
 * ShadowStrokeBody — text drop-shadow + outline-stroke controls, rendered as the
 * "Stroke" tab of the Text Settings sheet. Both write onto the selected text
 * overlay via `onChange` (a Partial<TextOverlay> patch); toggling a section off
 * clears its field. Colours reuse `ColorSheet` (a nested modal).
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { font, mono, vela } from '../constants';
import type { TextOverlay, TextShadow, TextStroke } from '../model/types';
import { VSlider } from './VSlider';
import { ColorSheet } from './ColorSheet';

const DEFAULT_SHADOW: TextShadow = { color: '#000000', blur: 4, dx: 0, dy: 2, opacity: 0.6 };
const DEFAULT_STROKE: TextStroke = { color: '#000000', width: 4 };

export function ShadowStrokeBody({
  shadow,
  stroke,
  onChange,
}: {
  shadow?: TextShadow;
  stroke?: TextStroke;
  onChange: (patch: Partial<TextOverlay>) => void;
}) {
  const [picker, setPicker] = useState<null | 'shadow' | 'stroke'>(null);

  const setShadow = (patch: Partial<TextShadow>) => onChange({ shadow: { ...(shadow ?? DEFAULT_SHADOW), ...patch } });
  const setStroke = (patch: Partial<TextStroke>) => onChange({ stroke: { ...(stroke ?? DEFAULT_STROKE), ...patch } });

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
      {/* Shadow */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Shadow</Text>
        <Switch
          value={!!shadow}
          onValueChange={(on) => onChange({ shadow: on ? DEFAULT_SHADOW : undefined })}
          trackColor={{ true: vela.accent, false: vela.toggleOff }}
          thumbColor="#fff"
        />
      </View>
      {shadow ? (
        <>
          <Row label="Color">
            <Pressable onPress={() => setPicker('shadow')} style={[styles.swatch, { backgroundColor: shadow.color }]} />
          </Row>
          <Slider label="Blur" value={shadow.blur ?? 4} min={0} max={24} step={1} onChange={(v) => setShadow({ blur: Math.round(v) })} />
          <Slider label="Offset X" value={shadow.dx ?? 0} min={-16} max={16} step={1} onChange={(v) => setShadow({ dx: Math.round(v) })} />
          <Slider label="Offset Y" value={shadow.dy ?? 2} min={-16} max={16} step={1} onChange={(v) => setShadow({ dy: Math.round(v) })} />
          <Slider label="Opacity" value={shadow.opacity ?? 0.6} min={0} max={1} step={0.05} onChange={(v) => setShadow({ opacity: Math.round(v * 100) / 100 })} fmt={(v) => v.toFixed(2)} />
        </>
      ) : null}

      {/* Stroke */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Stroke</Text>
        <Switch
          value={!!stroke}
          onValueChange={(on) => onChange({ stroke: on ? DEFAULT_STROKE : undefined })}
          trackColor={{ true: vela.accent, false: vela.toggleOff }}
          thumbColor="#fff"
        />
      </View>
      {stroke ? (
        <>
          <Row label="Color">
            <Pressable onPress={() => setPicker('stroke')} style={[styles.swatch, { backgroundColor: stroke.color }]} />
          </Row>
          <Slider label="Width" value={stroke.width} min={0} max={16} step={1} onChange={(v) => setStroke({ width: Math.round(v) })} />
        </>
      ) : null}

      {picker === 'shadow' ? (
        <ColorSheet value={shadow?.color ?? DEFAULT_SHADOW.color} onChange={(hex) => setShadow({ color: hex })} onClose={() => setPicker(null)} />
      ) : null}
      {picker === 'stroke' ? (
        <ColorSheet value={stroke?.color ?? DEFAULT_STROKE.color} onChange={(hex) => setStroke({ color: hex })} onClose={() => setPicker(null)} />
      ) : null}
    </ScrollView>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={{ flex: 1 }} />
      {children}
    </View>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  fmt,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={{ flex: 1 }}>
        <VSlider value={value} min={min} max={max} step={step} onChange={onChange} />
      </View>
      <Text style={styles.rowVal}>{fmt ? fmt(value) : Math.round(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  sectionTitle: { color: vela.textLight2, fontFamily: font.semibold, fontSize: 13.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 44 },
  rowLabel: { color: '#fff', fontSize: 14, fontFamily: font.medium, minWidth: 64 },
  rowVal: { color: '#fff', fontFamily: mono.regular, fontSize: 14, minWidth: 42, textAlign: 'right' },
  swatch: { width: 30, height: 30, borderRadius: 8, borderWidth: 2, borderColor: '#fff' },
});
