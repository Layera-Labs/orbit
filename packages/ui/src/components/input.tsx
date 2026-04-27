import * as React from 'react';
import { cn } from '@orbit/shared';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const OrbitInput = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-md border border-orbit-border bg-orbit-panel px-3 py-2 text-sm text-orbit-text',
          'placeholder:text-orbit-text-secondary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orbit-accent focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
OrbitInput.displayName = 'OrbitInput';
