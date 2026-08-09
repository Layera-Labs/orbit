import * as React from 'react';
import { cn } from '@layera-labs/shared';

export interface SidebarRailItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}

export interface OrbitSidebarProps {
  items: SidebarRailItem[];
  activeItem?: string;
  onItemClick?: (id: string) => void;
  drawerContent?: React.ReactNode;
  drawerOpen?: boolean;
  onDrawerClose?: () => void;
  className?: string;
}

export const OrbitSidebar = React.forwardRef<HTMLDivElement, OrbitSidebarProps>(
  ({ items, activeItem, onItemClick, drawerContent, drawerOpen, onDrawerClose, className }, ref) => {
    return (
      <div ref={ref} className={cn('pointer-events-auto flex h-full items-start gap-3', className)}>
        {/* Rail */}
        <div className="flex max-h-full w-[72px] shrink-0 flex-col items-center gap-1 overflow-y-auto rounded-[22px] border border-white/70 bg-white/90 px-2 py-3 shadow-[0_22px_55px_-30px_rgba(15,23,42,0.45)] backdrop-blur-xl">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => onItemClick?.(item.id)}
              className={cn(
                'group relative flex w-full flex-col items-center gap-1 rounded-[16px] px-2 py-2 text-slate-500 transition duration-150',
                'hover:-translate-y-px hover:bg-slate-50 hover:text-slate-800 active:translate-y-0 active:scale-[0.98]',
                activeItem === item.id && drawerOpen && 'bg-blue-50 text-blue-700 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.16)]'
              )}
              title={item.label}
            >
              <span className={cn(
                'flex h-9 w-9 items-center justify-center rounded-[14px] transition-colors',
                activeItem === item.id && drawerOpen ? 'bg-white text-blue-700 shadow-sm' : 'bg-transparent'
              )}>
                <span className="scale-90">{item.icon}</span>
              </span>
              <span className="max-w-full truncate text-[9px] font-semibold uppercase leading-none tracking-wide">
                {item.label}
              </span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="absolute right-1 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-orbit-danger px-1 text-[8px] font-bold text-white">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Drawer */}
        {drawerOpen && (
          <div className="relative flex h-full w-[calc(100vw-6rem)] min-w-[240px] max-w-[340px] shrink-0 flex-col overflow-hidden rounded-[24px] border border-white/70 bg-white/80 shadow-[0_28px_70px_-34px_rgba(15,23,42,0.48)] backdrop-blur-xl sm:w-[320px]">
            <div className="flex items-center justify-between border-b border-white/60 px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
              <span className="text-sm font-semibold text-slate-800">
                {items.find((i) => i.id === activeItem)?.label}
              </span>
              <button
                onClick={onDrawerClose}
                aria-label="Close panel"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/80 bg-white/75 text-slate-500 shadow-sm transition hover:bg-white hover:text-slate-800 active:scale-[0.96]"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">{drawerContent}</div>
          </div>
        )}
      </div>
    );
  }
);
OrbitSidebar.displayName = 'OrbitSidebar';
