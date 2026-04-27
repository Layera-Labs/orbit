/**
 * RulerOverlay - Pixel rulers on canvas edges
 */
import * as React from 'react';

interface RulerOverlayProps {
  zoom: number;
  panX: number;
  panY: number;
  canvasWidth: number;
  canvasHeight: number;
  showRulers: boolean;
}

const RULER_SIZE = 20;
const TICK_INTERVAL = 100;
const SUB_TICK_INTERVAL = 50;

export const RulerOverlay: React.FC<RulerOverlayProps> = ({
  zoom,
  panX,
  panY,
  canvasWidth,
  canvasHeight,
  showRulers,
}) => {
  if (!showRulers) return null;

  const scaledInterval = TICK_INTERVAL * zoom;
  const subScaledInterval = SUB_TICK_INTERVAL * zoom;

  // Horizontal ruler ticks
  const hTicks: { pos: number; label?: string; isMajor: boolean }[] = [];
  const hStart = -panX % scaledInterval;
  for (let x = hStart; x < canvasWidth; x += subScaledInterval) {
    const pixelValue = Math.round((x + panX) / zoom / SUB_TICK_INTERVAL) * SUB_TICK_INTERVAL;
    const isMajor = pixelValue % TICK_INTERVAL === 0;
    hTicks.push({ pos: x + RULER_SIZE, label: isMajor ? String(pixelValue) : undefined, isMajor });
  }

  // Vertical ruler ticks
  const vTicks: { pos: number; label?: string; isMajor: boolean }[] = [];
  const vStart = -panY % scaledInterval;
  for (let y = vStart; y < canvasHeight; y += subScaledInterval) {
    const pixelValue = Math.round((y + panY) / zoom / SUB_TICK_INTERVAL) * SUB_TICK_INTERVAL;
    const isMajor = pixelValue % TICK_INTERVAL === 0;
    vTicks.push({ pos: y + RULER_SIZE, label: isMajor ? String(pixelValue) : undefined, isMajor });
  }

  return (
    <>
      {/* Corner box */}
      <div
        className="absolute left-0 top-0 z-20 border-r border-b border-orbit-border bg-orbit-sidebar"
        style={{ width: RULER_SIZE, height: RULER_SIZE }}
      />

      {/* Horizontal ruler */}
      <div
        className="absolute left-0 top-0 z-10 overflow-hidden border-b border-orbit-border bg-orbit-sidebar"
        style={{ left: RULER_SIZE, height: RULER_SIZE, right: 0 }}
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
        className="absolute left-0 top-0 z-10 overflow-hidden border-r border-orbit-border bg-orbit-sidebar"
        style={{ top: RULER_SIZE, width: RULER_SIZE, bottom: 0 }}
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
