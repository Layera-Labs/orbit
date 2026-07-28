'use client';

/**
 * Editor CHROME state — which dock is open, how far the timeline is zoomed.
 *
 * Deliberately separate from the document stores (`videoStore` and the SDK's
 * own `OrbitStore`): none of this belongs in an undo stack, and none of it is
 * persisted with the project. It is where you are looking, not what you made.
 */
import { create } from 'zustand';

/** Rail section ids. `null` closes the panel. */
export type ToolId =
  | 'design'
  | 'elements'
  | 'text'
  | 'photos'
  | 'uploads'
  | 'video'
  | 'audio'
  | 'stickers'
  | 'effects'
  | 'transitions'
  | 'ai'
  | 'layers';

const PX_PER_SECOND_MIN = 8;
const PX_PER_SECOND_MAX = 240;

interface DesignState {
  tool: ToolId | null;
  inspectorOpen: boolean;
  /** Timeline scale. Read by every lane, the ruler and the drag hook. */
  pxPerSec: number;
  snap: boolean;

  setTool(tool: ToolId | null): void;
  toggleTool(tool: ToolId): void;
  setInspectorOpen(open: boolean): void;
  setPxPerSec(px: number): void;
  zoomBy(factor: number): void;
  setSnap(snap: boolean): void;
}

const clampZoom = (px: number) =>
  Math.min(PX_PER_SECOND_MAX, Math.max(PX_PER_SECOND_MIN, px));

export const useDesign = create<DesignState>((set, get) => ({
  tool: null,
  inspectorOpen: true,
  pxPerSec: 64,
  snap: true,

  setTool: (tool) => set({ tool }),
  toggleTool: (tool) => set({ tool: get().tool === tool ? null : tool }),
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
  setPxPerSec: (px) => set({ pxPerSec: clampZoom(px) }),
  zoomBy: (factor) => set({ pxPerSec: clampZoom(get().pxPerSec * factor) }),
  setSnap: (snap) => set({ snap }),
}));

export { PX_PER_SECOND_MAX, PX_PER_SECOND_MIN };
