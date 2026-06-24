import type { MutableRefObject } from 'react';
import type Konva from 'konva';
import { motion } from 'framer-motion';
import { useEditorState, useStore } from '../context';
import { Icon } from './Icon';

const MIN = 0.05;
const MAX = 5;

export function ZoomControl({ stageRef }: { stageRef: MutableRefObject<Konva.Stage | null> }) {
  const store = useStore();
  const state = useEditorState();
  const zoom = state.viewport.zoom;

  const setZoom = (next: number) => {
    const clamped = Math.max(MIN, Math.min(MAX, next));
    const stage = stageRef.current;
    const vp = store.state.viewport;
    if (stage) {
      const cx = stage.width() / 2;
      const cy = stage.height() / 2;
      const contentX = (cx - vp.x) / vp.zoom;
      const contentY = (cy - vp.y) / vp.zoom;
      store.setViewport({ zoom: clamped, x: cx - contentX * clamped, y: cy - contentY * clamped });
    } else {
      store.setViewport({ zoom: clamped });
    }
  };

  return (
    <motion.div className="o-zoom" onMouseDown={(e) => e.stopPropagation()} initial={{ opacity: 0, y: 10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}>
      <button title="Zoom out" onClick={() => setZoom(zoom / 1.2)}>
        <Icon name="minus" size={16} />
      </button>
      <input
        type="range"
        min={MIN}
        max={MAX}
        step={0.01}
        value={zoom}
        onChange={(e) => setZoom(Number(e.target.value))}
      />
      <button title="Zoom in" onClick={() => setZoom(zoom * 1.2)}>
        <Icon name="plus" size={16} />
      </button>
      <span className="o-zoom-val">{Math.round(zoom * 100)}%</span>
    </motion.div>
  );
}
