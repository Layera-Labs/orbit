import { createServer } from './server.js';

const port = Number(process.env.PORT ?? 8787);
createServer().listen(port, () => {
  console.log(`[orbit] render service listening on :${port}`);
});
