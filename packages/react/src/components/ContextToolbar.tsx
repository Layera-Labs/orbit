import * as React from 'react';
import { useMemo } from 'react';
import type { OrbitEngine } from '@orbit/core';
import type { Layer, TextContent } from '@orbit/shared';
import { useOrbitLayers } from '../hooks/useOrbitEngine';
import { TextToolbar } from './TextToolbar';

interface ContextToolbarProps {
  engine: OrbitEngine | null;
}

function updateContent(engine: OrbitEngine | null, layer: Layer, updates: Record<string, unknown>): void {
  if (!engine) return;
  const currentLayer = engine.scene.getLayer(layer.id);
  if (!currentLayer || currentLayer.type !== 'text') return;
  engine.updateLayer(layer.id, {
    content: {
      ...(currentLayer.content as unknown as Record<string, unknown>),
      ...updates,
    } as unknown as Layer['content'],
  });
}

export const ContextToolbar: React.FC<ContextToolbarProps> = ({ engine }) => {
  const { layers, selectedIds } = useOrbitLayers(engine);
  const selectedLayers = useMemo(
    () => selectedIds.map((id) => layers.find((layer) => layer.id === id)).filter((layer): layer is Layer => !!layer),
    [layers, selectedIds]
  );

  if (selectedLayers.length !== 1) return null;

  const layer = selectedLayers[0];
  if (layer.type !== 'text') return null;

  const updateLayer = (id: string, updates: Partial<Layer>) => {
    engine?.updateLayer(id, updates);
  };

  return (
    <div className="pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-1.5 overflow-x-auto rounded-full border border-white/70 bg-white/90 px-2 py-1.5 shadow-[0_18px_50px_-28px_rgba(15,23,42,0.34)] backdrop-blur-xl md:max-w-[calc(100vw-10rem)]">
      <TextToolbar
        engine={engine}
        layer={layer}
        content={layer.content as TextContent}
        updateLayer={updateLayer}
        updateContent={updateContent}
      />
    </div>
  );
};
