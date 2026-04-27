import { useState, useCallback } from 'react';

export function useAccordion(defaultOpen: string[] = []) {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set(defaultOpen));

  const toggle = useCallback((id: string) => {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const open = useCallback((id: string) => {
    setOpenItems((prev) => new Set([...prev, id]));
  }, []);

  const close = useCallback((id: string) => {
    setOpenItems((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const isOpen = useCallback(
    (id: string) => openItems.has(id),
    [openItems]
  );

  return {
    openItems,
    toggle,
    open,
    close,
    isOpen,
  };
}
