'use client';

import { useState } from 'react';
import {
  captionFileName,
  clearAutoCaptions,
  hasAutoCaptions,
  hasCaptionText,
  setAutoCaptions,
  toSRT,
  type VideoProject,
} from '@orbit/video/browser';
import { Icon } from '@/brand/Icon';
import { mediaIdOf } from '@/db/schema';
import { GenError, transcribe } from '@/net/genClient';
import { uploadMedia } from '@/net/renderClient';
import { useJobs } from '@/store/jobsStore';
import { useVideo } from '@/store/videoStore';
import styles from './Panels.module.css';

const COST = 5;

/**
 * Hand the browser a file it never fetched.
 *
 * The object URL is revoked on the next frame rather than immediately: the
 * click is synchronous but the download the browser starts from it is not, and
 * revoking in the same tick cancels it in Safari.
 */
function downloadText(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}

/**
 * Which clip gets transcribed.
 *
 * The selected one if it is a real media clip, then the first audio track, then
 * the first visual clip. Audio before video on purpose: a project with a
 * voiceover over b-roll has the words in the audio track, and transcribing the
 * silent footage instead would spend credits to produce nothing.
 *
 * Returns the clip's `start` too — the transcript is relative to the audio and
 * the overlays are absolute, so that offset is what lines them up.
 */
export function captionSource(
  p: VideoProject,
  selection: string | null,
): { src: string; start: number; label: string } | null {
  const visual = (p.tracks ?? []).filter((t) => t.kind !== 'audio').flatMap((t) => t.clips);
  const audio = (p.tracks ?? []).filter((t) => t.kind === 'audio').flatMap((t) => t.clips);

  const picked =
    [...audio, ...visual].find((c) => c.id === selection) ?? audio[0] ?? visual[0];
  if (!picked || !mediaIdOf(picked.src)) return null;
  return {
    src: picked.src,
    start: picked.start ?? 0,
    label: audio.includes(picked as never) ? 'the audio track' : 'the first clip',
  };
}

/**
 * Speech to captions, as a section of the Text panel.
 *
 * Not its own rail entry: captions ARE text on the timeline, they land in the
 * same overlay list, and the panel that lists every caption in the project is
 * where you would go to check the result.
 */
export function CaptionsSection({
  project,
  selection,
}: {
  project: VideoProject;
  selection: string | null;
}) {
  const apply = useVideo((s) => s.apply);
  const projectName = useVideo((s) => s.name);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const source = captionSource(project, selection);
  const existing = hasAutoCaptions(project);
  const exportable = hasCaptionText(project);

  const run = async () => {
    if (!source) return;
    setBusy(true);
    setNote(null);
    try {
      // The service transcribes an upload token, not a file: the audio is
      // already there if this project has ever been exported, and if it is not,
      // this is the same upload that export would do.
      // `uploadMedia` already returns the full `upload:<id>` src — the service
      // hands back the prefix, not a bare id. Adding one produced
      // `upload:upload:…` and a 400 that named the format it wanted.
      const src = await uploadMedia(mediaIdOf(source.src)!);
      const { lines, balance } = await transcribe({ src });
      if (typeof balance === 'number') useJobs.setState({ balance });
      apply((p) => setAutoCaptions(p, lines, source.start));
      setNote(
        lines.length
          ? `${lines.length} caption${lines.length === 1 ? '' : 's'} placed. Edit any of them like ordinary text.`
          : 'No speech was found in that audio.',
      );
    } catch (err) {
      if (err instanceof GenError && err.kind === 'unauthenticated')
        useJobs.setState({ signedOut: true });
      setNote(err instanceof Error ? err.message : 'Could not transcribe that audio.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.group}>
      <h3 className={styles.groupTitle}>Captions</h3>

      {!source ? (
        <p className={styles.note}>
          Add a clip or a sound file to the timeline, then captions can be written from
          its speech.
        </p>
      ) : (
        <>
          <p className={styles.note}>
            Transcribes {source.label} and places a caption per line.
            {existing && ' Running it again replaces the captions already there.'}
          </p>
          <button className={styles.action} onClick={run} disabled={busy}>
            <Icon name="text" size={14} />
            {busy ? 'Listening…' : existing ? 'Redo captions' : 'Add captions'}
            <span className={`${styles.cost} w-data`} style={{ marginLeft: 'auto' }}>
              {COST} credits
            </span>
          </button>
          {existing && (
            <button
              className={styles.action}
              onClick={() => {
                apply(clearAutoCaptions);
                setNote(null);
              }}
              disabled={busy}
            >
              <Icon name="close" size={14} />
              Remove captions
            </button>
          )}
        </>
      )}

      {/*
        A subtitle file, not a second copy of the captions.
        Offered whenever there is any timed text at all — including text typed
        by hand — because the `caption-` prefix is bookkeeping for re-running
        the transcription, not a category anyone chose, and a file that silently
        omitted the lines someone wrote themselves would be the worse surprise.
       */}
      {exportable && (
        <button
          className={styles.action}
          onClick={() =>
            downloadText(captionFileName(projectName), toSRT(project), 'application/x-subrip')
          }
        >
          <Icon name="download" size={14} />
          Save .srt
        </button>
      )}
      {exportable && (
        <p className={styles.note}>
          Every timed text on the timeline, as a subtitle file. Unlike burned-in
          captions, it can be turned off and translated.
        </p>
      )}

      {/* Plain text, and only after something happened. No progress bar: the
          service reports none, so a moving one would be invented. */}
      {note && <p className={styles.note}>{note}</p>}
    </div>
  );
}
