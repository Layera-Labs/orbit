/**
 * RulerOverlay - Pixel rulers on canvas edges
 */
import * as React from 'react';

interface RulerOverlayProps {
  zoom: number;
  canvasWidth: number;
  canvasHeight: number;
  showRulers: boolean;
  containerRef: React.RefObject<HTMLDivElement>;
}

const RULER_SIZE = 20;
const TICK_INTERVAL = 100;
const SUB_TICK_INTERVAL = 50;
const MIN_TICK_SPACING = 6;

interface CanvasBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const RulerOverlay: React.FC<RulerOverlayProps> = ({
  zoom,
  canvasWidth,
  canvasHeight,
  showRulers,
  containerRef,
}) => {
  const [bounds, setBounds] = React.useState<CanvasBounds | null>(null);

  React.useLayoutEffect(() => {
    if (!showRulers) {
      setBounds(null);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    let frameId: number | null = null;

    const measure = () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }

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
          height: wrapperRect.height,
        });
      });
    };

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(container);

    const wrapper = container.querySelector<HTMLElement>('.canvas-container');
    if (wrapper) {
      resizeObserver.observe(wrapper);
    }

    container.addEventListener('scroll', measure, { passive: true });
    measure();

    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      resizeObserver.disconnect();
      container.removeEventListener('scroll', measure);
    };
  }, [canvasHeight, canvasWidth, containerRef, showRulers, zoom]);

  if (!showRulers) return null;

  const scale = Math.max(zoom / 100, 0.01);
  const subScaledInterval = Math.max(SUB_TICK_INTERVAL * scale, MIN_TICK_SPACING);
  const scaledWidth = bounds?.width ?? canvasWidth * scale;
  const scaledHeight = bounds?.height ?? canvasHeight * scale;

  // Horizontal ruler ticks
  const hTicks: { pos: number; label?: string; isMajor: boolean }[] = [];
  for (let pos = 0; pos <= scaledWidth; pos += subScaledInterval) {
    const pixelValue = Math.round(pos / scale / SUB_TICK_INTERVAL) * SUB_TICK_INTERVAL;
    const isMajor = pixelValue % TICK_INTERVAL === 0;
    hTicks.push({ pos, label: isMajor ? String(pixelValue) : undefined, isMajor });
  }

  // Vertical ruler ticks
  const vTicks: { pos: number; label?: string; isMajor: boolean }[] = [];
  for (let pos = 0; pos <= scaledHeight; pos += subScaledInterval) {
    const pixelValue = Math.round(pos / scale / SUB_TICK_INTERVAL) * SUB_TICK_INTERVAL;
    const isMajor = pixelValue % TICK_INTERVAL === 0;
    vTicks.push({ pos, label: isMajor ? String(pixelValue) : undefined, isMajor });
  }

  const left = bounds?.left ?? 0;
  const top = bounds?.top ?? 0;
  const rulerTop = Math.max(0, top - RULER_SIZE);
  const rulerLeft = Math.max(0, left - RULER_SIZE);

  return (
    <>
      {/* Corner box */}
      <div
        className="absolute z-20 border-r border-b border-orbit-border bg-orbit-sidebar"
        style={{ left: rulerLeft, top: rulerTop, width: RULER_SIZE, height: RULER_SIZE }}
      />

      {/* Horizontal ruler */}
      <div
        className="absolute z-10 overflow-hidden border-b border-orbit-border bg-orbit-sidebar"
        style={{ left, top: rulerTop, width: scaledWidth, height: RULER_SIZE }}
      >
        {hTicks.map((tick, i) => (
          <React.Fragment key={`h-${i}`}>
            <div
              className="absolute top-0 border-l border-orbit-text-tertiary"
              style={{
                left: tick.pos,
                height: tick.isMajor ? RULER_SIZE * 0.7 : RULER_SIZE * 0.4,
                opacity: tick.isMajor ? 0.6 : 0.3,
              }}
            />
            {tick.label && (
              <span
                className="absolute top-0.5 text-[8px] text-orbit-text-tertiary"
                style={{ left: tick.pos + 2 }}
              >
                {tick.label}
              </span>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Vertical ruler */}
      <div
        className="absolute z-10 overflow-hidden border-r border-orbit-border bg-orbit-sidebar"
        style={{ left: rulerLeft, top, width: RULER_SIZE, height: scaledHeight }}
      >
        {vTicks.map((tick, i) => (
          <React.Fragment key={`v-${i}`}>
            <div
              className="absolute left-0 border-t border-orbit-text-tertiary"
              style={{
                top: tick.pos,
                width: tick.isMajor ? RULER_SIZE * 0.7 : RULER_SIZE * 0.4,
                opacity: tick.isMajor ? 0.6 : 0.3,
              }}
            />
            {tick.label && (
              <span
                className="absolute left-0.5 text-[8px] text-orbit-text-tertiary"
                style={{
                  top: tick.pos + 2,
                  writingMode: 'vertical-rl',
                  textOrientation: 'mixed',
                }}
              >
                {tick.label}
              </span>
            )}
          </React.Fragment>
        ))}
      </div>
    </>
  );
};
