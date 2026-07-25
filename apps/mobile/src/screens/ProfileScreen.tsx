import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppHeader } from '../components/AppHeader';
import { AuthSheet } from '../components/AuthSheet';
import { BottomNav } from '../components/BottomNav';
import { BottomSheet } from '../components/BottomSheet';
import { InputSheet } from '../components/InputSheet';
import { VIcon, type VIconName } from '../components/VIcon';
import { font, vela } from '../constants';
import { useAuth } from '../store/authStore';
import { useEditor } from '../store/editorStore';
import { CreateSheet } from './CreateSheet';

export function ProfileScreen() {
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const go = useEditor((s) => s.go);
  const serverUrl = useEditor((s) => s.serverUrl);
  const setServerUrl = useEditor((s) => s.setServerUrl);
  const newProject = useEditor((s) => s.newProject);
  const [authOpen, setAuthOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const authed = status === 'authed';

  const rows: Array<{ icon: VIconName; label: string; onPress: () => void }> = [
    {
      icon: 'templates',
      label: 'Projects & Media',
      onPress: () => go('library'),
    },
    { icon: 'prefs', label: 'Settings', onPress: () => setSettingsOpen(true) },
    {
      icon: 'help',
      label: 'Help & Support',
      onPress: () => Alert.alert('Help & Support', 'Support contact and guides are coming soon.'),
    },
    { icon: 'help', label: 'About Orbit', onPress: () => setAboutOpen(true) },
  ];

  return (
    <View style={styles.root}>
      <AppHeader title='Me' />
      <ScrollView contentInsetAdjustmentBehavior='automatic' showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.identity}>
          <LinearGradient colors={['#8e8cff', '#5b4bff']} style={styles.avatar}>
            <VIcon name='profile' size={38} color='#fff' strokeWidth={1.8} />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{authed ? user?.email?.split('@')[0] || 'Orbit Creator' : 'Guest User'}</Text>
            <Text style={styles.sub}>{authed ? user?.email : 'Create freely. Sign in only for AI.'}</Text>
          </View>
        </View>

        <LinearGradient colors={['#f0edff', '#f7f5ff']} style={styles.syncCard}>
          <View style={styles.syncIcon}>
            <VIcon name={authed ? 'check' : 'export'} size={24} color={vela.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.syncTitle}>{authed ? 'AI account connected' : 'Optional account'}</Text>
            <Text style={styles.syncSub}>{authed ? 'AI credits and generation history are available.' : 'Sign in for AI Studio. Local editing stays unlocked.'}</Text>
          </View>
          <Pressable style={styles.signButton} onPress={() => (authed ? void logout() : setAuthOpen(true))}>
            <Text style={styles.signText}>{authed ? 'Sign Out' : 'Sign In'}</Text>
          </Pressable>
        </LinearGradient>

        <View style={styles.menu}>
          {rows.map((row, index) => (
            <Pressable key={row.label} style={[styles.row, index > 0 && styles.rowBorder]} onPress={row.onPress}>
              <VIcon name={row.icon} size={20} color={vela.ink3} />
              <Text style={styles.rowText}>{row.label}</Text>
              <VIcon name='chevronRight' size={17} color={vela.lightMuted} />
            </Pressable>
          ))}
        </View>

        <View style={styles.localCard}>
          <VIcon name='lock' size={19} color={vela.success} />
          <View style={{ flex: 1 }}>
            <Text style={styles.localTitle}>Local-first workspace</Text>
            <Text style={styles.localText}>Projects remain available without an account.</Text>
          </View>
        </View>
      </ScrollView>

      <BottomNav onHome={() => go('projects')} onTemplates={() => go('discover')} onCreate={() => setCreateOpen(true)} onAi={() => go('ai')} />

      {authOpen ? <AuthSheet onClose={() => setAuthOpen(false)} onAuthed={() => setAuthOpen(false)} /> : null}
      {settingsOpen ? <InputSheet title='Render server' subtitle='Used for final video export and AI generation.' initialValue={serverUrl} placeholder='http://192.168.1.20:8787' keyboardType='url' autoCapitalize='none' onSave={setServerUrl} onClose={() => setSettingsOpen(false)} /> : null}
      {aboutOpen ? <AboutSheet onClose={() => setAboutOpen(false)} /> : null}
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

function AboutSheet({ onClose }: { onClose: () => void }) {
  const benefits: Array<{ icon: VIconName; title: string; text: string }> = [
    {
      icon: 'check',
      title: '100% Free',
      text: 'No login required to edit and export.',
    },
    {
      icon: 'quality',
      title: 'Powerful Editor',
      text: 'Professional multi-track tools for everyone.',
    },
    {
      icon: 'lock',
      title: 'Local & Private',
      text: 'Your projects and source media stay on device.',
    },
    {
      icon: 'fx',
      title: 'AI Studio is optional',
      text: 'Sign in only when you need generative tools.',
    },
  ];
  return (
    <BottomSheet onClose={onClose} style={styles.about} dim='#0007'>
      <Text style={styles.aboutTitle}>Why Orbit?</Text>
      {benefits.map((benefit) => (
        <View key={benefit.title} style={styles.aboutRow}>
          <View style={styles.aboutIcon}>
            <VIcon name={benefit.icon} size={21} color={vela.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.aboutRowTitle}>{benefit.title}</Text>
            <Text style={styles.aboutRowText}>{benefit.text}</Text>
          </View>
        </View>
      ))}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: vela.homeBg },
  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 116,
    gap: 18,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { color: vela.ink, fontFamily: font.extrabold, fontSize: 20 },
  sub: {
    color: vela.ink3,
    fontFamily: font.medium,
    fontSize: 12.5,
    marginTop: 3,
  },
  syncCard: {
    minHeight: 86,
    borderRadius: 16,
    borderCurve: 'continuous',
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderWidth: 1,
    borderColor: '#e3defe',
  },
  syncIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncTitle: { color: vela.ink, fontFamily: font.bold, fontSize: 13.5 },
  syncSub: {
    color: vela.ink3,
    fontFamily: font.medium,
    fontSize: 10.5,
    lineHeight: 14,
    marginTop: 2,
  },
  signButton: {
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  signText: { color: vela.accent, fontFamily: font.bold, fontSize: 11.5 },
  menu: {
    backgroundColor: vela.lightCard,
    borderRadius: 16,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  row: {
    minHeight: 56,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: vela.lightBorder,
  },
  rowText: {
    flex: 1,
    color: vela.ink2,
    fontFamily: font.semibold,
    fontSize: 14,
  },
  localCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: '#edf8f1',
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 14,
  },
  localTitle: { color: '#276443', fontFamily: font.bold, fontSize: 13 },
  localText: {
    color: '#4d7560',
    fontFamily: font.medium,
    fontSize: 11.5,
    marginTop: 2,
  },
  about: {
    backgroundColor: vela.sheet,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 38,
    gap: 17,
  },
  aboutTitle: { color: '#fff', fontFamily: font.extrabold, fontSize: 24 },
  aboutRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  aboutIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: vela.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aboutRowTitle: { color: '#fff', fontFamily: font.bold, fontSize: 15 },
  aboutRowText: {
    color: vela.muted,
    fontFamily: font.medium,
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 2,
  },
});
