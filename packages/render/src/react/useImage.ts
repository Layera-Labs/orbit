import { useEffect, useRef, useState } from 'react';

type Status = 'loading' | 'loaded' | 'failed';

/**
 * Minimal image loader for Konva nodes (avoids an external `use-image` dep).
 * Caches by src across the app for the session.
 */
const cache = new Map<string, HTMLImageElement>();

export function useImage(src: string | undefined): [HTMLImageElement | undefined, Status] {
  const [, force] = useState(0);
  const stateRef = useRef<{ img?: HTMLImageElement; status: Status }>({
    status: 'loading',
  });

  useEffect(() => {
    if (!src) {
      stateRef.current = { status: 'failed' };
      force((n) => n + 1);
      return;
    }
    const cached = cache.get(src);
    if (cached) {
      stateRef.current = { img: cached, status: 'loaded' };
      force((n) => n + 1);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      cache.set(src, img);
      stateRef.current = { img, status: 'loaded' };
      force((n) => n + 1);
    };
    img.onerror = () => {
      if (cancelled) return;
      stateRef.current = { status: 'failed' };
      force((n) => n + 1);
    };
    img.src = src;
    stateRef.current = { status: 'loading' };
    return () => {
      cancelled = true;
    };
  }, [src]);

  return [stateRef.current.img, stateRef.current.status];
}
