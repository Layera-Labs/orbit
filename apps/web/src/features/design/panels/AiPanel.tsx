'use client';

import { useEffect, useState } from 'react';
import { Icon, Plate } from '@layera-labs/orbit-brand';
import type { MediaRow } from '@/db/schema';
import { SignIn } from '@/features/auth/SignIn';
import { MODES, useJobs, type GenMode, type Job } from '@/store/jobsStore';
import { MediaPanel, type MediaFilter } from './MediaPanel';
import styles from './Panels.module.css';

/**
 * Generation, as a dock rather than a destination.
 *
 * The old studio page created a NEW project from every result, which is the
 * opposite of what you want once you are already working on something. Here a
 * result inserts into the open document.
 */
export function AiPanel({
  filter = 'all',
  modes,
  onInsert,
}: {
  /** Stills cannot take a speech result, so they never list one. */
  filter?: MediaFilter;
  /**
   * Which kinds this document can actually receive. Offering all three
   * everywhere meant a still project could spend credits on speech and then
   * show nothing at all — the result is real, but `filter` hides it from the
   * list and `insertMedia` refuses it. A mode you cannot use is not a choice.
   */
  modes?: GenMode[];
  onInsert(row: MediaRow): void;
}) {
  const offered = modes ? MODES.filter((m) => modes.includes(m.key)) : MODES;
  const [mode, setMode] = useState<GenMode>(offered[0].key);
  const [prompt, setPrompt] = useState('');

  const jobs = useJobs((s) => s.jobs);
  const balance = useJobs((s) => s.balance);
  const signedOut = useJobs((s) => s.signedOut);
  const notice = useJobs((s) => s.notice);
  const run = useJobs((s) => s.run);
  const cancel = useJobs((s) => s.cancel);
  const dismiss = useJobs((s) => s.dismiss);
  const refreshBalance = useJobs((s) => s.refreshBalance);

  const active = offered.find((m) => m.key === mode) ?? offered[0];
  const running = jobs.some((j) => j.status === 'running');

  useEffect(refreshBalance, [refreshBalance]);

  // A refresh mid-generation loses the request, but the credits were charged
  // server-side before it started — so warn before that happens.
  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [running]);

  const fire = () => {
    void run(active.key, prompt);
    setPrompt('');
  };

  /*
   * The refusal, WHERE it happens.
   *
   * This server meters and this browser has no account. Showing the prompt box
   * anyway meant the only way to find that out was to write something, press
   * Generate and read a failure — so the form takes the prompt's place until
   * there is an account to charge. Everything already generated stays listed.
   */
  if (signedOut)
    return (
      <div className={styles.stack}>
        <p className={styles.notice}>
          This render service meters generation against an account. Everything else in
          the editor works without one.
        </p>
        <SignIn compact />
        <div className={styles.group}>
          <h3 className={styles.groupTitle}>Generated</h3>
          <MediaPanel
            filter={filter}
            origin="ai"
            allowUpload={false}
            empty="Nothing generated yet."
            onInsert={onInsert}
          />
        </div>
      </div>
    );

  return (
    <div className={styles.stack}>
      {/* One option is not a choice — a lone "tab" that cannot be switched away
          from is chrome pretending to be a control. */}
      {offered.length > 1 && (
        <div className={styles.modes} role="tablist">
          {offered.map((m) => (
            <button
              key={m.key}
              role="tab"
              aria-selected={active.key === m.key}
              className={styles.mode}
              data-on={active.key === m.key}
              onClick={() => setMode(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      <textarea
        className={styles.prompt}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={active.placeholder}
        aria-label={`${active.label} prompt`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && prompt.trim()) fire();
        }}
      />

      <button className={styles.go} onClick={fire} disabled={!prompt.trim()}>
        <span>Generate</span>
        {/* Never surprise anyone with the charge — show it before firing. */}
        <span className={`${styles.cost} w-data`}>{active.cost} credits</span>
      </button>

      {balance != null && (
        <span className={`${styles.balance} w-data`}>{balance} credits remaining</span>
      )}

      {notice && <p className={styles.notice}>{notice}</p>}

      {jobs.length > 0 && (
        <div className={styles.group}>
          <h3 className={styles.groupTitle}>Working</h3>
          {jobs.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              onCancel={() => cancel(job.id)}
              onDismiss={() => dismiss(job.id)}
            />
          ))}
        </div>
      )}

      <div className={styles.group}>
        <h3 className={styles.groupTitle}>Generated</h3>
        <MediaPanel
          filter={filter}
          origin="ai"
          allowUpload={false}
          empty="Nothing generated yet. Results are stored in this browser, not on a server."
          onInsert={onInsert}
        />
      </div>
    </div>
  );
}

/** No progress bar: the service surfaces none, and a fake one is a lie. */
function JobRow({
  job,
  onCancel,
  onDismiss,
}: {
  job: Job;
  onCancel(): void;
  onDismiss(): void;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (job.status !== 'running') return;
    const id = setInterval(
      () => setElapsed(Math.round((Date.now() - job.startedAt) / 1000)),
      500,
    );
    return () => clearInterval(id);
  }, [job.status, job.startedAt]);

  const expect = MODES.find((m) => m.key === job.mode)?.expect ?? '';

  return (
    <article className={styles.job}>
      <Plate size={44} running={job.status === 'running'} live={job.status === 'running'} />
      <div className={styles.jobBody}>
        <span className={styles.jobPrompt}>{job.prompt}</span>
        {job.status === 'error' ? (
          <>
            <span className={styles.jobError}>{job.error}</span>
            <button className={styles.jobCancel} onClick={onDismiss}>
              Dismiss
            </button>
          </>
        ) : (
          <>
            <span className={`${styles.jobMeta} w-data`}>
              {elapsed}s · {expect}
            </span>
            <button
              className={styles.jobCancel}
              onClick={onCancel}
              title="Credits are charged before generation, so cancelling does not refund them."
            >
              <Icon name="close" size={11} /> Cancel
            </button>
          </>
        )}
      </div>
    </article>
  );
}
