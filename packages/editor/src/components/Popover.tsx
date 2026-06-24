import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export function Popover({
  trigger,
  children,
  className,
  title,
  align = 'left',
}: {
  /** Trigger content rendered inside the toggle button. */
  trigger: ReactNode;
  /** Popover body; receives a close() callback. */
  children: (close: () => void) => ReactNode;
  className?: string;
  title?: string;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className={className}
        data-active={open ? 'true' : 'false'}
        title={title}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="o-popover"
            data-align={align}
            onMouseDown={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.94, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ type: 'spring', stiffness: 520, damping: 32, mass: 0.6 }}
            style={{ transformOrigin: align === 'right' ? 'top right' : 'top left' }}
          >
            {children(() => setOpen(false))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function SliderRow({
  label,
  value,
  display,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="o-pop-row">
      <div className="o-pop-head">
        <span>{label}</span>
        <span className="o-val">{display}</span>
      </div>
      <input
        className="o-slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
