import * as React from 'react';
import { cn } from '@layera-labs/orbit-shared';

export interface OrbitSliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  label?: string;
  showValue?: boolean;
  valueFormatter?: (value: number) => string;
  disabled?: boolean;
  className?: string;
}

export const OrbitSlider = React.forwardRef<HTMLDivElement, OrbitSliderProps>(
  ({ value, min = 0, max = 100, step = 1, onChange, label, showValue = true, valueFormatter, disabled, className }, ref) => {
    const percentage = ((value - min) / (max - min)) * 100;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(Number(e.target.value));
    };

    const displayValue = valueFormatter ? valueFormatter(value) : String(value);

    return (
      <div ref={ref} className={cn('flex flex-col gap-orbit-sm', className)}>
        {(label || showValue) && (
          <div className="flex items-center justify-between">
            {label && <span className="text-sm text-orbit-text-secondary">{label}</span>}
            {showValue && (
              <span className="min-w-[3rem] rounded-orbit-sm bg-orbit-panel px-orbit-sm py-orbit-xs text-right text-xs font-medium text-orbit-text">
                {displayValue}
              </span>
            )}
          </div>
        )}
        <div className="relative flex h-5 items-center">
          {/* Track */}
          <div className="absolute h-1.5 w-full rounded-full bg-orbit-border">
            <div
              className="h-full rounded-full bg-orbit-accent"
              style={{ width: `${percentage}%` }}
            />
          </div>
          {/* Input */}
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={handleChange}
            disabled={disabled}
            className={cn(
              'absolute h-full w-full cursor-pointer appearance-none bg-transparent',
              ' [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none',
              ' [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orbit-accent',
              ' [&::-webkit-slider-thumb]:shadow-orbit-sm [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white',
              ' [&::-webkit-slider-thumb]:transition-transform hover:[&::-webkit-slider-thumb]:scale-110',
              ' [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full',
              ' [&::-moz-range-thumb]:bg-orbit-accent [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white',
              disabled && 'cursor-not-allowed opacity-50'
            )}
          />
        </div>
      </div>
    );
  }
);
OrbitSlider.displayName = 'OrbitSlider';
