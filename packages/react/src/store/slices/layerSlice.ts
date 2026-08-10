import type { StateCreator } from 'zustand';
import type { Layer } from '@layera-labs/orbit-shared';

export interface LayerSlice {
  layers: Layer[];
  selectedIds: string[];
  hoveredId: string | null;

  setLayers: (layers: Layer[]) => void;
  setSelectedIds: (ids: string[]) => void;
  selectLayer: (id: string) => void;
  deselectAll: () => void;
  setHoveredId: (id: string | null) => void;
}

export const createLayerSlice: StateCreator<LayerSlice> = (set) => ({
  layers: [],
  selectedIds: [],
  hoveredId: null,

  setLayers: (layers) => set({ layers }),
  setSelectedIds: (ids) => set({ selectedIds: ids }),
  selectLayer: (id) => set({ selectedIds: [id] }),
  deselectAll: () => set({ selectedIds: [], hoveredId: null }),
  setHoveredId: (id) => set({ hoveredId: id }),
});
