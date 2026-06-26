/**
 * Create New Project sheet (Vela light). The big "New Project" card creates a
 * real 9:16 project (ratio is adjustable in-editor); the Tools grid + tutorials
 * are tagged soon. Opened from the bottom-nav "+".
 */
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { font, vela } from '../constants';
import { VIcon } from '../components/VIcon';

const soon = (label: string) => Alert.alert('Coming soon', `${label} is coming soon.`);

const TOOLS = [
  { label: 'Photo Edit', d: 'M4 5h16v14H4zM4 15l5-4 4 3 3-3 4 3M9 9a1.3 1.3 0 100 .01', badge: '' },
  { label: 'Teleprompter', d: 'M4 5h16v11H4zM7 9h10M7 12h6M9 20h6M12 16v4', badge: 'New' },
  { label: 'BeatsClips', d: 'M13 3L5 13h6l-1 8 8-10h-6z', badge: '' },
  { label: 'Create Template', d: 'M12 5a3 3 0 100 6 3 3 0 000-6zM5 19a7 7 0 0110-6.3M17 14v6M14 17h6', badge: '' },
  { label: 'Overlay', d: 'M4 4h12v12H4zM8 8h12v12H8z', badge: '' },
  { label: 'Stories', d: 'M5 5h14M5 9h14M5 13h9M5 17h9M17 13l3 3-3 3', badge: '' },
];

const TUTORIAL_ICON = 'M3 8l9-4 9 4-9 4zM7 11v5c0 1 2 2 5 2s5-1 5-2v-5';

export function CreateSheet({ visible, onClose, onCreate }: { visible: boolean; onClose: () => void; onCreate: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ScrollView style={styles.root} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
        <View style={{ height: 54 }} />
        <View style={styles.topRow}>
          <Pressable style={styles.close} onPress={onClose} hitSlop={10}>
            <VIcon name="close" size={26} color={vela.ink2} strokeWidth={2.2} />
          </Pressable>
          <View style={styles.tabs}>
            <View>
              <Text style={styles.tabOn}>Create</Text>
              <View style={styles.tabUnderline} />
            </View>
            <Text style={styles.tabOff} onPress={() => soon('Yours')}>Yours</Text>
          </View>
        </View>

        <Pressable onPress={() => soon('Getting Started')}>
          <LinearGradient colors={['#2f7bff', '#5aa0ff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.gettingStarted}>
            <View style={styles.gsLogo} />
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.gsTitle}>Getting Started</Text>
              <Text style={styles.gsSub}>A quick guide to help you begin</Text>
            </View>
            <View style={styles.gsBtn}><Text style={styles.gsBtnText}>View</Text></View>
          </LinearGradient>
        </Pressable>

        <Pressable onPress={onCreate}>
          <LinearGradient colors={['#2f7bff', '#5aa0ff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.newProject}>
            <VIcon d="M7 6a2 2 0 104 0 2 2 0 00-4 0zM7 18a2 2 0 104 0 2 2 0 00-4 0zM9 8l9 8M18 8L9 16" size={40} color="#fff" strokeWidth={1.9} />
            <Text style={styles.newProjectTitle}>New Project</Text>
            <Text style={styles.newProjectSub}>Blank canvas · 9:16</Text>
          </LinearGradient>
        </Pressable>

        <View style={styles.upgrade}>
          <VIcon d="M4 8l4 4 4-7 4 7 4-4-2 11H6z" size={20} color="#caa23a" mode="fill" />
          <Text style={styles.upgradeText}>
            Upgrade to <Text style={{ fontFamily: font.extrabold }}>Orbit Pro</Text> to unlock unlimited projects.
          </Text>
          <VIcon name="chevronRight" size={18} color="#caa23a" />
        </View>

        <Text style={styles.sectionH}>Tools</Text>
        <View style={styles.toolsGrid}>
          {TOOLS.map((t) => (
            <Pressable key={t.label} style={styles.toolCell} onPress={() => soon(t.label)}>
              <View style={styles.toolTile}>
                <VIcon d={t.d} size={30} color={vela.ink2} strokeWidth={1.7} />
                {t.badge ? (
                  <View style={styles.toolBadge}><Text style={styles.toolBadgeText}>{t.badge}</Text></View>
                ) : null}
              </View>
              <Text style={styles.toolLabel}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionH}>Tutorial</Text>
        <View style={{ paddingHorizontal: 22, gap: 12 }}>
          {['Newbie tutorials and usage guides', 'Template creation tutorial'].map((label) => (
            <Pressable key={label} style={styles.tutorialRow} onPress={() => soon('Tutorials')}>
              <VIcon d={TUTORIAL_ICON} size={22} color={vela.ink3} strokeWidth={1.8} />
              <Text style={styles.tutorialText}>{label}</Text>
              <VIcon name="chevronRight" size={18} color={vela.lightMuted3} />
            </Pressable>
          ))}
        </View>

        <Text style={styles.storage}>Storage Used: 1.5 GB   <Text style={{ color: vela.action, fontFamily: font.bold }}>Clean up</Text></Text>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: vela.homeBg },
  topRow: { paddingHorizontal: 22, paddingTop: 8, alignItems: 'center', justifyContent: 'center' },
  close: { position: 'absolute', left: 22, top: 8 },
  tabs: { flexDirection: 'row', gap: 34, alignItems: 'center' },
  tabOn: { fontFamily: font.bold, fontSize: 19, color: vela.ink2 },
  tabUnderline: { position: 'absolute', left: '50%', marginLeft: -10, bottom: -7, width: 20, height: 3, backgroundColor: vela.ink2, borderRadius: 2 },
  tabOff: { fontFamily: font.bold, fontSize: 19, color: vela.lightMuted3 },

  gettingStarted: { marginHorizontal: 22, marginTop: 22, height: 78, borderRadius: 16, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18 },
  gsLogo: { width: 46, height: 46, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.18)' },
  gsTitle: { color: '#fff', fontFamily: font.extrabold, fontSize: 18 },
  gsSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2, fontFamily: font.medium },
  gsBtn: { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  gsBtnText: { color: vela.action, fontFamily: font.bold, fontSize: 14 },

  newProject: { marginHorizontal: 22, marginTop: 14, height: 150, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 10 },
  newProjectTitle: { color: '#fff', fontFamily: font.extrabold, fontSize: 24 },
  newProjectSub: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontFamily: font.medium },

  upgrade: { marginHorizontal: 22, marginTop: 12, backgroundColor: '#fbf2d8', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  upgradeText: { flex: 1, color: '#a8852a', fontSize: 13.5, fontFamily: font.semibold },

  sectionH: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 12, fontFamily: font.extrabold, fontSize: 20, color: vela.ink2 },
  toolsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 22, gap: 14 },
  toolCell: { width: '30%', alignItems: 'center', gap: 8 },
  toolTile: { width: '100%', aspectRatio: 1, borderRadius: 18, backgroundColor: vela.lightSurface, alignItems: 'center', justifyContent: 'center' },
  toolBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: vela.action, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2 },
  toolBadgeText: { color: '#fff', fontSize: 9, fontFamily: font.bold, fontStyle: 'italic' },
  toolLabel: { fontSize: 13, fontFamily: font.semibold, color: vela.ink3, textAlign: 'center' },

  tutorialRow: { height: 54, borderRadius: 14, backgroundColor: vela.lightSurface, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  tutorialText: { flex: 1, fontSize: 15, fontFamily: font.semibold, color: vela.ink2 },

  storage: { textAlign: 'center', paddingVertical: 28, fontSize: 14, color: vela.lightMuted, fontFamily: font.medium },
});
