/**
 * Floating quick-action bar (CapCut-style) shown over the timeline whenever a
 * clip/overlay is selected: Edit · Motion · Keyframe · Curve · Lock · Duplicate
 * · Delete. Styled in Vela's dark surface. Edit, Duplicate and Delete are real;
 * the rest are tagged "soon" (Curve is greyed as in CapCut).
 */
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { font, vela } from '../constants';
import { VIcon, type VIconName } from './VIcon';
import { OVERLAY_TRACK, useEditor } from '../store/editorStore';

const soon = (label: string) => Alert.alert('Coming soon', `${label} is coming soon.`);

interface Action {
  key: string;
  icon: VIconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

export function SelectionActionBar() {
  const selected = useEditor((s) => s.selected);
  const removeSelected = useEditor((s) => s.removeSelected);
  const duplicateSelected = useEditor((s) => s.duplicateSelected);
  const setPanel = useEditor((s) => s.setPanel);
  if (!selected) return null;

  const isText = selected.trackId === OVERLAY_TRACK;
  const actions: Action[] = [
    { key: 'edit', icon: 'pencil', label: 'Edit', onPress: isText ? () => setPanel('textedit') : () => setPanel('filter') },
    { key: 'motion', icon: 'motion', label: 'Motion', onPress: isText ? () => soon('Motion') : () => setPanel('motion') },
    { key: 'keyframe', icon: 'keyframe', label: 'Keyframe', onPress: isText ? () => soon('Keyframe') : () => setPanel('keyframe') },
    { key: 'curve', icon: 'curve', label: 'Curve', onPress: () => soon('Curve'), disabled: true },
    { key: 'duplicate', icon: 'duplicate', label: 'Duplicate', onPress: duplicateSelected },
    { key: 'delete', icon: 'trash', label: 'Delete', onPress: removeSelected },
  ];

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.bar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
          {actions.map((a) => (
            <Pressable key={a.key} style={styles.item} onPress={a.onPress}>
              <VIcon name={a.icon} size={21} color={a.disabled ? vela.muted3 : vela.textLight} strokeWidth={1.8} />
              <Text style={[styles.label, a.disabled && { color: vela.muted3 }]}>{a.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: -22, left: 0, right: 0, alignItems: 'center', zIndex: 30 },
  bar: {
    maxWidth: '96%',
    backgroundColor: '#26262d',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#3a3a42',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  content: { paddingHorizontal: 4, paddingVertical: 10 },
  item: { width: 51, alignItems: 'center', gap: 6 },
  label: { color: vela.textLight2, fontSize: 10.5, fontFamily: font.medium },
});
