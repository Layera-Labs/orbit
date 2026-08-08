/**
 * A topic goes in one end and a video comes out the other.
 *
 * ## The composition
 *
 * One object, not a stack of boxes. What you type and the shape it comes out in
 * live in the SAME card — and when the job starts, that card's lower strip
 * stops offering choices and starts reporting progress. The thing you
 * configured becomes the thing being built, in place, which is why there is no
 * separate "generating" screen and no modal.
 *
 * The aspect control draws three real frames at their TRUE relative
 * proportions on one baseline, rather than three identical chips wearing
 * different labels. It is the one control here that can show rather than tell,
 * so it does.
 *
 * ## Nothing on this screen is a promise it cannot keep
 *
 * There is no format picker, because exactly one format exists — a control with
 * one option is decoration. There is no cancel, because the service has no way
 * to stop a running generation and a button that quietly does nothing is worse
 * than its absence. There is no price shown next to the button: the server
 * knows the cost and does not report it, so the only honest thing to show is
 * the balance, and 402 says the rest.
 *
 * A server with no language model configured answers 503, and that is the state
 * a fresh deployment is actually in. It gets a real explanation and NO retry —
 * the answer will not be different a moment later.
 */
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { AppHeader } from '../components/AppHeader';
import { AuthSheet } from '../components/AuthSheet';
import { VIcon } from '../components/VIcon';
import { font, mono, r, sp, vela } from '../constants';
import { GEN_ASPECTS, GEN_STEPS, MAX_NOTES, MAX_TOPIC, frameSizeFor, stepIndex, stepLabel, type GenAspect } from '../net/generateClient';
import { downloadToPhotos } from '../net/renderClient';
import { downloadToMedia } from '../storage/media';
import { newId } from '../model/editor-ops';
import { useAuth } from '../store/authStore';
import { useEditor } from '../store/editorStore';
import { useGenerate } from '../store/generateStore';

/** The example the story format itself carries, so the placeholder is real. */
const PLACEHOLDER = 'Why the Eiffel Tower is taller in summer';

/**
 * Somewhere to start, for the one step nothing else on this screen helps with.
 *
 * Chosen to show the RANGE the format handles rather than to be used verbatim
 * — a mechanism, a piece of history, a habit — because what they are really
 * teaching is the shape of a topic that works: a specific claim, not a subject.
 */
const STARTERS = [
  'Why noise-cancelling fails on voices',
  'The five minutes that decided Midway',
  'Why bread goes stale faster in the fridge',
];

/** Long edge of an aspect swatch. Both other dimensions derive from the ratio. */
const FRAME_LONG = 46;

/** Where the counter starts being useful. Before this it is noise. */
const COUNT_FROM = MAX_TOPIC - 100;

