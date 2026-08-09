import * as React from 'react';
import { cn } from '@layera-labs/shared';

export interface OrbitResizableProps {
  children: React.ReactNode;
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  direction?: 'horizontal' | 'vertical' | 'both';
  onResize?: (width: number, height: number) => void;
  className?: string;
}

export const OrbitResizable = React.forwardRef<HTMLDivElement, OrbitResizableProps>(
  ({
    children,
    defaultWidth = 300,
    defaultHeight = 200,
    minWidth = 100,
    minHeight = 50,
    maxWidth = 800,
    maxHeight = 600,
    direction = 'both',
    onResize,
    className,
  }, ref) => {
    const [size, setSize] = React.useState({ width: defaultWidth, height: defaultHeight });
    const [isResizing, setIsResizing] = React.useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    const handleMouseDown = (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);

      const startX = e.clientX;
      const startY = e.clientY;
      const startWidth = size.width;
      const startHeight = size.height;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;

        const newWidth = direction !== 'vertical'
          ? Math.max(minWidth, Math.min(maxWidth, startWidth + deltaX))
          : startWidth;
        const newHeight = direction !== 'horizontal'
          ? Math.max(minHeight, Math.min(maxHeight, startHeight + deltaY))
          : startHeight;

        setSize({ width: newWidth, height: newHeight });
        onResize?.(newWidth, newHeight);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    };

    return (
      <div
        ref={(node) => {
          (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        className={cn('relative', className)}
        style={{ width: size.width, height: size.height }}
      >
        {children}

        {/* Resize handle */}
        {direction !== 'vertical' && (
          <div
            onMouseDown={handleMouseDown}
            className={cn(
              'absolute right-0 top-0 h-full w-1 cursor-col-resize',
              'hover:bg-orbit-accent/50',
              isResizing && 'bg-orbit-accent'
            )}
          />
        )}
        {direction !== 'horizontal' && (
          <div
            onMouseDown={handleMouseDown}
            className={cn(
              'absolute bottom-0 left-0 h-1 w-full cursor-row-resize',
              'hover:bg-orbit-accent/50',
              isResizing && 'bg-orbit-accent'
            )}
          />
        )}
        {direction === 'both' && (
          <div
            onMouseDown={handleMouseDown}
            className={cn(
              'absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize',
              'hover:bg-orbit-accent/50',
              isResizing && 'bg-orbit-accent'
            )}
          />
        )}
      </div>
    );
  }
);
OrbitResizable.displayName = 'OrbitResizable';
