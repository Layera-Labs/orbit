/**
 * DrawOptionsPanel - Brush/Highlighter/Vector tool options
 */
import * as React from 'react';
import { useState, useCallback, useEffect } from 'react';
import { OrbitSlider } from '@layera-labs/ui';
import type { OrbitEngine } from '@layera-labs/core';
import type { DrawOptions } from '@layera-labs/core';

interface DrawOptionsPanelProps {
  engine: OrbitEngine | null;
}

export const DrawOptionsPanel: React.FC<DrawOptionsPanelProps> = ({ engine }) => {
  const [options, setOptions] = useState<DrawOptions & { simplifyTolerance: number }>({
    strokeWidth: 4,
    color: '#3b82f6',
    opacity: 1,
    mode: 'brush',
    simplifyTolerance: 2,
    pressureSensitive: true,
  });

  useEffect(() => {
    if (!engine) return;
    const current = engine.getTool();
    if (current === 'brush' || current === 'highlighter') {
      engine.configureTool({ mode: current });
      setOptions((prev) => ({ ...prev, mode: current }));
    }
    if (current === 'vector') {
      engine.configureTool({ simplifyTolerance: options.simplifyTolerance });
    }
  }, [engine]);

  const update = useCallback(
    (patch: Partial<typeof options>) => {
      const next = { ...options, ...patch };
      setOptions(next);
      engine?.configureTool(next);
    },
    [options, engine]
  );

  const colors = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#e5e5e5', '#0f0f0f', '#ec4899', '#8b5cf6'];

  const currentTool = engine?.getTool() || 'select';
  const isVector = currentTool === 'vector';

  return (
    <div className="flex flex-col gap-orbit-md p-orbit-md">
      <div className="text-xs font-medium text-orbit-text-secondary uppercase tracking-wider">
        {isVector ? 'Vector Tool' : 'Draw Tool'}
      </div>

      {/* Mode */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-orbit-text-tertiary">Mode</label>
        <div className="flex gap-1">
          {(['brush', 'highlighter', 'vector'] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                update({ mode: m === 'vector' ? 'brush' : m });
                engine?.setTool(m);
              }}
              className={`
                flex-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors capitalize
                ${currentTool === m
                  ? 'border-orbit-accent bg-orbit-accent-subtle text-orbit-accent'
                  : 'border-orbit-border bg-orbit-panel text-orbit-text-secondary hover:text-orbit-text'}
              `}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Pressure sensitivity toggle */}
      <div className="flex items-center justify-between">
        <label className="text-xs text-orbit-text-tertiary">Pressure Sensitive</label>
        <button
          onClick={() => update({ pressureSensitive: !options.pressureSensitive })}
          className={`
            relative h-5 w-9 rounded-full transition-colors
            ${options.pressureSensitive ? 'bg-orbit-accent' : 'bg-orbit-border'}
          `}
        >
          <span
            className={`
              absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform
              ${options.pressureSensitive ? 'translate-x-4' : 'translate-x-0.5'}
            `}
          />
        </button>
      </div>

      <OrbitSlider
        label="Size"
        min={1}
        max={50}
        step={1}
        value={options.strokeWidth}
        onChange={(v) => update({ strokeWidth: v })}
        valueFormatter={(v) => `${v}px`}
      />

      <OrbitSlider
        label="Opacity"
        min={0.1}
        max={1}
        step={0.1}
        value={options.opacity}
        onChange={(v) => update({ opacity: v })}
        valueFormatter={(v) => `${Math.round(v * 100)}%`}
      />

      {isVector && (
        <OrbitSlider
          label="Simplify"
          min={0}
          max={10}
          step={0.5}
          value={options.simplifyTolerance}
          onChange={(v) => update({ simplifyTolerance: v })}
          valueFormatter={(v) => `${v}px`}
        />
      )}

      {/* Colors */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-orbit-text-tertiary">Color</label>
        <div className="grid grid-cols-4 gap-1.5">
          {colors.map((c) => (
            <button
              key={c}
              onClick={() => update({ color: c })}
              className={`
                h-6 w-full rounded-md border transition-all
                ${options.color === c ? 'border-orbit-accent ring-2 ring-orbit-accent/50' : 'border-orbit-border'}
              `}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
