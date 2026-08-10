/**
 * MyDesignsPanel - Save/load designs from DB
 */
import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { OrbitInput, OrbitButton, OrbitDropdown } from '@layera-labs/orbit-ui';
import { useEditorStore } from '../../store';
import type { DesignBackend, DesignData, SortOption } from '../../store/types';
import type { OrbitEngine } from '@layera-labs/orbit-core';
import { useToast } from '../ToastProvider';

interface MyDesignsPanelProps {
  engine: OrbitEngine | null;
  designBackend?: DesignBackend;
  getDesignPages?: () => { pages: NonNullable<DesignData['pages']>; activePageIndex: number };
  onLoadDesign?: (data: DesignData) => void;
  onClose?: () => void;
}

export const MyDesignsPanel: React.FC<MyDesignsPanelProps> = ({
  engine,
  designBackend,
  getDesignPages,
  onLoadDesign,
  onClose,
}) => {
  const { addToast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('updated');
  const [isLoading, setIsLoading] = useState(false);

  const designs = useEditorStore((s) => s.designs);
  const currentDesignId = useEditorStore((s) => s.currentDesignId);
  const currentDesignName = useEditorStore((s) => s.currentDesignName);
  const setDesigns = useEditorStore((s) => s.setDesigns);
  const setCurrentDesignId = useEditorStore((s) => s.setCurrentDesignId);
  const setCurrentDesignName = useEditorStore((s) => s.setCurrentDesignName);
  const setIsLoadingDesigns = useEditorStore((s) => s.setIsLoadingDesigns);
  const addOrUpdateDesign = useEditorStore((s) => s.addOrUpdateDesign);

  const loadDesigns = useCallback(async () => {
    if (!designBackend) return;
    setIsLoadingDesigns(true);
    try {
      const list = await designBackend.list(searchQuery, sortBy);
      setDesigns(list);
    } catch {
      addToast('Failed to load designs', 'error');
    } finally {
      setIsLoadingDesigns(false);
    }
  }, [designBackend, searchQuery, sortBy, setDesigns, setIsLoadingDesigns, addToast]);

  useEffect(() => {
    loadDesigns();
  }, [loadDesigns]);

  const handleSave = async () => {
    if (!engine || !designBackend) return;
    setIsLoading(true);
    try {
      const pageSnapshot = getDesignPages?.();
      const activePageIndex = pageSnapshot?.activePageIndex ?? 0;
      const activeScene = pageSnapshot?.pages[activePageIndex] ?? engine.scene.getState();
      const designData = {
        id: currentDesignId || `design-${Date.now()}`,
        name: currentDesignName,
        scene: activeScene,
        pages: pageSnapshot?.pages,
        activePageIndex: pageSnapshot?.activePageIndex,
        viewport: engine.viewport.getState(),
        background: activeScene.background,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const meta = await designBackend.save(designData as any);
      addOrUpdateDesign(meta);
      setCurrentDesignId(meta.id);
      addToast('Design saved', 'success');
    } catch {
      addToast('Failed to save design', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoad = async (id: string) => {
    if (!engine || !designBackend) return;
    setIsLoading(true);
    try {
      const data = await designBackend.get(id);
      if (data) {
        if (onLoadDesign) {
          onLoadDesign(data);
        } else {
          const pages = data.pages?.length ? data.pages : [data.scene];
          const pageIndex = Math.min(Math.max(data.activePageIndex ?? 0, 0), pages.length - 1);
          engine.loadScene(pages[pageIndex]);
        }
        engine.viewport.setZoom(data.viewport.zoom);
        setCurrentDesignId(data.id);
        setCurrentDesignName(data.name);
        addToast(`Loaded "${data.name}"`, 'success');
        onClose?.();
      }
    } catch {
      addToast('Failed to load design', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-orbit-sm border-b border-orbit-border">
        <div className="flex gap-2 mb-2">
          <OrbitInput
            value={currentDesignName}
            onChange={(e) => setCurrentDesignName(e.target.value)}
            placeholder="Design name"
            className="h-8 text-xs flex-1"
          />
          <OrbitButton variant="primary" size="sm" onClick={handleSave} disabled={isLoading}>
            Save
          </OrbitButton>
        </div>
        <div className="flex gap-2">
          <OrbitInput
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search designs..."
            className="h-8 text-xs flex-1"
          />
          <OrbitDropdown
            options={[
              { value: 'updated', label: 'Last Updated' },
              { value: 'date', label: 'Created' },
              { value: 'name', label: 'Name' },
            ]}
            value={sortBy}
            onChange={(v) => setSortBy(v as SortOption)}
            placeholder="Sort by"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto py-1">
        {!designBackend && (
          <div className="px-orbit-md py-orbit-sm text-xs text-orbit-text-tertiary text-center">
            No design backend configured
          </div>
        )}
        {designs.length === 0 && designBackend && (
          <div className="px-orbit-md py-orbit-sm text-xs text-orbit-text-tertiary text-center">
            No saved designs
          </div>
        )}
        {designs.map((design) => (
          <button
            key={design.id}
            onClick={() => handleLoad(design.id)}
            className={`
              flex w-full items-center gap-3 px-orbit-md py-orbit-sm text-left transition-colors
              ${currentDesignId === design.id ? 'bg-orbit-selected text-orbit-text' : 'text-orbit-text-secondary hover:bg-orbit-hover'}
            `}
          >
            <div className="h-10 w-10 shrink-0 rounded-md bg-orbit-panel border border-orbit-border overflow-hidden">
              {design.thumbnail ? (
                <img src={design.thumbnail} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] text-orbit-text-tertiary">
                  {design.layerCount}
                </div>
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-medium truncate">{design.name}</span>
              <span className="text-[10px] text-orbit-text-tertiary">
                {new Date(design.updatedAt).toLocaleDateString()}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
