import * as React from 'react';
import { cn } from '@orbit/shared';

export interface OrbitTooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  className?: string;
}

export const OrbitTooltip = React.forwardRef<HTMLDivElement, OrbitTooltipProps>(
  ({ children, content, placement = 'top', delay = 200, className }, ref) => {
    const [visible, setVisible] = React.useState(false);
    const timeoutRef = React.useRef<ReturnType<typeof setTimeout>>();

    const show = () => {
      timeoutRef.current = setTimeout(() => setVisible(true), delay);
    };

    const hide = () => {
      clearTimeout(timeoutRef.current);
      setVisible(false);
    };

    const placementClasses = {
      top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
      bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
      left: 'right-full top-1/2 -translate-y-1/2 mr-2',
      right: 'left-full top-1/2 -translate-y-1/2 ml-2',
    };

    const arrowClasses = {
      top: 'top-full left-1/2 -translate-x-1/2 border-t-orbit-panel',
      bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-orbit-panel',
      left: 'left-full top-1/2 -translate-y-1/2 border-l-orbit-panel',
      right: 'right-full top-1/2 -translate-y-1/2 border-r-orbit-panel',
    };

    return (
      <div
        ref={ref}
        className={cn('relative inline-flex', className)}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
        {visible && (
          <div
            className={cn(
              'absolute z-orbit-tooltip whitespace-nowrap',
              'rounded-orbit-md bg-orbit-panel px-orbit-md py-orbit-sm',
              'border border-orbit-border shadow-orbit-lg',
              'text-xs text-orbit-text',
              placementClasses[placement]
            )}
          >
            {content}
            <span
              className={cn(
                'absolute h-0 w-0 border-4 border-transparent',
                arrowClasses[placement]
              )}
            />
          </div>
        )}
      </div>
    );
  }
);
OrbitTooltip.displayName = 'OrbitTooltip';
