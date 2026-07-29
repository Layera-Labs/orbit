import process from 'node:process';
import { createServer } from './server.js';

// Load `apps/render-service/.env` (gitignored) if present, so the developer can
// keep REPLICATE_API_TOKEN etc. in a file instead of exporting it each run. Uses
// Node's built-in loader; a missing file is fine (rely on the ambient env).
try {
  (process as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.();
} catch {
  // no .env file — use the ambient environment
}

const port = Number(process.env.PORT ?? 8787);
const app = createServer();
const server = app.listen(port, () => {
  console.log(`[orbit] render service listening on :${port}`);
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
  console.log(`[orbit] ${signal} received, shutting down`);

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
