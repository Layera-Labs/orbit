import * as React from 'react';
import { cn } from '@orbit/shared';

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface OrbitTabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  orientation?: 'horizontal' | 'vertical';
  variant?: 'default' | 'pills' | 'underline';
  className?: string;
}

export const OrbitTabs = React.forwardRef<HTMLDivElement, OrbitTabsProps>(
  ({ tabs, activeTab, onChange, orientation = 'horizontal', variant = 'default', className }, ref) => {
    const isHorizontal = orientation === 'horizontal';

    return (
      <div
        ref={ref}
        className={cn(
          'flex',
          isHorizontal ? 'flex-row border-b border-orbit-border' : 'flex-col border-r border-orbit-border',
          className
        )}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => !tab.disabled && onChange(tab.id)}
            disabled={tab.disabled}
            className={cn(
              'relative flex items-center gap-2 transition-all duration-orbit-normal',
              isHorizontal
                ? 'px-orbit-md py-orbit-sm'
                : 'px-orbit-sm py-orbit-md w-full justify-start',
              'text-orbit-text-secondary hover:text-orbit-text',
              tab.disabled && 'opacity-50 cursor-not-allowed',
              variant === 'default' && activeTab === tab.id && 'text-orbit-accent',
              variant === 'pills' &&
                activeTab === tab.id &&
                'rounded-orbit-md bg-orbit-accent-muted text-orbit-accent',
              variant === 'underline' && activeTab === tab.id && 'text-orbit-accent'
            )}
          >
            {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
            <span className="text-sm font-medium">{tab.label}</span>
            {variant === 'underline' && activeTab === tab.id && (
              <span
                className={cn(
                  'absolute bg-orbit-accent',
                  isHorizontal ? 'bottom-0 left-0 right-0 h-0.5' : 'top-0 bottom-0 left-0 w-0.5'
                )}
              />
            )}
          </button>
        ))}
      </div>
    );
  }
);
OrbitTabs.displayName = 'OrbitTabs';
