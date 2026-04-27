/**
 * Agentic types
 */

import type { BlendMode, SceneGraph, ShapeContent } from '@orbit/shared';

export type ModelProvider = 'gpt-4o' | 'gemini-pro';

export interface AgenticConfig {
  apiKey: string;
  backendUrl: string;
  defaultModel?: ModelProvider;
}

export type AgenticCanvasAction =
  | {
      type: 'addText';
      text: string;
      fontSize?: number;
      fontWeight?: number;
      fontFamily?: string;
      color?: string;
    }
  | {
      type: 'updateText';
      layerId?: string;
      text?: string;
      fontSize?: number;
      fontWeight?: number;
      fontFamily?: string;
      color?: string;
    }
  | {
      type: 'addImage';
      src: string;
      width?: number;
      height?: number;
      name?: string;
    }
  | {
      type: 'addVideo';
      src: string;
      width?: number;
      height?: number;
      duration?: number;
      name?: string;
    }
  | {
      type: 'addShape';
      shape?: ShapeContent['shape'];
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
      width?: number;
      height?: number;
      name?: string;
    }
  | {
      type: 'addBackgroundLayer';
      value: string;
      name?: string;
    }
  | {
      type: 'updateLayerStyle';
      layerId?: string;
      opacity?: number;
      blendMode?: BlendMode;
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
      color?: string;
      fontSize?: number;
      fontWeight?: number;
      fontFamily?: string;
    }
  | {
      type: 'moveResizeLayer';
      layerId?: string;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      rotation?: number;
    }
  | {
      type: 'deleteLayer';
      layerId?: string;
    };

export interface CanvasAgentParams {
  prompt: string;
  scene: SceneGraph;
  selectedLayerIds?: string[];
  model?: string;
  imageBase64?: string | null;
  selectionImageBase64?: string | null;
}

export interface CanvasAgentResponse {
  actions: AgenticCanvasAction[];
  message?: string;
}
