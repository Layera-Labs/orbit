/**
 * Floating bottom navigation. An honest 3-item bar: Home · Create · Discover.
 * Active state is a type/colour shift on the icon (no tinted pill); the centre
 * "+" lifts with a tight directional shadow (no coloured glow).
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { vela } from '../constants';
import { VIcon } from './VIcon';

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
      <Pressable style={styles.tab} onPress={onHome}>
        <VIcon name="navHome" size={25} color={active === 'home' ? vela.accent : vela.lightMuted} strokeWidth={active === 'home' ? 2.4 : 2} />
      </Pressable>
      <Pressable style={styles.fab} onPress={onCreate}>
        <VIcon name="plus" size={26} color={vela.onAccent} strokeWidth={2.6} />
      </Pressable>
      <Pressable style={styles.tab} onPress={onDiscover}>
        <VIcon name="search" size={25} color={active === 'discover' ? vela.accent : vela.lightMuted} strokeWidth={active === 'discover' ? 2.6 : 2.2} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 60,
    right: 60,
    bottom: 26,
    height: 62,
    borderRadius: 31,
    backgroundColor: vela.lightCard,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  tab: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  fab: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: vela.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
