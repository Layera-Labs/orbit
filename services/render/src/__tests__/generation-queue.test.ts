// @vitest-environment node
//
// The generation queue's SQL, actually executed.
//
// Everything about the WORKER'S behaviour is proven in
// `packages/pipeline/src/__tests__/queue.test.ts`, against the in-memory queue,
// with no database. What is left here is the part an in-memory implementation
// cannot tell you anything about: whether the SQL parses, whether the guards
// are really in the WHERE clauses, and whether the two tables stay the same age.
//
// The house pattern for that has been `TEST_DATABASE_URL`, which means the SQL
// is unexecuted in ordinary CI and first runs on a deploy. So this suite runs
// against PGlite — real Postgres compiled to WASM, in-process, no daemon — and
// ALSO against a real server when TEST_DATABASE_URL is set:
//
//   TEST_DATABASE_URL="postgres://user:pass@host/db?sslmode=require" pnpm test
//
// One honest limit: PGlite is a single connection, so `Promise.all` over eight
// claims serializes. The concurrency test below therefore passes there for a
// weaker reason than it does against a real server — SKIP LOCKED under genuine
// contention is only proven by the gated run.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { runStep } from '@layera-labs/pipeline';
import { makePgPool } from '../pg-store';
import { PgGenerationQueue, PgStepLog } from '../generation-queue';

/**
 * PGlite in the shape the stores expect.
 *
 * They use exactly one thing — `query(text, params) => {rows, rowCount}` — so
 * the adapter is the whole compatibility layer. `affectedRows` is PGlite's name
 * for what `pg` calls `rowCount`, and `sweep` reads it.
 */
