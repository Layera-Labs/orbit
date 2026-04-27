import { useState, useCallback, useMemo } from 'react';
import { OrbitBackendAdapter } from '@orbit/agentic';
import type { CanvasAgentParams, CanvasAgentResponse } from '@orbit/agentic';
import type { GeneratedAsset } from '@orbit/shared';
import type { OrbitEngine } from '@orbit/core';


export type AgenticTool =
  | 'generate'
  | 'edit'
  | 'inpaint'
  | 'outpaint'
  | 'lighting';

export interface UseOrbitAgenticOptions {
  engine: OrbitEngine | null;
  apiKey: string;
  backendUrl?: string;
}

export interface AgenticGenerateState {
  prompt: string;
  tool: AgenticTool;
  imageBase64?: string | null;
  maskBase64?: string | null;
  model: string;
}

export function useOrbitAgentic(options: UseOrbitAgenticOptions) {
  const { engine, apiKey, backendUrl } = options;
  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState<GeneratedAsset[]>([]);
  const [error, setError] = useState<string | null>(null);

  const adapter = useMemo(() => new OrbitBackendAdapter(apiKey, backendUrl), [apiKey, backendUrl]);

  const generate = useCallback(
    async (state: AgenticGenerateState): Promise<GeneratedAsset | null> => {
      if (!engine || !state.prompt.trim()) return null;
      setIsGenerating(true);
      setError(null);
      try {
        let asset: GeneratedAsset;

        switch (state.tool) {
          case 'generate':
            asset = await adapter.generateImage({
              prompt: state.prompt,
              model: state.model,
            });
            break;
          case 'edit':
            if (!state.imageBase64) {
              throw new Error('Canvas image required for AI Edit');
            }
            asset = await adapter.imageToImage({
              prompt: state.prompt,
              imageBase64: state.imageBase64,
              model: state.model,
            });
            break;
          case 'inpaint':
            if (!state.imageBase64) {
              throw new Error('Canvas image required for Inpaint');
            }
            asset = await adapter.inpaint({
              prompt: state.prompt,
              imageBase64: state.imageBase64,
              maskBase64: state.maskBase64 || '',
              model: state.model,
            });
            break;
          case 'outpaint':
            if (!state.imageBase64) {
              throw new Error('Canvas image required for Outpaint');
            }
            asset = await adapter.outpaint({
              prompt: state.prompt,
              imageBase64: state.imageBase64,
              ratio: '1:1',
              expandPrompt: state.prompt,
              model: state.model,
            });
            break;
          case 'lighting':
            if (!state.imageBase64) {
              throw new Error('Canvas image required for Lighting');
            }
            asset = await adapter.adjustLighting({
              imageBase64: state.imageBase64,
              lights: [
                {
                  id: 'main',
                  x: 0.5,
                  y: 0.3,
                  z: 1.0,
                  color: '#ffffff',
                  brightness: 1.0,
                },
              ],
            });
            break;
          default:
            throw new Error(`Unsupported tool: ${state.tool}`);
        }

        setResults((prev) => [asset, ...prev]);
        return asset;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Generation failed';
        setError(msg);
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    [engine, adapter]
  );

  const runCanvasAgent = useCallback(
    async (params: CanvasAgentParams): Promise<CanvasAgentResponse | null> => {
      if (!engine || !params.prompt.trim()) return null;
      setIsGenerating(true);
      setError(null);
      try {
        return await adapter.runCanvasAgent(params);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Canvas agent failed';
        setError(msg);
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    [engine, adapter]
  );

  const clearResults = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  return {
    isGenerating,
    results,
    error,
    generate,
    runCanvasAgent,
    clearResults,
  };
}
