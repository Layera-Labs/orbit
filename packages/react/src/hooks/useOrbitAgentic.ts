import { useState, useCallback } from 'react';
import type { AiBackend } from '../backends/types';
import type { CanvasAgentParams, CanvasAgentResponse, GeneratedAsset } from '@layera-labs/shared';
import type { OrbitEngine } from '@layera-labs/core';


export type AgenticTool =
  | 'generate'
  | 'edit'
  | 'inpaint'
  | 'outpaint'
  | 'lighting';

export interface UseOrbitAgenticOptions {
  engine: OrbitEngine | null;
  /**
   * REQUIRED. This hook is nothing but calls into it — an optional backend
   * would mean every call returning null for a reason the caller cannot see,
   * and a UI wired to it showing buttons that do nothing. A host without an AI
   * layer does not call this hook.
   */
  backend: AiBackend;
}

export interface AgenticGenerateState {
  prompt: string;
  tool: AgenticTool;
  imageBase64?: string | null;
  maskBase64?: string | null;
  model: string;
}

export function useOrbitAgentic(options: UseOrbitAgenticOptions) {
  const { engine, backend } = options;
  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState<GeneratedAsset[]>([]);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(
    async (state: AgenticGenerateState): Promise<GeneratedAsset | null> => {
      if (!engine || !state.prompt.trim()) return null;
      setIsGenerating(true);
      setError(null);
      try {
        let asset: GeneratedAsset;

        switch (state.tool) {
          case 'generate':
            asset = await backend.generateImage({
              prompt: state.prompt,
              model: state.model,
            });
            break;
          case 'edit':
            if (!state.imageBase64) {
              throw new Error('Canvas image required for AI Edit');
            }
            asset = await backend.imageToImage({
              prompt: state.prompt,
              imageBase64: state.imageBase64,
              model: state.model,
            });
            break;
          case 'inpaint':
            if (!state.imageBase64) {
              throw new Error('Canvas image required for Inpaint');
            }
            asset = await backend.inpaint({
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
            asset = await backend.outpaint({
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
            asset = await backend.adjustLighting({
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
    [engine, backend]
  );

  const runCanvasAgent = useCallback(
    async (params: CanvasAgentParams): Promise<CanvasAgentResponse | null> => {
      if (!engine || !params.prompt.trim()) return null;
      setIsGenerating(true);
      setError(null);
      try {
        return await backend.runCanvasAgent(params);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Canvas agent failed';
        setError(msg);
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    [engine, backend]
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
