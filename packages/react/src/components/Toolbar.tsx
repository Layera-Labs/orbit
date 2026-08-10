/**
 * Toolbar - Extracted top toolbar component
 */
import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import { OrbitButton, OrbitDialog, OrbitLoading } from '@layera-labs/orbit-ui';
import { SOCIAL_PRESETS } from '@layera-labs/orbit-shared';
import { useEditorStore } from '../store';
import type { OrbitEngine } from '@layera-labs/orbit-core';

interface ToolbarProps {
  engine: OrbitEngine | null;
  isReady: boolean;
  onExport: (format: 'png' | 'jpg' | 'svg' | 'pdf', quality?: number, scale?: number) => void;
  onVideoExport?: () => void;
  onSave?: () => void;
  onPublish?: () => void;
  onNewDesign?: (width: number, height: number) => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  engine,
  isReady,
  onExport,
  onVideoExport,
  onSave,
  onPublish,
  onNewDesign,
}) => {
  const [exportOpen, setExportOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [quality, setQuality] = useState(0.92);
  const [scale, setScale] = useState(1);
  const exportRef = useRef<HTMLDivElement>(null);
  const newRef = useRef<HTMLDivElement>(null);

  const activeTool = useEditorStore((s) => s.activeTool);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const isSaving = useEditorStore((s) => s.isSaving);
  const isPublishing = useEditorStore((s) => s.isPublishing);
  const lastSavedAt = useEditorStore((s) => s.lastSavedAt);
  const currentDesignName = useEditorStore((s) => s.currentDesignName);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
      if (newRef.current && !newRef.current.contains(e.target as Node)) {
        setNewOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const tools: Array<{ id: string; label: string }> = [
    { id: 'select', label: 'Select' },
    { id: 'brush', label: 'Draw' },
    { id: 'vector', label: 'Vector' },
    { id: 'crop', label: 'Crop' },
  ];

  const handleNewPreset = (width: number, height: number) => {
    engine?.resizeCanvas(width, height);
    onNewDesign?.(width, height);
    setNewOpen(false);
  };

  const presets = Object.entries(SOCIAL_PRESETS).filter(([key]) => key !== 'custom');

  return (
    <div className="flex h-orbit-toolbar items-center border-b border-orbit-border bg-orbit-sidebar px-orbit-md">
      {/* New Design Dropdown */}
      <div className="relative" ref={newRef}>
        <OrbitButton variant="ghost" size="sm" onClick={() => setNewOpen(!newOpen)}>
          New
        </OrbitButton>
        {newOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border border-orbit-border bg-orbit-panel shadow-lg">
            <div className="max-h-80 overflow-auto p-2">
              <span className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-orbit-text-tertiary">
                Presets
              </span>
              <div className="mt-1 grid grid-cols-2 gap-1">
                {presets.map(([key, preset]) => (
                  <button
                    key={key}
                    onClick={() => handleNewPreset(preset.width, preset.height)}
                    className="flex flex-col items-center gap-1 rounded-md border border-orbit-border bg-orbit-panel p-2 text-left transition-colors hover:border-orbit-accent hover:bg-orbit-accent-subtle"
                  >
                    <div
                      className="rounded border border-orbit-border bg-orbit-canvas-bg"
                      style={{
                        width: 24,
                        height: 24 * (preset.height / preset.width),
                        maxHeight: 24,
                      }}
                    />
                    <span className="text-[10px] text-orbit-text">{preset.label}</span>
                    <span className="text-[9px] text-orbit-text-tertiary">
                      {preset.width}×{preset.height}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mx-2 h-4 w-px bg-orbit-border" />

      <span className="text-sm font-medium text-orbit-text">{currentDesignName}</span>
      {!isReady && <OrbitLoading variant="dots" size="sm" className="ml-2" />}

      {/* Tool Selector */}
      <div className="ml-4 flex items-center gap-px rounded-md border border-orbit-border bg-orbit-panel p-px">
        {tools.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setActiveTool(t.id);
              engine?.setTool(t.id as any);
            }}
            className={`
              px-3 py-1 text-xs font-medium rounded-[3px] transition-colors capitalize
              ${activeTool === t.id
                ? 'bg-orbit-accent text-white'
                : 'text-orbit-text-secondary hover:text-orbit-text hover:bg-orbit-hover'}
            `}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {lastSavedAt && (
          <span className="text-[10px] text-orbit-text-tertiary">
            Saved {new Date(lastSavedAt).toLocaleTimeString()}
          </span>
        )}
        {isSaving && <span className="text-xs text-orbit-text-secondary">Saving...</span>}

        {onSave && (
          <OrbitButton variant="ghost" size="sm" onClick={onSave} disabled={isSaving}>
            Save
          </OrbitButton>
        )}
        {onPublish && (
          <OrbitButton variant="primary" size="sm" onClick={onPublish} disabled={isPublishing}>
            {isPublishing ? 'Publishing...' : 'Publish'}
          </OrbitButton>
        )}

        <div className="mx-1 h-4 w-px bg-orbit-border" />

        {/* Export Dropdown */}
        <div className="relative" ref={exportRef}>
          <OrbitButton variant="ghost" size="sm" onClick={() => setExportOpen(!exportOpen)}>
            Export ▾
          </OrbitButton>
          {exportOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-md border border-orbit-border bg-orbit-panel shadow-lg p-orbit-sm">
              <div className="flex flex-col gap-2">
                {/* Quality */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-orbit-text-tertiary">Quality</label>
                  <div className="flex gap-1">
                    {[
                      { label: 'Low', value: 0.6 },
                      { label: 'Med', value: 0.85 },
                      { label: 'High', value: 0.95 },
                      { label: 'Max', value: 1.0 },
                    ].map((q) => (
                      <button
                        key={q.label}
                        onClick={() => setQuality(q.value)}
                        className={`
                          flex-1 rounded border px-1 py-0.5 text-[10px] transition-colors
                          ${quality === q.value
                            ? 'border-orbit-accent bg-orbit-accent-subtle text-orbit-accent'
                            : 'border-orbit-border text-orbit-text-secondary hover:text-orbit-text'}
                        `}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Scale */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-orbit-text-tertiary">Scale</label>
                  <div className="flex gap-1">
                    {[1, 1.5, 2, 3].map((s) => (
                      <button
                        key={s}
                        onClick={() => setScale(s)}
                        className={`
                          flex-1 rounded border px-1 py-0.5 text-[10px] transition-colors
                          ${scale === s
                            ? 'border-orbit-accent bg-orbit-accent-subtle text-orbit-accent'
                            : 'border-orbit-border text-orbit-text-secondary hover:text-orbit-text'}
                        `}
                      >
                        {s}×
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-orbit-border" />

                {/* Image Export buttons */}
                <div className="grid grid-cols-2 gap-1">
                  <OrbitButton
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      onExport('png', quality, scale);
                      setExportOpen(false);
                    }}
                  >
                    PNG
                  </OrbitButton>
                  <OrbitButton
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      onExport('jpg', quality, scale);
                      setExportOpen(false);
                    }}
                  >
                    JPG
                  </OrbitButton>
                  <OrbitButton
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      onExport('svg');
                      setExportOpen(false);
                    }}
                  >
                    SVG
                  </OrbitButton>
                  <OrbitButton
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      onExport('pdf', quality, scale);
                      setExportOpen(false);
                    }}
                  >
                    PDF
                  </OrbitButton>
                </div>

                <div className="border-t border-orbit-border" />

                {/* Video Export */}
                <OrbitButton
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    onVideoExport?.();
                    setExportOpen(false);
                  }}
                >
                  Video / GIF...
                </OrbitButton>
              </div>
            </div>
          )}
        </div>

        <div className="mx-1 h-4 w-px bg-orbit-border" />

        <OrbitButton variant="ghost" size="sm" onClick={() => engine?.undo()}>
          Undo
        </OrbitButton>
        <OrbitButton variant="ghost" size="sm" onClick={() => engine?.redo()}>
          Redo
        </OrbitButton>

        <div className="mx-1 h-4 w-px bg-orbit-border" />

        <OrbitButton
          variant="ghost"
          size="sm"
          onClick={() => setClearDialogOpen(true)}
        >
          Clear
        </OrbitButton>
      </div>

      {/* Clear Canvas Confirmation Dialog */}
      <OrbitDialog
        open={clearDialogOpen}
        onClose={() => setClearDialogOpen(false)}
        title="Clear Canvas"
        description="This will remove all layers and cannot be undone. Are you sure?"
        footer={
          <>
            <OrbitButton variant="secondary" size="sm" onClick={() => setClearDialogOpen(false)}>
              Cancel
            </OrbitButton>
            <OrbitButton
              variant="destructive"
              size="sm"
              onClick={() => {
                engine?.clearCanvas();
                setClearDialogOpen(false);
              }}
            >
              Clear All
            </OrbitButton>
          </>
        }
      />
    </div>
  );
};
