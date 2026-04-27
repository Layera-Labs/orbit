import * as React from 'react';
import { cn } from '@orbit/shared';

export type ToastVariant = 'default' | 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

export interface OrbitToastProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  className?: string;
}

export const OrbitToast = React.forwardRef<HTMLDivElement, OrbitToastProps>(
  ({ toasts, onDismiss, position = 'bottom-right', className }, ref) => {
    const positionClasses = {
      'top-right': 'top-orbit-lg right-orbit-lg',
      'top-left': 'top-orbit-lg left-orbit-lg',
      'bottom-right': 'bottom-orbit-lg right-orbit-lg',
      'bottom-left': 'bottom-orbit-lg left-orbit-lg',
    };

    const variantClasses: Record<ToastVariant, string> = {
      default: 'border-orbit-border',
      success: 'border-orbit-success bg-orbit-success-muted',
      error: 'border-orbit-danger bg-orbit-danger-muted',
      warning: 'border-orbit-warning bg-orbit-warning-muted',
      info: 'border-orbit-info bg-orbit-info-muted',
    };

    const variantIcons: Record<ToastVariant, React.ReactNode> = {
      default: null,
      success: (
        <svg className="h-5 w-5 text-orbit-success" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      ),
      error: (
        <svg className="h-5 w-5 text-orbit-danger" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
      ),
      warning: (
        <svg className="h-5 w-5 text-orbit-warning" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      ),
      info: (
        <svg className="h-5 w-5 text-orbit-info" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
      ),
    };

    return (
      <div ref={ref} className={cn('fixed z-orbit-tooltip flex flex-col gap-orbit-sm', positionClasses[position], className)}>
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'flex items-start gap-orbit-md rounded-orbit-lg border bg-orbit-panel p-orbit-md shadow-orbit-lg',
              'animate-orbit-slide-in',
              variantClasses[toast.variant || 'default']
            )}
          >
            {variantIcons[toast.variant || 'default']}
            <div className="flex-1">
              <p className="text-sm font-medium text-orbit-text">{toast.title}</p>
              {toast.description && <p className="mt-1 text-xs text-orbit-text-secondary">{toast.description}</p>}
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              className="rounded-orbit-sm p-1 text-orbit-text-secondary hover:bg-orbit-hover hover:text-orbit-text"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M11 3L3 11M3 3L11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    );
  }
);
OrbitToast.displayName = 'OrbitToast';
