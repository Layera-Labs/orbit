import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { UISlice } from './slices/uiSlice';
import type { CanvasSlice } from './slices/canvasSlice';
import type { LayerSlice } from './slices/layerSlice';
import type { UploadSlice } from './slices/uploadSlice';
import type { DesignsSlice } from './slices/designsSlice';
import type { AISlice } from './slices/aiSlice';
import { createUISlice } from './slices/uiSlice';
import { createCanvasSlice } from './slices/canvasSlice';
import { createLayerSlice } from './slices/layerSlice';
import { createUploadSlice } from './slices/uploadSlice';
import { createDesignsSlice } from './slices/designsSlice';
import { createAISlice } from './slices/aiSlice';

try { localStorage.removeItem('orbit-editor-state'); } catch {}

export type EditorStore = UISlice & CanvasSlice & LayerSlice & UploadSlice & DesignsSlice & AISlice;

export const useEditorStore = create<EditorStore>()(
  persist(
    (...a) => ({
      ...createUISlice(...a),
      ...createCanvasSlice(...a),
      ...createLayerSlice(...a),
      ...createUploadSlice(...a),
      ...createDesignsSlice(...a),
      ...createAISlice(...a),
    }),
    {
      name: 'orbit-editor-state-v2',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      migrate: (persistedState: any, version: number) => {
        if (version === 0) {
          delete persistedState.zoom;
          delete persistedState.panX;
          delete persistedState.panY;
          delete persistedState.rotation;
          delete persistedState.leftDrawerOpen;
          delete persistedState.agenticDrawerOpen;
        }
        return persistedState;
      },
      partialize: (state) => ({
        activeLeftPanel: state.activeLeftPanel,
        activeRightTab: state.activeRightTab,
        sidebarCollapsed: state.sidebarCollapsed,
        activeTool: state.activeTool,
        themeId: state.themeId,
        canvasWidth: state.canvasWidth,
        canvasHeight: state.canvasHeight,
        uploadedImages: state.uploadedImages,
        uploadedVideos: state.uploadedVideos,
        uploadedAudios: state.uploadedAudios,
        designs: state.designs,
        currentDesignId: state.currentDesignId,
        currentDesignName: state.currentDesignName,
        designSortBy: state.designSortBy,
      }),
    }
  )
);
