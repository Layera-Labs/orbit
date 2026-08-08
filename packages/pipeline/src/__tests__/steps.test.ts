/**
 * A retry must not re-charge a provider.
 *
 * This is the property the whole generation pipeline rests on, and it is worth
 * being precise about what it means. It is not "the job eventually succeeds" —
 * retrying from the top would achieve that, at the cost of paying for every
 * step that had already worked. It is that a step which HAS run does not run
 * again, so the retry is free.
 *
 * The tests below spy on how many times a step's function is actually invoked,
 * because that count is the money.
 */
import { describe, expect, it, vi } from 'vitest';
import { InMemoryStepLog, runSequence, runStep, type StepLog } from '../steps.ts';

const JOB = 'gen_7';

describe('runStep', () => {
  it('runs a step that has not run', async () => {
    const log = new InMemoryStepLog();
    const fn = vi.fn(async () => 'voice.mp3');
    expect(await runStep(log, JOB, 'speak', fn)).toBe('voice.mp3');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  /* The one that matters. Not "returns the same answer" — does not CALL it. */
  it('does not call a step that has already run', async () => {
    const log = new InMemoryStepLog();
    const fn = vi.fn(async () => 'voice.mp3');
    await runStep(log, JOB, 'speak', fn);
    const again = await runStep(log, JOB, 'speak', fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(again).toBe('voice.mp3');
  });

  /*
   * Recording only "done" would let a retry skip the step and then have nothing
   * to carry forward — the same failure in a tidier shape. The result has to
   * survive, which is why it must be data rather than a handle.
   */
  it('gives back what the step produced, from the record', async () => {
    const log = new InMemoryStepLog();
    const value = { audio: 'vo.mp3', durationSec: 4.2 };
    await runStep(log, JOB, 'speak', async () => value);

    const resumed = await runStep(log, JOB, 'speak', async () => {
      throw new Error('must not run');
    });
    expect(resumed).toEqual(value);
  });

  it('keys on the job as well as the step', async () => {
    const log = new InMemoryStepLog();
    const fn = vi.fn(async () => 'x');
    await runStep(log, 'gen_1', 'speak', fn);
    await runStep(log, 'gen_2', 'speak', fn);
    // Two different videos, both of which need speaking.
    expect(fn).toHaveBeenCalledTimes(2);
  });

  /*
   * A failure records nothing, so the step is retried. The alternative — mark
   * it done and move on — would carry an undefined result into a step that
   * needs a real one, and fail later somewhere with no obvious cause.
   */
  it('records nothing when a step throws', async () => {
    const log = new InMemoryStepLog();
    await expect(
      runStep(log, JOB, 'speak', async () => {
        throw new Error('provider 503');
      }),
    ).rejects.toThrow('provider 503');
    expect(await log.completed(JOB)).toEqual([]);

    const fn = vi.fn(async () => 'recovered.mp3');
    expect(await runStep(log, JOB, 'speak', fn)).toBe('recovered.mp3');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  /*
   * The gap this cannot close: the provider returned and the write did not
   * happen. The work was paid for and is not remembered, so the retry pays
   * again — and `attempts` is the only signal that it did.
   */
  it('counts attempts, so a step being paid for twice is visible', async () => {
    const log = new InMemoryStepLog();
    await runStep(log, JOB, 'speak', async () => {
      throw new Error('crashed after the provider call');
    }).catch(() => undefined);
    await runStep(log, JOB, 'speak', async () => 'vo.mp3');

    const [record] = await log.completed(JOB);
    expect(record.attempts).toBe(2);
  });

  /*
   * Two workers on one step. What this guarantees is CONVERGENCE, not
   * exclusion: both calls still run, so both still pay. `complete` returns the
   * FIRST record rather than replacing it and `runStep` returns what was
   * stored, so both workers carry the same value forward — without that, one
   * video gets assembled from two different sets of assets, which is a far
   * worse outcome than paying twice.
   *
   * Preventing the second call from happening at all is the QUEUE's job: only
   * one worker holds the claim on a job. This is the second line, for the
   * window where a stale claim has been re-offered while the original worker
   * is still alive.
   */
  it('converges on one result when two workers race a step', async () => {
    const log = new InMemoryStepLog();
    const [a, b] = await Promise.all([
      runStep(log, JOB, 'speak', async () => 'from-worker-a.mp3'),
      runStep(log, JOB, 'speak', async () => 'from-worker-b.mp3'),
    ]);
    expect(a).toBe(b);
    expect(await log.completed(JOB)).toHaveLength(1);
  });
});

describe('runSequence', () => {
  const chain = (calls: string[]) => [
    { name: 'plan', run: async () => { calls.push('plan'); return { scenes: 2 }; } },
    { name: 'speak', run: async (p: { scenes: number }) => { calls.push('speak'); return { audio: p.scenes }; } },
    { name: 'render', run: async (s: { audio: number }) => { calls.push('render'); return `out-${s.audio}.mp4`; } },
  ];

  it('threads each step into the next', async () => {
    const calls: string[] = [];
    const out = await runSequence(new InMemoryStepLog(), JOB, chain(calls), null);
    expect(out).toBe('out-2.mp4');
    expect(calls).toEqual(['plan', 'speak', 'render']);
  });

  /*
   * The real shape of a retry: two steps succeeded, the third failed, and the
   * job is run again. Only the third should cost anything.
   */
  it('resumes where it stopped, running only what is left', async () => {
    const log = new InMemoryStepLog();
    const calls: string[] = [];
    const steps = chain(calls);
    const failing = [...steps.slice(0, 2), { name: 'render', run: async () => { throw new Error('ffmpeg died'); } }];

    await expect(runSequence(log, JOB, failing, null)).rejects.toThrow('ffmpeg died');
    expect(calls).toEqual(['plan', 'speak']);

    calls.length = 0;
    const out = await runSequence(log, JOB, steps, null);
    expect(out).toBe('out-2.mp4');
    // Neither of the two that already ran was paid for again.
    expect(calls).toEqual(['render']);
  });

  /*
   * The name IS the key, so renaming a step makes it run again. That is
   * correct — it is a different step now — and worth knowing before renaming
   * one casually on a job that is mid-flight.
   */
  it('treats a renamed step as a new one', async () => {
    const log = new InMemoryStepLog();
    const fn = vi.fn(async () => 'x');
    await runSequence(log, JOB, [{ name: 'speak', run: fn }], null);
    await runSequence(log, JOB, [{ name: 'narrate', run: fn }], null);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('the store seam', () => {
  /* Anything satisfying `StepLog` works, so Postgres has nothing in it but SQL. */
  it('drives runStep from a hand-written log', async () => {
    const records: { step: string; result: unknown; at: string; attempts: number }[] = [];
    const custom: StepLog = {
      completed: async () => records,
      begin: async () => 1,
      complete: async (_job, step, result) => {
        const r = { step, result, at: 'then', attempts: 1 };
        records.push(r);
        return r;
      },
    };
    expect(await runStep(custom, JOB, 'speak', async () => 'a.mp3')).toBe('a.mp3');
    expect(await runStep(custom, JOB, 'speak', async () => 'b.mp3')).toBe('a.mp3');
  });
});
