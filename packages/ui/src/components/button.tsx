import * as React from 'react';
import { cn } from '@orbit/shared';
import { Slot } from '@radix-ui/react-slot';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  asChild?: boolean;
}

export const OrbitButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-md font-medium transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orbit-accent focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          'active:scale-[0.98]',
          variant === 'primary' && 'bg-orbit-accent text-white hover:bg-orbit-accent-hover shadow-sm',
          variant === 'secondary' && 'bg-orbit-panel text-orbit-text hover:bg-orbit-border border border-orbit-border',
          variant === 'ghost' && 'text-orbit-text hover:bg-orbit-panel',
          variant === 'destructive' && 'bg-orbit-danger text-white hover:opacity-90',
          variant === 'outline' && 'border-2 border-orbit-accent text-orbit-accent hover:bg-orbit-accent hover:text-white',
          size === 'sm' && 'h-8 px-3 text-xs gap-1.5',
          size === 'md' && 'h-10 px-4 text-sm gap-2',
          size === 'lg' && 'h-12 px-6 text-base gap-2',
          size === 'icon' && 'h-10 w-10',
          className
        )}
        {...props}
      />
    );
  }
);
OrbitButton.displayName = 'OrbitButton';
