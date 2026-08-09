import * as React from 'react';
import { cn } from '@layera-labs/shared';

export interface OrbitLoadingProps {
  variant?: 'spinner' | 'skeleton' | 'progress' | 'dots';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  progress?: number; // 0-100 for progress variant
  text?: string;
}

export const OrbitLoading = React.forwardRef<HTMLDivElement, OrbitLoadingProps>(
  ({ variant = 'spinner', size = 'md', className, progress = 0, text }, ref) => {
    const sizeClasses = {
      sm: 'h-4 w-4',
      md: 'h-8 w-8',
      lg: 'h-12 w-12',
    };

    const renderSpinner = () => (
      <div
        className={cn(
          'animate-orbit-spin rounded-full border-2 border-orbit-border border-t-orbit-accent',
          sizeClasses[size]
        )}
      />
    );

    const renderSkeleton = () => (
      <div className={cn('w-full space-y-orbit-sm', className)}>
        <div className="h-4 w-3/4 animate-pulse rounded-orbit-sm bg-orbit-border" />
        <div className="h-4 w-full animate-pulse rounded-orbit-sm bg-orbit-border" />
        <div className="h-4 w-5/6 animate-pulse rounded-orbit-sm bg-orbit-border" />
      </div>
    );

    const renderProgress = () => (
      <div className={cn('w-full space-y-orbit-sm', className)}>
        <div className="h-2 w-full overflow-hidden rounded-full bg-orbit-border">
          <div
            className="h-full rounded-full bg-orbit-accent transition-all duration-orbit-normal"
            style={{ width: `${clamp(progress, 0, 100)}%` }}
          />
        </div>
        {text && <p className="text-center text-sm text-orbit-text-secondary">{text}</p>}
      </div>
    );

    const renderDots = () => (
      <div className={cn('flex items-center gap-1', className)}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn(
              'rounded-full bg-orbit-accent',
              size === 'sm' ? 'h-1.5 w-1.5' : size === 'md' ? 'h-2 w-2' : 'h-3 w-3',
              'animate-orbit-pulse'
            )}
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    );

    const variants = {
      spinner: renderSpinner,
      skeleton: renderSkeleton,
      progress: renderProgress,
      dots: renderDots,
    };

    return (
      <div ref={ref} className={cn('flex items-center justify-center', className)}>
        {variants[variant]()}
      </div>
    );
  }
);
OrbitLoading.displayName = 'OrbitLoading';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
