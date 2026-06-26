/**
 * ColorPicker - Preset color swatches with custom color option
 */
import * as React from 'react';
import { useState, useRef, useEffect } from 'react';

const DEFAULT_PRESETS = [
  '#000000', '#ffffff', '#f5f5f5', '#d4d4d4',
  '#ef4444', '#f97316', '#f59e0b', '#84cc16',
  '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
  '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e',
];

const STORAGE_KEY = 'orbit-custom-colors';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({ value, onChange, label }) => {
  const [customColors, setCustomColors] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [showCustom, setShowCustom] = useState(false);
  const [customColor, setCustomColor] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close custom picker on click outside
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowCustom(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const allColors = [...DEFAULT_PRESETS, ...customColors];
  const isPreset = allColors.includes(value);

  const handleAddCustom = () => {
    if (!customColors.includes(customColor) && !DEFAULT_PRESETS.includes(customColor)) {
      const newColors = [...customColors, customColor];
      setCustomColors(newColors);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newColors));
    }
    setShowCustom(false);
  };

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">
          {label}
        </label>
      )}
      
      {/* Color swatches grid */}
      <div className="flex flex-wrap gap-1.5">
        {allColors.map((color) => (
          <button
            key={color}
            onClick={() => onChange(color)}
            className={`h-6 w-6 rounded-md border-2 transition-all ${
              value === color
                ? 'border-blue-500 scale-110 shadow-sm'
                : 'border-slate-200 hover:border-slate-400 hover:scale-105'
            }`}
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
        
        {/* Custom color button */}
        <button
          onClick={() => setShowCustom(!showCustom)}
          className={`flex h-6 w-6 items-center justify-center rounded-md border-2 text-xs transition-all ${
            showCustom || !isPreset
              ? 'border-blue-500 bg-blue-50 text-blue-600 scale-110'
              : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-400 hover:scale-105'
          }`}
          title="Custom color"
        >
          +
        </button>
      </div>

      {/* Custom color dropdown */}
      {showCustom && (
        <div className="absolute left-0 top-full z-50 mt-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <input
            type="color"
            value={customColor}
            onChange={(e) => {
              setCustomColor(e.target.value);
              onChange(e.target.value);
            }}
            className="h-8 w-8 cursor-pointer rounded border border-slate-200"
          />
          <input
            type="text"
            value={customColor}
            onChange={(e) => {
              setCustomColor(e.target.value);
              if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                onChange(e.target.value);
              }
            }}
            className="w-24 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="#000000"
          />
          <button
            onClick={handleAddCustom}
            className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600 transition-colors"
          >
            Add
          </button>
        </div>
      )}

      {/* Show current color hex */}
      <div className="mt-1.5 flex items-center gap-1.5">
        <span
          className="inline-block h-3.5 w-3.5 rounded-full border border-slate-200"
          style={{ backgroundColor: value }}
        />
        <span className="text-xs text-slate-500 font-mono">{value}</span>
      </div>
    </div>
  );
};
