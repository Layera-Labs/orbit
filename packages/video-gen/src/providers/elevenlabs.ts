/**
 * ElevenLabs-backed `MediaProvider` — text-to-speech only. Held server-side with
 * the developer's API key; wrapped by `GenerationService` for metering (tts = 5
 * credits). ElevenLabs returns raw MP3 bytes, which we inline as a data URI so
 * the provider stays storage-agnostic; the render service materializes it to a
 * served file URL for the client.
 * https://elevenlabs.io/docs/api-reference/text-to-speech
 */
import type { GenResult, MediaProvider, TTSRequest } from '../types';
import { ProviderError } from '../errors';

const ELEVEN_API = 'https://api.elevenlabs.io';
/** A long-standing public default voice ("Rachel"). */
const DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM';
const DEFAULT_MODEL = 'eleven_multilingual_v2';

export interface ElevenLabsProviderOptions {
  /** ElevenLabs API key (the developer's key, held server-side). */
  apiKey?: string;
  /** Default voice id (overridable per request via `TTSRequest.voice`). */
  voiceId?: string;
  /** TTS model id (default `eleven_multilingual_v2`). */
  model?: string;
  /** API base, for tests. */
  apiBase?: string;
  /** Injectable fetch, for tests. */
  fetchImpl?: typeof fetch;
}

export class ElevenLabsProvider implements MediaProvider {
  private apiKey: string;
  private voiceId: string;
  private model: string;
  private apiBase: string;
  private fetchImpl: typeof fetch;

  constructor(opts: ElevenLabsProviderOptions = {}) {
    this.apiKey = opts.apiKey ?? '';
    this.voiceId = opts.voiceId ?? DEFAULT_VOICE;
    this.model = opts.model ?? DEFAULT_MODEL;
    this.apiBase = opts.apiBase ?? ELEVEN_API;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async tts(req: TTSRequest): Promise<GenResult> {
    if (!this.apiKey) throw new Error('ElevenLabsProvider: missing API key');
    const voiceId = req.voice || this.voiceId;
    const res = await this.fetchImpl(`${this.apiBase}/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': this.apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text: req.text, model_id: this.model }),
      signal: req.signal,
    });
    if (!res.ok) throw new ProviderError(`ElevenLabs ${res.status}: ${await safeText(res)}`, res.status);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0) throw new Error('ElevenLabs returned empty audio');
    return {
      url: `data:audio/mpeg;base64,${base64(bytes)}`,
      meta: { provider: 'elevenlabs', voiceId, model: this.model, bytes: bytes.length },
    };
  }
}

/** Base64-encode bytes without depending on Node's Buffer (keeps `types: []`). */
function base64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000; // avoid arg-count limits on fromCharCode
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function safeText(r: Response): Promise<string> {
  try {
    return await r.text();
  } catch {
    return '';
  }
}
