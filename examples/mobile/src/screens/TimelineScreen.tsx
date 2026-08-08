/**
 * The editor timeline: import media, order it, trim it, scrub it.
 *
 * Two things here are worth copying rather than reinventing.
 *
 * **The playhead does not move; the timeline does.** It is pinned to the centre
 * of the viewport and the track scrolls underneath, so the current time is
 * simply the scroll offset divided by the zoom. That is one number, always
 * consistent, and it sidesteps the gesture fight you get from putting a
 * draggable playhead inside a horizontally scrolling track.
 *
 * **A trim commits once, on release.** The drag keeps a local draft and only
 * the finger lifting writes to the project. Applying every movement would push
 * sixty edits per second into whatever holds the undo stack.
 */
import { useRef, useState } from 'react';
import {
  Alert,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Button, Card, Notice, Screen } from '../ui';
import { c, s, type } from '../theme';
import { useProject } from '../project';
import {
  addClips,
  clipAt,
  clipsOf,
  formatTime,
  MIN_CLIP,
  moveClip,
  removeClip,
  totalDuration,
  trimClip,
  type MediaAsset,
} from '../orbit/timeline';
import type { VisualTrackClip } from '../orbit/types';

/** Zoom, in points per second of timeline. */
const PPS = 46;
const TRACK_H = 68;
const HANDLE_W = 22;

export default function TimelineScreen() {
  const { project, setProject, reset, sourceDurationOf, rememberDuration } = useProject();
  const clips = clipsOf(project);
  const total = totalDuration(clips);

  const [viewport, setViewport] = useState(0);
  const [time, setTime] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ id: string; edge: 'in' | 'out'; delta: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<ScrollView>(null);

  const onLayout = (e: LayoutChangeEvent) => setViewport(e.nativeEvent.layout.width);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    setTime(Math.min(Math.max(x / PPS, 0), total));
  };

  async function pick() {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('This example needs access to your photo library to put clips on the timeline.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos', 'images'],
      allowsMultipleSelection: true,
      quality: 1,
    });
    if (res.canceled) return;

    const assets: MediaAsset[] = res.assets.map((a) => {
      // The picker reports video length in MILLISECONDS, and omits it for a
      // still. Reading it as seconds gives every clip a three-hour source and
      // a trim that can be dragged into black.
      const seconds = a.duration != null ? a.duration / 1000 : undefined;
      if (seconds != null) rememberDuration(a.uri, seconds);
      return { uri: a.uri, type: a.type === 'video' ? 'video' : 'image', durationSec: seconds };
    });
    const next = addClips(project, assets);
    setProject(next);
    // Select what just arrived, so the inspector is open and the trim handles
    // are on screen without a second tap nobody knows to make.
    if (!selected) setSelected(clipsOf(next)[clipsOf(project).length]?.id ?? null);
  }

  const current = clipAt(clips, time);
  const chosen = clips.find((cl) => cl.id === selected) ?? null;

  return (
    <Screen
      title="Timeline"
      lede="A clip is plain JSON: a source, a start, a length, an in-point. Everything below is arithmetic over that, with no renderer involved."
      footer={
        <View style={styles.footerRow}>
          <View style={{ flex: 1 }}>
            <Button label={clips.length ? 'Add more' : 'Add clips'} onPress={pick} />
          </View>
          {clips.length ? (
            <View style={{ flex: 1 }}>
              <Button
                label="Clear"
                tone="quiet"
                onPress={() =>
                  Alert.alert('Clear the timeline?', 'This removes every clip.', [
                    { text: 'Keep', style: 'cancel' },
                    {
                      text: 'Clear',
                      style: 'destructive',
                      onPress: () => {
                        reset();
                        setSelected(null);
                        setTime(0);
                        scroller.current?.scrollTo({ x: 0, animated: false });
                      },
                    },
                  ])
                }
              />
            </View>
          ) : null}
        </View>
      }
    >
      <Card>
        <View style={styles.readout}>
          <Text style={styles.clock}>{formatTime(time)}</Text>
          <Text style={type.mono}>
            {clips.length ? `${formatTime(total)} total · ${clips.length} clips` : 'empty'}
          </Text>
        </View>

        <View onLayout={onLayout} style={styles.trackWrap}>
          {clips.length === 0 ? (
            <View style={styles.empty}>
              <Text style={[type.body, { textAlign: 'center' }]}>
                Nothing on the track yet.{'\n'}Add a few videos or photos to start.
              </Text>
            </View>
          ) : (
            <>
              <ScrollView
                ref={scroller}
                horizontal
                showsHorizontalScrollIndicator={false}
                onScroll={onScroll}
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingHorizontal: viewport / 2 }}
              >
                <View style={{ width: Math.max(total * PPS, 1) }}>
                  <Ruler seconds={total} />
                  <View style={styles.track}>
                    {clips.map((clip) => (
                      <ClipBlock
                        key={clip.id}
                        clip={clip}
                        selected={clip.id === selected}
                        draftDelta={draft?.id === clip.id ? draft : null}
                        onSelect={() => setSelected(clip.id === selected ? null : clip.id)}
                        onDraft={setDraft}
                        onCommit={(edge, delta) => {
                          setDraft(null);
                          if (Math.abs(delta) > 0.001) {
                            setProject(trimClip(project, clip.id, edge, delta, sourceDurationOf));
                          }
                        }}
                      />
                    ))}
                  </View>
                </View>
              </ScrollView>
              {/* Drawn over the track, not inside the scroller, so it stays put. */}
              <View pointerEvents="none" style={[styles.playhead, { left: viewport / 2 }]} />
            </>
          )}
        </View>

        {clips.length ? (
          <Text style={[type.mono, styles.underTrack]}>
            {current ? `at ${formatTime(time)} · ${label(current, clips.indexOf(current))}` : '—'}
          </Text>
        ) : null}
      </Card>

      {chosen ? (
        <Inspector
          clip={chosen}
          index={clips.indexOf(chosen)}
          sourceSec={sourceDurationOf(chosen.src)}
          onMove={(dir) => setProject(moveClip(project, chosen.id, dir))}
          onRemove={() => {
            setProject(removeClip(project, chosen.id));
            setSelected(null);
          }}
        />
      ) : clips.length ? (
        <Text style={[type.body, { marginTop: s.gap }]}>
          Tap a clip to select it, then drag either edge to trim. Scroll the track to move the
          playhead.
        </Text>
      ) : null}

      {error ? <Notice text={error} /> : null}
    </Screen>
  );
}

