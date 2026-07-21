/**
 * Runway-backed `MediaProvider` (image generation via Gen-4). Held server-side
 * with the developer's API token; wrapped by `GenerationService` for metering.
 *
 * Runway is asynchronous: a generation returns a task id, which we poll (no
 * faster than every 5s, per Runway's guidance) until it reaches a terminal
 * state. A thrown call is never charged (the service debits only on success).
 * https://docs.dev.runwayml.com
 */
import type { GenImageRequest, GenResult, GenVideoRequest, MediaProvider } from '../types';
import { ProviderError } from '../errors';

const RUNWAY_API = 'https://api.dev.runwayml.com';
const API_VERSION = '2024-11-06';
const DEFAULT_IMAGE_MODEL = 'gen4_image';
/** `WIDTH:HEIGHT` ratios gen4_image accepts. */
const IMAGE_RATIOS = [
  '1920:1080',
  '1080:1920',
  '1024:1024',
  '1360:768',
  '1080:1080',
  '1168:880',
  '1440:1080',
  '1080:1440',
  '1808:768',
  '2112:912',
];
const DEFAULT_RATIO = '1920:1080';
const DEFAULT_VIDEO_MODEL = 'gen4_turbo';
/** `WIDTH:HEIGHT` ratios gen4_turbo (image_to_video) accepts. */
const VIDEO_RATIOS = ['1280:720', '720:1280', '1104:832', '832:1104', '960:960', '1584:672'];
const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED']);

/** Pick the supported `WIDTH:HEIGHT` ratio closest to the requested aspect. */
export function nearestRatio(width: number, height: number, ratios: string[] = IMAGE_RATIOS): string {
  if (!(width > 0) || !(height > 0)) return ratios[0];
  const target = width / height;
  let best = ratios[0];
  let bestDiff = Infinity;
  for (const r of ratios) {
    const [w, h] = r.split(':').map(Number);
    const diff = Math.abs(w / h - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = r;
    }
  }
  return best;
}

export interface RunwayProviderOptions {
  /** Runway API token (the developer's key, held server-side). */
  token?: string;
  /** Text-to-image model (default `gen4_image`; overridable per request). */
  imageModel?: string;
  /** Image-to-video model (default `gen4_turbo`; overridable per request). */
  videoModel?: string;
  /** Output ratio `WIDTH:HEIGHT` for images (default `1920:1080`). */
  ratio?: string;
  /** API version header value. */
  apiVersion?: string;
  /** Poll interval (ms) — Runway asks for ≥5000. */
  pollMs?: number;
  /** Overall timeout (ms) for a generation. */
  timeoutMs?: number;
  /** Injectable fetch, for tests. */
  fetchImpl?: typeof fetch;
}

interface Task {
  id: string;
  status: string;
  output?: unknown;
  failure?: unknown;
  failureCode?: unknown;
}

export class RunwayProvider implements MediaProvider {
  private token: string;
  private imageModel: string;
  private videoModel: string;
  private ratio: string;
  private apiVersion: string;
  private pollMs: number;
  private timeoutMs: number;
  private fetchImpl: typeof fetch;