export function GenerateScreen() {
  const go = useEditor((s) => s.go);
  const credits = useEditor((s) => s.credits);
  const refreshCredits = useEditor((s) => s.refreshCredits);
  const topic = useGenerate((s) => s.topic);
  const notes = useGenerate((s) => s.notes);
  const aspect = useGenerate((s) => s.aspect);
  const job = useGenerate((s) => s.job);
  const starting = useGenerate((s) => s.starting);
  const error = useGenerate((s) => s.error);
  const elapsedSec = useGenerate((s) => s.elapsedSec);
  const setTopic = useGenerate((s) => s.setTopic);
  const setNotes = useGenerate((s) => s.setNotes);
  const setAspect = useGenerate((s) => s.setAspect);
  const start = useGenerate((s) => s.start);
  const resume = useGenerate((s) => s.resume);
  const reset = useGenerate((s) => s.reset);
  const [authOpen, setAuthOpen] = useState(false);

  // A job started before this mount is still running on the server; pick the
  // watch back up rather than showing an empty form over the top of it.
  useEffect(() => {
    resume();
    void refreshCredits();
  }, [resume, refreshCredits]);

  /*
   * Four states, and `editable` has to exclude ALL THREE of the others.
   *
   * It was `!running && !done`, which reads as complete and is not: a job that
   * FAILED is neither, so the screen dropped back to a blank-looking form with
   * the aspect frames where the reason should have been, and the footer offered
   * "Generate" because it tested `editable` first. The failure was in the store
   * and rendered nowhere. Found by looking at the screen rather than at this
   * expression, which is the only way that one was ever going to surface.
   */
  const running = job !== null && job.status !== 'done' && job.status !== 'error';
  const done = job?.status === 'done' && Boolean(job.result?.url);
  const failed = job?.status === 'error' || (job?.status === 'done' && !job.result?.url);
  const editable = !running && !done && !failed;

  return (
    <View style={styles.root}>
      <AppHeader
        title='Generate'
        leading={{ icon: 'back', label: 'Back', onPress: () => go('ai') }}
        actions={[{ icon: 'profile', label: 'Open profile', onPress: () => go('profile') }]}
      />
      {/* The KAV IS the flex container. Inside one, `behavior="padding"` grows
          padding in a box whose bottom edge is already behind the keyboard. */}
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps='handled'
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            {editable ? (
              <TextInput
                style={styles.topicInput}
                value={topic}
                onChangeText={setTopic}
                placeholder={PLACEHOLDER}
                placeholderTextColor={vela.lightMuted}
                multiline
                maxLength={MAX_TOPIC}
                textAlignVertical='top'
                autoCorrect
              />
            ) : (
              <Text style={styles.topicSaid}>{topic}</Text>
            )}

            <View style={styles.strip}>
              {editable ? (
                <AspectRow value={aspect} onChange={setAspect} count={topic.length} />
              ) : running ? (
                <Progress step={job?.step} elapsedSec={elapsedSec} queued={job?.status === 'queued'} />
              ) : done ? (
                <Outcome durationSec={job?.result?.durationSec} />
              ) : (
                <Failure message={job?.error ?? 'The generation did not finish.'} />
              )}
            </View>
          </View>

          {/*
            Present only while the field is empty, which is the whole idea: the
            hardest part of this screen is the first sentence, and once there IS
            one these would be a list of things you did not choose sitting under
            the thing you did. Plain lines rather than a row of tinted chips —
            they are sentences, and they are meant to be read.
          */}
          {editable && !topic.trim() ? (
            <View style={styles.starters}>
              {STARTERS.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setTopic(t)}
                  accessibilityRole='button'
                  style={({ pressed }) => [styles.starter, pressed ? styles.pressed : null]}
                >
                  <View style={styles.starterMark}>
                    <VIcon name='plus' size={15} color={vela.lightMuted} />
                  </View>
                  <Text style={styles.starterText}>{t}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {editable ? (
            <>
              <TextInput
                style={styles.notesInput}
                value={notes}
                onChangeText={setNotes}
                placeholder='Direction, tone, audience (optional)'
                placeholderTextColor={vela.lightMuted}
                multiline
                maxLength={MAX_NOTES}
                textAlignVertical='top'
              />
              {error ? (
                <StartError
                  kind={error.kind}
                  message={error.message}
                  onSignIn={() => setAuthOpen(true)}
                />
              ) : null}
            </>
          ) : null}

          {done && job?.result?.alignmentSkipped ? (
            <Text style={styles.foot}>
              Captions are per scene rather than per word. This server could not
              transcribe the narration back to time them.
            </Text>
          ) : null}
        </ScrollView>

        {/*
          The commit sits at the BOTTOM of the frame, not at the end of the
          content. Two reasons, and neither is decoration: it is where a thumb
          reaches, and it gives the screen a bottom edge — anchored to the
          content instead, everything below the last field was an empty half of
          nothing that read as unfinished rather than as room to breathe.
        */}
        <View style={styles.footer}>
          {editable ? (
            <>
              <Text style={styles.foot}>
                Four to seven narrated scenes, captioned, cut to the voice.
                {credits === null ? '' : ` ${credits} credits left.`}
              </Text>
              <Action
                label={starting ? 'Starting' : 'Generate'}
                busy={starting}
                disabled={!topic.trim() || starting}
                onPress={() => void start()}
              />
            </>
          ) : done && job?.result ? (
            <Collect
              url={job.result.url}
              durationSec={job.result.durationSec}
              aspect={aspect}
              topic={topic}
              onDone={reset}
            />
          ) : failed ? (
            <Action label='Start over' onPress={reset} />
          ) : null}
        </View>
      </KeyboardAvoidingView>
      {authOpen ? (
        <AuthSheet onClose={() => setAuthOpen(false)} onAuthed={() => setAuthOpen(false)} />
      ) : null}
    </View>
  );
}

/**
 * Three frames at their true relative proportions, on one baseline.
 *
 * Bottom-aligned rather than centred: sharing a baseline is what makes the row
 * read as one proportion chart instead of three unrelated tiles.
 */
function AspectRow({
  value,
  onChange,
  count,
}: {
  value: GenAspect;
  onChange: (a: GenAspect) => void;
  count: number;
}) {
  return (
    <View style={styles.aspectRow}>
      <View style={styles.frames}>
        {GEN_ASPECTS.map((a) => {
          const [w, h] = a.split(':').map(Number);
          const long = Math.max(w, h);
          const on = a === value;
          return (
            <Pressable
              key={a}
              onPress={() => onChange(a)}
              accessibilityRole='radio'
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${a} frame`}
              style={({ pressed }) => [styles.frameCell, pressed ? styles.pressed : null]}
            >
              <View style={styles.frameSlot}>
                <View
                  style={[
                    styles.frame,
                    {
                      width: (w / long) * FRAME_LONG,
                      height: (h / long) * FRAME_LONG,
                      backgroundColor: on ? vela.accent : 'transparent',
                      borderColor: on ? vela.accent : vela.lightMuted3,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.frameLabel, on ? styles.frameLabelOn : null]}>{a}</Text>
            </Pressable>
          );
        })}
      </View>
      {/* Silent until it starts to matter — a counter sitting at 0/400 is
          chrome that teaches nothing. */}
      {count >= COUNT_FROM ? (
        <Text style={styles.count}>{MAX_TOPIC - count}</Text>
      ) : null}
    </View>
  );
}

/** Six segments, one per pipeline step, and the name of the one running. */
function Progress({
  step,
  elapsedSec,
  queued,
}: {
  step?: string;
  elapsedSec: number;
  queued: boolean;
}) {
  const at = stepIndex(step);
  return (
    <View>
      <View style={styles.lane}>
        {GEN_STEPS.map((s, i) => (
          <Segment key={s.key} state={i < at ? 'done' : i === at ? 'live' : 'todo'} />
        ))}
      </View>
      <View style={styles.stripRow}>
        <Text style={styles.stage} numberOfLines={1}>
          {queued && at < 0 ? 'Waiting for a worker' : stepLabel(step)}
        </Text>
        <Text style={styles.elapsed}>{clock(elapsedSec)}</Text>
      </View>
      <Text style={styles.leaveNote}>Keeps running if you leave this screen.</Text>
    </View>
  );
}

/**
 * One block of the lane.
 *
 * The live one breathes. It is fully painted at every frame of that loop — the
 * range floors at 0.55, never 0 — so a device that refuses the animation
 * entirely still shows the whole lane. Reduced motion parks it at full.
 */
function Segment({ state }: { state: 'done' | 'live' | 'todo' }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(1);
  useEffect(() => {
    if (state !== 'live' || reduced) {
      t.value = 1;
      return;
    }
    t.value = withRepeat(withTiming(0.55, { duration: 900 }), -1, true);
  }, [state, reduced, t]);
  const style = useAnimatedStyle(() => ({ opacity: state === 'live' ? t.value : 1 }));
  return (
    <Animated.View
      style={[
        styles.segment,
        { backgroundColor: state === 'todo' ? vela.lightMuted3 : vela.accent },
        style,
      ]}
    />
  );
}

function Outcome({ durationSec }: { durationSec?: number }) {
  return (
    <View style={styles.stripRow}>
      <View style={styles.outcome}>
        <VIcon name='check' size={16} color={vela.success} />
        <Text style={styles.stage}>Ready</Text>
      </View>
      {durationSec ? <Text style={styles.elapsed}>{clock(Math.round(durationSec))}</Text> : null}
    </View>
  );
}

/*
 * The message is set in ink, not in red. Red at body size on a light strip is
 * the one place this palette cannot hold 4.5:1, and a failure the user cannot
 * comfortably read is a worse outcome than a quieter one. The mark carries the
 * colour instead, where it needs no contrast to do its job.
 */
function Failure({ message }: { message: string }) {
  return (
    <View style={styles.failure}>
      <VIcon name='close' size={16} color={vela.danger} />
      <Text style={styles.failureText}>{message}</Text>
    </View>
  );
}

/** What to do with a video that now exists. */
function Collect({
  url,
  durationSec,
  aspect,
  topic,
  onDone,
}: {
  url: string;
  durationSec?: number;
  aspect: GenAspect;
  topic: string;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState<'open' | 'save' | null>(null);

  /*
   * Downloaded BEFORE the project is created, so the editor opens with the clip
   * already on the timeline. Creating first navigates immediately and leaves
   * the user watching an empty project while the file arrives.
   */
  async function openInEditor(): Promise<void> {
    setBusy('open');
    try {
      const src = await downloadToMedia(url, 'mp4');
      const dur = durationSec && durationSec > 0 ? durationSec : 10;
      const { width, height } = frameSizeFor(aspect);
      const store = useEditor.getState();
      store.newProject(topic.slice(0, 60).trim() || 'Generated', width, height);
      store.setMediaDuration(src, dur);
      store.importVisual([
        { id: newId('v'), type: 'video', src, start: 0, duration: dur, trimIn: 0, volume: 1 },
      ]);
      onDone();
    } catch (e) {
      Alert.alert('Could not open it', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function save(): Promise<void> {
    setBusy('save');
    try {
      await downloadToPhotos(url, Date.now());
      Alert.alert('Saved', 'The video is in your photo library.');
    } catch (e) {
      Alert.alert('Could not save it', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Action
        label={busy === 'open' ? 'Opening' : 'Open in the editor'}
        busy={busy === 'open'}
        disabled={busy !== null}
        onPress={() => void openInEditor()}
      />
      {/* A row, not a second button. An outlined twin of the button above it is
          the stock action pair; these are two different kinds of thing and are
          built as two different kinds of thing. */}
      <Pressable
        style={({ pressed }) => [styles.quietRow, pressed ? styles.pressed : null]}
        onPress={() => void save()}
        disabled={busy !== null}
        accessibilityRole='button'
      >
        <VIcon name='save' size={19} color={vela.ink3} />
        <Text style={styles.quietText}>
          {busy === 'save' ? 'Saving to Photos' : 'Save to Photos'}
        </Text>
        {busy === 'save' ? <ActivityIndicator color={vela.lightMuted} /> : null}
      </Pressable>
    </>
  );
}

/**
 * A failure to START.
 *
 * Each kind gets the recovery that actually exists, and nothing gets a retry
 * that cannot work: a server with no language model will answer 503 again, so
 * it is told plainly and offered nothing.
 */
function StartError({
  kind,
  message,
  onSignIn,
}: {
  kind: string;
  message: string;
  onSignIn: () => void;
}) {
  return (
    <View style={styles.startError}>
      <View style={styles.failure}>
        <VIcon name='close' size={16} color={vela.danger} />
        <Text style={styles.failureText}>{message}</Text>
      </View>
      {kind === 'unauthenticated' ? (
        <Pressable
          style={({ pressed }) => [styles.quietRow, pressed ? styles.pressed : null]}
          onPress={onSignIn}
          accessibilityRole='button'
        >
          <VIcon name='profile' size={19} color={vela.ink3} />
          <Text style={styles.quietText}>Sign in</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Action({
  label,
  onPress,
  busy,
  disabled,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.action,
        disabled ? styles.actionOff : null,
        pressed && !disabled ? styles.actionDown : null,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole='button'
      accessibilityState={{ disabled: Boolean(disabled) }}
    >
      <Text style={[styles.actionLabel, disabled ? styles.actionLabelOff : null]}>{label}</Text>
      {busy ? <ActivityIndicator color={vela.onAccent} /> : null}
    </Pressable>
  );
}

/** m:ss. Mono, because it is a measurement and it must not reflow every tick. */
function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: vela.homeBg },
  fill: { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: sp.lg, paddingBottom: sp.xl },

  footer: { paddingHorizontal: 22, paddingBottom: 38 },

  starters: { marginTop: sp.xl, gap: 2 },
  starter: {
    flexDirection: 'row',
    // Top, not centre: one of these can wrap, and a centred mark then sits in
    // the gap BETWEEN its two lines rather than beside the line it belongs to.
    alignItems: 'flex-start',
    gap: sp.md,
    paddingVertical: 11,
    paddingHorizontal: sp.xs,
  },
  // Nudged down to the first line's optical centre, since the row aligns to the
  // text box's top and a 15pt glyph is shorter than a 20pt line.
  starterMark: { marginTop: 2.5 },
  starterText: {
    flex: 1,
    color: vela.ink3,
    fontFamily: font.medium,
    fontSize: 14.5,
    lineHeight: 20,
  },

  card: {
    backgroundColor: vela.lightCard,
    borderRadius: r.xl,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: vela.lightBorder,
    overflow: 'hidden',
  },
  topicInput: {
    color: vela.ink,
    fontFamily: font.semibold,
    fontSize: 21,
    lineHeight: 29,
    padding: sp.xl,
    minHeight: 104,
  },
  topicSaid: {
    color: vela.ink,
    fontFamily: font.semibold,
    fontSize: 21,
    lineHeight: 29,
    padding: sp.xl,
  },
  /* Tonal, not a rule: the strip is a step darker than the card, so the two
     zones separate without a hairline drawn between them. */
  strip: {
    backgroundColor: vela.lightSurface,
    paddingHorizontal: sp.xl,
    paddingVertical: sp.lg,
  },

  aspectRow: { flexDirection: 'row', alignItems: 'flex-end' },
  frames: { flexDirection: 'row', alignItems: 'flex-end', gap: sp.xl, flex: 1 },
  frameCell: { alignItems: 'center' },
  // A fixed slot so every frame sits on ONE baseline whatever its height.
  frameSlot: { height: FRAME_LONG, justifyContent: 'flex-end' },
  frame: { borderWidth: 1.5, borderRadius: 4, borderCurve: 'continuous' },
  frameLabel: {
    color: vela.ink3,
    fontFamily: mono.medium,
    fontSize: 10.5,
    marginTop: 7,
  },
  frameLabelOn: { color: vela.ink },
  count: { color: vela.lightMuted, fontFamily: mono.regular, fontSize: 11, marginBottom: 2 },

  lane: { flexDirection: 'row', gap: 4, marginBottom: sp.md },
  segment: { flex: 1, height: 7, borderRadius: 3.5 },
  stripRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: sp.md },
  stage: { color: vela.ink2, fontFamily: font.semibold, fontSize: 14.5, flexShrink: 1 },
  elapsed: { color: vela.lightMuted, fontFamily: mono.medium, fontSize: 12.5 },
  leaveNote: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 11.5,
    marginTop: 6,
  },
  outcome: { flexDirection: 'row', alignItems: 'center', gap: sp.sm },

  failure: { flexDirection: 'row', alignItems: 'flex-start', gap: sp.sm },
  failureText: {
    flex: 1,
    color: vela.ink2,
    fontFamily: font.medium,
    fontSize: 13.5,
    lineHeight: 19,
  },
  startError: { marginTop: sp.lg },

  notesInput: {
    backgroundColor: vela.lightCard,
    borderRadius: r.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: vela.lightBorder,
    color: vela.ink2,
    fontFamily: font.medium,
    fontSize: 15,
    lineHeight: 21,
    padding: sp.lg,
    minHeight: 78,
    marginTop: sp.md,
  },

  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: sp.md,
    backgroundColor: vela.action,
    borderRadius: r.lg,
    borderCurve: 'continuous',
    paddingVertical: 17,
    marginTop: sp.lg,
  },
  actionOff: { backgroundColor: vela.lightBorder },
  actionDown: { backgroundColor: vela.accentDim },
  /* Touch feedback is a tone change and nothing else — no lift, no scale. */
  pressed: { opacity: 0.55 },
  actionLabel: { color: vela.onAccent, fontFamily: font.bold, fontSize: 15.5 },
  actionLabelOff: { color: vela.ink3 },

  quietRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp.md,
    paddingVertical: sp.lg,
    paddingHorizontal: sp.xs,
    marginTop: sp.xs,
  },
  quietText: { flex: 1, color: vela.ink2, fontFamily: font.semibold, fontSize: 14.5 },

  foot: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: sp.md,
    marginBottom: sp.xs,
  },
});