const label = (clip: VisualTrackClip, index: number): string =>
  `clip ${index + 1} · ${clip.type} · in ${(clip.trimIn ?? 0).toFixed(1)}s`;

/**
 * One tick a second, numbered every five, so the row does not turn to mush.
 *
 * The mark and its label are positioned SEPARATELY and both anchor to the left
 * edge. Wrapping them in one absolutely-positioned box does not work: the box
 * shrinks to its widest child, which is the label, and `alignItems: 'center'`
 * then centres the mark over the LABEL rather than over its own second. Every
 * numbered tick lands a few points late, and the drift is just small enough to
 * look like sloppy rendering rather than a bug.
 */
function Ruler({ seconds }: { seconds: number }) {
  const ticks = Math.ceil(seconds);
  return (
    <View style={styles.ruler}>
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const major = i % 5 === 0;
        return (
          <View key={i}>
            <View
              style={[
                styles.tickMark,
                { left: i * PPS },
                major && { height: 8, backgroundColor: c.faint },
              ]}
            />
            {major ? <Text style={[styles.tickLabel, { left: i * PPS + 4 }]}>{i}s</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

function ClipBlock({
  clip,
  selected,
  draftDelta,
  onSelect,
  onDraft,
  onCommit,
}: {
  clip: VisualTrackClip;
  selected: boolean;
  draftDelta: { edge: 'in' | 'out'; delta: number } | null;
  onSelect: () => void;
  onDraft: (d: { id: string; edge: 'in' | 'out'; delta: number }) => void;
  onCommit: (edge: 'in' | 'out', delta: number) => void;
}) {
  // A drag on either edge shortens the block the same way, because the track is
  // packed: trimming the head does not move this clip's start, it moves
  // everything after it. So the draft only has to change the width.
  const shown = draftDelta
    ? clip.duration + (draftDelta.edge === 'out' ? draftDelta.delta : -draftDelta.delta)
    : clip.duration;
  const width = Math.max(MIN_CLIP, shown) * PPS;

  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${clip.type} clip, ${clip.duration.toFixed(1)} seconds`}
      style={[styles.clip, { width }, selected && styles.clipOn]}
    >
      <Text numberOfLines={1} style={[styles.clipLabel, selected && { color: c.accent }]}>
        {clip.type === 'video' ? 'video' : 'still'}
      </Text>
      <Text style={styles.clipTime}>{clip.duration.toFixed(1)}s</Text>
      {selected ? (
        <>
          <TrimHandle
            edge="in"
            onDrag={(d) => onDraft({ id: clip.id, edge: 'in', delta: d })}
            onEnd={(d) => onCommit('in', d)}
          />
          <TrimHandle
            edge="out"
            onDrag={(d) => onDraft({ id: clip.id, edge: 'out', delta: d })}
            onEnd={(d) => onCommit('out', d)}
          />
        </>
      ) : null}
    </Pressable>
  );
}

function TrimHandle({
  edge,
  onDrag,
  onEnd,
}: {
  edge: 'in' | 'out';
  onDrag: (deltaSec: number) => void;
  onEnd: (deltaSec: number) => void;
}) {
  const last = useRef(0);
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      // Captured on MOVE as well, so the enclosing horizontal ScrollView does
      // not take the gesture the moment the finger travels sideways — which is
      // the only direction a trim ever goes.
      onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dx) > 2,
      onPanResponderMove: (_e, g) => {
        last.current = g.dx / PPS;
        onDrag(last.current);
      },
      onPanResponderRelease: () => onEnd(last.current),
      onPanResponderTerminate: () => onEnd(last.current),
    }),
  ).current;

  return (
    <View
      {...responder.panHandlers}
      accessibilityLabel={edge === 'in' ? 'Trim the start' : 'Trim the end'}
      style={[styles.handle, edge === 'in' ? { left: 0 } : { right: 0 }]}
    >
      <View style={styles.handleGrip} />
    </View>
  );
}

function Inspector({
  clip,
  index,
  sourceSec,
  onMove,
  onRemove,
}: {
  clip: VisualTrackClip;
  index: number;
  sourceSec?: number;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const rows: [string, string][] = [
    ['position', `${index + 1}`],
    ['starts at', `${clip.start.toFixed(2)}s`],
    ['plays for', `${clip.duration.toFixed(2)}s`],
    ['source in', `${(clip.trimIn ?? 0).toFixed(2)}s`],
    ['source is', sourceSec != null ? `${sourceSec.toFixed(2)}s` : 'unmeasured'],
  ];
  return (
    <Card style={{ marginTop: s.gap }}>
      <Text style={type.heading}>Selected clip</Text>
      <View style={{ marginTop: s.gap }}>
        {rows.map(([k, v]) => (
          <View key={k} style={styles.row}>
            <Text style={type.label}>{k}</Text>
            <Text style={type.mono}>{v}</Text>
          </View>
        ))}
      </View>
      <View style={[styles.footerRow, { marginTop: s.gap }]}>
        <View style={{ flex: 1 }}>
          <Button label="Earlier" tone="quiet" onPress={() => onMove(-1)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Later" tone="quiet" onPress={() => onMove(1)} />
        </View>
      </View>
      <View style={{ marginTop: s.gap }}>
        <Button label="Remove" tone="quiet" onPress={onRemove} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  readout: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  // No negative tracking. Mono digits at this size are already tight, and
  // pulling them closer makes the readout look crushed rather than confident.
  clock: { fontSize: 30, fontFamily: 'Menlo', color: c.text },
  trackWrap: { marginTop: s.gutter - 4, height: TRACK_H + 28, justifyContent: 'flex-end' },
  empty: {
    height: TRACK_H + 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: s.radius,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.edge,
    backgroundColor: c.raised,
  },
  ruler: { height: 24 },
  tickMark: { position: 'absolute', top: 0, width: 1, height: 4, backgroundColor: c.edge },
  tickLabel: { ...type.mono, position: 'absolute', top: 9, fontSize: 10 },
  track: { flexDirection: 'row', height: TRACK_H, gap: 2 },
  clip: {
    height: TRACK_H,
    borderRadius: 6,
    backgroundColor: c.raised,
    borderWidth: 1,
    borderColor: c.edge,
    paddingHorizontal: HANDLE_W,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  clipOn: { borderColor: c.accent, backgroundColor: c.accentDim },
  clipLabel: { ...type.label, color: c.text },
  clipTime: { ...type.mono, fontSize: 11, marginTop: 2 },
  handle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: HANDLE_W,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.accent,
  },
  handleGrip: { width: 2, height: 18, borderRadius: 1, backgroundColor: c.ink, opacity: 0.55 },
  playhead: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: c.accent },
  underTrack: { marginTop: s.gap },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  footerRow: { flexDirection: 'row', gap: s.gap },
});
