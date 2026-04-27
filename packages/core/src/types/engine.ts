/**
 * Core engine types
 */

import type { CollaborationConfig } from '../collaboration';

export interface EngineConfig {
  width?: number;
  height?: number;
  background?: string;
  collaboration?: CollaborationConfig;
}

export type ToolType = 'select' | 'brush' | 'highlighter' | 'text' | 'shape' | 'crop' | 'vector';

export interface ToolOptions {
  strokeWidth?: number;
  color?: string;
  opacity?: number;
}

export interface Matrix {
  a: number; b: number; c: number;
  d: number; e: number; f: number;
}
