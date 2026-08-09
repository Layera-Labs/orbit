/**
 * OrbitEditor v2 - Refactored with OrbitSidebar rail+drawer, Zustand, and new panels
 */
import * as React from 'react';
import { useEffect, useCallback, useRef, useState } from 'react';
import { useOrbitEngine } from './hooks/useOrbitEngine';
import { useEngineBridge } from './hooks/useEngineBridge';
import { OrbitSidebar } from '@layera-labs/ui';
import { themeManager } from '@layera-labs/ui';
import { useEditorStore } from './store';
import { localStorageDesignBackend } from './backends/design';
import { ToastProvider, useToast } from './components/ToastProvider';
import { KeyboardShortcuts } from './components/KeyboardShortcuts';
import { Toolbar } from './components/Toolbar';
import { BottomBar } from './components/BottomBar';
import { Timeline } from './components/Timeline';
import { RulerOverlay } from './components/RulerOverlay';
import { VideoExportModal } from './components/VideoExportModal';
import { ContextToolbar } from './components/ContextToolbar';
import { PageControls } from './components/PageControls';
import {
  ToolsPanel,
  TextPanel,
  UploadPanel,
  AssetsPanel,
  BackgroundsPanel,
  VideosPanel,
  ShapesPanel,
  HistoryPanel,
  LayersPanel,
  MyDesignsPanel,
  TemplatesPanel,
} from './components/panels';
import { AgenticPanel } from './components/right-panel/AgenticPanel';
import type { AssetProvider, SceneGraph as SceneGraphState } from '@layera-labs/shared';
import type { UploadConfig, AutoSaveConfig, DesignBackend, DesignData } from './store/types';
import type { AiBackend, ExportBackend } from './backends/types';
import { addLayerAndSelect, createImageLayer, createVideoLayer } from './utils/layerPlacement';

export interface OrbitEditorProps {
  /**
   * Kept for source compatibility, but the editor no longer reads either of
   * these: they existed only so it could construct a backend client of its own.
   * Credentials now belong to whoever builds the backend it is handed.
   */
  apiKey?: string;
  backendUrl?: string;
  theme?: string;
  config?: Record<string, unknown>;
  providers?: {
    photos?: AssetProvider;
    videos?: AssetProvider;
  };
  callbacks?: {
    onExport?: (blob: Blob, format: string) => void;
    onError?: (error: Error) => void;
    onPublish?: (design: any) => Promise<void>;
    onNewDesign?: (width: number, height: number) => void;
  };
  uploadConfig?: UploadConfig;
  designBackend?: DesignBackend;
  autoSave?: AutoSaveConfig;
  /**
   * Where MP4 / PNG-sequence renders are sent. Injected rather than built here:
   * the editor used to construct `@layera-labs/agentic`'s client for this, which made
   * the AI package a runtime dependency of plain editing. Omit it and export
   * still works, in the browser, as GIF.
   */
  exportBackend?: ExportBackend;
  /**
   * The AI layer, and entirely opt-in. Omit it and the editor has no AI at all:
   * the canvas "AI" button and the agentic drawer are not rendered, rather than
   * rendered and unable to answer a click.
   */
  aiBackend?: AiBackend;
}

// Simple SVG icons for sidebar rail
const Icons = {
  tools: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
  text: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>,
  upload: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>,
  assets: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>,
  backgrounds: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/></svg>,
  videos: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2.18"/><path d="M10 8l6 4-6 4V8z"/></svg>,
  shapes: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l9 4.9V17L12 22l-9-4.9V7z"/></svg>,
  ai: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3l1.8 5.4L19 10.2l-5.2 1.8L12 17l-1.8-5L5 10.2l5.2-1.8L12 3z"/><path d="M19 15l.9 2.7L22 18.6l-2.1.8L19 22l-.9-2.6-2.1-.8 2.1-.9L19 15z"/></svg>,
  history: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v5h5M3 12a9 9 0 1 0 2.8-6.5L3 8"/></svg>,
  layers: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
  designs: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  templates: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>,
};

