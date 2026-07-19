/**
 * Floating navigation: an iOS-26 liquid-glass pill (Home · Search · Profile ·
 * Pro) plus a distinct solid-gold Create FAB bottom-right (VN-style). Profile
 * and Pro open self-contained sheets so every screen gets them. Glass falls back
 * to a solid warm surface where liquid glass is unavailable.
 */
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { font, vela } from '../constants';
import { VIcon, type VIconName } from './VIcon';
import { Glass } from './Glass';
import { BottomSheet } from './BottomSheet';
import { OrbitMark } from './OrbitMark';
import { useEditor } from '../store/editorStore';

const APP_VERSION = '1.0.0';

export function BottomNav({
  active,
  onHome,
  onDiscover,
  onCreate,
}: {
  active: 'home' | 'discover';
  onHome: () => void;
  onDiscover: () => void;
  onCreate: () => void;
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [proOpen, setProOpen] = useState(false);

  const Tab = ({ icon, on, onPress, sw = 2 }: { icon: VIconName; on?: boolean; onPress: () => void; sw?: number }) => (
    <Pressable style={styles.tab} onPress={onPress}>
      <VIcon name={icon} size={24} color={on ? vela.accent : vela.ink3} strokeWidth={on ? sw + 0.4 : sw} />
    </Pressable>
  );

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Glass style={styles.bar} fallbackColor={vela.lightCard} interactive colorScheme="light">
        <Tab icon="navHome" on={active === 'home'} onPress={onHome} />
        <Tab icon="search" on={active === 'discover'} onPress={onDiscover} sw={2.2} />
        <Tab icon="profile" onPress={() => setProfileOpen(true)} />
        <Tab icon="crown" onPress={() => setProOpen(true)} sw={1.9} />
      </Glass>
      <Pressable style={styles.fab} onPress={onCreate}>
        <VIcon name="plus" size={28} color={vela.onAccent} strokeWidth={2.6} />
      </Pressable>

      {profileOpen ? <ProfileSheet onClose={() => setProfileOpen(false)} onPro={() => { setProfileOpen(false); setProOpen(true); }} /> : null}
      {proOpen ? <ProSheet onClose={() => setProOpen(false)} /> : null}
    </View>
  );
}

function ProfileSheet({ onClose, onPro }: { onClose: () => void; onPro: () => void }) {
  const serverUrl = useEditor((s) => s.serverUrl);
  const setServerUrl = useEditor((s) => s.setServerUrl);
  const editServer = () =>
    Alert.prompt('Render server', 'URL of your render service.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Save', onPress: (t?: string) => t && setServerUrl(t) },
    ], 'plain-text', serverUrl);

  const rows: { icon: VIconName; label: string; sub?: string; onPress: () => void }[] = [
    { icon: 'prefs', label: 'Render server', sub: serverUrl, onPress: editServer },
    { icon: 'crown', label: 'Upgrade to Orbit Pro', onPress: onPro },
    { icon: 'help', label: 'About Orbit', sub: `Version ${APP_VERSION}`, onPress: () => Alert.alert('Orbit', `A local-first video editor.\nVersion ${APP_VERSION}`) },
  ];
  return (
    <BottomSheet onClose={onClose} dim="#0006">
      <View style={s.profileHead}>
        <OrbitMark size={40} />
        <View>
          <Text style={s.profileTitle}>Orbit</Text>
          <Text style={s.profileSub}>Local workspace · no account needed</Text>
        </View>
      </View>
      <View style={s.divider} />
      {rows.map((r) => (
        <Pressable key={r.label} style={s.row} onPress={r.onPress}>
          <VIcon name={r.icon} size={22} color={vela.textLight} />
          <View style={{ flex: 1 }}>
            <Text style={s.rowLabel}>{r.label}</Text>
            {r.sub ? <Text style={s.rowSub} numberOfLines={1}>{r.sub}</Text> : null}
          </View>
          <VIcon name="chevronRight" size={18} color={vela.muted3} />
        </Pressable>
      ))}
    </BottomSheet>
  );
}

function ProSheet({ onClose }: { onClose: () => void }) {
  const perks = ['Unlimited projects & folders', '4K + HDR10 export', 'No watermark', 'Priority cloud renders'];
  return (
    <BottomSheet onClose={onClose} dim="#0008">
      <View style={s.proHead}>
        <OrbitMark size={34} />
        <Text style={s.proTitle}>Orbit <Text style={{ color: vela.accent }}>Pro</Text></Text>
      </View>
      <Text style={s.proLead}>Everything in Orbit, unlocked.</Text>
      <View style={{ gap: 12, marginTop: 6 }}>
        {perks.map((p) => (
          <View key={p} style={s.perk}>
            <VIcon name="check" size={18} color={vela.accent} strokeWidth={2.6} />
            <Text style={s.perkText}>{p}</Text>
          </View>
        ))}
      </View>
      <Pressable style={s.proCta} onPress={() => Alert.alert('Orbit Pro', 'Orbit Pro isn’t available yet. It’s coming soon.')}>
        <Text style={s.proCtaText}>Coming soon</Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 110, justifyContent: 'flex-end' },
  bar: {
    position: 'absolute',
    left: 18,
    right: 96,
    bottom: 26,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
  },
  tab: { flex: 1, height: 52, alignItems: 'center', justifyContent: 'center' },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 26,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: vela.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
});

const s = StyleSheet.create({
  profileHead: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 4 },
  profileTitle: { color: '#fff', fontFamily: font.extrabold, fontSize: 22 },
  profileSub: { color: vela.muted, fontFamily: font.medium, fontSize: 13, marginTop: 2 },
  divider: { height: 1, backgroundColor: vela.divider, marginVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14 },
  rowLabel: { color: '#fff', fontFamily: font.semibold, fontSize: 16 },
  rowSub: { color: vela.muted2, fontFamily: font.regular, fontSize: 12.5, marginTop: 2 },

  proHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 4 },
  proTitle: { color: '#fff', fontFamily: font.extrabold, fontSize: 26 },
  proLead: { color: vela.muted, fontFamily: font.medium, fontSize: 14, marginTop: 2, marginBottom: 8 },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  perkText: { color: vela.textLight, fontFamily: font.medium, fontSize: 15.5 },
  proCta: { marginTop: 20, height: 54, borderRadius: 16, backgroundColor: vela.accent, alignItems: 'center', justifyContent: 'center' },
  proCtaText: { color: vela.onAccent, fontFamily: font.bold, fontSize: 17 },
});
