/**
 * Orbit's persistent navigation: four destinations in the original iOS 26
 * liquid-glass pill, plus a distinct floating Create button on the right.
 */
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { font, vela } from '../constants';
import { VIcon, type VIconName } from './VIcon';
import { Glass } from './Glass';
import { BottomSheet } from './BottomSheet';
import { OrbitMark } from './OrbitMark';

export type MainTab = 'home' | 'templates' | 'ai' | 'premium';

/** Three nav layouts:
 *  - `pill`   compact glass pill + a separate Create button floating right.
 *  - `dock`   full-width glass dock, Create raised through a centre notch.
 *  - `inline` one flat glass bar, Create sitting inline as the middle slot
 *             (nothing floats or breaks the bar's silhouette). */
export type NavVariant = 'pill' | 'dock' | 'inline';

/** The layout every screen uses. Flip this one value to try another look
 *  (individual screens can still override with the `variant` prop). */
const DEFAULT_VARIANT: NavVariant = 'inline';

interface BottomNavProps {
  active?: Exclude<MainTab, 'premium'>;
  onHome: () => void;
  onTemplates: () => void;
  onCreate: () => void;
  onAi: () => void;
  dark?: boolean;
  variant?: NavVariant;
}

export function BottomNav({ active, onHome, onTemplates, onCreate, onAi, dark = false, variant = DEFAULT_VARIANT }: BottomNavProps) {
  const [premiumOpen, setPremiumOpen] = useState(false);
  const tabs: Array<{
    key: MainTab;
    label: string;
    icon: VIconName;
    onPress: () => void;
  }> = [
    { key: 'home', label: 'Home', icon: 'navHome', onPress: onHome },
    {
      key: 'templates',
      label: 'Templates',
      icon: 'layout',
      onPress: onTemplates,
    },
    { key: 'ai', label: 'AI Studio', icon: 'fx', onPress: onAi },
    { key: 'premium', label: 'Premium', icon: 'crown', onPress: () => setPremiumOpen(true) },
  ];
  const idle = dark ? vela.textLight2 : vela.ink3;

  const renderTab = (tab: (typeof tabs)[number]) => {
    const selected = tab.key === 'premium' ? premiumOpen : active === tab.key;
    return (
      <Pressable key={tab.key} accessibilityRole='tab' accessibilityLabel={tab.label} accessibilityState={{ selected }} style={styles.tab} onPress={tab.onPress} hitSlop={4}>
        {/* Icon-only tabs: a soft accent pill carries the active state (no labels). */}
        <View style={[styles.iconHolder, selected && styles.iconHolderOn]}>
          <VIcon name={tab.icon} size={22} color={selected ? vela.accent : idle} strokeWidth={selected ? 2.3 : 1.9} />
        </View>
      </Pressable>
    );
  };

  const glassFallback = dark ? 'rgba(18,23,34,0.98)' : 'rgba(255,255,255,0.98)';

  if (variant === 'inline') {
    return (
      <View style={styles.inlineWrap} pointerEvents='box-none'>
        <Glass style={styles.inlineBar} fallbackColor={glassFallback} interactive colorScheme={dark ? 'dark' : 'light'}>
          {tabs.slice(0, 2).map(renderTab)}
          <Pressable
            accessibilityRole='button'
            accessibilityLabel='Create new project'
            style={styles.tab}
            onPress={onCreate}
            hitSlop={4}
          >
            {({ pressed }) => (
              <View style={[styles.inlineCreate, pressed && styles.createPressed]}>
                <VIcon name='plus' size={24} color='#fff' strokeWidth={2.7} />
              </View>
            )}
          </Pressable>
          {tabs.slice(2).map(renderTab)}
        </Glass>

        {premiumOpen ? <PremiumSheet onClose={() => setPremiumOpen(false)} /> : null}
      </View>
    );
  }

  if (variant === 'dock') {
    return (
      <View style={styles.dockWrap} pointerEvents='box-none'>
        <Glass style={styles.dockBar} fallbackColor={glassFallback} interactive colorScheme={dark ? 'dark' : 'light'}>
          {tabs.slice(0, 2).map(renderTab)}
          {/* Reserved slot under the raised centre Create button. */}
          <View style={styles.dockNotch} />
          {tabs.slice(2).map(renderTab)}
        </Glass>

        <Pressable accessibilityRole='button' accessibilityLabel='Create new project' style={({ pressed }) => [styles.dockFab, pressed && styles.createPressed]} onPress={onCreate}>
          <VIcon name='plus' size={26} color='#fff' strokeWidth={2.7} />
        </Pressable>

        {premiumOpen ? <PremiumSheet onClose={() => setPremiumOpen(false)} /> : null}
      </View>
    );
  }

  return (
    <View style={styles.wrap} pointerEvents='box-none'>
      <Glass style={styles.bar} fallbackColor={glassFallback} interactive colorScheme={dark ? 'dark' : 'light'}>
        {tabs.map(renderTab)}
      </Glass>

      <Pressable accessibilityRole='button' accessibilityLabel='Create new project' style={({ pressed }) => [styles.fab, pressed && styles.createPressed]} onPress={onCreate}>
        <VIcon name='plus' size={28} color='#fff' strokeWidth={2.7} />
      </Pressable>

      {premiumOpen ? <PremiumSheet onClose={() => setPremiumOpen(false)} /> : null}
    </View>
  );
}

