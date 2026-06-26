import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { RATIOS } from '../constants';
import { theme } from '../constants';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreate: (name: string, width: number, height: number) => void;
}

export function NewProjectModal({ visible, onClose, onCreate }: Props) {
  const [name, setName] = useState('Untitled');
  const [ratioKey, setRatioKey] = useState(RATIOS[0].key);

  function create() {
    const r = RATIOS.find((x) => x.key === ratioKey) ?? RATIOS[0];
    onCreate(name.trim() || 'Untitled', r.width, r.height);
    setName('Untitled');
    setRatioKey(RATIOS[0].key);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>New project</Text>

          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Untitled"
            placeholderTextColor={theme.muted}
            autoCapitalize="sentences"
          />

          <Text style={styles.label}>Aspect ratio</Text>
          <View style={styles.ratios}>
            {RATIOS.map((r) => {
              const on = r.key === ratioKey;
              return (
                <Pressable
                  key={r.key}
                  onPress={() => setRatioKey(r.key)}
                  style={[styles.ratio, on && styles.ratioOn]}
                >
                  <Text style={[styles.ratioLabel, on && styles.ratioLabelOn]}>{r.label}</Text>
                  <Text style={[styles.ratioHint, on && styles.ratioHintOn]}>{r.hint}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.actions}>
            <Pressable style={[styles.btn, styles.btnGhost]} onPress={onClose}>
              <Text style={styles.btnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnPrimary]} onPress={create}>
              <Text style={styles.btnPrimaryText}>Create</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000a', justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.surface2, padding: 20, paddingBottom: 40, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 10 },
  title: { color: theme.text, fontSize: 22, fontWeight: '700', marginBottom: 4 },
  label: { color: theme.subtext, fontSize: 13, marginTop: 8 },
  input: { backgroundColor: theme.surface, color: theme.text, borderRadius: 10, padding: 12, fontSize: 16 },
  ratios: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ratio: { flexGrow: 1, flexBasis: '47%', backgroundColor: theme.surface, borderRadius: 10, padding: 14, borderWidth: 2, borderColor: 'transparent' },
  ratioOn: { borderColor: theme.accent },
  ratioLabel: { color: theme.text, fontSize: 18, fontWeight: '700' },
  ratioLabelOn: { color: theme.accent },
  ratioHint: { color: theme.muted, fontSize: 12, marginTop: 2 },
  ratioHintOn: { color: theme.subtext },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  btn: { flex: 1, borderRadius: 12, padding: 15, alignItems: 'center' },
  btnGhost: { backgroundColor: theme.surface },
  btnGhostText: { color: theme.subtext, fontWeight: '600', fontSize: 16 },
  btnPrimary: { backgroundColor: theme.accent },
  btnPrimaryText: { color: theme.accentText, fontWeight: '700', fontSize: 16 },
});
