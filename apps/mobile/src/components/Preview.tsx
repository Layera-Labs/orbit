/**
 * Multi-track live preview. The bottom visual track is the BASE — its active
 * clip drives a single expo-video player (or a full-frame image). Higher visual
 * tracks render as positioned overlays by their normalized `rect`: images live,
 * videos as a static poster frame (compositing multiple live videos on-device
 * is too costly — the server export is the true composite). A JS transport clock
 * advances the playhead; added audio mixes only in the export.
 */
import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { theme } from '../constants';
import { clipAtTime } from '../model/editor-ops';
import { projectDuration } from '../model/project';
import type { TextOverlay, VisualTrack, VisualTrackClip } from '../model/types';
import { videoThumbnail } from '../storage/media';
import { useEditor } from '../store/editorStore';

const TICK_MS = 50;
const SEEK_EPS = 0.25;
const posterCache = new Map<string, string>();

/** A positioned overlay layer (image live, video as a poster). */
function OverlayLayer({ clip, width, height }: { clip: VisualTrackClip; width: number; height: number }) {
  const r = clip.rect ?? { x: 0, y: 0, w: 1, h: 1 };
  const style = { position: 'absolute' as const, left: r.x * width, top: r.y * height, width: r.w * width, height: r.h * height };

  const [poster, setPoster] = useState<string | undefined>(clip.type === 'image' ? clip.src : posterCache.get(clip.src));
  useEffect(() => {
    let alive = true;
    if (clip.type === 'video' && !posterCache.has(clip.src)) {
      videoThumbnail(clip.src, clip.trimIn ?? 0).then((t) => {
        if (t) {
          posterCache.set(clip.src, t);
          if (alive) setPoster(t);
        }
      });
    }
    return () => {
      alive = false;
    };
  }, [clip.src, clip.type, clip.type === 'video' ? clip.trimIn : 0]);

  return (
    <View style={[style, styles.overlayLayer]}>
      {poster ? <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
    </View>
  );
}

export function Preview({ width, height }: { width: number; height: number }) {
  const project = useEditor((s) => s.project);
  const playheadSec = useEditor((s) => s.playheadSec);
  const isPlaying = useEditor((s) => s.isPlaying);
  const setPlayhead = useEditor((s) => s.setPlayhead);
  const setPlaying = useEditor((s) => s.setPlaying);

  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
  });
  const loadedSrc = useRef<string | null>(null);

  const total = project ? projectDuration(project) : 0;
  const lookupT = total > 0 ? Math.min(playheadSec, total - 0.01) : playheadSec;
  const visualTracks = (project?.tracks ?? []).filter((t): t is VisualTrack => t.kind === 'visual');
  const base = visualTracks[0];
  const overlayTracks = visualTracks.slice(1);
  const baseActive = base ? (clipAtTime(base, lookupT) as VisualTrackClip | undefined) : undefined;

  useEffect(() => {
    if (baseActive && baseActive.type === 'video') {
      if (loadedSrc.current !== baseActive.src) {
        loadedSrc.current = baseActive.src;
        player.replaceAsync(baseActive.src).catch(() => {});
      }
    } else {
      loadedSrc.current = null;
      player.pause();
    }
  }, [baseActive?.id, baseActive?.type, baseActive?.src, player]);

  useEffect(() => {
    if (!baseActive || baseActive.type !== 'video') {
      player.pause();
      return;
    }
    const sourceTime = (baseActive.trimIn ?? 0) + (playheadSec - baseActive.start);
    if (isPlaying) {
      if (Math.abs(player.currentTime - sourceTime) > SEEK_EPS * 6) player.currentTime = sourceTime;
      player.play();
    } else {
      player.pause();
      if (Math.abs(player.currentTime - sourceTime) > SEEK_EPS) player.currentTime = Math.max(0, sourceTime);
    }
  }, [baseActive?.id, isPlaying, playheadSec, player]);

  useEffect(() => {
    if (!isPlaying || !project) return;
    let last = Date.now();
    let acc = playheadSec >= total ? 0 : playheadSec;
    const timer = setInterval(() => {
      const now = Date.now();
      acc += (now - last) / 1000;
      last = now;
      if (acc >= total) {
        setPlayhead(total);
        setPlaying(false);
        return;
      }
      setPlayhead(acc);
    }, TICK_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, total, project?.id]);

  const overlays = (project?.overlays ?? []).filter((o) => playheadSec >= o.start && playheadSec <= o.end);
  const scale = project ? width / project.width : 1;

  // Active overlay clips, bottom track → top.
  const activeOverlays = overlayTracks
    .map((t) => clipAtTime(t, lookupT) as VisualTrackClip | undefined)
    .filter((c): c is VisualTrackClip => !!c);

  return (
    <View style={[styles.frame, { width, height }]}>
      {baseActive?.type === 'video' ? (
        <VideoView style={StyleSheet.absoluteFill} player={player} contentFit="contain" nativeControls={false} />
      ) : null}
      {baseActive?.type === 'image' ? <Image source={{ uri: baseActive.src }} style={StyleSheet.absoluteFill} resizeMode="contain" /> : null}
      {!baseActive ? <Text style={styles.empty}>{total > 0 ? '' : 'Empty — import media'}</Text> : null}

      {activeOverlays.map((c) => (
        <OverlayLayer key={c.id} clip={c} width={width} height={height} />
      ))}

      {overlays.map((o: TextOverlay) => (
        <View key={o.id} style={[styles.textOverlay, { top: o.y * height }]} pointerEvents="none">
          <Text style={{ color: o.color, fontSize: Math.max(8, o.fontSize * scale), fontWeight: o.bold ? '700' : '400', textAlign: o.align ?? 'center', width: '90%' }}>
            {o.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { backgroundColor: '#000', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
  empty: { color: theme.muted, fontSize: 14 },
  overlayLayer: { overflow: 'hidden', borderRadius: 4, backgroundColor: '#0006' },
  textOverlay: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  playBtn: { position: 'absolute', bottom: 8, alignSelf: 'center' },
  playPill: { backgroundColor: '#000a', borderRadius: 20, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  playGlyph: { color: '#fff', fontSize: 16 },
});
