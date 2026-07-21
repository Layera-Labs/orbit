/**
 * AI hub — the single home for every AI feature, opened from the gold "AI" button
 * in the editor top bar. Each tile routes into the existing flows (seeding the
 * generate modal's mode/source), gating through the auth sheet when logged out.
 * The credit balance sits up top and taps through to buy more.
 */
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { font, vela } from '../constants';
import { VIcon, type VIconName } from './VIcon';
import { BottomSheet } from './BottomSheet';
import { useEditor } from '../store/editorStore';
import { openAi } from '../store/aiActions';

type Action = { label: string; icon: VIconName; onPress: () => void };

export function AiHubSheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const credits = useEditor((s) => s.credits);
  const refreshCredits = useEditor((s) => s.refreshCredits);
  const close = () => setPanel(null);

  useEffect(() => {
    void refreshCredits();
  }, [refreshCredits]);

  const actions: Action[] = [
    { label: 'Image', icon: 'image', onPress: () => openAi('aigen', { mode: 'image' }) },
    { label: 'Video', icon: 'video', onPress: () => openAi('aigen', { mode: 'video', source: 'text' }) },
    { label: 'Photo → Video', icon: 'photos', onPress: () => openAi('aigen', { mode: 'video', source: 'photo' }) },
    { label: 'Voiceover', icon: 'audio', onPress: () => openAi('tts') },
    { label: 'Library', icon: 'templates', onPress: () => setPanel('genhistory') },
  ];

  return (
    <BottomSheet onClose={close} style={{ gap: 14, paddingBottom: 26 }}>
      <View style={s.head}>
        <View style={s.title}>
          <VIcon name="fx" size={20} color={vela.accent} strokeWidth={2} />
          <Text style={s.titleText}>AI</Text>
        </View>
        <Pressable onPress={() => setPanel('buycredits')} style={s.creditPill} hitSlop={8}>
          <VIcon name="bolt" size={12} color={vela.accent} strokeWidth={2.2} />
          <Text style={s.creditText}>{credits == null ? '—' : credits}</Text>
          <VIcon name="plus" size={11} color={vela.accent} strokeWidth={2.6} />
        </Pressable>
      </View>

      <View style={s.grid}>
        {actions.map((a) => (
          <Pressable key={a.label} style={s.tile} onPress={a.onPress}>
            <VIcon name={a.icon} size={28} color={vela.accent} strokeWidth={1.9} />
            <Text style={s.tileLabel} numberOfLines={1}>{a.label}</Text>
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleText: { color: '#fff', fontFamily: font.extrabold, fontSize: 21 },
  creditPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, backgroundColor: vela.accentSoft },
  creditText: { color: vela.accent, fontFamily: font.semibold, fontSize: 12.5 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '31.5%', height: 104, borderRadius: 18, backgroundColor: vela.card2, alignItems: 'center', justifyContent: 'center', gap: 10 },
  tileLabel: { color: '#fff', fontFamily: font.semibold, fontSize: 13.5, paddingHorizontal: 4 },
});
