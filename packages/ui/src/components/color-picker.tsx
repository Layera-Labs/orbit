import * as React from 'react';
import { cn } from '@layera-labs/orbit-shared';

export interface OrbitColorPickerProps {
  value: string;
  onChange: (value: string) => void;
  showPresets?: boolean;
  showAlpha?: boolean; // Reserved for future alpha channel support
  presets?: string[];
  className?: string;
}

const DEFAULT_PRESETS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
  '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#000000',
  '#ffffff', '#6b7280', '#1f2937',
];

export const OrbitColorPicker = React.memo(
  React.forwardRef<HTMLDivElement, OrbitColorPickerProps>(
    ({ value, onChange, showPresets = true, showAlpha: _showAlpha, presets = DEFAULT_PRESETS, className }, ref) => {
      const [localValue, setLocalValue] = React.useState(value);
      const nativeInputRef = React.useRef<HTMLInputElement>(null);

      // Sync with external value
      React.useEffect(() => {
        setLocalValue(value);
        if (nativeInputRef.current) {
          nativeInputRef.current.value = value.startsWith('#') ? value : '#000000';
        }
      }, [value]);

      // Native color picker fires 'change' when dialog closes (not during drag)
      React.useEffect(() => {
        const el = nativeInputRef.current;
        if (!el) return;
        const handleNativeChange = (e: Event) => {
          const newValue = (e.target as HTMLInputElement).value;
          setLocalValue(newValue);
          onChange(newValue);
        };
        el.addEventListener('change', handleNativeChange);
        return () => el.removeEventListener('change', handleNativeChange);
      }, [onChange]);

      const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setLocalValue(e.target.value);
      };

      const handleTextBlur = () => {
        onChange(localValue);
      };

      const handlePresetClick = (preset: string) => {
        setLocalValue(preset);
        onChange(preset);
      };

      return (
        <div ref={ref} className={cn('flex flex-col gap-orbit-md', className)}>
          {/* Color input + preview */}
          <div className="flex items-center gap-orbit-md">
            <div
              className="h-10 w-10 rounded-orbit-md border border-orbit-border shadow-orbit-sm"
              style={{ backgroundColor: localValue }}
            />
            <input
              type="text"
              value={localValue}
              onChange={handleTextChange}
              onBlur={handleTextBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onChange(localValue);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className={cn(
                'h-10 flex-1 rounded-orbit-md border border-orbit-border',
                'bg-orbit-panel px-orbit-md text-sm text-orbit-text',
                'uppercase',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orbit-accent'
              )}
            />
            <input
              ref={nativeInputRef}
              type="color"
              defaultValue={localValue.startsWith('#') ? localValue : '#000000'}
              className="h-10 w-10 cursor-pointer rounded-orbit-md border-0 bg-transparent p-0"
            />
          </div>

          {/* Presets */}
          {showPresets && (
            <div className="grid grid-cols-9 gap-1">
              {presets.map((preset) => (
                <button
                  key={preset}
                  onClick={() => handlePresetClick(preset)}
                  className={cn(
                    'h-6 w-6 rounded-orbit-sm border-2 transition-transform',
                    localValue === preset ? 'border-orbit-accent scale-110' : 'border-transparent hover:scale-105'
                  )}
                  style={{ backgroundColor: preset }}
                  title={preset}
                />
              ))}
            </div>
          )}
        </div>
      );
    }
  )
);
OrbitColorPicker.displayName = 'OrbitColorPicker';