function PremiumSheet({ onClose }: { onClose: () => void }) {
  const perks = ['Unlimited projects and folders', '4K and HDR10 export', 'No watermark', 'Priority cloud renders'];
  return (
    <BottomSheet onClose={onClose} dim='#0008'>
      <View style={styles.premiumHead}>
        <OrbitMark size={34} />
        <Text style={styles.premiumTitle}>Orbit <Text style={{ color: vela.accent }}>Premium</Text></Text>
      </View>
      <Text style={styles.premiumLead}>Professional creation tools, all unlocked.</Text>
      <View style={styles.perks}>
        {perks.map((perk) => (
          <View key={perk} style={styles.perk}>
            <VIcon name='check' size={18} color={vela.accent} strokeWidth={2.6} />
            <Text style={styles.perkText}>{perk}</Text>
          </View>
        ))}
      </View>
      <Pressable style={styles.premiumCta} onPress={() => Alert.alert('Orbit Premium', 'Orbit Premium is coming soon.')}>
        <Text style={styles.premiumCtaText}>Coming soon</Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 106,
    justifyContent: 'flex-end',
    zIndex: 40,
  },
  bar: {
    position: 'absolute',
    left: 12,
    right: 88,
    bottom: 24,
    height: 62,
    borderRadius: 31,
    borderCurve: 'continuous',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(130,130,150,0.18)',
  },
  tab: {
    flex: 1,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconHolder: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconHolderOn: { backgroundColor: vela.accentSoft },
  // ---- inline variant: one flat bar, Create is the middle slot ----
  inlineWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 92,
    justifyContent: 'flex-end',
    zIndex: 40,
  },
  inlineBar: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 12,
    height: 64,
    borderRadius: 30,
    borderCurve: 'continuous',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(130,130,150,0.18)',
  },
  inlineCreate: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: vela.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ---- dock variant: full-width bar, Create raised in the centre ----
  dockWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 122,
    justifyContent: 'flex-end',
    zIndex: 40,
  },
  dockBar: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 12,
    height: 64,
    borderRadius: 30,
    borderCurve: 'continuous',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(130,130,150,0.18)',
  },
  dockNotch: { width: 72 },
  dockFab: {
    position: 'absolute',
    left: '50%',
    marginLeft: -29,
    bottom: 42,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: vela.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
    boxShadow: '0 6px 16px rgba(71,53,220,0.32)',
  },
  fab: {
    position: 'absolute',
    right: 12,
    bottom: 24,
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: vela.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
    boxShadow: '0 6px 16px rgba(71,53,220,0.32)',
  },
  createPressed: {
    transform: [{ scale: 0.94 }],
    backgroundColor: vela.accentDim,
  },
  premiumHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 4 },
  premiumTitle: { color: '#fff', fontFamily: font.extrabold, fontSize: 24 },
  premiumLead: { color: vela.muted, fontFamily: font.medium, fontSize: 14, marginTop: 2, marginBottom: 8 },
  perks: { gap: 12, marginTop: 6 },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  perkText: { color: vela.textLight, fontFamily: font.medium, fontSize: 15.5 },
  premiumCta: { marginTop: 20, height: 54, borderRadius: 16, backgroundColor: vela.accent, alignItems: 'center', justifyContent: 'center' },
  premiumCtaText: { color: vela.onAccent, fontFamily: font.bold, fontSize: 17 },
});
