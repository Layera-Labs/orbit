/**
 * Export — the four hops from a timeline on a phone to an MP4 in Photos.
 *
 * The stage line is not decoration. Uploading, rendering, downloading and
 * saving fail for different reasons and take wildly different amounts of time,
 * and an export that says only "working…" is indistinguishable from an export
 * that has died.
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Button, Card, Notice, Screen } from '../ui';
import { c, s, type } from '../theme';
import { useProject } from '../project';
import { serverUrl } from '../orbit/server';
import { clipsOf, formatTime, totalDuration } from '../orbit/timeline';
import { exportProject, localSources, saveToPhotos, type ExportProgress } from '../orbit/render';

export default function ExportScreen() {
  const base = serverUrl();
  const { project } = useProject();
  const clips = clipsOf(project);
  const total = totalDuration(clips);

  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = progress !== null;

  async function run() {
    setError(null);
    setUrl(null);
    setSavedTo(null);
    setProgress({ stage: 'uploading' });
    try {
      const finished = await exportProject(
        base,
        project,
        { width: project.width, height: project.height, fps: project.fps },
        setProgress,
      );
      setUrl(finished);
      // Downloading and saving report through the same callback, so the line
      // keeps moving right through to the photo library.
      setSavedTo(await saveToPhotos(finished, setProgress));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProgress(null);
    }
  }

  if (clips.length === 0) {
    return (
      <Screen
        title="Export"
        lede="Upload the local media, POST the project to /v1/render as a job, poll it, then download the result."
      >
        <Card>
          <Text style={type.body}>
            There is nothing to export yet. Put a few clips on the Timeline first; this screen
            ships whatever is on it.
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      title="Export"
      lede="Upload the local media, POST the project to /v1/render as a job, poll it, then download the result."
      footer={
        <Button
          label={busy ? stageLabel(progress) : url ? 'Export again' : 'Export'}
          onPress={run}
          busy={busy}
        />
      }
    >
      <Card>
        <Text style={type.heading}>What ships</Text>
        <View style={{ marginTop: s.gap }}>
          <Row k="clips" v={`${clips.length}`} />
          <Row k="duration" v={formatTime(total)} />
          <Row k="resolution" v={`${project.width}×${project.height}`} />
          <Row k="frame rate" v={`${project.fps} fps`} />
          <Row k="files to upload" v={`${localSources(project).length}`} />
        </View>
        <Text style={[type.mono, { marginTop: s.gap }]}>{base}</Text>
      </Card>

      {busy ? (
        <Card style={{ marginTop: s.gap }}>
          <Text style={type.label}>{stageLabel(progress)}</Text>
          <Bar fraction={progress?.fraction} />
          <Text style={[type.body, { marginTop: s.gap }]}>
            Encoding happens on the service, not the phone. This can take a while for long
            timelines.
          </Text>
        </Card>
      ) : null}

      {url ? <Result url={url} savedTo={savedTo} /> : null}
      {error ? <Notice text={error} /> : null}
    </Screen>
  );
}

function stageLabel(p: ExportProgress | null): string {
  if (!p) return 'Working';
  switch (p.stage) {
    case 'uploading':
      return p.total ? `Uploading ${p.current} of ${p.total}` : 'Uploading';
    case 'rendering':
      return p.fraction != null ? `Rendering ${Math.round(p.fraction * 100)}%` : 'Rendering';
    case 'downloading':
      return 'Downloading';
    case 'saving':
      return 'Saving to Photos';
  }
}

/**
 * Indeterminate is a real state, not zero.
 *
 * The service reports nothing until ffmpeg has encoded its first frames, so a
 * bar drawn at 0% in the meantime reads as a hang. A flat rail says "no number
 * yet" honestly.
 */
function Bar({ fraction }: { fraction?: number }) {
  const known = typeof fraction === 'number';
  return (
    <View style={styles.rail}>
      <View
        style={[
          styles.fill,
          known
            ? { width: `${Math.round(Math.min(Math.max(fraction, 0), 1) * 100)}%` }
            : { width: '100%', opacity: 0.22 },
        ]}
      />
    </View>
  );
}

function Result({ url, savedTo }: { url: string; savedTo: string | null }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.play();
  });
  return (
    <Card style={{ marginTop: s.gap }}>
      <Text style={type.heading}>Done</Text>
      <VideoView player={player} style={styles.player} nativeControls contentFit="contain" />
      <Text style={[type.body, { marginTop: s.gap }]}>
        {savedTo
          ? 'Saved to your photo library.'
          : 'Downloaded, but not saved: photo library access was declined.'}
      </Text>
    </Card>
  );
}

const Row = ({ k, v }: { k: string; v: string }) => (
  <View style={styles.row}>
    <Text style={type.label}>{k}</Text>
    <Text style={type.mono}>{v}</Text>
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  rail: {
    height: 3,
    borderRadius: 2,
    backgroundColor: c.raised,
    marginTop: 10,
    overflow: 'hidden',
  },
  fill: { height: 3, borderRadius: 2, backgroundColor: c.accent },
  player: {
    width: '100%',
    aspectRatio: 9 / 16,
    maxHeight: 340,
    alignSelf: 'center',
    marginTop: s.gap,
    borderRadius: s.radius,
    backgroundColor: '#000',
  },
});
