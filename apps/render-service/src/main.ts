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
createServer().listen(port, () => {
  console.log(`[orbit] render service listening on :${port}`);
});
