/**
 * Discover (Vela light). Gradient hero + searchable showcase. The template
 * cards are REAL: tapping one creates a new editable project from a built-in
 * (or user-saved) template. Hero/promo remain decorative.
 */
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { font, mono, vela } from '../constants';
import { VIcon } from '../components/VIcon';
import { BottomNav } from '../components/BottomNav';
import { CreateSheet } from './CreateSheet';
import { useEditor } from '../store/editorStore';
import { BUILTIN_TEMPLATES, type EditorTemplate } from '../templates';
import { listUserTemplates } from '../storage/templates';

const soon = (label: string) => Alert.alert('Coming soon', `${label} is coming soon.`);
const ratioOf = (t: { width: number; height: number }) => (t.height > t.width ? '9:16' : t.height === t.width ? '1:1' : '16:9');

export function DiscoverScreen() {
  const go = useEditor((s) => s.go);
  const newProject = useEditor((s) => s.newProject);
  const newProjectFromTemplate = useEditor((s) => s.newProjectFromTemplate);
  const newProjectFromStoredTemplate = useEditor((s) => s.newProjectFromStoredTemplate);
  const [createOpen, setCreateOpen] = useState(false);
  const userTemplates = listUserTemplates();

  return (
    <View style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        {/* gradient hero header */}
        <LinearGradient colors={['#b07a4e', '#7d93a8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.hero}>
          <View style={{ height: 54 }} />
          <View style={styles.heroTop}>
            <Text style={styles.h1}>Discover</Text>
            <View style={styles.heroIcons}>
              <VIcon name="picture" size={22} color="#fff" strokeWidth={2} />
              <VIcon name="crop" size={22} color="#fff" strokeWidth={2} />
            </View>
          </View>
          <Pressable style={styles.search} onPress={() => soon('Search')}>
            <VIcon name="search" size={19} color={vela.lightMuted} strokeWidth={2.2} />
            <Text style={styles.searchText}>Search templates &amp; effects</Text>
          </Pressable>
          <View style={styles.heroBody}>
            <Text style={styles.heroTitle}>Carousel{'\n'}Style</Text>
            <Text style={styles.heroSub}>Craft scroll-stopping social posts in minutes.</Text>
          </View>
          <View style={styles.dots}>
            <View style={[styles.dot, styles.dotOn]} />
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
          </View>
        </LinearGradient>

        {/* template quick row */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
          {BUILTIN_TEMPLATES.map((tpl) => (
            <Pressable key={tpl.id} style={styles.cat} onPress={() => newProjectFromTemplate(tpl)}>
              <LinearGradient colors={tpl.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.catCard}>
                <Text style={styles.catTag}>{tpl.tag}</Text>
              </LinearGradient>
              <Text style={styles.catName}>{tpl.name}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* partner promo */}
        <Pressable style={styles.flux} onPress={() => soon('Flux Studio')}>
          <View style={styles.fluxLogo}><Text style={styles.fluxLogoText}>Flux</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fluxTitle}>Flux Studio: Photo &amp; Graphic</Text>
            <Text style={styles.fluxSub}>A quick &amp; pro design app</Text>
          </View>
          <View style={styles.fluxBtn}><Text style={styles.fluxBtnText}>Try Now</Text></View>
        </Pressable>

        {/* templates grid */}
        <Text style={styles.sectionH}>Templates <Text style={{ color: vela.lightMuted }}>{BUILTIN_TEMPLATES.length}</Text></Text>
        <View style={styles.grid}>
          {BUILTIN_TEMPLATES.map((tpl) => (
            <Pressable key={tpl.id} style={styles.gridCell} onPress={() => newProjectFromTemplate(tpl)}>
              <LinearGradient colors={tpl.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gridCard}>
                <Text style={styles.recentTag}>{ratioOf(tpl)} · {tpl.tag}</Text>
                <Text style={styles.gridName}>{tpl.name}</Text>
              </LinearGradient>
            </Pressable>
          ))}
        </View>

        {/* user-saved templates */}
        {userTemplates.length ? (
          <>
            <Text style={styles.sectionH}>My Templates <Text style={{ color: vela.lightMuted }}>{userTemplates.length}</Text></Text>
            <View style={styles.grid}>
              {userTemplates.map((tpl) => (
                <Pressable key={tpl.id} style={styles.gridCell} onPress={() => newProjectFromStoredTemplate(tpl)}>
                  <LinearGradient colors={['#2a2a2a', '#4a4030']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gridCard}>
                    <Text style={styles.recentTag}>{ratioOf(tpl.project)} · saved</Text>
                    <Text style={styles.gridName} numberOfLines={1}>{tpl.name}</Text>
                  </LinearGradient>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>

      <BottomNav active="discover" onHome={() => go('projects')} onDiscover={() => {}} onCreate={() => setCreateOpen(true)} />

      <CreateSheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={() => {
          setCreateOpen(false);
          newProject('Untitled', 1080, 1920);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: vela.homeBg },

  hero: { paddingBottom: 18 },
  heroTop: { paddingHorizontal: 22, paddingTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { fontFamily: font.extrabold, fontSize: 30, color: '#fff', letterSpacing: -0.6 },
  heroIcons: { flexDirection: 'row', gap: 12 },
  search: { marginHorizontal: 22, marginTop: 14, height: 46, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.92)', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  searchText: { color: vela.lightMuted, fontSize: 16, fontFamily: font.medium },
  heroBody: { paddingHorizontal: 22, marginTop: 18 },
  heroTitle: { fontFamily: font.extrabold, fontStyle: 'italic', fontSize: 34, color: '#fff', lineHeight: 33 },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 10, maxWidth: 200, fontFamily: font.medium },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 16 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotOn: { width: 18, backgroundColor: '#fff' },

  catRow: { gap: 14, paddingHorizontal: 22, paddingTop: 20, paddingBottom: 6 },
  cat: { width: 124 },
  catCard: { height: 124, borderRadius: 18, justifyContent: 'flex-end', padding: 12 },
  catTag: { fontFamily: mono.regular, fontSize: 10, color: 'rgba(255,255,255,0.85)' },
  catName: { textAlign: 'center', marginTop: 9, fontFamily: font.bold, fontSize: 14.5, color: vela.ink },

  flux: { marginHorizontal: 22, marginTop: 18, height: 80, borderRadius: 16, backgroundColor: '#eef0fb', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 14 },
  fluxLogo: { width: 46, height: 46, borderRadius: 13, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  fluxLogoText: { color: '#fff', fontFamily: font.extrabold, fontSize: 13, fontStyle: 'italic' },
  fluxTitle: { fontFamily: font.extrabold, fontSize: 16, color: vela.ink },
  fluxSub: { color: vela.lightMuted, fontSize: 13, marginTop: 2, fontFamily: font.medium },
  fluxBtn: { backgroundColor: '#111', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 9 },
  fluxBtnText: { color: '#fff', fontFamily: font.bold, fontSize: 13 },

  sectionH: { paddingHorizontal: 22, paddingTop: 18, fontFamily: font.extrabold, fontSize: 18, color: vela.ink },
  recentTag: { fontFamily: mono.regular, fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 22, paddingTop: 14, gap: 14, justifyContent: 'space-between' },
  gridCell: { width: '47%' },
  gridCard: { aspectRatio: 0.72, borderRadius: 16, justifyContent: 'flex-end', padding: 12, gap: 4 },
  gridName: { fontFamily: font.bold, fontSize: 15, color: '#fff' },
});
