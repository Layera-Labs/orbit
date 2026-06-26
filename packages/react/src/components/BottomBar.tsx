/**
 * BottomBar - Zoom controls, grid toggles, and canvas info
 */
import * as React from 'react';
import { OrbitButton } from '@orbit/ui';
import { useEditorStore } from '../store';
import type { OrbitEngine } from '@orbit/core';

interface BottomBarProps {
  engine: OrbitEngine | null;
}

export const BottomBar: React.FC<BottomBarProps> = ({ engine }) => {
  const zoom = useEditorStore((s) => s.zoom);
  const showGrid = useEditorStore((s) => s.showGrid);
  const gridType = useEditorStore((s) => s.gridType);
  const snapToGrid = useEditorStore((s) => s.snapToGrid);
  const setShowGrid = useEditorStore((s) => s.setShowGrid);
  const setGridType = useEditorStore((s) => s.setGridType);
  const setSnapToGrid = useEditorStore((s) => s.setSnapToGrid);
  const showRulers = useEditorStore((s) => s.showRulers);
  const setShowRulers = useEditorStore((s) => s.setShowRulers);
  const zoomPercent = Math.round(zoom);

  return (
    <div className="flex h-orbit-zoombar items-center justify-between border-t border-orbit-border bg-orbit-sidebar px-orbit-md">
      <div className="flex items-center gap-2">
        {/* Grid controls */}
        <button
          onClick={() => setShowGrid(!showGrid)}
          className={`
            rounded px-2 py-1 text-[10px] font-medium transition-colors
            ${showGrid ? 'bg-orbit-accent text-white' : 'text-orbit-text-secondary hover:text-orbit-text'}
          `}
          title="Toggle grid"
        >
          Grid
        </button>
        {showGrid && (
          <>
            <button
              onClick={() => setGridType(gridType === 'dots' ? 'lines' : 'dots')}
              className="rounded px-2 py-1 text-[10px] text-orbit-text-secondary hover:text-orbit-text transition-colors"
              title="Toggle grid type"
            >
              {gridType === 'dots' ? 'Dots' : 'Lines'}
            </button>
            <button
              onClick={() => setSnapToGrid(!snapToGrid)}
              className={`
                rounded px-2 py-1 text-[10px] font-medium transition-colors
                ${snapToGrid ? 'bg-orbit-accent text-white' : 'text-orbit-text-secondary hover:text-orbit-text'}
              `}
              title="Snap to grid"
            >
              Snap
            </button>
          </>
        )}

        {/* Rulers toggle */}
        <button
          onClick={() => setShowRulers(!showRulers)}
          className={`
            rounded px-2 py-1 text-[10px] font-medium transition-colors
            ${showRulers ? 'bg-orbit-accent text-white' : 'text-orbit-text-secondary hover:text-orbit-text'}
          `}
          title="Toggle rulers"
        >
          Rulers
        </button>

        <div className="mx-1 h-4 w-px bg-orbit-border" />

        <OrbitButton
          variant="ghost"
          size="sm"
          onClick={() => engine?.zoomOut()}
        >
          -
        </OrbitButton>
        <span className="min-w-[3rem] text-center text-xs text-orbit-text">{zoomPercent}%</span>
        <OrbitButton
          variant="ghost"
          size="sm"
          onClick={() => engine?.zoomIn()}
        >
          +
        </OrbitButton>
      </div>
      <div className="flex items-center gap-2">
        <OrbitButton variant="ghost" size="sm" onClick={() => engine?.zoomToFit()}>
          Fit
        </OrbitButton>
        <OrbitButton variant="ghost" size="sm" onClick={() => engine?.resetZoom()}>
          100%
        </OrbitButton>
      </div>
    </div>
  );
};
