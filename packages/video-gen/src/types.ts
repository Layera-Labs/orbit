/**
 * Provider-agnostic generative-media interfaces. A concrete `MediaProvider`
 * (fal.ai, Replicate, ElevenLabs, …) implements only the methods it supports;
 * the `GenerationService` wraps any provider with credit metering.
 */
export interface GenImageRequest {
  prompt: string;
  width?: number;
  height?: number;
  model?: string;
  /** Abort the generation (e.g. the API client disconnected). */
  signal?: AbortSignal;
}

export interface GenVideoRequest {
  prompt: string;
  durationSec?: number;
  /** Optional source image (image-to-video). If omitted, one is generated first. */
  image?: string;
  model?: string;
  /** Target dimensions (mapped to the nearest supported ratio). */
  width?: number;
  height?: number;
  /** Also generate a matching sound effect (returned as `meta.audioUrl`). */
  audio?: boolean;
  /** Abort the generation (e.g. the API client disconnected). */
  signal?: AbortSignal;
}

export interface TTSRequest {
  text: string;
  voice?: string;
  /** Speaking-rate multiplier supported by the voice provider. */
  speed?: number;
  /** Abort the generation (e.g. the API client disconnected). */
  signal?: AbortSignal;
}

/**
 * What one provider call actually consumed.
 *
 * Separate from `meta`, which is free-form vendor detail (a task id, a ratio, a
 * companion audio url) and is there for the caller. This is the operational
 * measurement: how long the vendor took, and how much of whatever they bill for
 * it used. The service logs it; nothing is returned to the client.
 *
 * Deliberately carries NO money. A price belongs to the operator's contract,
 * not to this package — it differs per plan, changes without warning, and a
 * confident-looking wrong number in a log is worse than an absent one. What is
 * recorded here is measured fact; `services/render` multiplies it by rates
 * the operator states.
 */
export interface ProviderUsage {
  /** Vendor, as one lowercase token: 'runway', 'elevenlabs', 'replicate'. */
  provider: string;
  /** The model actually used, after defaults are applied. */
  model?: string;
  /** Wall-clock time at the vendor, milliseconds. */
  ms: number;
  /**
   * How much was consumed, in `unit`. Absent when the vendor bills per call
   * rather than per quantity — which is itself worth knowing, so it is omitted
   * rather than reported as 1.
   */
  units?: number;
  /** What `units` counts: 'video-seconds', 'characters', 'images'. */
  unit?: string;
}

export interface GenResult {
  /** URL (or data URI) of the produced asset — typically stored in R2. */
  url: string;
  meta?: Record<string, unknown>;
  /** What the call consumed. Absent from a provider that does not report it. */
  usage?: ProviderUsage;
}

export interface MediaProvider {
  generateImage?(req: GenImageRequest): Promise<GenResult>;
  generateVideo?(req: GenVideoRequest): Promise<GenResult>;
  tts?(req: TTSRequest): Promise<GenResult>;
}
