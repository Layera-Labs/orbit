/**
 * TemplatesPanel - Preset canvas sizes and template gallery
 */
import * as React from 'react';
import { SOCIAL_PRESETS } from '@layera-labs/shared';
import { useEditorStore } from '../../store';
import type { OrbitEngine } from '@layera-labs/core';

interface TemplatesPanelProps {
  engine: OrbitEngine | null;
  onNewDesign?: (width: number, height: number) => void;
}

const PRESET_CATEGORIES: Record<string, string> = {
  social: 'Social Media',
  print: 'Print',
  screen: 'Screen',
  custom: 'Custom',
};

export const TemplatesPanel: React.FC<TemplatesPanelProps> = ({ onNewDesign }) => {
  const setCurrentDesignName = useEditorStore((s) => s.setCurrentDesignName);
  const setCurrentDesignId = useEditorStore((s) => s.setCurrentDesignId);

  const presets = Object.entries(SOCIAL_PRESETS).map(([key, value]) => ({
    id: key,
    ...value,
  }));

  const categories = Array.from(new Set(presets.map((p) => p.category)));

  const handleSelectPreset = (preset: typeof presets[0]) => {
    if (preset.id === 'custom') {
      // For custom, just clear and let user set dimensions elsewhere
      return;
    }
    setCurrentDesignName(preset.label);
    setCurrentDesignId('');
    onNewDesign?.(preset.width, preset.height);
    // Clear design ID from URL
    const url = new URL(window.location.href);
    url.searchParams.delete('design');
    window.history.replaceState({}, '', url.toString());
  };

  return (
    <div className="flex flex-col gap-orbit-lg">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-orbit-text">New Design</span>
        <span className="text-xs text-orbit-text-secondary">Choose a preset size to start</span>
      </div>

      {categories.map((category) => (
        <div key={category} className="flex flex-col gap-orbit-sm">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-orbit-text-tertiary">
            {PRESET_CATEGORIES[category] || category}
          </span>
          <div className="grid grid-cols-2 gap-orbit-sm">
            {presets
              .filter((p) => p.category === category)
              .map((preset) => {
                const ratio = preset.width / preset.height;
                const visualW = Math.min(40, 40 * ratio);
                const visualH = Math.min(40, 40 / ratio);
                return (
                  <button
                    key={preset.id}
                    onClick={() => handleSelectPreset(preset)}
                    className="flex min-h-[96px] flex-col items-center justify-between gap-2 rounded-md border border-orbit-border bg-orbit-panel p-orbit-sm transition-colors hover:border-orbit-accent hover:bg-orbit-accent-subtle"
                  >
                    {/* Aspect ratio visual */}
                    <div className="flex flex-1 items-center justify-center">
                      <div
                        className="rounded border border-orbit-border bg-orbit-canvas-bg"
                        style={{
                          width: visualW,
                          height: visualH,
                          minWidth: 12,
                          minHeight: 12,
                        }}
                      />
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[11px] font-medium leading-tight text-orbit-text">{preset.label}</span>
                      <span className="text-[10px] tabular-nums text-orbit-text-tertiary">
                        {preset.width} × {preset.height}
                      </span>
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
};
