/**
 * FontPickerSheet — searchable list of all Google Fonts. Tapping a family
 * downloads + registers it at runtime, then applies it to the selected caption
 * (live in the preview); the export embeds the same font server-side.
 */
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { font, vela } from '../constants';
import { VIcon } from './VIcon';
import { POPULAR_FONTS, fetchGoogleFonts, loadGoogleFont } from '../text/fonts';

export function FontPickerSheet({ value, onChange, onClose }: { value?: string; onChange: (family?: string) => void; onClose: () => void }) {
  const [all, setAll] = useState<string[]>(POPULAR_FONTS);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchGoogleFonts().then((fams) => alive && setAll(fams));
    return () => {
      alive = false;
    };
  }, []);

  const data = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? all.filter((f) => f.toLowerCase().includes(q)) : all;
    return ['__default__', ...list];
  }, [all, query]);

  async function pick(family?: string) {
    if (!family) {
      onChange(undefined);
      return;
    }
    setBusy(family);
    const ok = await loadGoogleFont(family);
    setBusy(null);
    if (ok) onChange(family);
  }

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>Font</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <VIcon name="check" size={24} color="#fff" />
            </Pressable>
          </View>
          <View style={styles.search}>
            <VIcon name="search" size={18} color={vela.muted} strokeWidth={2.2} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search fonts"
              placeholderTextColor={vela.muted2}
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
          <FlatList
            data={data}
            keyExtractor={(f) => f}
            keyboardShouldPersistTaps="handled"
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingBottom: 12 }}
            renderItem={({ item }) => {
              if (item === '__default__') {
                const on = !value;
                return (
                  <Pressable style={styles.row} onPress={() => pick(undefined)}>
                    <Text style={[styles.name, on && styles.nameOn]}>Default</Text>
                    {on ? <VIcon name="check" size={18} color={vela.accent} /> : null}
                  </Pressable>
                );
              }
              const on = value === item;
              return (
                <Pressable style={styles.row} onPress={() => pick(item)}>
                  <Text style={[styles.name, on && styles.nameOn]} numberOfLines={1}>{item}</Text>
                  {busy === item ? <ActivityIndicator size="small" color={vela.muted} /> : on ? <VIcon name="check" size={18} color={vela.accent} /> : null}
                </Pressable>
              );
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
  sheet: { backgroundColor: vela.sheet, padding: 18, paddingBottom: 24, borderTopLeftRadius: 26, borderTopRightRadius: 26, gap: 12, height: '72%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#fff', fontFamily: font.bold, fontSize: 17 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: vela.card3, borderRadius: 12, paddingHorizontal: 14, height: 44 },
  searchInput: { flex: 1, color: '#fff', fontSize: 16, fontFamily: font.regular },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: vela.card2 },
  name: { color: vela.textLight, fontSize: 17, fontFamily: font.medium, flex: 1 },
  nameOn: { color: vela.accent, fontFamily: font.bold },
});
