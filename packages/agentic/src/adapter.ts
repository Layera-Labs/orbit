/**
 * AI Backend Adapter
 * Routes to api.orbit.ai with system prompts
 */

import type {
  GenerateParams,
  InpaintParams,
  OutpaintParams,
  LightingParams,
  ImageToImageParams,
  VideoGenerateParams,
  AudioGenerateParams,
  GeneratedAsset,
  VideoExportOptions,
  ExportJob,
  ExportInitResponse,
  ExportListResponse,
} from '@orbit/shared';
import type { CanvasAgentParams, CanvasAgentResponse } from './types';
import { SYSTEM_PROMPTS } from './prompts';

export interface AIBackendAdapter {
  generateImage(params: GenerateParams): Promise<GeneratedAsset>;
  inpaint(params: InpaintParams): Promise<GeneratedAsset>;
  outpaint(params: OutpaintParams): Promise<GeneratedAsset>;
  adjustLighting(params: LightingParams): Promise<GeneratedAsset>;
  imageToImage(params: ImageToImageParams): Promise<GeneratedAsset>;
  generateVideo(params: VideoGenerateParams): Promise<GeneratedAsset>;
  generateAudio(params: AudioGenerateParams): Promise<GeneratedAsset>;
  runCanvasAgent(params: CanvasAgentParams): Promise<CanvasAgentResponse>;
  // Video export
  initVideoExport(params: VideoExportOptions): Promise<ExportInitResponse>;
  markExportReady(jobId: string): Promise<void>;
  getExportStatus(jobId: string): Promise<ExportJob>;
  retryExport(jobId: string): Promise<{ newJobId: string }>;
  cancelExport(jobId: string): Promise<void>;
  listExports(options?: { limit?: number; offset?: number }): Promise<ExportListResponse>;
  getExportEventsUrl(jobId: string): string;
}

export class OrbitBackendAdapter implements AIBackendAdapter {
  constructor(
    private apiKey: string,
    private backendUrl: string = 'https://api.orbit.ai'
  ) {}

  private async request(endpoint: string, body: unknown, systemPrompt?: string): Promise<GeneratedAsset> {
    const payload = systemPrompt
      ? { ...(body as object), systemPrompt }
      : body;

    const response = await fetch(`${this.backendUrl}/v1/${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`AI request failed: ${response.statusText}`);
    }

    return response.json();
  }

  async generateImage(params: GenerateParams): Promise<GeneratedAsset> {
    return this.request('generate', params, SYSTEM_PROMPTS.edit);
  }

  async inpaint(params: InpaintParams): Promise<GeneratedAsset> {
    return this.request('inpaint', params, SYSTEM_PROMPTS.inpaint);
  }

  async outpaint(params: OutpaintParams): Promise<GeneratedAsset> {
    return this.request('outpaint', params, SYSTEM_PROMPTS.outpaint);
  }

  async adjustLighting(params: LightingParams): Promise<GeneratedAsset> {
    return this.request('lighting', params, SYSTEM_PROMPTS.lighting);
  }

  async imageToImage(params: ImageToImageParams): Promise<GeneratedAsset> {
    return this.request('image-to-image', params, SYSTEM_PROMPTS.edit);
  }

  async generateVideo(params: VideoGenerateParams): Promise<GeneratedAsset> {
    return this.request('generate-video', params);
  }

  async generateAudio(params: AudioGenerateParams): Promise<GeneratedAsset> {
    return this.request('generate-audio', params);
  }

  async runCanvasAgent(params: CanvasAgentParams): Promise<CanvasAgentResponse> {
    const response = await fetch(`${this.backendUrl}/v1/canvas-agent`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`Canvas agent request failed: ${response.statusText}`);
    }

    return response.json();
  }

  // Video Export
  async initVideoExport(params: VideoExportOptions): Promise<ExportInitResponse> {
    const response = await fetch(`${this.backendUrl}/v1/export-video/init`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
    if (!response.ok) throw new Error(`Export init failed: ${response.statusText}`);
    return response.json();
  }

  async markExportReady(jobId: string): Promise<void> {
    const response = await fetch(`${this.backendUrl}/v1/export-video/${jobId}/ready`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
    });
    if (!response.ok) throw new Error(`Mark ready failed: ${response.statusText}`);
  }

  async getExportStatus(jobId: string): Promise<ExportJob> {
    const response = await fetch(`${this.backendUrl}/v1/export-video/${jobId}/status`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
    });
    if (!response.ok) throw new Error(`Get status failed: ${response.statusText}`);
    return response.json();
  }

  async retryExport(jobId: string): Promise<{ newJobId: string }> {
    const response = await fetch(`${this.backendUrl}/v1/export-video/${jobId}/retry`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
    });
    if (!response.ok) throw new Error(`Retry failed: ${response.statusText}`);
    return response.json();
  }

  async cancelExport(jobId: string): Promise<void> {
    const response = await fetch(`${this.backendUrl}/v1/export-video/${jobId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
    });
    if (!response.ok) throw new Error(`Cancel failed: ${response.statusText}`);
  }

  async listExports(options?: { limit?: number; offset?: number }): Promise<ExportListResponse> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    const response = await fetch(`${this.backendUrl}/v1/export-video?${params}`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
    });
    if (!response.ok) throw new Error(`List exports failed: ${response.statusText}`);
    return response.json();
  }

  getExportEventsUrl(jobId: string): string {
    return `${this.backendUrl}/v1/export-video/${jobId}/events`;
  }
}
