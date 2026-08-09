/**
 * The Orbit RN ↔ WebView bridge protocol — the public message contract.
 *
 * Commands flow client (React Native) → host (the WebView running the v2 web
 * build). Events flow host → client. Every command gets a correlated result so
 * the client can `await` it. Everything is plain JSON so it survives
 * `postMessage`/`injectJavaScript`.
 */
import type { CanvasAction, Document, ID, Viewport } from '@layera-labs/model';

export const ORBIT_BRIDGE_PROTOCOL = 1;

/** Export formats. `svg`/`json` are headless; `png`/`jpeg` need the live renderer. */
export type OrbitExportFormat = 'svg' | 'json' | 'png' | 'jpeg';

export interface OrbitExportOptions {
  /** Raster scale relative to the page's native pixel size (png/jpeg). */
  scale?: number;
  quality?: number;
  background?: string;
}

/** Commands: client (RN) → host (WebView). */
export type OrbitCommand =
  | { type: 'getDocument' }
  | { type: 'loadDocument'; doc: Document }
  | { type: 'applyOps'; actions: CanvasAction[] }
  | { type: 'export'; format: OrbitExportFormat; options?: OrbitExportOptions }
  | { type: 'select'; ids: ID[] }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'setViewport'; patch: Partial<Viewport> };

/** Maps each command to its result type, so client calls are type-safe. */
export interface OrbitCommandResults {
  getDocument: Document;
  loadDocument: void;
  applyOps: void;
  export: string; // SVG markup, JSON string, or a data URL
  select: void;
  undo: void;
  redo: void;
  setViewport: void;
}

/** Events: host (WebView) → client (RN). */
export type OrbitEvent =
  | { type: 'ready'; protocol: number }
  | { type: 'change'; doc: Document }
  | { type: 'selectionChange'; selection: ID[] }
  | { type: 'historyChange'; canUndo: boolean; canRedo: boolean }
  | { type: 'error'; message: string };

export interface CommandEnvelope {
  kind: 'orbit:cmd';
  id: number;
  command: OrbitCommand;
}

export type ResultEnvelope =
  | { kind: 'orbit:res'; id: number; ok: true; value: unknown }
  | { kind: 'orbit:res'; id: number; ok: false; error: string };

export interface EventEnvelope {
  kind: 'orbit:evt';
  event: OrbitEvent;
}

export type OrbitMessage = CommandEnvelope | ResultEnvelope | EventEnvelope;

export function isOrbitMessage(x: unknown): x is OrbitMessage {
  return (
    !!x &&
    typeof x === 'object' &&
    typeof (x as { kind?: unknown }).kind === 'string' &&
    (x as { kind: string }).kind.startsWith('orbit:')
  );
}

export function encode(msg: OrbitMessage): string {
  return JSON.stringify(msg);
}

export function decode(raw: string): OrbitMessage | null {
  try {
    const x: unknown = JSON.parse(raw);
    return isOrbitMessage(x) ? x : null;
  } catch {
    return null;
  }
}
