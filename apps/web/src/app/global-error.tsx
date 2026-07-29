'use client';

/**
 * The last boundary: a throw in the ROOT LAYOUT itself, which `error.tsx`
 * cannot catch because it renders inside that layout.
 *
 * It has to supply its own `<html>` and `<body>` — the layout that would have
 * provided them is the thing that failed — and it therefore cannot use the
 * app's styles or the pre-paint theme script. So the styling here is inline and
 * intentionally minimal, and it commits to no theme: `color-scheme` lets the
 * browser pick, so the page is legible either way rather than guessing wrong
 * and rendering dark text on dark.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          colorScheme: 'light dark',
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeContent: 'center',
          justifyItems: 'start',
          gap: 16,
          padding: 32,
          maxWidth: '62ch',
          marginInline: 'auto',
          font: '16px/1.55 system-ui, sans-serif',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 32, lineHeight: 1.1 }}>Orbit could not start.</h1>
        <p style={{ margin: 0, opacity: 0.7 }}>
          Your projects are stored in this browser and were not touched by this.
        </p>
        <pre
          style={{
            width: '100%',
            margin: 0,
            padding: '12px 16px',
            borderRadius: 6,
            background: 'rgba(127,127,127,0.14)',
            font: '12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            maxHeight: '40vh',
            overflowY: 'auto',
          }}
        >
          {error.message}
          {error.digest ? `\n\nreference: ${error.digest}` : ''}
        </pre>
        <button
          type="button"
          onClick={reset}
          style={{
            padding: '10px 18px',
            borderRadius: 6,
            border: '1px solid currentColor',
            background: 'transparent',
            color: 'inherit',
            font: 'inherit',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
