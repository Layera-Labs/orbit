'use client';

/**
 * The route-level boundary. Catches anything thrown while rendering a page or
 * its children, which before this took the whole app to a blank document.
 *
 * `reset()` re-renders the segment rather than reloading — for the common case
 * (a transient read, a race on mount) that recovers without losing the editor
 * state that is still in memory.
 */
import { useEffect } from 'react';
import { Failure } from '@/features/errors/Failure';

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Next logs server errors itself, but a client-side throw caught here would
    // otherwise leave nothing in the console for whoever is debugging it.
    console.error('[orbit] unhandled render error:', error);
  }, [error]);

  return <Failure title="That screen stopped working." error={error} onRetry={reset} />;
}
