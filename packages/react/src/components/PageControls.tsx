import * as React from 'react';

interface PageControlsProps {
  containerRef: React.RefObject<HTMLDivElement>;
  activePageIndex: number;
  pageCount: number;
  pagesLayout: 'vertical' | 'horizontal';
  onPreviousPage: () => void;
  onNextPage: () => void;
  onDuplicatePage: () => void;
  onAddPage: () => void;
  onDeletePage: () => void;
  onTogglePagesLayout: () => void;
}

interface CanvasBounds {
  left: number;
  top: number;
  width: number;
}

const PageButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className = '', children, ...props }) => (
  <button
    {...props}
    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-700 transition hover:bg-white/90 hover:text-slate-950 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-35 ${className}`}
  >
    {children}
  </button>
);

export const PageControls: React.FC<PageControlsProps> = ({
  containerRef,
  activePageIndex,
  pageCount,
  pagesLayout,
  onPreviousPage,
  onNextPage,
  onDuplicatePage,
  onAddPage,
  onDeletePage,
  onTogglePagesLayout,
}) => {
  const [bounds, setBounds] = React.useState<CanvasBounds | null>(null);

  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let frameId: number | null = null;

    const measure = () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        frameId = null;
        const wrapper = container.querySelector<HTMLElement>('.canvas-container');
        if (!wrapper) return;
        const containerRect = container.getBoundingClientRect();
        const wrapperRect = wrapper.getBoundingClientRect();
        setBounds({
          left: wrapperRect.left - containerRect.left,
          top: wrapperRect.top - containerRect.top,
          width: wrapperRect.width,
        });
      });
    };

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(container);
    const wrapper = container.querySelector<HTMLElement>('.canvas-container');
    if (wrapper) resizeObserver.observe(wrapper);
    container.addEventListener('scroll', measure, { passive: true });
    measure();

    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      container.removeEventListener('scroll', measure);
    };
  }, [containerRef, activePageIndex, pageCount]);

  if (!bounds) return null;

  const canNavigateBack = activePageIndex > 0;
  const canNavigateForward = activePageIndex < pageCount - 1;
  const showDelete = activePageIndex > 0 && pageCount > 1;

  return (
    <div
      className="pointer-events-auto absolute z-[40] flex -translate-x-full items-center gap-1 rounded-xl border border-white/70 bg-white/90 p-1 shadow-[0_18px_42px_-30px_rgba(15,23,42,0.45)] backdrop-blur-xl"
      style={{
        left: bounds.left + bounds.width,
        top: Math.max(72, bounds.top - 42),
      }}
    >
      {pageCount > 1 && (
        <>
          <PageButton type="button" onClick={onPreviousPage} disabled={!canNavigateBack} aria-label="Previous page" title="Previous page">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </PageButton>
          <span className="min-w-12 px-1 text-center text-xs font-semibold text-slate-600">
            {activePageIndex + 1}/{pageCount}
          </span>
          <PageButton type="button" onClick={onNextPage} disabled={!canNavigateForward} aria-label="Next page" title="Next page">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </PageButton>
          <div className="mx-1 h-5 w-px bg-slate-200" />
        </>
      )}
      <PageButton
        type="button"
        onClick={onTogglePagesLayout}
        aria-label={`Pages layout: ${pagesLayout}`}
        title={`Pages layout: ${pagesLayout}`}
      >
        {pagesLayout === 'vertical' ? (
          <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <rect x="5" y="2.5" width="8" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
            <rect x="5" y="10.5" width="8" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        ) : (
          <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <rect x="2.5" y="5" width="5" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
            <rect x="10.5" y="5" width="5" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        )}
      </PageButton>
      <div className="mx-1 h-5 w-px bg-slate-200" />
      <PageButton type="button" onClick={onDuplicatePage} aria-label="Duplicate page" title="Duplicate page">
        <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect x="6" y="3" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <rect x="3" y="6" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </PageButton>
      <PageButton type="button" onClick={onAddPage} aria-label="Add page" title="Add page">
        <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect x="3" y="4" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12.5 3v4M10.5 5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </PageButton>
      {showDelete && (
        <PageButton type="button" onClick={onDeletePage} aria-label="Delete page" title="Delete page">
          <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M4 5h10M7 5V3.8h4V5M6 7v6M9 7v6M12 7v6M5 5l.5 10h7L13 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </PageButton>
      )}
    </div>
  );
};
