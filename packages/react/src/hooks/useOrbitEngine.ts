/**
 * React hooks for Orbit Engine
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { OrbitEngine } from '@orbit/core';
import type { Layer, ViewportState } from '@orbit/shared';

export function useOrbitEngine(config: { width?: number; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<OrbitEngine | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const canvasWidth = config.width || 1080;
    const canvasHeight = config.height || 1080;

    const engine = new OrbitEngine({ width: canvasWidth, height: canvasHeight });
    engine.init(el);
    engineRef.current = engine;

    let fitDone = false;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width < 10 || height < 10) return;
      if (fitDone) return;

      engine.viewport.zoomToFit(canvasWidth, canvasHeight, width, height, 96);
      fitDone = true;
    });

    ro.observe(el);
    setIsReady(true);

    return () => {
      ro.disconnect();
      engine.destroy();
      engineRef.current = null;
      setIsReady(false);
    };
  }, [config.width, config.height]);

  return { containerRef, engine: engineRef.current, isReady };
}

export function useOrbitLayers(engine: OrbitEngine | null) {
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!engine) return;

    const unsubscribe = engine.scene.subscribe((state) => {
      setLayers(state.root);
    });

    const unsubscribeSelection = engine.on('selectionChange', (ids: string[]) => {
      setSelectedIds(ids);
    });

    return () => {
      unsubscribe();
      unsubscribeSelection();
    };
  }, [engine]);

  const addLayer = useCallback((layer: Omit<Layer, 'id'>): string | undefined => {
    return engine?.addLayer(layer);
  }, [engine]);

  const removeLayer = useCallback((id: string) => {
    engine?.removeLayer(id);
  }, [engine]);

  const selectLayer = useCallback((id: string | string[]) => {
    engine?.selectLayer(id);
  }, [engine]);

  const updateLayer = useCallback((id: string, updates: Partial<Layer>) => {
    engine?.updateLayer(id, updates);
  }, [engine]);

  const moveLayer = useCallback((id: string, newIndex: number) => {
    engine?.moveLayer(id, newIndex);
  }, [engine]);

  return {
    layers,
    selectedIds,
    addLayer,
    removeLayer,
    selectLayer,
    updateLayer,
    moveLayer,
  };
}

export function useOrbitViewport(engine: OrbitEngine | null) {
  const [viewport, setViewport] = useState<ViewportState>({ zoom: 100 });

  useEffect(() => {
    if (!engine) return;

    const unsubscribe = engine.viewport.subscribe((state) => {
      setViewport(state);
    });

    return () => unsubscribe();
  }, [engine]);

  const zoomIn = useCallback(() => engine?.zoomIn(), [engine]);
  const zoomOut = useCallback(() => engine?.zoomOut(), [engine]);
  const zoomToFit = useCallback(() => engine?.zoomToFit(), [engine]);
  const resetZoom = useCallback(() => engine?.resetZoom(), [engine]);

  return {
    viewport,
    zoomIn,
    zoomOut,
    zoomToFit,
    resetZoom,
  };
}

export function useOrbitHistory(engine: OrbitEngine | null) {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    if (!engine) return;

    const unsubscribe = engine.history.subscribe((undo, redo) => {
      setCanUndo(undo);
      setCanRedo(redo);
    });

    return () => unsubscribe();
  }, [engine]);

  const undo = useCallback(() => engine?.undo(), [engine]);
  const redo = useCallback(() => engine?.redo(), [engine]);

  return { canUndo, canRedo, undo, redo };
}

export function useOrbitTool(engine: OrbitEngine | null) {
  const [tool, setToolState] = useState<string>('select');

  useEffect(() => {
    if (!engine) return;

    const unsubscribe = engine.on('toolChange', (t: string) => {
      setToolState(t);
    });

    return () => unsubscribe();
  }, [engine]);

  const setTool = useCallback((t: string) => {
    engine?.setTool(t as any);
  }, [engine]);

  return { tool, setTool };
}
