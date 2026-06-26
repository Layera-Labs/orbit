/**
 * ShapesPanel - Geometric shapes library
 */
import * as React from 'react';
import { useCallback } from 'react';
import { useOrbitLayers } from '../../hooks/useOrbitEngine';
import type { OrbitEngine } from '@orbit/core';
import type { ShapeContent } from '@orbit/shared';
import { createShapeLayer } from '../../utils/layerPlacement';

interface ShapesPanelProps {
  engine: OrbitEngine | null;
  onClose?: () => void;
}

const SHAPES = [
  { id: 'rectangle', label: 'Rectangle', icon: '▭' },
  { id: 'circle', label: 'Circle', icon: '○' },
  { id: 'triangle', label: 'Triangle', icon: '△' },
  { id: 'star', label: 'Star', icon: '★' },
  { id: 'polygon', label: 'Polygon', icon: '⬡' },
  { id: 'line', label: 'Line', icon: '—' },
  { id: 'arrow', label: 'Arrow', icon: '→' },
];

const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#e5e5e5', '#0f0f0f', '#ec4899', '#8b5cf6'];

export const ShapesPanel: React.FC<ShapesPanelProps> = ({ engine, onClose }) => {
  const { addLayer, selectLayer } = useOrbitLayers(engine);
  const [fillColor, setFillColor] = React.useState('#3b82f6');
  const [strokeColor, setStrokeColor] = React.useState('transparent');

  const addShape = useCallback(
    (shapeType: string) => {
      const layer = createShapeLayer(engine, {
        shape: shapeType as ShapeContent['shape'],
        fill: fillColor,
        stroke: strokeColor,
        width: shapeType === 'line' || shapeType === 'arrow' ? 150 : 120,
        height: shapeType === 'line' || shapeType === 'arrow' ? 4 : 120,
      });
      const id = addLayer(layer);
      if (id) selectLayer(id);
      onClose?.();
    },
    [addLayer, engine, selectLayer, fillColor, strokeColor, onClose]
  );

  return (
    <div className="flex flex-col gap-orbit-md p-orbit-md">
      <div className="text-xs font-medium text-orbit-text-secondary uppercase tracking-wider">
        Shapes
      </div>

      <div className="grid grid-cols-3 gap-2">
        {SHAPES.map((shape) => (
          <button
            key={shape.id}
            onClick={() => addShape(shape.id)}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-orbit-border bg-orbit-panel p-2 transition-colors hover:border-orbit-accent hover:bg-orbit-accent-subtle"
          >
            <span className="text-lg">{shape.icon}</span>
            <span className="text-[10px] text-orbit-text-secondary">{shape.label}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-orbit-text-tertiary">Fill Color</label>
        <div className="grid grid-cols-4 gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setFillColor(c)}
              className={`
                h-6 w-full rounded-md border transition-all
                ${fillColor === c ? 'border-orbit-accent ring-2 ring-orbit-accent/50' : 'border-orbit-border'}
              `}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-orbit-text-tertiary">Stroke Color</label>
        <div className="grid grid-cols-4 gap-1.5">
          {['transparent', ...COLORS].map((c) => (
            <button
              key={c}
              onClick={() => setStrokeColor(c)}
              className={`
                h-6 w-full rounded-md border transition-all
                ${strokeColor === c ? 'border-orbit-accent ring-2 ring-orbit-accent/50' : 'border-orbit-border'}
              `}
              style={{ backgroundColor: c === 'transparent' ? 'var(--orbit-panel-bg)' : c }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
