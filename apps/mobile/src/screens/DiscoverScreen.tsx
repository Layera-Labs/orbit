/** Template browser matching the new light Orbit shell. */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppHeader } from '../components/AppHeader';
import { BottomNav } from '../components/BottomNav';
import { Chip, SearchField } from '../components/OrbitUi';
import { font, mono, orbitTonal, vela } from '../constants';
import { listUserTemplates } from '../storage/templates';
import { useEditor } from '../store/editorStore';
import { BUILTIN_TEMPLATES, type EditorTemplate } from '../templates';
import { CreateSheet } from './CreateSheet';

type Category = 'Trending' | 'Reel' | 'Intro' | 'Lyrics' | 'Celebrate';
const CATEGORIES: Category[] = ['Trending', 'Reel', 'Intro', 'Lyrics', 'Celebrate'];

function matchesCategory(template: EditorTemplate, category: Category): boolean {
  if (category === 'Trending') return true;
  if (category === 'Reel') return template.category === 'Social';
  if (category === 'Intro') return template.category === 'Titles';
  if (category === 'Lyrics') return template.category === 'Music';
  return template.category === 'Celebrate';
}

function ratioLabel(template: { width: number; height: number }): string {
  return template.height > template.width ? '9:16' : template.height === template.width ? '1:1' : '16:9';
}

export function DiscoverScreen() {
  const go = useEditor((s) => s.go);
  const newProject = useEditor((s) => s.newProject);
  const newProjectFromTemplate = useEditor((s) => s.newProjectFromTemplate);
  const newProjectFromStoredTemplate = useEditor((s) => s.newProjectFromStoredTemplate);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('Trending');
  const [createOpen, setCreateOpen] = useState(false);
  const userTemplates = listUserTemplates();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return BUILTIN_TEMPLATES.filter((template) => matchesCategory(template, category) && (!q || `${template.name} ${template.tag}`.toLowerCase().includes(q)));
  }, [category, query]);

  return (
    <View style={styles.root}>
      <AppHeader
        title='Templates'
        actions={[
          {
            icon: 'profile',
            label: 'Open profile',
            onPress: () => go('profile'),
          },
        ]}
      />
      <ScrollView contentInsetAdjustmentBehavior='automatic' showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <SearchField value={query} onChangeText={setQuery} placeholder='Search templates…' />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {CATEGORIES.map((item) => (
            <Chip key={item} label={item} selected={category === item} onPress={() => setCategory(item)} icon={item === 'Trending' ? 'fx' : undefined} />
          ))}
        </ScrollView>

        {visible.length ? (
          <View style={styles.grid}>
            {visible.map((template, index) => (
              <Pressable key={template.id} style={styles.cell} onPress={() => newProjectFromTemplate(template)}>
                <LinearGradient colors={template.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, index % 3 === 0 && styles.cardTall]}>
                  <Text style={styles.cardRatio}>
                    {ratioLabel(template)} · {template.tag}
                  </Text>
                  <Text style={styles.cardHero}>{template.name.toUpperCase()}</Text>
                  <Text style={styles.cardDuration}>00:{template.id.length % 2 ? '15' : '12'}</Text>
                </LinearGradient>
                <Text style={styles.name} numberOfLines={1}>
                  {template.name}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No templates match “{query.trim()}”.</Text>
          </View>
        )}

        {userTemplates.length ? (
          <>
            <Text style={styles.sectionTitle}>My Templates</Text>
            <View style={styles.grid}>
              {userTemplates.map((template) => (
                <Pressable key={template.id} style={styles.cell} onPress={() => newProjectFromStoredTemplate(template)}>
                  <LinearGradient colors={orbitTonal} style={styles.card}>
                    <Text style={styles.cardRatio}>{ratioLabel(template.project)} · saved</Text>
                    <Text style={styles.cardHero}>{template.name.toUpperCase()}</Text>
                  </LinearGradient>
                  <Text style={styles.name} numberOfLines={1}>
                    {template.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>

      <BottomNav active='templates' onHome={() => go('projects')} onTemplates={() => {}} onCreate={() => setCreateOpen(true)} onAi={() => go('ai')} />
      <CreateSheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={(width, height) => {
          setCreateOpen(false);
          newProject('Untitled', width, height);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: vela.homeBg },
  content: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 116,
    gap: 14,
  },
  chips: { gap: 8, paddingRight: 8 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 17,
  },
  cell: { width: '48%' },
  card: {
    height: 142,
    borderRadius: 14,
    borderCurve: 'continuous',
    overflow: 'hidden',
    padding: 12,
    justifyContent: 'flex-end',
  },
  cardTall: { height: 154 },
  cardRatio: {
    position: 'absolute',
    left: 10,
    top: 10,
    color: '#ffffffba',
    fontFamily: mono.medium,
    fontSize: 9.5,
  },
  cardHero: {
    color: '#fff',
    fontFamily: font.extrabold,
    fontSize: 22,
    lineHeight: 22,
    letterSpacing: -0.5,
    maxWidth: 130,
  },
  cardDuration: {
    color: '#fff',
    backgroundColor: '#0009',
    alignSelf: 'flex-start',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
    fontFamily: mono.medium,
    fontSize: 9,
    marginTop: 8,
  },
  name: {
    color: vela.ink,
    fontFamily: font.semibold,
    fontSize: 12.5,
    marginTop: 6,
  },
  sectionTitle: {
    color: vela.ink,
    fontFamily: font.extrabold,
    fontSize: 18,
    marginTop: 8,
  },
  empty: { paddingVertical: 70, alignItems: 'center' },
  emptyText: {
    color: vela.ink3,
    fontFamily: font.medium,
    fontSize: 14,
    textAlign: 'center',
  },
});
