import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppHeader } from '../components/AppHeader';
import { AuthSheet } from '../components/AuthSheet';
import { BottomNav } from '../components/BottomNav';
import { PrimaryButton } from '../components/OrbitUi';
import { VIcon, type VIconName } from '../components/VIcon';
import { font, vela } from '../constants';
import { openAi } from '../store/aiActions';
import { useAuth } from '../store/authStore';
import { useEditor, type AiIntent } from '../store/editorStore';
import { CreateSheet } from './CreateSheet';

const capabilities: Array<{ icon: VIconName; label: string }> = [
  { icon: 'video', label: 'AI Video Generation' },
  { icon: 'subtitle', label: 'Auto Captions & Transcribe' },
  { icon: 'audio', label: 'AI Voiceover & Text to Speech' },
  { icon: 'cutout', label: 'Background Removal' },
  { icon: 'text', label: 'Script Writer & Ideas' },
];

export function AiStudioScreen() {
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);
  const projects = useEditor((s) => s.projects);
  const go = useEditor((s) => s.go);
  const openProject = useEditor((s) => s.openProject);
  const newProject = useEditor((s) => s.newProject);
  const setPanel = useEditor((s) => s.setPanel);
  const credits = useEditor((s) => s.credits);
  const refreshCredits = useEditor((s) => s.refreshCredits);
  const [authOpen, setAuthOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const authed = status === 'authed';

  useEffect(() => {
    if (authed) void refreshCredits();
  }, [authed, refreshCredits]);

  function enterEditor(): void {
    const latest = [...projects].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (latest) openProject(latest.id);
    else newProject('AI Creation', 1080, 1920);
  }

  function launch(target: 'aigen' | 'tts', intent?: AiIntent): void {
    enterEditor();
    openAi(target, intent);
  }

  function openHistory(): void {
    enterEditor();
    setPanel('genhistory');
  }

  return (
    <View style={styles.root}>
      <AppHeader
        title='AI Studio'
        dark
        actions={[
          ...(authed
            ? [
                {
                  icon: 'bolt' as const,
                  label: 'Buy credits',
                  onPress: () => {
                    enterEditor();
                    setPanel('buycredits');
                  },
                  prominent: true,
                },
              ]
            : []),
          {
            icon: 'profile',
            label: 'Open profile',
            onPress: () => go('profile'),
          },
        ]}
      />
      <ScrollView contentInsetAdjustmentBehavior='automatic' showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.heroMark}>
          <LinearGradient colors={['#a94cf7', '#5b4bff']} style={styles.sparkHalo}>
            <VIcon name='fx' size={46} color='#fff' strokeWidth={1.7} />
          </LinearGradient>
        </View>

        {authed ? (
          <SignedInStudio email={user?.email} credits={credits} onImage={() => launch('aigen', { mode: 'image' })} onVideo={() => launch('aigen', { mode: 'video', source: 'text' })} onPhotoVideo={() => launch('aigen', { mode: 'video', source: 'photo' })} onVoice={() => launch('tts')} onHistory={openHistory} />
        ) : (
          <>
            <View style={styles.intro}>
              <Text style={styles.title}>Unlock the power of AI</Text>
              <Text style={styles.subtitle}>Sign in to access AI tools and supercharge your creativity.</Text>
            </View>
            <View style={styles.capabilities}>
              {capabilities.map((item) => (
                <View key={item.label} style={styles.capability}>
                  <VIcon name={item.icon} size={18} color={vela.textLight2} />
                  <Text style={styles.capabilityText}>{item.label}</Text>
                </View>
              ))}
            </View>
            <PrimaryButton label='Unlock AI Studio' onPress={() => setAuthOpen(true)} style={{ marginTop: 8 }} />
            <Text style={styles.optional}>AI is optional. Editing and export stay open to everyone.</Text>
          </>
        )}
      </ScrollView>

      <BottomNav dark active='ai' onHome={() => go('projects')} onTemplates={() => go('discover')} onCreate={() => setCreateOpen(true)} onAi={() => {}} />
      {authOpen ? <AuthSheet onClose={() => setAuthOpen(false)} onAuthed={() => setAuthOpen(false)} /> : null}
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

function SignedInStudio({ email, credits, onImage, onVideo, onPhotoVideo, onVoice, onHistory }: { email?: string; credits: number | null; onImage: () => void; onVideo: () => void; onPhotoVideo: () => void; onVoice: () => void; onHistory: () => void }) {
  const actions: Array<{
    label: string;
    detail: string;
    icon: VIconName;
    onPress: () => void;
  }> = [
    {
      label: 'Generate Image',
      detail: 'Prompt → visual',
      icon: 'image',
      onPress: onImage,
    },
    {
      label: 'Generate Video',
      detail: 'Prompt → clip',
      icon: 'video',
      onPress: onVideo,
    },
    {
      label: 'Photo to Video',
      detail: 'Animate a photo',
      icon: 'photos',
      onPress: onPhotoVideo,
    },
    {
      label: 'Voiceover',
      detail: 'Text → speech',
      icon: 'audio',
      onPress: onVoice,
    },
  ];
  return (
    <>
      <View style={styles.signedHead}>
        <View>
          <Text style={styles.signedEyebrow}>READY TO CREATE</Text>
          <Text style={styles.signedTitle}>Your AI toolkit</Text>
          {email ? <Text style={styles.signedEmail}>{email}</Text> : null}
        </View>
        <View style={styles.creditPill}>
          <VIcon name='bolt' size={14} color={vela.accent2} />
          <Text style={styles.creditText}>{credits ?? '—'}</Text>
        </View>
      </View>
      <View style={styles.toolGrid}>
        {actions.map((action) => (
          <Pressable key={action.label} style={styles.toolCard} onPress={action.onPress}>
            <View style={styles.toolIcon}>
              <VIcon name={action.icon} size={26} color={vela.accent2} />
            </View>
            <Text style={styles.toolTitle}>{action.label}</Text>
            <Text style={styles.toolDetail}>{action.detail}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable style={styles.history} onPress={onHistory}>
        <VIcon name='templates' size={20} color={vela.textLight} />
        <Text style={styles.historyText}>Generation history</Text>
        <VIcon name='chevronRight' size={17} color={vela.muted} />
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: vela.editorBg },
  content: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 118 },
  heroMark: { alignItems: 'center' },
  sparkHalo: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 34px rgba(147,63,242,0.34)',
  },
  intro: { alignItems: 'center', marginTop: 22 },
  title: {
    color: '#fff',
    fontFamily: font.extrabold,
    fontSize: 22,
    textAlign: 'center',
  },
  subtitle: {
    color: vela.muted,
    fontFamily: font.medium,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 290,
    marginTop: 7,
  },
  capabilities: { gap: 14, marginTop: 28, marginBottom: 24 },
  capability: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  capabilityText: {
    color: vela.textLight,
    fontFamily: font.medium,
    fontSize: 14.5,
  },
  optional: {
    color: vela.muted2,
    fontFamily: font.medium,
    fontSize: 11.5,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 14,
  },
  signedHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
  },
  signedEyebrow: {
    color: vela.accent2,
    fontFamily: font.bold,
    fontSize: 10.5,
    letterSpacing: 1.2,
  },
  signedTitle: {
    color: '#fff',
    fontFamily: font.extrabold,
    fontSize: 25,
    marginTop: 4,
  },
  signedEmail: {
    color: vela.muted,
    fontFamily: font.medium,
    fontSize: 12,
    marginTop: 3,
  },
  creditPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(147,63,242,0.14)',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  creditText: { color: '#fff', fontFamily: font.bold, fontSize: 13 },
  toolGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
    marginTop: 24,
  },
  toolCard: {
    width: '48%',
    minHeight: 142,
    backgroundColor: vela.card,
    borderRadius: 18,
    borderCurve: 'continuous',
    padding: 15,
    justifyContent: 'flex-end',
    borderWidth: 1,
    borderColor: vela.divider,
  },
  toolIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: 'rgba(147,63,242,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  toolTitle: { color: '#fff', fontFamily: font.bold, fontSize: 14 },
  toolDetail: {
    color: vela.muted,
    fontFamily: font.medium,
    fontSize: 11.5,
    marginTop: 3,
  },
  history: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: vela.card,
    borderRadius: 15,
    borderCurve: 'continuous',
    padding: 16,
    marginTop: 14,
  },
  historyText: {
    flex: 1,
    color: vela.textLight,
    fontFamily: font.semibold,
    fontSize: 14,
  },
});
