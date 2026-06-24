import type { GenImageRequest, GenResult, GenVideoRequest, MediaProvider, TTSRequest } from './types';

/** Deterministic provider for dev/tests — returns fake URLs and records calls. */
export class MockMediaProvider implements MediaProvider {
  calls: Array<{ kind: 'image' | 'video' | 'tts'; req: unknown }> = [];

  async generateImage(req: GenImageRequest): Promise<GenResult> {
    this.calls.push({ kind: 'image', req });
    return { url: `mock://image/${encodeURIComponent(req.prompt)}` };
  }

  async generateVideo(req: GenVideoRequest): Promise<GenResult> {
    this.calls.push({ kind: 'video', req });
    return { url: `mock://video/${encodeURIComponent(req.prompt)}` };
  }

  async tts(req: TTSRequest): Promise<GenResult> {
    this.calls.push({ kind: 'tts', req });
    return { url: `mock://tts/${req.text.length}` };
  }
}
