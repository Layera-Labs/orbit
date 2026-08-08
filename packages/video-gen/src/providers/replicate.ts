/**
 * Replicate-backed `MediaProvider` (image generation). Held server-side with the
 * developer's API token; wrapped by `GenerationService` for credit metering.
 *
 * Uses Replicate's model-prediction endpoint with `Prefer: wait` (blocks up to
 * ~60s and returns the finished prediction); falls back to polling the prediction
 * URL if it comes back non-terminal. A thrown call is never charged (the service
 * debits only on a resolved result).
 */
import type { GenImageRequest, GenResult, MediaProvider } from '../types';

const REPLICATE_API = 'https://api.replicate.com/v1';
/** Fast, inexpensive text-to-image default (square, ~1s). */
const DEFAULT_MODEL = 'black-forest-labs/flux-schnell';
const TERMINAL = new Set(['succeeded', 'failed', 'canceled']);

export interface ReplicateProviderOptions {
  /** Replicate API token (the developer's key, held server-side). */
  token?: string;
  /** Default model slug `owner/name` (overridable per request via `req.model`). */
  model?: string;
  /** Extra model input merged into every request (model-specific fields). */
  defaultInput?: Record<string, unknown>;
  /** Poll interval (ms) when `Prefer: wait` returns a non-terminal prediction. */
  pollMs?: number;
  /** Overall timeout (ms) for a generation. */
  timeoutMs?: number;
  /** Injectable fetch, for tests. */
  fetchImpl?: typeof fetch;
}

interface Prediction {
  id: string;
  status: string;
  output?: unknown;
  error?: unknown;
  urls?: { get?: string };
}

export class ReplicateProvider implements MediaProvider {
  private token: string;
  private model: string;
  private defaultInput: Record<string, unknown>;
  private pollMs: number;
  private timeoutMs: number;
  private fetchImpl: typeof fetch;

  constructor(opts: ReplicateProviderOptions = {}) {
    this.token = opts.token ?? '';
    this.model = opts.model ?? DEFAULT_MODEL;
    this.defaultInput = opts.defaultInput ?? {};
    this.pollMs = opts.pollMs ?? 1500;
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', ...extra };
  }

  async generateImage(req: GenImageRequest): Promise<GenResult> {
    const startedAt = Date.now();
    if (!this.token) throw new Error('ReplicateProvider: missing API token');
    const model = req.model ?? this.model;
    const res = await this.fetchImpl(`${REPLICATE_API}/models/${model}/predictions`, {
      method: 'POST',
      headers: this.headers({ Prefer: 'wait' }),
      body: JSON.stringify({ input: { prompt: req.prompt, ...this.defaultInput } }),
    });
    if (!res.ok) throw new Error(`Replicate ${res.status}: ${await safeText(res)}`);
    const settled = await this.settle((await res.json()) as Prediction);
    if (settled.status !== 'succeeded') {
      throw new Error(`Replicate generation ${settled.status}: ${String(settled.error ?? 'unknown error')}`);
    }
    const url = pickUrl(settled.output);
    if (!url) throw new Error('Replicate returned no output URL');
    return {
      url,
      meta: { provider: 'replicate', model, id: settled.id },
      usage: {
        provider: 'replicate',
        model,
        ms: Date.now() - startedAt,
        units: 1,
        unit: 'images',
      },
    };
  }

  /** Poll the prediction until it reaches a terminal state. */
  private async settle(pred: Prediction): Promise<Prediction> {
    const getUrl = pred.urls?.get;
    const deadline = Date.now() + this.timeoutMs;
    let cur = pred;
    while (!TERMINAL.has(cur.status)) {
      if (!getUrl || Date.now() > deadline) throw new Error('Replicate generation timed out');
      await sleep(this.pollMs);
      const r = await this.fetchImpl(getUrl, { headers: this.headers() });
      if (!r.ok) throw new Error(`Replicate poll ${r.status}: ${await safeText(r)}`);
      cur = (await r.json()) as Prediction;
    }
    return cur;
  }
}

/** Replicate `output` is a URL string or an array of URL strings. */
function pickUrl(output: unknown): string | null {
  if (typeof output === 'string') return output;
  if (Array.isArray(output) && output.length && typeof output[0] === 'string') return output[0];
  return null;
}

async function safeText(r: Response): Promise<string> {
  try {
    return await r.text();
  } catch {
    return '';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