function pglitePool(db: PGlite): Pool {
  return {
    query: async (text: string, params?: unknown[]) => {
      const r = await db.query(text, params as never[]);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
    end: async () => db.close(),
  } as unknown as Pool;
}

const REAL = process.env.TEST_DATABASE_URL;

const backends: { name: string; make: () => Promise<Pool>; skip: boolean }[] = [
  { name: 'PGlite', make: async () => pglitePool(await PGlite.create()), skip: false },
  { name: 'Postgres', make: async () => makePgPool(REAL!), skip: !REAL },
];

for (const backend of backends) {
  describe.skipIf(backend.skip)(`generation queue (${backend.name})`, () => {
    let pool: Pool;
    const prefix = `test_gen_${process.pid}`;
    const id = (s: string) => `${prefix}_${s}`;

    beforeAll(async () => {
      pool = await backend.make();
      await new PgGenerationQueue(pool).whenReady();
    });

    /*
     * A clean slate per test, not per file. These share one database, and a job
     * left `running` by an earlier test is claimable by a later one that uses a
     * shorter stale window — which reads as the claim being broken when it is
     * the fixture that is dirty.
     */
    beforeEach(async () => {
      await pool.query('DELETE FROM generation_jobs WHERE id LIKE $1', ['test_gen_%']);
    });

    afterAll(async () => {
      await pool.query('DELETE FROM generation_jobs WHERE id LIKE $1', ['test_gen_%']);
      await pool.end();
    });

    it('round-trips a job through its whole life', async () => {
      const q = new PgGenerationQueue(pool);
      const job = await q.enqueue(id('life'), { topic: 'why the sky is blue' });
      expect(job.status).toBe('queued');

      const claimed = await q.claim('w1');
      expect(claimed!.id).toBe(job.id);
      expect(claimed!.input).toEqual({ topic: 'why the sky is blue' });

      await q.setStep(job.id, 'speak', 'w1');
      expect((await q.get(job.id))!.step).toBe('speak');

      await q.finish(job.id, { url: 'out.mp4' }, 'w1');
      const done = (await q.get(job.id))!;
      expect(done.status).toBe('done');
      expect(done.result).toEqual({ url: 'out.mp4' });
      expect(done.finishedAt).toBeGreaterThan(0);
    });

    /*
     * `FOR UPDATE SKIP LOCKED` is what stops two workers polling at the same
     * instant from both taking the same job — and paying every provider for it
     * twice. See the note at the top about what this does and does not prove
     * under PGlite.
     */
    it('hands one job to exactly one worker', async () => {
      const q = new PgGenerationQueue(pool);
      await q.enqueue(id('race'), {});
      const claims = await Promise.all(
        Array.from({ length: 8 }, (_, i) => q.claim(`w${i}`)),
      );
      expect(claims.filter((c) => c?.id === id('race'))).toHaveLength(1);
    });

    /*
     * Being declared stale does not stop a process — it only means nobody heard
     * from it. So the superseded worker is still running and will still call
     * `finish`. Every write is guarded on the claim for that reason.
     */
    it('ignores every write from a worker that no longer holds the claim', async () => {
      // Stale immediately, so the second claim can take it.
      const q = new PgGenerationQueue(pool, 0);
      await q.enqueue(id('stale'), {});
      await q.claim('old');
      await new Promise((r) => setTimeout(r, 10));
      expect((await q.claim('new'))!.id).toBe(id('stale'));

      await q.setStep(id('stale'), 'speak', 'old');
      await q.finish(id('stale'), 'stale.mp4', 'old');
      await q.fail(id('stale'), 'stale error', 'old');
      await q.release(id('stale'), 'old');

      const seen = (await q.get(id('stale')))!;
      expect(seen.status).toBe('running');
      expect(seen.step).toBeUndefined();
      expect(seen.result).toBeUndefined();

      await q.finish(id('stale'), 'real.mp4', 'new');
      expect((await q.get(id('stale')))!.result).toBe('real.mp4');
    });

    /*
     * Asserted on `claimed_at` itself, not by racing a short stale window
     * against the clock. The first version of this test used a 60ms window and
     * two sleeps, which is fine in-process and meaningless against a remote
     * server where one round trip is measured in seconds — it failed there
     * while the code was correct. What the heartbeat actually promises is that
     * the deadline moves, and only for the worker holding the claim.
     */
    it('pushes the stale deadline out, and only for the worker holding it', async () => {
      const q = new PgGenerationQueue(pool);
      await q.enqueue(id('beat'), {});
      await q.claim('old');
      const claimedAt = async () =>
        new Date(
          (
            await pool.query('SELECT claimed_at FROM generation_jobs WHERE id = $1', [
              id('beat'),
            ])
          ).rows[0].claimed_at,
        ).getTime();
      const first = await claimedAt();

      await q.heartbeat(id('beat'), 'someone-else');
      expect(await claimedAt()).toBe(first);

      // Separation only, so `now()` cannot land in the same millisecond. The
      // assertion below is about which value moved, not about how long it took.
      await new Promise((r) => setTimeout(r, 5));
      await q.heartbeat(id('beat'), 'old');
      expect(await claimedAt()).toBeGreaterThan(first);
    });

    it('puts a released job back for whoever is still up', async () => {
      const q = new PgGenerationQueue(pool);
      await q.enqueue(id('release'), {});
      await q.claim('old');
      await q.release(id('release'), 'old');
      expect((await q.get(id('release')))!.status).toBe('queued');
      expect((await q.claim('new'))!.id).toBe(id('release'));
    });

    it('claims oldest first', async () => {
      const q = new PgGenerationQueue(pool);
      await q.enqueue(id('older'), {});
      await new Promise((r) => setTimeout(r, 5));
      await q.enqueue(id('newer'), {});
      expect((await q.claim('w'))!.id).toBe(id('older'));
    });
  });

  describe.skipIf(backend.skip)(`generation step log (${backend.name})`, () => {
    let pool: Pool;
    const prefix = `test_gen_${process.pid}_s`;
    const id = (s: string) => `${prefix}_${s}`;

    beforeAll(async () => {
      pool = await backend.make();
      await new PgGenerationQueue(pool).whenReady();
    });

    /*
     * A clean slate per test, not per file. These share one database, and a job
     * left `running` by an earlier test is claimable by a later one that uses a
     * shorter stale window — which reads as the claim being broken when it is
     * the fixture that is dirty.
     */
    beforeEach(async () => {
      await pool.query('DELETE FROM generation_jobs WHERE id LIKE $1', ['test_gen_%']);
    });

    afterAll(async () => {
      await pool.query('DELETE FROM generation_jobs WHERE id LIKE $1', ['test_gen_%']);
      await pool.end();
    });

    const fresh = async (name: string) => {
      const q = new PgGenerationQueue(pool);
      const job = await q.enqueue(id(name), {});
      return { q, log: new PgStepLog(q, pool), job: job.id };
    };

    it('does not run a step a second time', async () => {
      const { log, job } = await fresh('once');
      let calls = 0;
      const run = () =>
        runStep(log, job, 'speak', async () => {
          calls++;
          return { audio: 'vo.mp3', durationSec: 4.2 };
        });

      expect(await run()).toEqual({ audio: 'vo.mp3', durationSec: 4.2 });
      expect(await run()).toEqual({ audio: 'vo.mp3', durationSec: 4.2 });
      expect(calls).toBe(1);
    });

    /*
     * A step that BEGAN is not a step that finished. Filtering on a non-null
     * result would get this right by accident — a step that legitimately
     * returns null stores JSONB null, which is not SQL NULL — and any refactor
     * would get it wrong. That is why the column is a timestamp.
     */
    it('does not treat a begun step as a completed one', async () => {
      const { log, job } = await fresh('begun');
      await log.begin(job, 'speak');
      expect(await log.completed(job)).toEqual([]);
    });

    it('stores a result that is legitimately null', async () => {
      const { log, job } = await fresh('null');
      expect(await runStep(log, job, 'align', async () => null)).toBeNull();
      // Completed, not merely begun — the distinction `completed_at` protects.
      expect(await log.completed(job)).toHaveLength(1);
    });

    it('counts attempts, so a step being paid for twice is visible', async () => {
      const { log, job } = await fresh('attempts');
      await runStep(log, job, 'speak', async () => {
        throw new Error('crashed after the provider call');
      }).catch(() => undefined);
      await runStep(log, job, 'speak', async () => 'vo.mp3');
      const [record] = await log.completed(job);
      expect(record.attempts).toBe(2);
    });

    /*
     * Two workers inside the same step. Both run and both pay — preventing that
     * is the claim's job, not this one. What must hold is that they carry the
     * SAME value forward, or one video is assembled from two sets of assets.
     */
    it('converges on one result when two workers race a step', async () => {
      const { log, job } = await fresh('race');
      const [a, b] = await Promise.all([
        runStep(log, job, 'speak', async () => 'from-a.mp3'),
        runStep(log, job, 'speak', async () => 'from-b.mp3'),
      ]);
      expect(a).toBe(b);
      expect(await log.completed(job)).toHaveLength(1);
    });

    it('keys on the job as well as the step', async () => {
      const one = await fresh('key1');
      const two = await fresh('key2');
      let calls = 0;
      const fn = async () => {
        calls++;
        return 'x';
      };
      await runStep(one.log, one.job, 'speak', fn);
      await runStep(two.log, two.job, 'speak', fn);
      expect(calls).toBe(2);
    });

    it('resumes a job, running only the step that is left', async () => {
      const { log, job } = await fresh('resume');
      const calls: string[] = [];
      await runStep(log, job, 'plan', async () => {
        calls.push('plan');
        return { scenes: 2 };
      });
      await expect(
        runStep(log, job, 'speak', async () => {
          calls.push('speak');
          throw new Error('elevenlabs 429');
        }),
      ).rejects.toThrow('429');

      calls.length = 0;
      await runStep(log, job, 'plan', async () => {
        calls.push('plan');
        return { scenes: 99 };
      });
      await runStep(log, job, 'speak', async () => {
        calls.push('speak');
        return 'vo.mp3';
      });
      // The planner was not paid for twice, and the retry got the FIRST plan.
      expect(calls).toEqual(['speak']);
      const plan = (await log.completed(job)).find((r) => r.step === 'plan');
      expect(plan!.result).toEqual({ scenes: 2 });
    });

    /*
     * The sweep exists so the jobs table does not grow without end. Without the
     * cascade its step rows outlive it forever, since nothing else ever knows
     * that job id again.
     */
    it('takes a job’s steps with it when the job is swept', async () => {
      const { q, log, job } = await fresh('sweep');
      await q.claim('w1');
      await runStep(log, job, 'speak', async () => 'vo.mp3');
      await q.finish(job, 'out.mp4', 'w1');

      // Still inside its time to live: a finished job is not swept the moment
      // it finishes, or a client polling for its result finds nothing there.
      await q.sweep(60_000);
      expect(await q.get(job)).not.toBeNull();

      await new Promise((r) => setTimeout(r, 5));
      expect(await q.sweep(0)).toBe(1);
      expect(await q.get(job)).toBeNull();
      const rows = await pool.query(
        'SELECT count(*)::int AS n FROM generation_steps WHERE job_id = $1',
        [job],
      );
      expect(rows.rows[0].n).toBe(0);
    });
  });
}
