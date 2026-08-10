/**
 * ElevenLabs-backed `MediaProvider` — text-to-speech only. Held server-side with
 * the developer's API key; wrapped by `GenerationService` for metering (tts = 5
 * credits). ElevenLabs returns raw MP3 bytes, which we inline as a data URI so
 * the provider stays storage-agnostic; the render service materializes it to a
 * served file URL for the client.
 * https://elevenlabs.io/docs/api-reference/text-to-speech
 */
import type { GenResult, MediaProvider, TTSRequest } from "../types";
import { ProviderError } from "../errors";

const ELEVEN_API = "https://api.elevenlabs.io";
/** A long-standing public default voice ("Rachel"). */
const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_MODEL = "eleven_multilingual_v2";

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
    this.apiKey = opts.apiKey ?? "";
    this.voiceId = opts.voiceId ?? DEFAULT_VOICE;
    this.model = opts.model ?? DEFAULT_MODEL;
    this.apiBase = opts.apiBase ?? ELEVEN_API;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async tts(req: TTSRequest): Promise<GenResult> {
    if (!this.apiKey) throw new Error("ElevenLabsProvider: missing API key");
    const startedAt = Date.now();
    const voiceId = req.voice || this.voiceId;
    // The voice id lands in the URL path, so it must not be able to traverse to
    // another endpoint — that would aim the operator's API key at an arbitrary
    // ElevenLabs route and hand the response back to the caller.
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(voiceId))
      throw new ProviderError(`ElevenLabs: invalid voice id: ${voiceId}`, 400);
    const res = await this.fetchImpl(
      `${this.apiBase}/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey,
          "content-type": "application/json",
          accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: req.text,
          model_id: this.model,
          voice_settings:
            req.speed == null
              ? undefined
              : { speed: Math.max(0.7, Math.min(1.2, req.speed)) },
        }),
        signal: req.signal,
      },
    );
    if (!res.ok)
      throw new ProviderError(
        `ElevenLabs ${res.status}: ${await safeText(res)}`,
        res.status,
      );
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0) throw new Error("ElevenLabs returned empty audio");
    return {
      url: `data:audio/mpeg;base64,${base64(bytes)}`,
      meta: {
        provider: "elevenlabs",
        voiceId,
        model: this.model,
        bytes: bytes.length,
      },
      /*
       * ElevenLabs bills TTS by CHARACTERS OF INPUT, not by seconds of audio
       * out — so this counts what was sent, which is also the only one of the
       * two knowable without decoding the result.
       */
      usage: {
        provider: "elevenlabs",
        model: this.model,
        ms: Date.now() - startedAt,
        units: req.text.length,
        unit: "characters",
      },
    };
  }

  /**
   * Speech → timed segments, for auto-captions.
   *
   * ElevenLabs rather than a second vendor: the operator has already given this
   * service an ElevenLabs key for TTS, so captions cost no new secret, no new
   * account and no new billing relationship.
   *
   * Word timings, not the paragraph. The API returns a word list with start and
   * end seconds, and grouping those into readable lines is a decision about
   * captions — how long a line may be, where it may break — that belongs to us,
   * not to whatever sentence splitting the model happens to do.
   */
  async transcribe(req: TranscribeRequest): Promise<TranscriptWord[]> {
    if (!this.apiKey) throw new Error("ElevenLabsProvider: missing API key");
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(req.audio)]), "audio");
    form.append("model_id", req.model ?? "scribe_v1");
    if (req.language) form.append("language_code", req.language);

    const res = await this.fetchImpl(`${this.apiBase}/v1/speech-to-text`, {
      method: "POST",
      headers: { "xi-api-key": this.apiKey },
      body: form,
      signal: req.signal,
    });
    if (!res.ok)
      throw new ProviderError(
        `ElevenLabs ${res.status}: ${await safeText(res)}`,
        res.status,
      );

    const body = (await res.json()) as {
      words?: { text?: string; start?: number; end?: number; type?: string }[];
    };
    return (body.words ?? [])
      // The response interleaves spacing entries with the real words; only
      // `type: "word"` carries meaning, and keeping the rest would put stray
      // gaps on screen as if they were captions.
      .filter((w) => (w.type ?? "word") === "word" && (w.text ?? "").trim())
      .map((w) => ({
        text: (w.text ?? "").trim(),
        start: w.start ?? 0,
        end: w.end ?? w.start ?? 0,
      }));
  }
}

export interface TranscribeRequest {
  audio: ArrayBuffer;
  language?: string;
  model?: string;
  signal?: AbortSignal;
}

export interface TranscriptWord {
  text: string;
  start: number;
  end: number;
}

/**
 * A caption line, as this package produces it.
 *
 * Structurally the `CaptionLine` of `@layera-labs/orbit-video`, declared separately because
 * this package does not depend on that one and should not acquire a dependency
 * to borrow a type. The two are held together where they actually meet — the
 * render service annotates `groupWords`' result as `CaptionLine[]` before it
 * goes on the wire, so a divergence fails to compile there rather than
 * reaching a client as a field it does not know about.
 */
export interface TranscriptLine {
  text: string;
  start: number;
  end: number;
  words: TranscriptWord[];
}

/**
 * Group words into caption lines.
 *
 * Pure, and separate from the provider, because this is the part with taste in
 * it: a caption that runs too long is unreadable at a glance and one that
 * breaks every three words flickers. A line ends when it would get too long,
 * when it has been up too long, or when the speaker pauses — the pause being
 * the one that makes captions track speech rather than chop it evenly.
 *
 * Each line KEEPS the words it was built from. Grouping is the only lossy step
 * between the model and the timeline — a line's span cannot be taken back apart
 * — so dropping the array here would mean any later word-level effect had to
 * pay for transcribing the same audio a second time.
 */
export function groupWords(
  words: TranscriptWord[],
  opts: { maxChars?: number; maxSeconds?: number; gapSeconds?: number } = {},
): TranscriptLine[] {
  const maxChars = opts.maxChars ?? 42;
  const maxSeconds = opts.maxSeconds ?? 3.5;
  const gapSeconds = opts.gapSeconds ?? 0.6;

  const lines: TranscriptLine[] = [];
  let cur: TranscriptWord[] = [];

  const flush = () => {
    if (!cur.length) return;
    lines.push({
      text: cur.map((w) => w.text).join(" "),
      start: cur[0].start,
      end: cur[cur.length - 1].end,
      // A copy, so the emitted line is decoupled from the accumulator. `cur` is
      // reassigned rather than cleared below, which makes sharing the array
      // safe TODAY — and makes the obvious tidy-up (`cur.length = 0`) reach
      // back into every line already pushed.
      words: cur.slice(),
    });
    cur = [];
  };

  for (const w of words) {
    if (cur.length) {
      const chars = cur.reduce((n, x) => n + x.text.length + 1, 0) + w.text.length;
      const span = w.end - cur[0].start;
      const gap = w.start - cur[cur.length - 1].end;
      if (chars > maxChars || span > maxSeconds || gap > gapSeconds) flush();
    }
    cur.push(w);
  }
  flush();
  return lines;
}

/** Base64-encode bytes without depending on Node's Buffer (keeps `types: []`). */
function base64(bytes: Uint8Array): string {
  let binary = "";
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
    return "";
  }
}
