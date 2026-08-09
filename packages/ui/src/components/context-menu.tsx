import * as React from 'react';
import { cn } from '@layera-labs/shared';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  separator?: boolean;
  onClick?: () => void;
}

export interface OrbitContextMenuProps {
  children: React.ReactNode;
  items: ContextMenuItem[];
  className?: string;
}

export const OrbitContextMenu = React.forwardRef<HTMLDivElement, OrbitContextMenuProps>(
  ({ children, items, className }, ref) => {
    const [visible, setVisible] = React.useState(false);
    const [position, setPosition] = React.useState({ x: 0, y: 0 });
    const menuRef = React.useRef<HTMLDivElement>(null);

    const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      setPosition({ x: e.clientX, y: e.clientY });
      setVisible(true);
    };

    React.useEffect(() => {
      const handleClick = () => setVisible(false);
      if (visible) {
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
      }
    }, [visible]);

    return (
      <div ref={ref} onContextMenu={handleContextMenu} className={className}>
        {children}
        {visible && (
          <div
            ref={menuRef}
            className={cn(
              'fixed z-orbit-overlay min-w-[160px] rounded-orbit-md',
              'border border-orbit-border bg-orbit-panel shadow-orbit-lg',
              'overflow-hidden'
            )}
            style={{ left: position.x, top: position.y }}
          >
            {items.map((item) =>
              item.separator ? (
                <div key={item.id} className="my-1 h-px bg-orbit-divider" />
              ) : (
                <button
                  key={item.id}
                  onClick={() => {
                    item.onClick?.();
                    setVisible(false);
                  }}
                  disabled={item.disabled}
                  className={cn(
                    'flex w-full items-center justify-between px-orbit-md py-orbit-sm',
                    'text-sm text-orbit-text',
                    'hover:bg-orbit-hover',
                    item.disabled && 'cursor-not-allowed opacity-50'
                  )}
                >
                  <span className="flex items-center gap-2">
                    {item.icon}
                    {item.label}
                  </span>
                  {item.shortcut && (
                    <span className="text-xs text-orbit-text-tertiary">{item.shortcut}</span>
                  )}
                </button>
              )
            )}
          </div>
        )}
      </div>
    );
  }
);
OrbitContextMenu.displayName = 'OrbitContextMenu';
