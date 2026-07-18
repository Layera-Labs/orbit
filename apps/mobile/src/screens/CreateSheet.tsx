/**
 * New Project sheet. Opened from the bottom-nav "+". Pick a format and it
 * creates a real project at that ratio (adjustable later in the editor).
 */
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { font, vela, RATIOS, type RatioPreset } from '../constants';
import { VIcon } from '../components/VIcon';

// Proportional preview box for a ratio, scaled to fit a fixed height.
function RatioFrame({ preset }: { preset: RatioPreset }) {
  const H = 68;
  const w = Math.min(64, H * (preset.width / preset.height));
  const h = w * (preset.height / preset.width);
  return <View style={[styles.frame, { width: w, height: Math.min(H, h) }]} />;
}

export function CreateSheet({
  visible,
  onClose,
  onCreate,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: (width: number, height: number) => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ScrollView style={styles.root} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ height: 54 }} />
        <View style={styles.topRow}>
          <Text style={styles.title}>New Project</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <VIcon name="close" size={26} color={vela.ink2} strokeWidth={2.2} />
          </Pressable>
        </View>
        <Text style={styles.lead}>Pick a format to start — you can change it any time in the editor.</Text>

        <View style={styles.grid}>
          {RATIOS.map((r) => (
            <Pressable key={r.key} style={styles.card} onPress={() => onCreate(r.width, r.height)}>
              <View style={styles.frameWrap}>
                <RatioFrame preset={r} />
              </View>
              <Text style={styles.cardLabel}>{r.label}</Text>
              <Text style={styles.cardHint}>{r.hint}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: vela.homeBg },
  topRow: { paddingHorizontal: 22, paddingTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: font.extrabold, fontSize: 26, color: vela.ink, letterSpacing: -0.4 },
  lead: { paddingHorizontal: 22, paddingTop: 8, fontSize: 14.5, color: vela.ink3, fontFamily: font.medium, maxWidth: 320, lineHeight: 20 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 22, paddingTop: 22, gap: 14, justifyContent: 'space-between' },
  card: { width: '47%', backgroundColor: vela.lightCard, borderRadius: 16, paddingVertical: 20, alignItems: 'center', gap: 6 },
  frameWrap: { height: 72, alignItems: 'center', justifyContent: 'center' },
  frame: { borderRadius: 6, backgroundColor: vela.accentSoft, borderWidth: 1.5, borderColor: vela.accent },
  cardLabel: { fontFamily: font.bold, fontSize: 17, color: vela.ink, marginTop: 4 },
  cardHint: { fontSize: 12.5, color: vela.lightMuted, fontFamily: font.medium },
});
