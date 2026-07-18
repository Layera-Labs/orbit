/**
 * Discover — a warm-dark showcase hero over a light, categorised template
 * browser. Templates are REAL: tapping one creates a new editable project.
 * Sections group the built-ins by category; the search box filters across all.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { font, mono, vela } from '../constants';
import { VIcon } from '../components/VIcon';
import { OrbitMark } from '../components/OrbitMark';
import { BottomNav } from '../components/BottomNav';
import { CreateSheet } from './CreateSheet';
import { useEditor } from '../store/editorStore';
import { BUILTIN_TEMPLATES, TEMPLATE_CATEGORIES, type EditorTemplate } from '../templates';
import { listUserTemplates } from '../storage/templates';

const ratioOf = (t: { width: number; height: number }) => (t.height > t.width ? '9:16' : t.height === t.width ? '1:1' : '16:9');

export function DiscoverScreen() {
  const go = useEditor((s) => s.go);
  const newProject = useEditor((s) => s.newProject);
  const newProjectFromTemplate = useEditor((s) => s.newProjectFromTemplate);
  const newProjectFromStoredTemplate = useEditor((s) => s.newProjectFromStoredTemplate);
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState('');
  const userTemplates = listUserTemplates();

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const matched = BUILTIN_TEMPLATES.filter((t) => t.name.toLowerCase().includes(q));

  const Card = ({ tpl }: { tpl: EditorTemplate }) => (
    <Pressable style={styles.cat} onPress={() => newProjectFromTemplate(tpl)}>
      <LinearGradient colors={tpl.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.catCard}>
        <Text style={styles.catTag}>{ratioOf(tpl)} · {tpl.tag}</Text>
      </LinearGradient>
      <Text style={styles.catName} numberOfLines={1}>{tpl.name}</Text>
    </Pressable>
  );

  return (
    <View style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 130 }}>
        {/* warm-dark showcase hero */}
        <LinearGradient colors={['#241d13', '#0f0d0a']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.hero}>
          <View style={{ height: 54 }} />
          <View style={styles.heroTop}>
            <Text style={styles.h1}>Discover</Text>
            <OrbitMark size={30} />
          </View>
          <View style={styles.search}>
            <VIcon name="search" size={19} color={vela.lightMuted} strokeWidth={2.2} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search templates"
              placeholderTextColor={vela.lightMuted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>
          <View style={styles.heroBody}>
            <Text style={styles.heroTitle}>Start from a <Text style={{ color: vela.accent }}>template</Text></Text>
            <Text style={styles.heroSub}>Ready-made looks — open one and make it yours.</Text>
          </View>
        </LinearGradient>

        {searching ? (
          <>
            <Text style={styles.sectionH}>Results <Text style={styles.count}>{matched.length}</Text></Text>
            {matched.length ? (
              <View style={styles.grid}>
                {matched.map((tpl) => (
                  <Pressable key={tpl.id} style={styles.gridCell} onPress={() => newProjectFromTemplate(tpl)}>
                    <LinearGradient colors={tpl.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gridCard}>
                      <Text style={styles.gridTag}>{ratioOf(tpl)} · {tpl.tag}</Text>
                      <Text style={styles.gridName} numberOfLines={1}>{tpl.name}</Text>
                    </LinearGradient>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No templates match “{query.trim()}”.</Text>
              </View>
            )}
          </>
        ) : (
          <>
            {/* categorised sections */}
            {TEMPLATE_CATEGORIES.map((cat) => {
              const items = BUILTIN_TEMPLATES.filter((t) => t.category === cat);
              if (!items.length) return null;
              return (
                <View key={cat}>
                  <Text style={styles.sectionH}>{cat} <Text style={styles.count}>{items.length}</Text></Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
                    {items.map((tpl) => <Card key={tpl.id} tpl={tpl} />)}
                  </ScrollView>
                </View>
              );
            })}

            {/* user-saved templates */}
            {userTemplates.length ? (
              <>
                <Text style={styles.sectionH}>My Templates <Text style={styles.count}>{userTemplates.length}</Text></Text>
                <View style={styles.grid}>
                  {userTemplates.map((tpl) => (
                    <Pressable key={tpl.id} style={styles.gridCell} onPress={() => newProjectFromStoredTemplate(tpl)}>
                      <LinearGradient colors={[vela.ink3, vela.ink]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gridCard}>
                        <Text style={styles.gridTag}>{ratioOf(tpl.project)} · saved</Text>
                        <Text style={styles.gridName} numberOfLines={1}>{tpl.name}</Text>
                      </LinearGradient>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      <BottomNav active="discover" onHome={() => go('projects')} onDiscover={() => {}} onCreate={() => setCreateOpen(true)} />

      <CreateSheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={(w, h) => {
          setCreateOpen(false);
          newProject('Untitled', w, h);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: vela.homeBg },

  hero: { paddingBottom: 26 },
  heroTop: { paddingHorizontal: 22, paddingTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { fontFamily: font.extrabold, fontSize: 30, color: '#fff', letterSpacing: -0.6 },
  search: { marginHorizontal: 22, marginTop: 14, height: 46, borderRadius: 14, backgroundColor: vela.lightCard, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  searchInput: { flex: 1, color: vela.ink, fontSize: 16, fontFamily: font.medium, height: '100%' },
  heroBody: { paddingHorizontal: 22, marginTop: 20 },
  heroTitle: { fontFamily: font.extrabold, fontSize: 30, color: '#fff', lineHeight: 34 },
  heroSub: { color: 'rgba(255,255,255,0.72)', fontSize: 13.5, marginTop: 10, maxWidth: 240, fontFamily: font.medium },

  sectionH: { paddingHorizontal: 22, paddingTop: 22, fontFamily: font.extrabold, fontSize: 18, color: vela.ink },
  count: { color: vela.lightMuted },
  catRow: { gap: 14, paddingHorizontal: 22, paddingTop: 14, paddingBottom: 4 },
  cat: { width: 124 },
  catCard: { height: 124, borderRadius: 18, justifyContent: 'flex-end', padding: 12 },
  catTag: { fontFamily: mono.regular, fontSize: 10, color: 'rgba(255,255,255,0.85)' },
  catName: { textAlign: 'center', marginTop: 9, fontFamily: font.bold, fontSize: 14.5, color: vela.ink },

  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 22, paddingTop: 14, gap: 14, justifyContent: 'space-between' },
  gridCell: { width: '47%' },
  gridCard: { aspectRatio: 0.72, borderRadius: 16, justifyContent: 'flex-end', padding: 12, gap: 4 },
  gridTag: { fontFamily: mono.regular, fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  gridName: { fontFamily: font.bold, fontSize: 15, color: '#fff' },

  empty: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 22 },
  emptyText: { color: vela.ink3, fontSize: 15, fontFamily: font.medium, textAlign: 'center' },
});
