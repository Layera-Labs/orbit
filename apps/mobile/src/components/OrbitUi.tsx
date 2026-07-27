import { Pressable, StyleSheet, Text, TextInput, View, type ViewStyle } from 'react-native';
import { font, vela } from '../constants';
import { VIcon, type VIconName } from './VIcon';

export function PrimaryButton({ label, onPress, icon, style }: { label: string; onPress: () => void; icon?: VIconName; style?: ViewStyle }) {
  return (
    <Pressable accessibilityRole='button' onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.82 }]}>
      <View style={[styles.primary, style]}>
        {icon ? <VIcon name={icon} size={20} color='#fff' strokeWidth={2.4} /> : null}
        <Text style={styles.primaryText}>{label}</Text>
      </View>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress: () => void; icon?: VIconName }) {
  return (
    <Pressable accessibilityRole='button' accessibilityState={{ selected: !!selected }} onPress={onPress} style={[styles.chip, selected && styles.chipOn]}>
      {icon ? <VIcon name={icon} size={13} color={selected ? '#fff' : vela.ink3} /> : null}
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function SearchField({ value, onChangeText, placeholder }: { value: string; onChangeText: (value: string) => void; placeholder: string }) {
  return (
    <View style={styles.search}>
      <VIcon name='search' size={18} color={vela.lightMuted} strokeWidth={2.1} />
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={vela.lightMuted} style={styles.searchInput} autoCapitalize='none' autoCorrect={false} clearButtonMode='while-editing' />
    </View>
  );
}

const styles = StyleSheet.create({
  primary: {
    backgroundColor: vela.action,
    height: 52,
    borderRadius: 13,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 9,
    paddingHorizontal: 18,
  },
  primaryText: { color: '#fff', fontFamily: font.bold, fontSize: 16 },
  chip: {
    height: 34,
    borderRadius: 17,
    backgroundColor: vela.lightSurface,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  chipOn: { backgroundColor: vela.accent },
  chipText: { color: vela.ink3, fontFamily: font.semibold, fontSize: 12.5 },
  chipTextOn: { color: '#fff' },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { color: vela.ink, fontFamily: font.extrabold, fontSize: 16.5 },
  sectionAction: { color: vela.accent, fontFamily: font.bold, fontSize: 13 },
  search: {
    height: 44,
    borderRadius: 13,
    borderCurve: 'continuous',
    backgroundColor: vela.lightSurface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 13,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    color: vela.ink,
    fontFamily: font.medium,
    fontSize: 14,
  },
});
