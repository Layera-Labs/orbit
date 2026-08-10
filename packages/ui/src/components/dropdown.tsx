import * as React from 'react';
import { cn } from '@layera-labs/orbit-shared';

export interface DropdownOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface OrbitDropdownProps {
  options: DropdownOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export const OrbitDropdown = React.forwardRef<HTMLDivElement, OrbitDropdownProps>(
  ({ options, value, onChange, placeholder = 'Select...', disabled, className }, ref) => {
    const [open, setOpen] = React.useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    const selected = options.find((o) => o.value === value);

    React.useEffect(() => {
      const handleClick = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    return (
      <div ref={containerRef} className={cn('relative', className)}>
        <button
          ref={ref as React.Ref<HTMLButtonElement>}
          onClick={() => !disabled && setOpen(!open)}
          disabled={disabled}
          className={cn(
            'flex h-10 w-full items-center justify-between rounded-orbit-md',
            'border border-orbit-border bg-orbit-panel px-orbit-md',
            'text-sm text-orbit-text',
            'hover:border-orbit-border-hover',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orbit-accent',
            disabled && 'cursor-not-allowed opacity-50'
          )}
        >
          <span className="flex items-center gap-2">
            {selected?.icon}
            {selected?.label || <span className="text-orbit-text-tertiary">{placeholder}</span>}
          </span>
          <svg
            className={cn('h-4 w-4 text-orbit-text-secondary transition-transform', open && 'rotate-180')}
            viewBox="0 0 16 16"
            fill="none"
          >
            <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {open && (
          <div
            className={cn(
              'absolute z-orbit-overlay mt-1 w-full rounded-orbit-md',
              'border border-orbit-border bg-orbit-panel shadow-orbit-lg',
              'overflow-hidden'
            )}
          >
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                disabled={option.disabled}
                className={cn(
                  'flex w-full items-center gap-2 px-orbit-md py-orbit-sm',
                  'text-sm text-orbit-text',
                  'hover:bg-orbit-hover',
                  option.disabled && 'cursor-not-allowed opacity-50',
                  value === option.value && 'bg-orbit-accent-muted text-orbit-accent'
                )}
              >
                {option.icon}
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
);
OrbitDropdown.displayName = 'OrbitDropdown';
