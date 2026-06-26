/**
 * Floating bottom navigation (Vela "isBrowse" bar). Home + Discover are real
 * tabs; the centre "+" opens Create; Templates / Profile are tagged soon.
 */
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { vela } from '../constants';
import { VIcon } from './VIcon';

const soon = (label: string) => Alert.alert('Coming soon', `${label} is coming soon.`);

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
  return (
    <View style={styles.bar}>
      <Pressable style={[styles.tab, active === 'home' && styles.tabOn]} onPress={onHome}>
        <VIcon name="navHome" size={24} color={active === 'home' ? vela.accent : vela.lightMuted} />
      </Pressable>
      <Pressable style={[styles.tab, active === 'discover' && styles.tabOn]} onPress={onDiscover}>
        <VIcon name="search" size={24} color={active === 'discover' ? vela.accent : vela.lightMuted} strokeWidth={2} />
      </Pressable>
      <Pressable style={styles.fab} onPress={onCreate}>
        <VIcon name="plus" size={26} color="#fff" strokeWidth={2.6} />
      </Pressable>
      <Pressable style={styles.tab} onPress={() => soon('Templates')}>
        <VIcon name="templates" size={24} color={vela.lightMuted} />
      </Pressable>
      <Pressable style={styles.tab} onPress={() => soon('Profile')}>
        <VIcon name="profile" size={24} color={vela.lightMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 22,
    height: 62,
    borderRadius: 34,
    backgroundColor: 'rgba(255,255,255,0.94)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    shadowColor: '#141428',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  tab: { width: 48, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: 'rgba(109,74,255,0.12)' },
  fab: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: vela.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: vela.accent,
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
});
