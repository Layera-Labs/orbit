import * as React from 'react';
import { cn } from '@orbit/shared';

export interface AccordionItem {
  id: string;
  title: string;
  content: React.ReactNode;
  disabled?: boolean;
}

export interface OrbitAccordionProps {
  items: AccordionItem[];
  allowMultiple?: boolean;
  defaultOpen?: string[];
  className?: string;
}

export const OrbitAccordion = React.forwardRef<HTMLDivElement, OrbitAccordionProps>(
  ({ items, allowMultiple = false, defaultOpen = [], className }, ref) => {
    const [openItems, setOpenItems] = React.useState<Set<string>>(new Set(defaultOpen));

    const toggleItem = (id: string) => {
      setOpenItems((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          if (!allowMultiple) next.clear();
          next.add(id);
        }
        return next;
      });
    };

    return (
      <div ref={ref} className={cn('flex flex-col gap-orbit-xs', className)}>
        {items.map((item) => {
          const isOpen = openItems.has(item.id);
          return (
            <div
              key={item.id}
              className={cn(
                'rounded-orbit-md border border-orbit-border overflow-hidden',
                isOpen && 'border-orbit-border-hover'
              )}
            >
              <button
                onClick={() => !item.disabled && toggleItem(item.id)}
                disabled={item.disabled}
                className={cn(
                  'flex w-full items-center justify-between px-orbit-md py-orbit-sm',
                  'text-sm font-medium text-orbit-text',
                  'hover:bg-orbit-hover',
                  item.disabled && 'cursor-not-allowed opacity-50',
                  isOpen && 'bg-orbit-panel'
                )}
              >
                {item.title}
                <svg
                  className={cn(
                    'h-4 w-4 text-orbit-text-secondary transition-transform duration-orbit-normal',
                    isOpen && 'rotate-180'
                  )}
                  viewBox="0 0 16 16"
                  fill="none"
                >
                  <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {isOpen && (
                <div className="border-t border-orbit-border px-orbit-md py-orbit-sm text-sm text-orbit-text-secondary animate-orbit-fade-in">
                  {item.content}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }
);
OrbitAccordion.displayName = 'OrbitAccordion';
