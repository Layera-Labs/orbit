import type { StateCreator } from 'zustand';
import type { ViewportState, BackgroundProps } from '@orbit/shared';

export interface CanvasSlice {
  canvasWidth: number;
  canvasHeight: number;
  background: BackgroundProps;
  zoom: number;
  panX: number;
  panY: number;
  rotation: number;
  showGrid: boolean;
  gridType: 'dots' | 'lines';
  gridSize: number;
  snapToGrid: boolean;
  showRulers: boolean;

  setCanvasSize: (w: number, h: number) => void;
  setBackground: (bg: BackgroundProps) => void;
  setViewport: (vp: Partial<ViewportState>) => void;
  resetViewport: () => void;
  setShowGrid: (show: boolean) => void;
  setGridType: (type: 'dots' | 'lines') => void;
  setGridSize: (size: number) => void;
  setSnapToGrid: (snap: boolean) => void;
  setShowRulers: (show: boolean) => void;
}

export const createCanvasSlice: StateCreator<CanvasSlice> = (set) => ({
  canvasWidth: 1080,
  canvasHeight: 1080,
  background: { type: 'solid', value: '#ffffff' },
  zoom: 100,
  panX: 0,
  panY: 0,
  rotation: 0,
  showGrid: true,
  gridType: 'dots',
  gridSize: 20,
  snapToGrid: false,
  showRulers: false,

  setCanvasSize: (w, h) => set({ canvasWidth: w, canvasHeight: h }),
  setBackground: (bg) => set({ background: bg }),
  setViewport: (vp) => set((s) => ({ ...s, ...vp })),
  resetViewport: () => set({ zoom: 100, panX: 0, panY: 0, rotation: 0 }),
  setShowGrid: (show) => set({ showGrid: show }),
  setGridType: (type) => set({ gridType: type }),
  setGridSize: (size) => set({ gridSize: size }),
  setSnapToGrid: (snap) => set({ snapToGrid: snap }),
  setShowRulers: (show) => set({ showRulers: show }),
});
