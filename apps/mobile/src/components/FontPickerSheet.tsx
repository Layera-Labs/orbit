/**
 * FontPickerBody — searchable Google Fonts list with Favourites / Recently used
 * sections and each name previewed in its own typeface. Rendered as the "Font"
 * tab of the Text Settings sheet (fills its parent). Tapping a family downloads
 * + registers it, records it as recent, then applies it to the caption.
 *
 * Typeface previews load lazily for on-screen rows (viewability) and remount via
 * `useFontsVersion` once the download registers (iOS caches font-name misses).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View, type ViewToken } from 'react-native';
import { font, vela } from '../constants';
import { VIcon } from './VIcon';
import { POPULAR_FONTS, fetchGoogleFonts, isFontLoaded, loadGoogleFont, useFontsVersion } from '../text/fonts';
import { addRecentFont, loadFontPrefs, toggleFavourite } from '../storage/fontPrefs';

type Row =
  | { type: 'default' }
  | { type: 'header'; title: string }
  | { type: 'font'; family: string; section: string };

export function FontPickerBody({ value, onChange }: { value?: string; onChange: (family?: string) => void }) {
  const [all, setAll] = useState<string[]>(POPULAR_FONTS);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [prefs, setPrefs] = useState(() => loadFontPrefs());
  const fontsVersion = useFontsVersion();

  useEffect(() => {
    let alive = true;
    fetchGoogleFonts().then((fams) => alive && setAll(fams));
    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const out: Row[] = [{ type: 'default' }];
    if (q) {
      out.push({ type: 'header', title: 'Results' });
      all.filter((f) => f.toLowerCase().includes(q)).forEach((f) => out.push({ type: 'font', family: f, section: 'r' }));
      return out;
    }
    if (prefs.favourites.length) {
      out.push({ type: 'header', title: 'Favourites' });
      prefs.favourites.forEach((f) => out.push({ type: 'font', family: f, section: 'fav' }));
    }
    if (prefs.recent.length) {
      out.push({ type: 'header', title: 'Recently used' });
      prefs.recent.forEach((f) => out.push({ type: 'font', family: f, section: 'rec' }));
    }
    out.push({ type: 'header', title: 'All fonts' });
    all.forEach((f) => out.push({ type: 'font', family: f, section: 'all' }));
    return out;
  }, [all, query, prefs]);

  // Lazily download the typeface of rows scrolled into view so their names can
  // render in their own font. `loadGoogleFont` dedupes + bumps the fonts version.
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    for (const vi of viewableItems) {
      const row = vi.item as Row;
      if (row.type === 'font' && !isFontLoaded(row.family)) void loadGoogleFont(row.family);
    }
  }).current;

  async function pick(family?: string) {
    if (!family) {
      onChange(undefined);
      return;
    }
    setBusy(family);
    const ok = await loadGoogleFont(family);
    setBusy(null);
    if (ok) {
      setPrefs(addRecentFont(family));
      onChange(family);
    }
  }

  return (
    <View style={{ flex: 1, gap: 12 }}>
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
        data={rows}
        keyExtractor={(row) => (row.type === 'font' ? `${row.section}:${row.family}` : row.type === 'header' ? `h:${row.title}` : 'default')}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 12 }}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return <Text style={styles.section}>{item.title}</Text>;
          }
          if (item.type === 'default') {
            const on = !value;
            return (
              <Pressable style={styles.row} onPress={() => pick(undefined)}>
                <Text style={[styles.name, on && styles.nameOn]}>Default</Text>
                {on ? <VIcon name="check" size={18} color={vela.accent} /> : null}
              </Pressable>
            );
          }
          const family = item.family;
          const on = value === family;
          const fav = prefs.favourites.includes(family);
          const loaded = isFontLoaded(family);
          return (
            <Pressable style={styles.row} onPress={() => pick(family)}>
              <Text
                key={`${family}-${fontsVersion}`}
                style={[styles.name, on && styles.nameOn, loaded ? { fontFamily: family } : null]}
                numberOfLines={1}
              >
                {family}
              </Text>
              <View style={styles.rowRight}>
                {busy === family ? (
                  <ActivityIndicator size="small" color={vela.muted} />
                ) : on ? (
                  <VIcon name="check" size={18} color={vela.accent} />
                ) : null}
                <Pressable onPress={() => setPrefs(toggleFavourite(family))} hitSlop={10}>
                  <VIcon name="star" size={19} mode={fav ? 'fill' : 'stroke'} color={fav ? vela.accent : vela.muted2} />
                </Pressable>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: vela.card3, borderRadius: 12, paddingHorizontal: 14, height: 44 },
  searchInput: { flex: 1, color: '#fff', fontSize: 16, fontFamily: font.regular },
  section: { color: vela.muted, fontFamily: font.semibold, fontSize: 12.5, letterSpacing: 0.4, textTransform: 'uppercase', paddingTop: 14, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: vela.card2 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  name: { color: vela.textLight, fontSize: 18, fontFamily: font.medium, flex: 1, marginRight: 12 },
  nameOn: { color: vela.accent },
});