// Panel registry
const PANEL_REGISTRY = [
  { id: 'tools', label: 'Tools', icon: Icons.tools, component: ToolsPanel },
  { id: 'text', label: 'Text', icon: Icons.text, component: TextPanel },
  { id: 'upload', label: 'Upload', icon: Icons.upload, component: UploadPanel },
  { id: 'assets', label: 'Assets', icon: Icons.assets, component: AssetsPanel },
  { id: 'backgrounds', label: 'Backgrounds', icon: Icons.backgrounds, component: BackgroundsPanel },
  { id: 'videos', label: 'Videos', icon: Icons.videos, component: VideosPanel },
  { id: 'shapes', label: 'Shapes', icon: Icons.shapes, component: ShapesPanel },
  { id: 'history', label: 'History', icon: Icons.history, component: HistoryPanel },
  { id: 'layers', label: 'Layers', icon: Icons.layers, component: LayersPanel },
  { id: 'my-designs', label: 'My Designs', icon: Icons.designs, component: MyDesignsPanel },
  { id: 'templates', label: 'Templates', icon: Icons.templates, component: TemplatesPanel },
];

interface EditorPage {
  id: string;
  scene: SceneGraphState;
}

type PagesLayout = 'vertical' | 'horizontal';

function createPageId(): string {
  return `page-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneScene(scene: SceneGraphState): SceneGraphState {
  return JSON.parse(JSON.stringify(scene)) as SceneGraphState;
}

function createBlankScene(width: number, height: number): SceneGraphState {
  return {
    root: [],
    background: { type: 'solid', value: '#ffffff' },
    border: {
      width: 0,
      color: '#000000',
      style: 'solid',
      radius: 0,
      sides: { top: true, right: true, bottom: true, left: true },
      radiusCorners: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
    },
    width,
    height,
  };
}

export const OrbitEditor: React.FC<OrbitEditorProps> = (props) => {
  return (
    <ToastProvider>
      <OrbitEditorInner {...props} />
    </ToastProvider>
  );
};

const OrbitEditorInner: React.FC<OrbitEditorProps> = ({
  theme,
  config,
  providers,
  callbacks,
  uploadConfig,
  designBackend: customDesignBackend,
  autoSave,
  exportBackend,
  aiBackend,
}) => {
  const { addToast } = useToast();
  const initialCanvasWidth = (config?.width as number) || 1080;
  const initialCanvasHeight = (config?.height as number) || 1080;
  const { containerRef, engine, isReady } = useOrbitEngine({
    width: initialCanvasWidth,
    height: initialCanvasHeight,
  });

  // Bridge engine state to Zustand
  useEngineBridge(engine);

  // Zustand selectors
  const activeLeftPanel = useEditorStore((s) => s.activeLeftPanel);
  const leftDrawerOpen = useEditorStore((s) => s.leftDrawerOpen);
  const editorMode = useEditorStore((s) => s.editorMode);
  const agenticDrawerOpen = useEditorStore((s) => s.agenticDrawerOpen);
  const setActiveLeftPanel = useEditorStore((s) => s.setActiveLeftPanel);
  const setLeftDrawerOpen = useEditorStore((s) => s.setLeftDrawerOpen);
  const setEditorMode = useEditorStore((s) => s.setEditorMode);
  const setAgenticDrawerOpen = useEditorStore((s) => s.setAgenticDrawerOpen);
  const setThemeId = useEditorStore((s) => s.setThemeId);
  const setIsSaving = useEditorStore((s) => s.setIsSaving);
  const setIsPublishing = useEditorStore((s) => s.setIsPublishing);
  const setLastSavedAt = useEditorStore((s) => s.setLastSavedAt);
  const currentDesignId = useEditorStore((s) => s.currentDesignId);
  const setCurrentDesignId = useEditorStore((s) => s.setCurrentDesignId);
  const setCurrentDesignName = useEditorStore((s) => s.setCurrentDesignName);
  const layers = useEditorStore((s) => s.layers);
  const showGrid = useEditorStore((s) => s.showGrid);
  const gridType = useEditorStore((s) => s.gridType);
  const gridSize = useEditorStore((s) => s.gridSize);
  const snapToGrid = useEditorStore((s) => s.snapToGrid);
  const showRulers = useEditorStore((s) => s.showRulers);
  const canvasWidth = useEditorStore((s) => s.canvasWidth);
  const canvasHeight = useEditorStore((s) => s.canvasHeight);
  const zoom = useEditorStore((s) => s.zoom);
  const [videoExportOpen, setVideoExportOpen] = useState(false);

  const designBackend = customDesignBackend || localStorageDesignBackend;
  const [pages, setPages] = useState<EditorPage[]>(() => [
    { id: createPageId(), scene: createBlankScene(initialCanvasWidth, initialCanvasHeight) },
  ]);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [pagesLayout, setPagesLayout] = useState<PagesLayout>('vertical');
  const activePageIndexRef = useRef(0);
  const pagesRef = useRef(pages);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    activePageIndexRef.current = activePageIndex;
  }, [activePageIndex]);

  const getPagesSnapshot = useCallback((): EditorPage[] => {
    const snapshot = pagesRef.current.map((page) => ({
      ...page,
      scene: cloneScene(page.scene),
    }));
    const activeIndex = activePageIndexRef.current;
    if (engine && snapshot[activeIndex]) {
      snapshot[activeIndex] = {
        ...snapshot[activeIndex],
        scene: cloneScene(engine.scene.getState()),
      };
    }
    return snapshot;
  }, [engine]);

  const activatePage = useCallback((index: number, nextPages = pagesRef.current) => {
    const page = nextPages[index];
    if (!engine || !page) return;
    activePageIndexRef.current = index;
    setActivePageIndex(index);
    engine.loadScene(cloneScene(page.scene));
  }, [engine]);

  const scrollActivePageIntoView = useCallback((behavior: ScrollBehavior = 'smooth') => {
    requestAnimationFrame(() => {
      const wrapper = containerRef.current?.querySelector<HTMLElement>('.canvas-container');
      wrapper?.scrollIntoView({
        behavior,
        block: pagesLayout === 'vertical' ? 'center' : 'nearest',
        inline: pagesLayout === 'horizontal' ? 'center' : 'nearest',
      });
    });
  }, [containerRef, pagesLayout]);

  const handleSetActivePage = useCallback((index: number) => {
    const snapshot = getPagesSnapshot();
    const nextIndex = Math.min(Math.max(index, 0), snapshot.length - 1);
    setPages(snapshot);
    activatePage(nextIndex, snapshot);
    scrollActivePageIntoView();
  }, [activatePage, getPagesSnapshot, scrollActivePageIntoView]);

  useEffect(() => {
    const container = containerRef.current;
    const wrapper = container?.querySelector<HTMLElement>('.canvas-container');
    if (!container || !wrapper) return;

    const scale = Math.max(zoom / 100, 0.01);
    const pageWidth = Math.max(1, Math.round(canvasWidth * scale));
    const pageHeight = Math.max(1, Math.round(canvasHeight * scale));
    const isVertical = pagesLayout === 'vertical';

    container.style.display = 'flex';
    container.style.flexDirection = isVertical ? 'column' : 'row';
    container.style.alignItems = 'center';
    const pageList = pagesRef.current;

    container.style.justifyContent = pageList.length === 1 ? 'center' : 'flex-start';
    container.style.gap = '64px';
    container.style.overflow = 'auto';
    container.style.boxSizing = 'border-box';
    container.style.padding = isVertical ? '92px 48px 72px' : '92px 72px 72px 128px';

    wrapper.style.order = String(activePageIndex);
    wrapper.style.flex = '0 0 auto';
    wrapper.style.margin = pageList.length === 1 ? 'auto' : '0';
    wrapper.style.boxShadow = '0 28px 70px -42px rgba(15, 23, 42, 0.55)';

    container.querySelectorAll<HTMLElement>('.orbit-page-slot').forEach((slot) => slot.remove());

    pageList.forEach((page, index) => {
      if (index === activePageIndex) return;
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = 'orbit-page-slot';
      slot.setAttribute('aria-label', `Open page ${index + 1}`);
      slot.title = `Page ${index + 1}`;
      slot.style.order = String(index);
      slot.style.width = `${pageWidth}px`;
      slot.style.height = `${pageHeight}px`;
      slot.style.flex = '0 0 auto';
      slot.style.border = '0';
      slot.style.padding = '0';
      slot.style.background = page.scene.background.type === 'solid' ? String(page.scene.background.value) : '#ffffff';
      slot.style.boxShadow = '0 28px 70px -42px rgba(15, 23, 42, 0.55)';
      slot.style.cursor = 'pointer';
      slot.style.display = 'block';
      slot.onclick = () => handleSetActivePage(index);
      container.appendChild(slot);
    });

    scrollActivePageIntoView('auto');
  }, [
    activePageIndex,
    canvasHeight,
    canvasWidth,
    containerRef,
    handleSetActivePage,
    pages.length,
    pagesLayout,
    scrollActivePageIntoView,
    zoom,
  ]);

  useEffect(() => {
    if (!engine) return;
    return engine.scene.subscribe((scene) => {
      const activeIndex = activePageIndexRef.current;
      setPages((currentPages) =>
        currentPages.map((page, index) =>
          index === activeIndex ? { ...page, scene: cloneScene(scene) } : page
        )
      );
    });
  }, [engine]);

  const handlePreviousPage = useCallback(() => {
    const snapshot = getPagesSnapshot();
    const nextIndex = Math.max(0, activePageIndexRef.current - 1);
    setPages(snapshot);
    activatePage(nextIndex, snapshot);
    scrollActivePageIntoView();
  }, [activatePage, getPagesSnapshot, scrollActivePageIntoView]);

  const handleNextPage = useCallback(() => {
    const snapshot = getPagesSnapshot();
    const nextIndex = Math.min(snapshot.length - 1, activePageIndexRef.current + 1);
    setPages(snapshot);
    activatePage(nextIndex, snapshot);
    scrollActivePageIntoView();
  }, [activatePage, getPagesSnapshot, scrollActivePageIntoView]);

  const handleAddPage = useCallback(() => {
    const snapshot = getPagesSnapshot();
    const activeIndex = activePageIndexRef.current;
    const currentScene = snapshot[activeIndex]?.scene ?? createBlankScene(initialCanvasWidth, initialCanvasHeight);
    const nextPage: EditorPage = {
      id: createPageId(),
      scene: createBlankScene(currentScene.width, currentScene.height),
    };
    const nextPages = [...snapshot, nextPage];
    const nextIndex = nextPages.length - 1;
    setPages(nextPages);
    activatePage(nextIndex, nextPages);
    scrollActivePageIntoView();
  }, [activatePage, getPagesSnapshot, initialCanvasHeight, initialCanvasWidth, scrollActivePageIntoView]);

  const handleDuplicatePage = useCallback(() => {
    const snapshot = getPagesSnapshot();
    const activeIndex = activePageIndexRef.current;
    const currentPage = snapshot[activeIndex];
    if (!currentPage) return;
    const nextIndex = activeIndex + 1;
    const nextPage: EditorPage = {
      id: createPageId(),
      scene: cloneScene(currentPage.scene),
    };
    const nextPages = [...snapshot.slice(0, nextIndex), nextPage, ...snapshot.slice(nextIndex)];
    setPages(nextPages);
    activatePage(nextIndex, nextPages);
    scrollActivePageIntoView();
  }, [activatePage, getPagesSnapshot, scrollActivePageIntoView]);

  const handleDeletePage = useCallback(() => {
    const snapshot = getPagesSnapshot();
    const activeIndex = activePageIndexRef.current;
    if (activeIndex === 0 || snapshot.length <= 1) return;
    const nextPages = snapshot.filter((_, index) => index !== activeIndex);
    const nextIndex = Math.max(0, activeIndex - 1);
    setPages(nextPages);
    activatePage(nextIndex, nextPages);
    scrollActivePageIntoView();
  }, [activatePage, getPagesSnapshot, scrollActivePageIntoView]);

  const getDesignPagesForSave = useCallback(() => {
    const snapshot = getPagesSnapshot();
    return {
      pages: snapshot.map((page) => page.scene),
      activePageIndex: activePageIndexRef.current,
    };
  }, [getPagesSnapshot]);

  const handleLoadDesign = useCallback((data: DesignData) => {
    const savedScenes = data.pages?.length ? data.pages : [data.scene];
    const nextPages = savedScenes.map((scene) => ({
      id: createPageId(),
      scene: cloneScene(scene),
    }));
    const nextIndex = Math.min(Math.max(data.activePageIndex ?? 0, 0), nextPages.length - 1);
    setPages(nextPages);
    activatePage(nextIndex, nextPages);
    scrollActivePageIntoView('auto');
  }, [activatePage, scrollActivePageIntoView]);

  const handleTogglePagesLayout = useCallback(() => {
    setPagesLayout((layout) => layout === 'vertical' ? 'horizontal' : 'vertical');
  }, []);

  // Sync snap-to-grid settings to engine
  useEffect(() => {
    if (engine) {
      engine.setSnapToGrid(snapToGrid, gridSize);
    }
  }, [engine, snapToGrid, gridSize]);

  // Theme setup
  useEffect(() => {
    const id = theme || 'orbit-light';
    try {
      themeManager.setTheme(id);
      setThemeId(id);
    } catch {
      themeManager.setTheme('orbit-light');
      setThemeId('orbit-light');
    }
  }, [theme, setThemeId]);

  // Design ID from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const designId = params.get('design');
    if (designId) {
      setCurrentDesignId(designId);
      designBackend.get(designId).then((data) => {
        if (data) setCurrentDesignName(data.name);
      });
    }
  }, [setCurrentDesignId, setCurrentDesignName, designBackend]);

  // Auto-save
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performSave = useCallback(async () => {
    if (!engine) return;
    setIsSaving(true);
    try {
      const pageSnapshot = getPagesSnapshot();
      const activeScene = pageSnapshot[activePageIndexRef.current]?.scene ?? engine.scene.getState();
      const designData = {
        id: currentDesignId || `design-${Date.now()}`,
        name: useEditorStore.getState().currentDesignName,
        scene: activeScene,
        pages: pageSnapshot.map((page) => page.scene),
        activePageIndex: activePageIndexRef.current,
        viewport: engine.viewport.getState(),
        background: activeScene.background,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (autoSave?.onSave) {
        await autoSave.onSave(designData as any);
      } else {
        await designBackend.save(designData as any);
      }

      if (!currentDesignId) {
        setCurrentDesignId(designData.id);
        const url = new URL(window.location.href);
        url.searchParams.set('design', designData.id);
        window.history.replaceState({}, '', url.toString());
      }

      setLastSavedAt(new Date().toISOString());
    } catch {
      // silent fail for auto-save
    } finally {
      setIsSaving(false);
    }
  }, [engine, currentDesignId, autoSave, designBackend, setIsSaving, setCurrentDesignId, setLastSavedAt, getPagesSnapshot]);

  // Auto-save on canvas changes
  useEffect(() => {
    if (!engine || autoSave?.enabled === false) return;

    const unsub = engine.scene.subscribe(() => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        performSave();
      }, autoSave?.debounceMs || 5000);
    });

    return () => {
      unsub();
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [engine, autoSave, performSave]);

  const handlePublish = useCallback(async () => {
    if (!callbacks?.onPublish || !engine) return;
    setIsPublishing(true);
    try {
      const pageSnapshot = getPagesSnapshot();
      const activeScene = pageSnapshot[activePageIndexRef.current]?.scene ?? engine.scene.getState();
      const designData = {
        id: currentDesignId || `design-${Date.now()}`,
        name: useEditorStore.getState().currentDesignName,
        scene: activeScene,
        pages: pageSnapshot.map((page) => page.scene),
        activePageIndex: activePageIndexRef.current,
        viewport: engine.viewport.getState(),
        background: activeScene.background,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await callbacks.onPublish(designData);
      addToast('Published successfully', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Publish failed', 'error');
    } finally {
      setIsPublishing(false);
    }
  }, [callbacks, engine, currentDesignId, setIsPublishing, addToast, getPagesSnapshot]);

  const handleExport = useCallback(
    async (format: 'png' | 'jpg' | 'svg' | 'pdf', quality?: number, scale?: number) => {
      if (!engine) return;
      try {
        if (format === 'pdf') {
          // Lazy load jspdf for PDF export
          const { jsPDF } = await import('jspdf');
          const dataUrl = engine.exportToDataURL('png', quality, scale);
          const img = new Image();
          img.onload = () => {
            const pdf = new jsPDF({
              orientation: img.width > img.height ? 'landscape' : 'portrait',
              unit: 'px',
              format: [img.width, img.height],
            });
            pdf.addImage(dataUrl, 'PNG', 0, 0, img.width, img.height);
            const pdfBlob = pdf.output('blob');
            callbacks?.onExport?.(pdfBlob, 'pdf');
            addToast('Exported as PDF', 'success');
          };
          img.src = dataUrl;
          return;
        }

        const blob = await engine.export({ format, quality: quality ?? 0.92, scale });
        callbacks?.onExport?.(blob, format);
        addToast(`Exported as ${format.toUpperCase()}`, 'success');
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        callbacks?.onError?.(error);
        addToast(error.message, 'error');
      }
    },
    [engine, callbacks, addToast]
  );

  const handleAddImage = useCallback(
    (src: string, width: number, height: number, x?: number, y?: number) => {
      const layer = createImageLayer(engine, src, width, height, x !== undefined && y !== undefined ? { x, y } : undefined);
      const id = addLayerAndSelect(engine, layer);
      if (id) {
        addToast('Image added', 'success');
      }
    },
    [engine, addToast]
  );

  const handleAddVideo = useCallback(
    (src: string, width: number, height: number, duration: number, x?: number, y?: number) => {
      const layer = createVideoLayer(engine, src, width, height, duration, x !== undefined && y !== undefined ? { x, y } : undefined);
      const id = addLayerAndSelect(engine, layer);
      if (id) {
        addToast('Video added', 'success');
      }
    },
    [engine, addToast]
  );

  // Active panel content
  const activePanelDef = PANEL_REGISTRY.find((p) => p.id === activeLeftPanel);

  const drawerContent = React.useMemo(() => {
    if (!activePanelDef) return null;
    const PanelComponent = activePanelDef.component;
    const panelProps: any = { engine };

    // Pass specific props based on panel type
    if (activePanelDef.id === 'assets') {
      panelProps.photoProvider = providers?.photos;
      panelProps.videoProvider = providers?.videos;
      panelProps.onAddImage = handleAddImage;
      panelProps.onAddVideo = handleAddVideo;
    }
    if (activePanelDef.id === 'upload') {
      panelProps.uploadConfig = uploadConfig;
    }
    if (activePanelDef.id === 'videos') {
      panelProps.videoProvider = providers?.videos;
      panelProps.onAddVideo = handleAddVideo;
    }
    if (activePanelDef.id === 'templates') {
      panelProps.onNewDesign = (width: number, height: number) => {
        engine?.resizeCanvas(width, height);
        callbacks?.onNewDesign?.(width, height);
      };
    }
    if (activePanelDef.id === 'my-designs') {
      panelProps.designBackend = designBackend;
      panelProps.getDesignPages = getDesignPagesForSave;
      panelProps.onLoadDesign = handleLoadDesign;
    }

    return <PanelComponent {...panelProps} />;
  }, [activePanelDef, engine, providers, uploadConfig, designBackend, handleAddImage, handleAddVideo, callbacks, getDesignPagesForSave, handleLoadDesign]);

  return (
    <>
      <KeyboardShortcuts engine={engine} />
      <div className="orbit-editor flex h-full min-h-0 w-full flex-col">
        <Toolbar
          engine={engine}
          isReady={isReady}
          onExport={handleExport}
          onVideoExport={() => setVideoExportOpen(true)}
          onSave={performSave}
          onPublish={callbacks?.onPublish ? handlePublish : undefined}
          onNewDesign={callbacks?.onNewDesign}
        />

        <div className="relative flex min-h-0 flex-1 overflow-hidden bg-orbit-workspace">
          <div className="pointer-events-none absolute bottom-4 left-4 top-4 z-[60] max-w-[calc(100vw-2rem)]">
            <OrbitSidebar
              items={PANEL_REGISTRY.map((p) => ({ id: p.id, icon: p.icon, label: p.label }))}
              activeItem={activeLeftPanel}
              onItemClick={(id) => {
                setEditorMode('manual');
                setAgenticDrawerOpen(false);
                if (id === activeLeftPanel) {
                  setLeftDrawerOpen(!leftDrawerOpen);
                } else {
                  setActiveLeftPanel(id);
                  setLeftDrawerOpen(true);
                }
              }}
              drawerContent={drawerContent}
              drawerOpen={leftDrawerOpen}
              onDrawerClose={() => setLeftDrawerOpen(false)}
            />
          </div>

          <div
            className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={(e) => {
              e.preventDefault();
              const data = e.dataTransfer.getData('application/orbit-asset');
              if (!data) return;
              try {
                const asset = JSON.parse(data);
                const rect = e.currentTarget.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                const scale = Math.max(zoom / 100, 0.01);
                const canvasX = mouseX / scale;
                const canvasY = mouseY / scale;
                if (asset.type === 'video') {
                  handleAddVideo(
                    asset.src,
                    asset.width || 640,
                    asset.height || 360,
                    asset.duration || asset.metadata?.duration || 10,
                    canvasX,
                    canvasY
                  );
                } else {
                  handleAddImage(
                    asset.src,
                    asset.width || 800,
                    asset.height || 600,
                    canvasX,
                    canvasY
                  );
                }
              } catch {
                // ignore invalid drop data
              }
            }}
            style={{
              backgroundColor: 'var(--orbit-workspace-bg)',
              backgroundImage: showGrid
                ? gridType === 'dots'
                  ? `radial-gradient(circle, var(--orbit-canvas-dot) 1px, transparent 1px)`
                  : `linear-gradient(to right, var(--orbit-canvas-dot) 1px, transparent 1px), linear-gradient(to bottom, var(--orbit-canvas-dot) 1px, transparent 1px)`
                : 'none',
              backgroundSize: showGrid ? `${gridSize}px ${gridSize}px` : 'auto',
            }}
          >
            <div className="pointer-events-none absolute left-1/2 top-4 z-[70] -translate-x-1/2">
              <ContextToolbar engine={engine} />
            </div>

            {/* No AI backend, no AI button. A control that cannot answer a click
                is worse than an absent one. */}
            {aiBackend && (
            <button
              type="button"
              aria-pressed={editorMode === 'agentic' && agenticDrawerOpen}
              onClick={() => {
                setEditorMode('agentic');
                setAgenticDrawerOpen(true);
                setLeftDrawerOpen(false);
              }}
              className={`
                absolute right-4 top-4 z-[55] inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold shadow-[0_18px_42px_-26px_rgba(37,99,235,0.65)] backdrop-blur-xl transition active:scale-[0.98]
                ${editorMode === 'agentic' && agenticDrawerOpen
                  ? 'border-blue-300 bg-blue-600 text-white'
                  : 'border-white/70 bg-white/90 text-blue-700 hover:bg-white'}
              `}
            >
              {Icons.ai}
              AI
            </button>
            )}

            <RulerOverlay
              zoom={zoom}
              canvasWidth={canvasWidth}
              canvasHeight={canvasHeight}
              showRulers={showRulers}
              containerRef={containerRef}
            />
            <PageControls
              containerRef={containerRef}
              activePageIndex={activePageIndex}
              pageCount={pages.length}
              pagesLayout={pagesLayout}
              onPreviousPage={handlePreviousPage}
              onNextPage={handleNextPage}
              onDuplicatePage={handleDuplicatePage}
              onAddPage={handleAddPage}
              onDeletePage={handleDeletePage}
              onTogglePagesLayout={handleTogglePagesLayout}
            />
            <div ref={containerRef} className="h-full w-full" />
          </div>

          {agenticDrawerOpen && aiBackend && (
            <aside className="absolute bottom-4 right-4 top-4 z-[65] flex w-[calc(100vw-2rem)] max-w-[390px] flex-col overflow-hidden rounded-[26px] border border-white/70 bg-white/90 shadow-[0_30px_80px_-34px_rgba(15,23,42,0.5)] backdrop-blur-xl sm:w-[390px]">
              <div className="flex items-center justify-between border-b border-white/60 px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Agentic AI</p>
                  <p className="text-xs text-slate-500">Prompt-driven layer edits</p>
                </div>
                <button
                  type="button"
                  aria-label="Close Agentic AI"
                  onClick={() => {
                    setAgenticDrawerOpen(false);
                    setEditorMode('manual');
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/80 bg-white/75 text-slate-500 shadow-sm transition hover:bg-white hover:text-slate-800 active:scale-[0.96]"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <AgenticPanel engine={engine} backend={aiBackend} />
              </div>
            </aside>
          )}
        </div>

        <Timeline engine={engine} layers={layers} />
        <BottomBar engine={engine} />
      </div>

      <VideoExportModal
        open={videoExportOpen}
        onClose={() => setVideoExportOpen(false)}
        engine={engine}
        backend={exportBackend}
        onError={(err) => {
          callbacks?.onError?.(err);
          addToast(err.message, 'error');
        }}
      />
    </>
  );
};
