/**
 * The worker loop, proven without a database.
 *
 * This is where the queue's behaviour is actually established. The Postgres
 * implementation's own tests are gated on `TEST_DATABASE_URL` and do not run in
 * ordinary CI, so if the loop were only exercised there it would be exercised
 * nowhere. Everything below runs against `InMemoryGenerationQueue`, which
 * enforces the same claim guard the SQL does — a suite that never checks a
 * superseded worker would pass against a store that loses jobs in production.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  InMemoryGenerationQueue,
  startGenerationWorker,
  type GenerationJob,
} from '../queue.ts';

/** Wait for a condition rather than for a duration; a sleep would be a race. */
async function until(fn: () => boolean | Promise<boolean>, ms = 2000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!(await fn())) {
    if (Date.now() > deadline) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 1));
  }
}

const statusOf = async (q: InMemoryGenerationQueue, id: string) => (await q.get(id))?.status;
const stepOf = async (q: InMemoryGenerationQueue, id: string) => (await q.get(id))?.step;

const start = (
  queue: InMemoryGenerationQueue,
  handle: (j: GenerationJob, setStep: (s: string) => void) => Promise<unknown>,
  opts: { onError?: (e: string, err: unknown) => void } = {},
) =>
  startGenerationWorker({
    queue,
    workerId: 'w1',
    handle,
    pollMs: 1,
    heartbeatMs: 5,
    onError: opts.onError,
  });

/** A handler that blocks until the test lets it finish. */
function gate() {
  let open!: () => void;
  const held = new Promise<void>((r) => (open = r));
  return { held, open };
}

describe('the worker loop', () => {
  it('claims a queued job, runs it, and records what it returned', async () => {
    const queue = new InMemoryGenerationQueue();
    const job = await queue.enqueue('g1', { topic: 'why the sky is blue' });
    const worker = start(queue, async (j) => `out:${(j.input as { topic: string }).topic}`);

    await until(async () => (await statusOf(queue, job.id)) === 'done');
    await worker.stop();
    expect((await queue.get(job.id))!.result).toBe('out:why the sky is blue');
  });

  /*
   * A generation that fails must not take the worker with it. Ending the loop
   * would remove this box from the cluster silently — the only symptom would be
   * that everything got slower.
   */
  it('fails one job and keeps going', async () => {
    const queue = new InMemoryGenerationQueue();
    const bad = await queue.enqueue('n1', { n: 1 });
    const good = await queue.enqueue('n2', { n: 2 });
    const errors: string[] = [];
    const worker = start(
      queue,
      async (j) => {
        if (j.id === bad.id) throw new Error('elevenlabs 429');
        return 'ok';
      },
      { onError: (e) => errors.push(e) },
    );

    await until(async () => (await statusOf(queue, good.id)) === 'done');
    await worker.stop();

    const failed = (await queue.get(bad.id))!;
    expect(failed.status).toBe('error');
    expect(failed.error).toBe('elevenlabs 429');
    expect(errors).toContain('generation-failed');
  });

  it('reports where a job has got to', async () => {
    const queue = new InMemoryGenerationQueue();
    const job = await queue.enqueue('j1', {});
    const g = gate();
    const worker = start(queue, async (_j, setStep) => {
      setStep('speak');
      await g.held;
      return 'ok';
    });

    await until(async () => (await stepOf(queue, job.id)) === 'speak');
    g.open();
    await until(async () => (await statusOf(queue, job.id)) === 'done');
    await worker.stop();
  });

  /*
   * A long generation has to keep saying it is alive, or the stale sweep hands
   * its job to a second worker — which starts from the top and pays every
   * provider again, because it has its own view of what has been done.
   */
  it('heartbeats while a job is running and stops afterwards', async () => {
    const queue = new InMemoryGenerationQueue();
    const beats = vi.spyOn(queue, 'heartbeat');
    const job = await queue.enqueue('j2', {});
    const g = gate();
    const worker = start(queue, async () => {
      await g.held;
      return 'ok';
    });

    await until(() => beats.mock.calls.length >= 2);
    g.open();
    await until(async () => (await statusOf(queue, job.id)) === 'done');
    const afterFinish = beats.mock.calls.length;
    await new Promise((r) => setTimeout(r, 40));
    await worker.stop();

    // A leaked interval would keep declaring a finished job alive, which is the
    // one thing that stops the stale sweep from ever recovering anything.
    expect(beats.mock.calls.length).toBe(afterFinish);
  });

  /*
   * Shutdown does NOT wait for a generation — it runs for minutes and a deploy
   * cannot wait. The job goes back for whoever is still up.
   */
  it('hands an in-flight job back on stop rather than failing it', async () => {
    const queue = new InMemoryGenerationQueue();
    const job = await queue.enqueue('j3', {});
    const g = gate();
    const worker = start(queue, async () => {
      await g.held;
      return 'ok';
    });

    await until(() => worker.inFlight() === job.id);
    await worker.stop();
    expect(await statusOf(queue, job.id)).toBe('queued');

    /*
     * And the abandoned handler's eventual `finish` must not resurrect it. This
     * is why release happens BEFORE the handler returns: by the time it does,
     * the claim guard is already rejecting it.
     */
    g.open();
    await new Promise((r) => setTimeout(r, 30));
    expect(await statusOf(queue, job.id)).toBe('queued');
    expect((await queue.get(job.id))!.result).toBeUndefined();
  });

  it('does not take new work after being stopped', async () => {
    const queue = new InMemoryGenerationQueue();
    const worker = start(queue, async () => 'ok');
    // Let it settle into the poll before stopping, so this exercises a stop
    // against a live loop rather than one that never started.
    await new Promise((r) => setTimeout(r, 20));
    await worker.stop();

    const late = await queue.enqueue('j4', {});
    await new Promise((r) => setTimeout(r, 40));
    expect(await statusOf(queue, late.id)).toBe('queued');
  });

  /*
   * The window between deciding to stop and the claim coming back. Nothing is
   * held yet, so `stop` has nothing to release — and without the check after
   * the claim, the job is picked up by a process that is on its way out and
   * nobody sees it again until the stale sweep.
   */
  it('puts back a job claimed in the instant it was told to stop', async () => {
    const queue = new InMemoryGenerationQueue();
    const job = await queue.enqueue('j5', {});
    const real = queue.claim.bind(queue);
    const g = gate();
    vi.spyOn(queue, 'claim').mockImplementation(async (w) => {
      await g.held;
      return real(w);
    });
    const handle = vi.fn(async () => 'ok');
    const worker = start(queue, handle);

    await new Promise((r) => setTimeout(r, 10));
    const stopped = worker.stop();
    g.open();
    await stopped;
    await new Promise((r) => setTimeout(r, 30));

    expect(handle).not.toHaveBeenCalled();
    expect(await statusOf(queue, job.id)).toBe('queued');
  });

  /* A database blip is not a reason to leave the cluster. */
  it('survives a claim that throws', async () => {
    const queue = new InMemoryGenerationQueue();
    const errors: string[] = [];
    let failures = 0;
    const real = queue.claim.bind(queue);
    vi.spyOn(queue, 'claim').mockImplementation(async (w) => {
      if (failures++ < 2) throw new Error('ECONNRESET');
      return real(w);
    });
    const job = await queue.enqueue('j6', {});
    const worker = start(queue, async () => 'ok', { onError: (e) => errors.push(e) });

    await until(async () => (await statusOf(queue, job.id)) === 'done');
    await worker.stop();
    expect(errors).toContain('generation-claim-failed');
  });
});

