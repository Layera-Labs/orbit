import * as React from 'react';
import { useState, useCallback } from 'react';
import { OrbitButton, OrbitSlider } from '@orbit/ui';
import type { OrbitEngine } from '@orbit/core';
import type { AdjustmentValues } from '@orbit/effects';
import { DEFAULT_ADJUSTMENTS } from '@orbit/effects';
import { useOrbitLayers } from '../../hooks/useOrbitEngine';
import { useToast } from '../ToastProvider';

interface AdjustmentsPanelProps {
  engine: OrbitEngine | null;
}

export const AdjustmentsPanel: React.FC<AdjustmentsPanelProps> = ({ engine }) => {
  const { selectedIds } = useOrbitLayers(engine);
  const { addToast } = useToast();
  const [values, setValues] = useState<AdjustmentValues>(DEFAULT_ADJUSTMENTS);
  const [isApplying, setIsApplying] = useState(false);

  const selectedLayerId = selectedIds[0];

  const update = useCallback((patch: Partial<AdjustmentValues>) => {
    setValues((prev: AdjustmentValues) => ({ ...prev, ...patch }));
  }, []);

  const handleApply = useCallback(async () => {
    if (!engine || !selectedLayerId) return;
    setIsApplying(true);
    try {
      await engine.applyAdjustments(selectedLayerId, values);
      addToast('Adjustments applied', 'success');
    } catch {
      addToast('Failed to apply adjustments', 'error');
    } finally {
      setIsApplying(false);
    }
  }, [engine, selectedLayerId, values, addToast]);

  const handleReset = useCallback(() => {
    setValues(DEFAULT_ADJUSTMENTS);
  }, []);

  if (!selectedLayerId) {
    return (
      <div className="p-orbit-md">
        <span className="text-xs text-orbit-text-tertiary">Select an image layer to adjust</span>
      </div>
    );
  }

  const sliders: { key: keyof AdjustmentValues; label: string; min: number; max: number; step: number }[] = [
    { key: 'brightness', label: 'Brightness', min: -1, max: 1, step: 0.05 },
    { key: 'contrast', label: 'Contrast', min: 0, max: 2, step: 0.05 },
    { key: 'saturation', label: 'Saturation', min: 0, max: 2, step: 0.05 },
    { key: 'temperature', label: 'Temperature', min: -0.5, max: 0.5, step: 0.05 },
  ];

  return (
    <div className="flex flex-col gap-orbit-md p-orbit-md">
      <div className="text-xs font-medium text-orbit-text-secondary uppercase tracking-wider">
        Image Adjustments
      </div>

      {sliders.map((slider) => (
        <OrbitSlider
          key={String(slider.key)}
          label={slider.label}
          min={slider.min}
          max={slider.max}
          step={slider.step}
          value={values[slider.key]}
          onChange={(v) => update({ [slider.key]: v })}
          valueFormatter={(v) => v.toFixed(2)}
        />
      ))}

      <div className="flex gap-2 pt-2">
        <OrbitButton variant="primary" size="sm" className="flex-1" onClick={handleApply} disabled={isApplying}>
          {isApplying ? 'Applying...' : 'Apply'}
        </OrbitButton>
        <OrbitButton variant="secondary" size="sm" className="flex-1" onClick={handleReset}>
          Reset
        </OrbitButton>
      </div>
    </div>
  );
};
