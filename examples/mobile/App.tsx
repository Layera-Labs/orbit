/**
 * Three tabs, three ideas, one project shared between two of them.
 *
 * No navigation library: this app has three screens that never stack, and
 * pulling in a router to switch between them would be the largest dependency
 * here by an order of magnitude.
 *
 * All three stay MOUNTED once visited, which is deliberate — unmounting the
 * Timeline while an export reads its project, or the Studio while a
 * generation polls, would throw away work the user is waiting on.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { ProjectProvider } from './src/project';
import StudioScreen from './src/screens/StudioScreen';
import TimelineScreen from './src/screens/TimelineScreen';
import ExportScreen from './src/screens/ExportScreen';
import { c, s } from './src/theme';

const TABS = [
  { key: 'studio', label: 'AI studio' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'export', label: 'Export' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function App() {
  const [tab, setTab] = useState<TabKey>('studio');
  const [seen, setSeen] = useState<Set<TabKey>>(() => new Set<TabKey>(['studio']));

  const open = (key: TabKey) => {
    setTab(key);
    setSeen((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  };

  return (
    <ProjectProvider>
      <View style={styles.app}>
        <StatusBar style="light" />
        <View style={{ height: Constants.statusBarHeight }} />
        <View style={styles.body}>
          {/* `display: none` rather than a conditional render: a hidden screen
              keeps its state, its in-flight job and its scroll position. */}
          {seen.has('studio') ? (
            <View style={[styles.pane, tab !== 'studio' && styles.hidden]}>
              <StudioScreen />
            </View>
          ) : null}
          {seen.has('timeline') ? (
            <View style={[styles.pane, tab !== 'timeline' && styles.hidden]}>
              <TimelineScreen />
            </View>
          ) : null}
          {seen.has('export') ? (
            <View style={[styles.pane, tab !== 'export' && styles.hidden]}>
              <ExportScreen />
            </View>
          ) : null}
        </View>

        <View style={styles.tabs}>
          {TABS.map((t) => {
            const on = t.key === tab;
            return (
              <Pressable
                key={t.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => open(t.key)}
                style={styles.tab}
                hitSlop={6}
              >
                {/* The active tab is said with type — colour and weight — not
                    marked with a dot bolted underneath it. */}
                <Text style={[styles.tabLabel, on && styles.tabLabelOn]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </ProjectProvider>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: c.ink },
  body: { flex: 1 },
  pane: { ...StyleSheet.absoluteFillObject },
  hidden: { display: 'none' },
  tabs: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.edge,
    backgroundColor: c.panel,
    paddingTop: 14,
    paddingBottom: 28,
    paddingHorizontal: s.gap,
  },
  tab: { flex: 1, alignItems: 'center' },
  tabLabel: { fontSize: 14, fontWeight: '500', color: c.faint },
  tabLabelOn: { color: c.accent, fontWeight: '700' },
});
