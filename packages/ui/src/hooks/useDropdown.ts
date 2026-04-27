import { useState, useCallback } from 'react';

export function useDropdown(defaultValue?: string) {
  const [value, setValue] = useState(defaultValue || '');
  const [open, setOpen] = useState(false);

  const select = useCallback((newValue: string) => {
    setValue(newValue);
    setOpen(false);
  }, []);

  const toggle = useCallback(() => setOpen((prev) => !prev), []);
  const close = useCallback(() => setOpen(false), []);

  return {
    value,
    open,
    select,
    toggle,
    close,
    setValue,
  };
}
