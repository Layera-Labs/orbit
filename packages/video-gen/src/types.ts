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
  /** Abort the generation (e.g. the API client disconnected). */
  signal?: AbortSignal;
}

export interface GenResult {
  /** URL (or data URI) of the produced asset — typically stored in R2. */
  url: string;
  meta?: Record<string, unknown>;
}

export interface MediaProvider {
  generateImage?(req: GenImageRequest): Promise<GenResult>;
  generateVideo?(req: GenVideoRequest): Promise<GenResult>;
  tts?(req: TTSRequest): Promise<GenResult>;
}
