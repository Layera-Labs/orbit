/**
 * OrbitEditor v2 - Refactored with OrbitSidebar rail+drawer, Zustand, and new panels
 */
import * as React from 'react';
import { useEffect, useCallback, useRef, useState } from 'react';
import { useOrbitEngine } from './hooks/useOrbitEngine';
import { useEngineBridge } from './hooks/useEngineBridge';
import { OrbitSidebar } from '@orbit/ui';
import { themeManager } from '@orbit/ui';
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
import type { AssetProvider } from '@orbit/shared';
import type { UploadConfig, AutoSaveConfig, DesignBackend } from './store/types';
import { addLayerAndSelect, createImageLayer, createVideoLayer } from './utils/layerPlacement';

export interface OrbitEditorProps {
  apiKey: string;
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

export const OrbitEditor: React.FC<OrbitEditorProps> = (props) => {
  return (
    <ToastProvider>
      <OrbitEditorInner {...props} />
    </ToastProvider>
  );
};

const OrbitEditorInner: React.FC<OrbitEditorProps> = ({
  apiKey,
  backendUrl,
  theme,
  config,
  providers,
  callbacks,
  uploadConfig,
  designBackend: customDesignBackend,
  autoSave,
}) => {
  const { addToast } = useToast();
  const { containerRef, engine, isReady } = useOrbitEngine({
    width: (config?.width as number) || 1080,
    height: (config?.height as number) || 1080,
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
  const panX = useEditorStore((s) => s.panX);
  const panY = useEditorStore((s) => s.panY);
  const zoom = useEditorStore((s) => s.zoom);
  const [videoExportOpen, setVideoExportOpen] = useState(false);

  const designBackend = customDesignBackend || localStorageDesignBackend;

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
      const designData = {
        id: currentDesignId || `design-${Date.now()}`,
        name: useEditorStore.getState().currentDesignName,
        scene: engine.scene.getState(),
        viewport: engine.viewport.getState(),
        background: engine.scene.getState().background,
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
  }, [engine, currentDesignId, autoSave, designBackend, setIsSaving, setCurrentDesignId, setLastSavedAt]);

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
      const designData = {
        id: currentDesignId || `design-${Date.now()}`,
        name: useEditorStore.getState().currentDesignName,
        scene: engine.scene.getState(),
        viewport: engine.viewport.getState(),
        background: engine.scene.getState().background,
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
  }, [callbacks, engine, currentDesignId, setIsPublishing, addToast]);

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
    }

    return <PanelComponent {...panelProps} />;
  }, [activePanelDef, engine, providers, uploadConfig, designBackend, handleAddImage, handleAddVideo, callbacks]);

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
                const canvasX = (mouseX - panX) / zoom;
                const canvasY = (mouseY - panY) / zoom;
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
            <div className="pointer-events-none absolute left-1/2 top-4 z-[45] -translate-x-1/2">
              <ContextToolbar engine={engine} />
            </div>

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

            <RulerOverlay
              zoom={zoom}
              panX={panX}
              panY={panY}
              canvasWidth={canvasWidth}
              canvasHeight={canvasHeight}
              showRulers={showRulers}
            />
            <div ref={containerRef} className="h-full w-full" />
          </div>

          {agenticDrawerOpen && (
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
                <AgenticPanel engine={engine} apiKey={apiKey} backendUrl={backendUrl} />
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
        apiKey={apiKey}
        backendUrl={backendUrl}
        onError={(err) => {
          callbacks?.onError?.(err);
          addToast(err.message, 'error');
        }}
      />
    </>
  );
};
