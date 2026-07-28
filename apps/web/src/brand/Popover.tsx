'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Popover.module.css';

export interface PopoverProps {
  /** The element the panel is measured against. */
  anchor: HTMLElement | null;
  open: boolean;
  onClose(): void;
  children: ReactNode;
  /** Which side of the anchor to prefer; flips when there is no room. */
  side?: 'top' | 'bottom';
  align?: 'start' | 'center';
  label?: string;
}

/**
 * A small anchored panel.
 *
 * Rendered through a PORTAL to `document.body`, and this is load-bearing rather
 * than tidiness. `position: fixed` resolves against the nearest ancestor with a
 * `transform`, not the viewport — and the property bar is centred with
 * `translateX(-50%)`, so a panel left in the tree was pushed half the bar's
 * width off to the right and its clamp computed against the wrong box. The bar
 * also scrolls horizontally, which would clip it. A portal escapes both.
 *
 * It flips and clamps to stay on screen, so the content is never sliced by a
 * viewport edge.
 */
export function Popover({
  anchor,
  open,
  onClose,
  children,
  side = 'bottom',
  align = 'start',
  label,
}: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const place = () => {
      const panel = ref.current;
      if (!panel) return;
      const a = anchor.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      const gap = 6;
      const margin = 8;

      let top = side === 'bottom' ? a.bottom + gap : a.top - p.height - gap;
      // Flip when the preferred side would put it off screen.
      if (top + p.height > window.innerHeight - margin) top = a.top - p.height - gap;
      if (top < margin) top = a.bottom + gap;
      top = Math.min(Math.max(margin, top), window.innerHeight - p.height - margin);

      let left = align === 'center' ? a.left + a.width / 2 - p.width / 2 : a.left;
      left = Math.min(Math.max(margin, left), window.innerWidth - p.width - margin);
      setPos({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchor, side, align, children]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    // `pointerdown` and not `click`: a drag that starts outside should dismiss
    // immediately rather than after the pointer is released somewhere else.
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, anchor, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      ref={ref}
      className={styles.panel}
      role="dialog"
      aria-label={label}
      // Rendered at 0,0 on the very first frame so it can be measured, then
      // placed. It is not hidden while that happens — a panel that starts at
      // opacity 0 and never gets its position would simply be gone.
      style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
    >
      {children}
    </div>,
    document.body,
  );
}
