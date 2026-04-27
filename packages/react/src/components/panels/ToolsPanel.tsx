import * as React from 'react';
import { useCallback } from 'react';
import { useOrbitLayers } from '../../hooks/useOrbitEngine';
import { OrbitButton } from '@orbit/ui';
import type { OrbitEngine } from '@orbit/core';
import { createCenteredTextLayer, createShapeLayer } from '../../utils/layerPlacement';

interface ToolsPanelProps {
  engine: OrbitEngine | null;
}

export const ToolsPanel: React.FC<ToolsPanelProps> = ({ engine }) => {
  const { addLayer, selectLayer } = useOrbitLayers(engine);

  const createTextLayer = useCallback(() => {
    const layer = createCenteredTextLayer(engine, {
      text: 'Double click to edit',
      fontSize: 32,
      fontWeight: 400,
      color: '#1a1a1a',
      width: 300,
      height: 60,
      name: 'Text',
    });
    const id = addLayer(layer);
    if (id) selectLayer(id);
  }, [addLayer, engine, selectLayer]);

  const createRectLayer = useCallback(() => {
    const layer = createShapeLayer(engine, {
      shape: 'rectangle',
      fill: '#3b82f6',
      width: 200,
      height: 150,
    });
    const id = addLayer(layer);
    if (id) selectLayer(id);
  }, [addLayer, engine, selectLayer]);

  const createCircleLayer = useCallback(() => {
    const layer = createShapeLayer(engine, {
      shape: 'circle',
      fill: '#22c55e',
      width: 150,
      height: 150,
    });
    const id = addLayer(layer);
    if (id) selectLayer(id);
  }, [addLayer, engine, selectLayer]);

  return (
    <div className="flex flex-col gap-2 p-orbit-md border-b border-orbit-border">
      <span className="text-xs font-medium text-orbit-text-secondary uppercase tracking-wider">Tools</span>
      <div className="grid grid-cols-3 gap-2">
        <OrbitButton variant="secondary" size="sm" onClick={createTextLayer}>
          T
        </OrbitButton>
        <OrbitButton variant="secondary" size="sm" onClick={createRectLayer}>
          ▭
        </OrbitButton>
        <OrbitButton variant="secondary" size="sm" onClick={createCircleLayer}>
          ○
        </OrbitButton>
      </div>
    </div>
  );
};
