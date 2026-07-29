// @vitest-environment node
//
// The shared render queue, against a REAL Postgres.
//
// Every interesting property here is a property of the database — SKIP LOCKED
// handing two pollers two different rows, a stale claim becoming available
// again — and none of them can be observed against a fake. The suite skips
// itself when there is no ORBIT_TEST_DATABASE_URL rather than passing on a
// stub and implying it checked something.
//
//   docker run -d --rm -e POSTGRES_PASSWORD=orbit -e POSTGRES_DB=orbit \
//     -p 55432:5432 postgres:16-alpine
//   ORBIT_TEST_DATABASE_URL=postgres://postgres:orbit@localhost:55432/orbit pnpm test
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { makePgPool } from '../pg-store.js';
import { PgJobQueue } from '../job-queue.js';

const URL = process.env.ORBIT_TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;

let pool: Pool;
let queue: PgJobQueue;

const project = { id: 'p', width: 64, height: 64 };

beforeAll(async () => {
  if (!URL) return;
  pool = makePgPool(URL);
  await pool.query('DROP TABLE IF EXISTS render_jobs');
  queue = new PgJobQueue(pool, 500); // a short stale window, so the sweep is testable
});

// Each test starts from an empty queue. Without this the FIRST test's rows are
// still queued when the "claims oldest first" test runs, and it dutifully
// claims one of those — a failure that says nothing about the queue.
beforeEach(async () => {
  if (URL) await pool.query('TRUNCATE render_jobs');
});

afterAll(async () => {
  if (pool) await pool.end();
});

suite('PgJobQueue', () => {
  it('accepts a job and reads it back from anywhere', async () => {
    const job = await queue.enqueue('j1', project);
    expect(job.status).toBe('queued');
    expect((await queue.get('j1'))?.status).toBe('queued');
  });

  it('is null for an id it has never seen', async () => {
    expect(await queue.get('nope')).toBeNull();
  });

  /*
   * THE property. Two workers polling at the same instant must get two
   * different rows — not block on each other, and above all not both render the
   * same job and both charge for it.
   */
  it('never hands the same job to two workers', async () => {
    await queue.enqueue('a', project);
    await queue.enqueue('b', project);
    const [one, two] = await Promise.all([queue.claim('w1'), queue.claim('w2')]);
    expect(one).not.toBeNull();
    expect(two).not.toBeNull();
    expect(one!.id).not.toBe(two!.id);
  });

  it('claims oldest first', async () => {
    await queue.enqueue('first', project);
    await new Promise((r) => setTimeout(r, 10));
    await queue.enqueue('second', project);
    expect((await queue.claim('w'))?.id).toBe('first');
  });

  it('gives the work back, project and all', async () => {
    await queue.enqueue('withProject', { ...project, marker: 42 }, { fps: 24 });
    const claimed = await queue.claim('w');
    expect(claimed?.project).toMatchObject({ marker: 42 });
    expect(claimed?.output).toMatchObject({ fps: 24 });
  });

  it('returns nothing when the queue is empty rather than blocking', async () => {
    expect(await queue.claim('w')).toBeNull();
  });

  /*
   * A worker that dies mid-render must not strand its job in `running`
   * forever — nothing else would ever look at it again.
   */
  it('re-offers a job whose worker went quiet', async () => {
    await queue.enqueue('orphan', project);
    expect((await queue.claim('doomed'))?.id).toBe('orphan');
    expect(await queue.claim('other')).toBeNull(); // still fresh
    await new Promise((r) => setTimeout(r, 700)); // past the stale window
    expect((await queue.claim('rescuer'))?.id).toBe('orphan');
  });

  it('holds a claim while the worker keeps saying it is alive', async () => {
    await queue.enqueue('long', project);
    await queue.claim('busy');
    await new Promise((r) => setTimeout(r, 350));
    await queue.heartbeat('long');
    await new Promise((r) => setTimeout(r, 350));
    // Would be past the 500ms window without the heartbeat.
    expect(await queue.claim('thief')).toBeNull();
  });

  it('records a result, and a failure', async () => {
    await queue.enqueue('ok', project);
    await queue.claim('w');
    await queue.finish('ok', '/files/v.mp4');
    expect(await queue.get('ok')).toMatchObject({ status: 'done', url: '/files/v.mp4' });

    await queue.enqueue('bad', project);
    await queue.claim('w');
    await queue.fail('bad', 'ffmpeg exited 1');
    expect(await queue.get('bad')).toMatchObject({ status: 'error', error: 'ffmpeg exited 1' });
  });

  it('counts what is in flight, for /health', async () => {
    await queue.enqueue('d1', project);
    await queue.enqueue('d2', project);
    await queue.claim('w');
    expect(await queue.depth()).toEqual({ queued: 1, running: 1 });
  });

  it('sweeps finished rows and leaves live ones alone', async () => {
    await queue.enqueue('old', project);
    await queue.claim('w');
    await queue.finish('old', '/files/old.mp4');
    const before = await queue.depth();
    expect(await queue.sweep(0)).toBeGreaterThan(0);
    expect(await queue.get('old')).toBeNull();
    expect(await queue.depth()).toEqual(before);
  });
});
