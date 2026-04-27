/**
 * BackgroundsPanel - Canvas background options
 */
import * as React from 'react';
import { OrbitButton } from '@orbit/ui';
import type { OrbitEngine } from '@orbit/core';
import { addLayerAndSelect, createBackgroundLayer } from '../../utils/layerPlacement';

interface BackgroundsPanelProps {
  engine: OrbitEngine | null;
}

const SOLID_COLORS = [
  '#ffffff', '#0f0f0f', '#3b82f6', '#ef4444', '#22c55e',
  '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316',
  '#84cc16', '#14b8a6', '#6366f1', '#a855f7', '#64748b',
];

const GRADIENTS = [
  { id: 'sunset', name: 'Sunset', value: 'linear-gradient(135deg, #f97316, #ef4444, #ec4899)' },
  { id: 'ocean', name: 'Ocean', value: 'linear-gradient(135deg, #06b6d4, #3b82f6, #6366f1)' },
  { id: 'midnight', name: 'Midnight', value: 'linear-gradient(135deg, #0f0f0f, #1e1b4b, #312e81)' },
  { id: 'forest', name: 'Forest', value: 'linear-gradient(135deg, #166534, #22c55e, #84cc16)' },
  { id: 'berry', name: 'Berry', value: 'linear-gradient(135deg, #be123c, #ec4899, #a855f7)' },
  { id: 'gold', name: 'Gold', value: 'linear-gradient(135deg, #ca8a04, #f59e0b, #fbbf24)' },
];

export const BackgroundsPanel: React.FC<BackgroundsPanelProps> = ({ engine }) => {
  const [activeTab, setActiveTab] = React.useState<'solid' | 'gradient' | 'pattern'>('solid');
  const [customColor, setCustomColor] = React.useState('#3b82f6');

  const applyBackground = (_type: 'solid' | 'gradient' | 'pattern', value: string, name = 'Background') => {
    addLayerAndSelect(engine, createBackgroundLayer(engine, value, name), { sendToBack: true });
  };

  return (
    <div className="flex flex-col gap-orbit-md p-orbit-md">
      <div className="text-xs font-medium text-orbit-text-secondary uppercase tracking-wider">
        Backgrounds
      </div>

      {/* Tabs */}
      <div className="flex border-b border-orbit-border">
        {(['solid', 'gradient', 'pattern'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`
              flex-1 px-orbit-sm py-orbit-sm text-xs font-medium transition-colors capitalize
              ${activeTab === tab ? 'text-orbit-accent border-b-2 border-orbit-accent' : 'text-orbit-text-secondary hover:text-orbit-text'}
            `}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Solid Colors */}
      {activeTab === 'solid' && (
        <div className="flex flex-col gap-orbit-md">
          <div className="grid grid-cols-5 gap-2">
            {SOLID_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => applyBackground('solid', color)}
                className="aspect-square rounded-md border border-orbit-border transition-transform hover:scale-105"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              className="h-8 w-8 rounded-md border border-orbit-border"
            />
            <OrbitButton variant="secondary" size="sm" onClick={() => applyBackground('solid', customColor)}>
              Apply Custom
            </OrbitButton>
          </div>
        </div>
      )}

      {/* Gradients */}
      {activeTab === 'gradient' && (
        <div className="grid grid-cols-2 gap-2">
          {GRADIENTS.map((g) => (
            <button
              key={g.id}
              onClick={() => applyBackground('gradient', g.value, g.name)}
              className="flex aspect-video flex-col items-center justify-center gap-1 rounded-md border border-orbit-border transition-transform hover:scale-105"
              style={{ background: g.value }}
            >
              <span className="text-xs font-medium text-white drop-shadow">{g.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Patterns */}
      {activeTab === 'pattern' && (
        <div className="grid grid-cols-2 gap-2">
          {['dots', 'grid', 'diagonal', 'noise'].map((pattern) => (
            <button
              key={pattern}
              onClick={() => applyBackground('pattern', '#f8fafc', `${pattern} background`)}
              className="flex aspect-video flex-col items-center justify-center gap-1 rounded-md border border-orbit-border bg-orbit-panel transition-colors hover:border-orbit-accent"
            >
              <span className="text-xs font-medium text-orbit-text capitalize">{pattern}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
