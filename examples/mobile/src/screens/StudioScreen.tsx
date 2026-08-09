/**
 * AI studio — a topic goes in, a finished video comes back.
 *
 * The whole screen is one long-running job with four states: a form, a progress
 * lane, a result, or a reason it failed. They share the card rather than
 * pushing a modal, because a generation takes minutes and the user should be
 * able to look at what they asked for while they wait.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Button, Card, Notice, Screen } from '../ui';
import { c, s, type } from '../theme';
import { serverUrl } from '../orbit/server';
import {
  fetchGeneration,
  frameSizeFor,
  GEN_ASPECTS,
  GEN_STEPS,
  isRetryable,
  isSettled,
  MAX_TOPIC,
  pollDelay,
  startGeneration,
  stepIndex,
  stepLabel,
  type GenAspect,
  type GenerationJob,
} from '../orbit/generate';
import { saveToPhotos } from '../orbit/render';

/**
 * Give up after this many consecutive failed polls.
 *
 * A poll survives a dropped connection — a phone changing networks mid-job
 * should not lose a generation somebody paid for — but it cannot retry
 * forever, or a service that has genuinely gone leaves a spinner on screen
 * until the app is force-quit.
 */
const MAX_MISSES = 25;

export default function StudioScreen() {
  const base = serverUrl();
  const [topic, setTopic] = useState('');
  const [aspect, setAspect] = useState<GenAspect>('9:16');
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [error, setError] = useState<{ text: string; retryable: boolean } | null>(null);
  const [starting, setStarting] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const running = starting || (job !== null && !isSettled(job));
  const url = job?.status === 'done' ? job.result?.url : undefined;
  const failed = job?.status === 'error' || (job?.status === 'done' && !url);

  /** Stops the poll when the screen unmounts, or a new job replaces this one. */
  const live = useRef(0);
  useEffect(() => () => void live.current++, []);

  async function poll(id: string) {
    const mine = ++live.current;
    let attempt = 0;
    let misses = 0;
    for (;;) {
      await new Promise((r) => setTimeout(r, pollDelay(attempt++)));
      if (live.current !== mine) return;
      try {
        const next = await fetchGeneration(base, id);
        misses = 0;
        if (live.current !== mine) return;
        setJob(next);
        if (isSettled(next)) return;
      } catch (err) {
        if (++misses < MAX_MISSES) continue;
        if (live.current !== mine) return;
        setError({ text: (err as Error).message, retryable: true });
        setJob(null);
        return;
      }
    }
  }

  async function generate() {
    const text = topic.trim();
    if (!text) return;
    live.current++;
    setError(null);
    setSaved(null);
    setJob(null);
    setStarting(true);
    try {
      const id = await startGeneration(base, { topic: text, aspect });
      setJob({ id, status: 'queued' });
      void poll(id);
    } catch (err) {
      setError({ text: (err as Error).message, retryable: isRetryable(err) });
    } finally {
      setStarting(false);
    }
  }

  function reset() {
    live.current++;
    setJob(null);
    setError(null);
    setSaved(null);
  }

  const size = frameSizeFor(aspect);
  const editable = !running && !url && !failed;

  return (
    <Screen
      title="AI studio"
      lede="Type a topic and the service builds the whole video. POST /v1/generate answers with a job id, not a file."
      footer={
        url || failed ? (
          <Button label="Start again" onPress={reset} tone="quiet" />
        ) : (
          <Button
            label={running ? 'Generating' : 'Generate'}
            onPress={generate}
            busy={running}
            disabled={!topic.trim()}
          />
        )
      }
    >
      <Card>
        <Text style={type.label}>Topic</Text>
        <TextInput
          value={topic}
          onChangeText={setTopic}
          editable={editable}
          multiline
          maxLength={MAX_TOPIC}
          placeholder="Three things nobody tells you about sourdough"
          placeholderTextColor={c.faint}
          style={[styles.input, !editable && { color: c.muted }]}
        />
        <Text style={[type.mono, styles.count]}>
          {topic.length}/{MAX_TOPIC}
        </Text>

        <View style={styles.rule} />

        {running ? (
          <StepLane step={job?.step} />
        ) : url ? (
          <Result url={url} saved={saved} onSave={async () => setSaved(await saveToPhotos(url))} />
        ) : failed ? (
          <Notice text={job?.error ?? 'The service finished the job without producing a file.'} />
        ) : (
          <AspectRow value={aspect} onChange={setAspect} />
        )}
      </Card>

      {!running && !url && !failed ? (
        <>
          <Text style={[type.mono, { marginTop: s.gap }]}>
            {size.width}×{size.height} · {base}
          </Text>
          <Plan />
        </>
      ) : null}

      {error ? (
        <>
          <Notice text={error.text} />
          {!error.retryable ? (
            <Notice
              tone="muted"
              text="Generation needs a language model and a voice: set ORBIT_LLM_BASE_URL, ORBIT_LLM_MODEL, ORBIT_LLM_API_KEY and ELEVENLABS_API_KEY on the service, then restart it. The Timeline and Export tabs work without any of them."
            />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

/**
 * What the service is going to do, before it starts doing it.
 *
 * Not filler. A generation runs for minutes with nothing to look at, and the
 * six names here are the same ones the progress lane uses, so by the time the
 * lane appears the reader already knows what "align" means. It also answers
 * the only real question a first-time user has, which is why it is slow.
 */
function Plan() {
  return (
    <View style={{ marginTop: s.gutter }}>
      <Text style={type.label}>What it does, in order</Text>
      {GEN_STEPS.map((g, i) => (
        <View key={g.key} style={styles.planRow}>
          <Text style={[type.mono, styles.planNum]}>{i + 1}</Text>
          <Text style={[type.body, { color: c.muted }]}>{g.label}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Three frames drawn to their true relative proportions, standing on one
 * baseline, so the row is a proportion chart rather than three equal tiles.
 */
function AspectRow({
  value,
  onChange,
}: {
  value: GenAspect;
  onChange: (a: GenAspect) => void;
}) {
  const H = 54;
  return (
    <View>
      <Text style={type.label}>Shape</Text>
      <View style={styles.aspectRow}>
        {GEN_ASPECTS.map((a) => {
          const { width, height } = frameSizeFor(a);
          const on = a === value;
          return (
            <Pressable
              key={a}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={a}
              onPress={() => onChange(a)}
              style={styles.aspectCell}
              hitSlop={8}
            >
              <View
                style={[
                  styles.frame,
                  { height: H, width: Math.round(H * (width / height)) },
                  on && { borderColor: c.accent, backgroundColor: c.accentDim },
                ]}
              />
              <Text style={[styles.aspectLabel, on && { color: c.accent, fontWeight: '600' }]}>
                {a}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Where the job has got to.
 *
 * Every step is on screen from the start, so the lane does not grow and shove
 * the layout down as it goes, and a step the server adds later that this build
 * has never heard of still gets a line — `stepIndex` answers -1 and nothing
 * below is marked done.
 */
function StepLane({ step }: { step?: string }) {
  const at = stepIndex(step);
  return (
    <View>
      <Text style={type.label}>{stepLabel(step)}</Text>
      <View style={styles.lane}>
        {GEN_STEPS.map((g, i) => (
          <View
            key={g.key}
            style={[
              styles.laneSeg,
              i < at && { backgroundColor: c.accent, opacity: 0.45 },
              i === at && { backgroundColor: c.accent },
            ]}
          />
        ))}
      </View>
      <Text style={[type.body, { marginTop: s.gap }]}>
        This takes a few minutes. Leaving the screen does not cancel it, but this example forgets
        the job id, so stay here to see the result.
      </Text>
    </View>
  );
}

function Result({
  url,
  saved,
  onSave,
}: {
  url: string;
  saved: string | null;
  onSave: () => Promise<void>;
}) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.play();
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <View>
      <VideoView player={player} style={styles.player} nativeControls contentFit="contain" />
      <View style={{ marginTop: s.gap }}>
        <Button
          label={saved ? 'Saved to Photos' : 'Save to Photos'}
          tone="quiet"
          disabled={!!saved}
          busy={saving}
          onPress={async () => {
            setSaving(true);
            setErr(null);
            try {
              await onSave();
            } catch (e) {
              setErr((e as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        />
      </View>
      {err ? <Notice text={err} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    marginTop: 6,
    minHeight: 80,
    color: c.text,
    fontSize: 17,
    lineHeight: 24,
    textAlignVertical: 'top',
  },
  count: { textAlign: 'right' },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: c.edge,
    marginVertical: s.gutter - 4,
  },
  aspectRow: { flexDirection: 'row', alignItems: 'flex-end', gap: s.gutter, marginTop: s.gap },
  aspectCell: { alignItems: 'center' },
  frame: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: c.edge,
    backgroundColor: c.raised,
  },
  aspectLabel: { ...type.label, marginTop: 8 },
  planRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12, marginTop: 8 },
  planNum: { width: 14 },
  lane: { flexDirection: 'row', gap: 4, marginTop: 10 },
  laneSeg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: c.raised },
  player: {
    width: '100%',
    aspectRatio: 9 / 16,
    maxHeight: 380,
    alignSelf: 'center',
    borderRadius: s.radius,
    backgroundColor: '#000',
  },
});
