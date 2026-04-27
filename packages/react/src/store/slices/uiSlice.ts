import type { StateCreator } from 'zustand';

export interface UISlice {
  // Sidebar / Panel state
  activeLeftPanel: string;
  activeRightTab: string;
  leftDrawerOpen: boolean;
  sidebarCollapsed: boolean;
  editorMode: 'manual' | 'agentic';
  agenticDrawerOpen: boolean;

  // Tool state
  activeTool: string;

  // Theme
  themeId: string;

  // Saving / Publishing
  isSaving: boolean;
  isPublishing: boolean;
  lastSavedAt: string | null;

  // Actions
  setActiveLeftPanel: (id: string) => void;
  setActiveRightTab: (id: string) => void;
  toggleLeftDrawer: () => void;
  setLeftDrawerOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setEditorMode: (mode: 'manual' | 'agentic') => void;
  setAgenticDrawerOpen: (open: boolean) => void;
  setActiveTool: (tool: string) => void;
  setThemeId: (id: string) => void;
  setIsSaving: (saving: boolean) => void;
  setIsPublishing: (publishing: boolean) => void;
  setLastSavedAt: (date: string | null) => void;
}

export const createUISlice: StateCreator<UISlice> = (set) => ({
  activeLeftPanel: 'tools',
  activeRightTab: 'properties',
  leftDrawerOpen: false,
  sidebarCollapsed: false,
  editorMode: 'manual',
  agenticDrawerOpen: false,
  activeTool: 'select',
  themeId: 'orbit-light',
  isSaving: false,
  isPublishing: false,
  lastSavedAt: null,

  setActiveLeftPanel: (id) => set({ activeLeftPanel: id }),
  setActiveRightTab: (id) => set({ activeRightTab: id }),
  toggleLeftDrawer: () => set((s) => ({ leftDrawerOpen: !s.leftDrawerOpen })),
  setLeftDrawerOpen: (open) => set({ leftDrawerOpen: open }),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setEditorMode: (mode) => set({ editorMode: mode }),
  setAgenticDrawerOpen: (open) => set({ agenticDrawerOpen: open }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  setThemeId: (id) => set({ themeId: id }),
  setIsSaving: (saving) => set({ isSaving: saving }),
  setIsPublishing: (publishing) => set({ isPublishing: publishing }),
  setLastSavedAt: (date) => set({ lastSavedAt: date }),
});
