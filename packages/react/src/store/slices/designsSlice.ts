import type { StateCreator } from 'zustand';
import type { DesignMeta, SortOption } from '../types';

export interface DesignsSlice {
  designs: DesignMeta[];
  currentDesignId: string | null;
  currentDesignName: string;
  isLoadingDesigns: boolean;
  isSavingDesign: boolean;
  designSearchQuery: string;
  designSortBy: SortOption;

  setDesigns: (designs: DesignMeta[]) => void;
  setCurrentDesignId: (id: string | null) => void;
  setCurrentDesignName: (name: string) => void;
  setIsLoadingDesigns: (loading: boolean) => void;
  setIsSavingDesign: (saving: boolean) => void;
  setDesignSearchQuery: (query: string) => void;
  setDesignSortBy: (sort: SortOption) => void;
  addOrUpdateDesign: (design: DesignMeta) => void;
  removeDesign: (id: string) => void;
}

export const createDesignsSlice: StateCreator<DesignsSlice> = (set) => ({
  designs: [],
  currentDesignId: null,
  currentDesignName: 'Untitled Design',
  isLoadingDesigns: false,
  isSavingDesign: false,
  designSearchQuery: '',
  designSortBy: 'updated',

  setDesigns: (designs) => set({ designs }),
  setCurrentDesignId: (id) => set({ currentDesignId: id }),
  setCurrentDesignName: (name) => set({ currentDesignName: name }),
  setIsLoadingDesigns: (loading) => set({ isLoadingDesigns: loading }),
  setIsSavingDesign: (saving) => set({ isSavingDesign: saving }),
  setDesignSearchQuery: (query) => set({ designSearchQuery: query }),
  setDesignSortBy: (sort) => set({ designSortBy: sort }),
  addOrUpdateDesign: (design) =>
    set((s) => {
      const idx = s.designs.findIndex((d) => d.id === design.id);
      const next = [...s.designs];
      if (idx >= 0) next[idx] = design;
      else next.unshift(design);
      return { designs: next };
    }),
  removeDesign: (id) =>
    set((s) => ({ designs: s.designs.filter((d) => d.id !== id) })),
});