  constructor(opts: RunwayProviderOptions = {}) {
    this.token = opts.token ?? '';
    this.imageModel = opts.imageModel ?? DEFAULT_IMAGE_MODEL;
    this.videoModel = opts.videoModel ?? DEFAULT_VIDEO_MODEL;
    this.ratio = opts.ratio ?? DEFAULT_RATIO;
    this.apiVersion = opts.apiVersion ?? API_VERSION;
    this.pollMs = opts.pollMs ?? 5000;
    this.timeoutMs = opts.timeoutMs ?? 180_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'X-Runway-Version': this.apiVersion,
      'Content-Type': 'application/json',
    };
  }

  async generateImage(req: GenImageRequest): Promise<GenResult> {
    if (!this.token) throw new Error('RunwayProvider: missing API token');
    const model = req.model ?? this.imageModel;
    // Follow the project's aspect ratio (mapped to the nearest supported one),
    // so the generated image matches the video the user is making.
    const ratio = req.width && req.height ? nearestRatio(req.width, req.height, IMAGE_RATIOS) : this.ratio;
    const res = await this.fetchImpl(`${RUNWAY_API}/v1/text_to_image`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ promptText: req.prompt, model, ratio }),
      signal: req.signal,
    });
    if (!res.ok) throw new ProviderError(`Runway ${res.status}: ${await safeText(res)}`, res.status);
    const { id } = (await res.json()) as { id?: string };
    if (!id) throw new Error('Runway did not return a task id');
    const task = await this.poll(id, req.signal);
    if (task.status !== 'SUCCEEDED') {
      throw new Error(`Runway task ${task.status}: ${String(task.failure ?? task.failureCode ?? 'unknown error')}`);
    }
    const url = pickUrl(task.output);
    if (!url) throw new Error('Runway returned no output URL');
    return { url, meta: { provider: 'runway', model, id, ratio } };
  }

  async generateVideo(req: GenVideoRequest): Promise<GenResult> {
    if (!this.token) throw new Error('RunwayProvider: missing API token');
    // Runway animates a source image; text-to-video = generate an image first.
    const promptImage =
      req.image ?? (await this.generateImage({ prompt: req.prompt, width: req.width, height: req.height, signal: req.signal })).url;
    const model = req.model ?? this.videoModel;
    const ratio = req.width && req.height ? nearestRatio(req.width, req.height, VIDEO_RATIOS) : VIDEO_RATIOS[0];
    // gen4_turbo supports 5s or 10s.
    const duration = (req.durationSec ?? 5) >= 8 ? 10 : 5;
    const res = await this.fetchImpl(`${RUNWAY_API}/v1/image_to_video`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ promptImage, promptText: req.prompt, model, ratio, duration }),
      signal: req.signal,
    });
    if (!res.ok) throw new ProviderError(`Runway ${res.status}: ${await safeText(res)}`, res.status);
    const { id } = (await res.json()) as { id?: string };
    if (!id) throw new Error('Runway did not return a task id');
    const task = await this.poll(id, req.signal);
    if (task.status !== 'SUCCEEDED') {
      throw new Error(`Runway task ${task.status}: ${String(task.failure ?? task.failureCode ?? 'unknown error')}`);
    }
    const url = pickUrl(task.output);
    if (!url) throw new Error('Runway returned no output URL');
    // Optional matching sound effect (Runway video is silent), returned so the
    // caller can add it as a separate audio clip.
    const audioUrl = req.audio ? await this.soundEffect(req.prompt, duration, req.signal) : undefined;
    return { url, meta: { provider: 'runway', model, id, ratio, duration, ...(audioUrl ? { audioUrl } : {}) } };
  }

  /** Generate a matching sound effect (eleven_text_to_sound_v2). Returns its URL. */
  private async soundEffect(prompt: string, duration: number, signal?: AbortSignal): Promise<string> {
    const res = await this.fetchImpl(`${RUNWAY_API}/v1/sound_effect`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ model: 'eleven_text_to_sound_v2', promptText: prompt, duration }),
      signal,
    });
    if (!res.ok) throw new ProviderError(`Runway sound_effect ${res.status}: ${await safeText(res)}`, res.status);
    const { id } = (await res.json()) as { id?: string };
    if (!id) throw new Error('Runway sound_effect did not return a task id');
    const task = await this.poll(id, signal);
    if (task.status !== 'SUCCEEDED') {
      throw new Error(`Runway sound_effect ${task.status}: ${String(task.failure ?? task.failureCode ?? 'unknown error')}`);
    }
    const url = pickUrl(task.output);
    if (!url) throw new Error('Runway sound_effect returned no output URL');
    return url;
  }

  /** Poll the task until it reaches a terminal state (or the caller aborts). */
  private async poll(id: string, signal?: AbortSignal): Promise<Task> {
    const deadline = Date.now() + this.timeoutMs;
    for (;;) {
      if (signal?.aborted) throw abortError();
      await sleep(this.pollMs, signal);
      const r = await this.fetchImpl(`${RUNWAY_API}/v1/tasks/${id}`, { headers: this.headers(), signal });
      if (!r.ok) throw new ProviderError(`Runway poll ${r.status}: ${await safeText(r)}`, r.status);
      const task = (await r.json()) as Task;
      if (TERMINAL.has(task.status)) return task;
      if (Date.now() > deadline) throw new Error('Runway generation timed out');
    }
  }
}

/** An AbortError matching the shape `fetch` throws, so callers detect cancels uniformly. */
function abortError(): Error {
  const e = new Error('Aborted');
  e.name = 'AbortError';
  return e;
}

/** Runway task `output` is an array of URL strings. */
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

/** Sleep that rejects early with an AbortError if the signal fires mid-wait. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
