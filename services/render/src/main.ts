import process from 'node:process';
import { createServer } from './server.js';
import { logError, logInfo } from './logging.js';

// Load `services/render/.env` (gitignored) if present, so the developer can
// keep REPLICATE_API_TOKEN etc. in a file instead of exporting it each run. Uses
// Node's built-in loader; a missing file is fine (rely on the ambient env).
try {
  (process as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.();
} catch {
  // no .env file — use the ambient environment
}

const port = Number(process.env.PORT ?? 8787);
const app = createServer();

/*
 * Fail the DEPLOY, not the first request.
 *
 * Every Pg store creates its own tables from its constructor and awaits that
 * promise inside each method. The tables therefore appeared on first use, which
 * meant a wrong DATABASE_URL, a revoked password or a schema that could not be
 * created showed up as a 500 on whoever clicked first — long after the deploy
 * that caused it had reported success, and with an error that named a query
 * rather than the configuration.
 *
 * Awaiting here inverts that: a broken database is a container that exits
 * non-zero and never takes traffic, which is what an orchestrator already knows
 * how to handle. With no DATABASE_URL there is nothing to wait for and this
 * resolves immediately.
 */
const readiness = (await app.locals.ready) as { ok: boolean; errors: string[] };
if (!readiness.ok) {
  for (const e of readiness.errors) logError('schema-not-ready', { msg: e });
  logError('startup-refused', { msg: 'the database is not usable' });
  process.exit(1);
}

const server = app.listen(port, () => {
  logInfo('listening', { port });
});

/**
 * Shut down on a signal, and ACTUALLY EXIT.
 *
 * The subtle part: installing a SIGTERM listener REPLACES Node's default
 * behaviour of terminating. A handler that only sets a flag therefore leaves
 * the process alive — `docker stop` waits out its grace period and then
 * SIGKILLs, which kills an in-flight encode with no chance to unwind it. Every
 * rolling deploy stranded whatever was rendering in `running`, owned by a
 * worker that no longer existed, until the stale sweep reclaimed it fifteen
 * minutes later.
 *
 * So: stop accepting connections, let the worker hand its job back, then exit.
 */
const GRACE_MS = Number(process.env.ORBIT_SHUTDOWN_GRACE_MS ?? 8000);
let closing = false;

async function stop(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  logInfo('shutdown', { signal });

  // Stop taking new work first, so nothing is claimed while we unwind.
  server.close();

  /*
   * Bounded. Releasing a claim is one UPDATE, but it runs against a database
   * that may be exactly what is unhealthy — and a shutdown that hangs gets
   * SIGKILLed anyway, losing the tidy exit this exists to perform.
   */
  const unwound = (app.locals.shutdown as (() => Promise<void>) | undefined)?.();
  await Promise.race([
    unwound ?? Promise.resolve(),
    new Promise((resolve) => setTimeout(resolve, GRACE_MS)),
  ]);

  process.exit(0);
}

process.once('SIGTERM', () => void stop('SIGTERM'));
process.once('SIGINT', () => void stop('SIGINT'));
