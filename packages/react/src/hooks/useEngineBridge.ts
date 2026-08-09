/**
 * useEngineBridge - Syncs OrbitEngine state into Zustand store
 */
import { useEffect } from 'react';
import { useEditorStore } from '../store';
import type { OrbitEngine } from '@layera-labs/core';

export function useEngineBridge(engine: OrbitEngine | null) {
  const setLayers = useEditorStore((s) => s.setLayers);
  const setSelectedIds = useEditorStore((s) => s.setSelectedIds);
  const setViewport = useEditorStore((s) => s.setViewport);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);

  useEffect(() => {
    if (!engine) return;

    setLayers(engine.scene.getState().root);
    setViewport(engine.viewport.getState());

    // Sync layers
    const unsubScene = engine.scene.subscribe((state) => {
      setLayers(state.root);
    });

    // Sync selection
    const unsubSelection = engine.on('selectionChange', (ids: string[]) => {
      setSelectedIds(ids);
    });

    // Sync viewport
    const unsubViewport = engine.viewport.subscribe((state) => {
      setViewport({ zoom: state.zoom });
    });

    // Sync tool
    const unsubTool = engine.on('toolChange', (tool: string) => {
      setActiveTool(tool);
    });

    return () => {
      unsubScene();
      unsubSelection();
      unsubViewport();
      unsubTool();
    };
  }, [engine, setLayers, setSelectedIds, setViewport, setActiveTool]);
}