describe('the claim guard', () => {
  /*
   * A hand-wound clock, not `setTimeout`. These are assertions about a stale
   * WINDOW, and a real one makes them both slow and flaky — the first attempt
   * at the test below passed a stale window of zero and then raced the
   * millisecond boundary, which reads as a broken guard.
   */
  const clocked = (staleMs: number) => {
    let t = 1_000;
    return {
      queue: new InMemoryGenerationQueue(staleMs, () => t),
      advance: (ms: number) => {
        t += ms;
      },
    };
  };

  /*
   * Being declared stale does not stop a process — it only means nobody heard
   * from it. So the superseded worker is still running, and will still call
   * `finish` on a job that now belongs to someone else. Every write is guarded
   * for that reason, and the in-memory queue enforces it so that no test above
   * can pass against a store that would lose data in Postgres.
   */
  it('ignores every write from a worker that no longer holds the claim', async () => {
    const { queue, advance } = clocked(50);
    const job = await queue.enqueue('j7', {});
    await queue.claim('old');
    advance(100);
    expect((await queue.claim('new'))!.id).toBe(job.id);

    await queue.setStep(job.id, 'speak', 'old');
    await queue.finish(job.id, 'stale.mp4', 'old');
    await queue.fail(job.id, 'stale error', 'old');
    await queue.release(job.id, 'old');

    const seen = (await queue.get(job.id))!;
    expect(seen.status).toBe('running');
    expect(seen.step).toBeUndefined();
    expect(seen.result).toBeUndefined();

    await queue.finish(job.id, 'real.mp4', 'new');
    expect((await queue.get(job.id))!.result).toBe('real.mp4');
  });

  it('re-offers a job whose worker has gone quiet', async () => {
    const { queue, advance } = clocked(50);
    const job = await queue.enqueue('j8', {});
    expect((await queue.claim('old'))!.id).toBe(job.id);
    // Still fresh: nobody else may take it.
    advance(40);
    expect(await queue.claim('new')).toBeNull();

    advance(20);
    expect((await queue.claim('new'))!.id).toBe(job.id);
  });

  it('keeps a claim alive across a heartbeat', async () => {
    const { queue, advance } = clocked(50);
    const job = await queue.enqueue('j9', {});
    await queue.claim('old');
    advance(40);
    await queue.heartbeat(job.id, 'old');
    advance(30);
    // 70ms since the claim, but only 30 since it last said anything.
    expect(await queue.claim('new')).toBeNull();
  });

  it('claims oldest first', async () => {
    const queue = new InMemoryGenerationQueue();
    await queue.enqueue('a', {});
    await queue.enqueue('b', {});
    expect((await queue.claim('w'))!.id).toBe('a');
  });
});
