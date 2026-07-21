/**
 * Recent AI generations — a grid of past results. Tap one to re-insert it into
 * the timeline (downloads the remote result again via the store's insert-from-URL
 * actions). Results live on the render server's ephemeral storage, so an older
 * one may have expired; that surfaces as a friendly alert, not an error.
 */
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { font, vela } from '../constants';
import { newId } from '../model/editor-ops';
import { VIcon } from './VIcon';
import { BottomSheet } from './BottomSheet';
import { useEditor } from '../store/editorStore';
import { clearHistory, loadHistory, type GenRecord } from '../storage/genHistory';

export function GenHistorySheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const insertImageFromUrl = useEditor((s) => s.insertImageFromUrl);
  const insertVideoFromUrl = useEditor((s) => s.insertVideoFromUrl);
  const importVisual = useEditor((s) => s.importVisual);
  const setMediaDuration = useEditor((s) => s.setMediaDuration);
  const [records, setRecords] = useState<GenRecord[]>(() => loadHistory());
  const [insertingId, setInsertingId] = useState<string | null>(null);

  const close = () => setPanel(null);

  const insert = async (r: GenRecord) => {
    if (insertingId) return;
    setInsertingId(r.id);
    try {
      if (r.source === 'upload') {
        // Local file already in the media dir — insert it directly (no download).
        if (r.kind === 'image') {
          importVisual([{ id: newId('img'), type: 'image', src: r.url, start: 0, duration: 4 }]);
        } else {
          const dur = r.durationSec && r.durationSec > 0 ? r.durationSec : 5;
          setMediaDuration(r.url, dur);
          importVisual([{ id: newId('v'), type: 'video', src: r.url, start: 0, duration: dur, trimIn: 0, volume: 1 }]);
        }
      } else if (r.kind === 'image') {
        await insertImageFromUrl(r.url);
      } else {
        await insertVideoFromUrl(r.url, r.audioUrl, r.durationSec);
      }
      close();
    } catch {
      setInsertingId(null);
      Alert.alert('Unavailable', 'This item is no longer available.');
    }
  };

  const confirmClear = () => {
    Alert.alert('Clear Library', 'Remove everything from your Library? Your timeline clips are not affected.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => { clearHistory(); setRecords([]); } },
    ]);
  };

  return (
    <BottomSheet onClose={close} style={{ gap: 12, paddingBottom: 24 }}>
      <View style={s.head}>
        <Text style={s.title}>Library</Text>
        {records.length > 0 ? (
          <Pressable onPress={confirmClear} hitSlop={10}><Text style={s.clear}>Clear</Text></Pressable>
        ) : null}
      </View>

      {records.length === 0 ? (
        <View style={s.empty}>
          <VIcon name="fx" size={26} color={vela.muted3} strokeWidth={1.8} />
          <Text style={s.emptyText}>Your AI generations and uploads show up here.</Text>
        </View>
      ) : (
        <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
          <View style={s.grid}>
            {records.map((r) => (
              <Pressable key={r.id} style={s.tile} onPress={() => insert(r)}>
                <View style={s.thumb}>
                  <Image source={{ uri: r.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  {r.kind === 'video' ? (
                    <View style={s.badge}><VIcon name="play" size={12} color="#fff" strokeWidth={2.4} /></View>
                  ) : null}
                  {insertingId === r.id ? (
                    <View style={s.tileBusy}><ActivityIndicator color="#fff" /></View>
                  ) : null}
                </View>
                <Text style={s.caption} numberOfLines={1}>{r.prompt}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#fff', fontFamily: font.bold, fontSize: 18 },
  clear: { color: vela.muted, fontFamily: font.semibold, fontSize: 14 },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 40 },
  emptyText: { color: vela.muted2, fontFamily: font.medium, fontSize: 14.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '31.5%', gap: 6 },
  thumb: { width: '100%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: vela.card2 },
  badge: { position: 'absolute', left: 6, top: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  tileBusy: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  caption: { color: vela.textLight2, fontFamily: font.medium, fontSize: 11.5 },
});
