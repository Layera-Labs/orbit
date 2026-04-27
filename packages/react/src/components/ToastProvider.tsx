import * as React from 'react';
import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextValue {
  addToast: (message: string, type?: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType = 'info', duration = 4000) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const toast: Toast = { id, message, type, duration };
      setToasts((prev) => [...prev, toast]);

      if (duration > 0) {
        const timer = setTimeout(() => removeToast(id), duration);
        timersRef.current.set(id, timer);
      }
    },
    [removeToast]
  );

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
};

function ToastContainer({
  toasts,
  onRemove,
}: {
  toasts: Toast[];
  onRemove: (id: string) => void;
}) {
  const typeStyles: Record<ToastType, string> = {
    info: 'bg-orbit-panel border-orbit-border text-orbit-text',
    success: 'bg-orbit-success-muted border-orbit-success text-orbit-text',
    warning: 'bg-orbit-warning-muted border-orbit-warning text-orbit-text',
    error: 'bg-orbit-danger-muted border-orbit-danger text-orbit-text',
  };

  return (
    <div className="fixed bottom-4 right-4 z-[500] flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`
            flex items-center gap-3 rounded-md border px-4 py-3 shadow-orbit-md
            animate-orbit-slide-in min-w-[280px] max-w-[400px]
            ${typeStyles[toast.type]}
          `}
        >
          <span className="flex-1 text-xs font-medium">{toast.message}</span>
          <button
            onClick={() => onRemove(toast.id)}
            className="text-orbit-text-tertiary hover:text-orbit-text transition-colors"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
