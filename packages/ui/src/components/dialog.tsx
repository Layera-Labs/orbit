import * as React from 'react';
import { cn } from '@layera-labs/orbit-shared';

export interface OrbitDialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const OrbitDialog = React.forwardRef<HTMLDivElement, OrbitDialogProps>(
  ({ open, onClose, title, description, children, footer, size = 'md', className }, ref) => {
    if (!open) return null;

    const sizeClasses = {
      sm: 'max-w-sm',
      md: 'max-w-md',
      lg: 'max-w-lg',
      xl: 'max-w-xl',
    };

    return (
      <div className="fixed inset-0 z-orbit-modal flex items-center justify-center p-orbit-md">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />

        {/* Dialog */}
        <div
          ref={ref}
          className={cn(
            'relative max-h-[calc(100dvh-2rem)] w-full overflow-hidden rounded-orbit-lg bg-orbit-panel shadow-orbit-xl',
            'border border-orbit-border',
            'animate-orbit-fade-in',
            sizeClasses[size],
            className
          )}
        >
          {/* Header */}
          {(title || description) && (
            <div className="border-b border-orbit-border px-orbit-lg py-orbit-md">
              {title && <h2 className="text-lg font-semibold text-orbit-text">{title}</h2>}
              {description && <p className="mt-1 text-sm text-orbit-text-secondary">{description}</p>}
            </div>
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-orbit-md top-orbit-md rounded-orbit-sm p-1 text-orbit-text-secondary hover:bg-orbit-hover hover:text-orbit-text"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>

          {/* Content */}
          <div className="max-h-[calc(100dvh-12rem)] overflow-y-auto px-orbit-lg py-orbit-md">{children}</div>

          {/* Footer */}
          {footer && (
            <div className="flex items-center justify-end gap-orbit-sm border-t border-orbit-border px-orbit-lg py-orbit-md">
              {footer}
            </div>
          )}
        </div>
      </div>
    );
  }
);
OrbitDialog.displayName = 'OrbitDialog';
