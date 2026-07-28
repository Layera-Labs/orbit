'use client';

import type { TextOverlay } from '@orbit/video/browser';
import { Icon } from '@/brand/Icon';
import {
  duplicateOverlay,
  removeOverlay,
  rippleDeleteOverlay,
  updateOverlay,
  useVideo,
} from '@/store/videoStore';
import { Slider } from '../panels/MotionPanels';
import panel from '../panels/Panels.module.css';

const ALIGNS = ['left', 'center', 'right'] as const;

/**
 * A caption's properties.
 *
 * Every control here maps to a field `overlayToSVG` already renders and resvg
 * already rasterizes at export, so nothing in this panel can drift from the
 * finished file — the preview and the export build their text from the SAME
 * SVG string.
 */
export function TextInspector({ overlay, time }: { overlay: TextOverlay; time: number }) {
  const apply = useVideo((s) => s.apply);
  const select = useVideo((s) => s.select);

  const set = (patch: Partial<TextOverlay>) =>
    apply((p) => updateOverlay(p, overlay.id, patch));

  const span = overlay.end - overlay.start;

  return (
    <div className={panel.stack}>
      <div className={panel.group}>
        <h3 className={panel.groupTitle}>Words</h3>
        <textarea
          className={panel.prompt}
          style={{ minHeight: 64 }}
          value={overlay.text}
          onChange={(e) => set({ text: e.target.value })}
          aria-label="Text"
        />
      </div>

      <div className={panel.group}>
        <h3 className={panel.groupTitle}>Type</h3>
        <Slider
          label="Size"
          value={overlay.fontSize}
          min={12}
          max={240}
          step={2}
          format={(v) => `${Math.round(v)}px`}
          onChange={(fontSize) => set({ fontSize })}
        />
        <div className={panel.presets}>
          {ALIGNS.map((a) => (
            <button
              key={a}
              className={panel.preset}
              data-on={(overlay.align ?? 'center') === a}
              onClick={() => set({ align: a })}
            >
              {a}
            </button>
          ))}
        </div>
        <div className={panel.pair}>
          <label className={panel.field}>
            <span className={panel.fieldLabel}>Colour</span>
            <input
              className={panel.input}
              type="color"
              style={{ height: 30, padding: 2 }}
              value={overlay.color}
              onChange={(e) => set({ color: e.target.value })}
            />
          </label>
          <button
            className={panel.action}
            data-on={overlay.bold}
            onClick={() => set({ bold: !overlay.bold })}
          >
            {overlay.bold ? 'Bold' : 'Regular'}
          </button>
        </div>
        <Slider
          label="Tracking"
          value={overlay.letterSpacing ?? 0}
          min={-4}
          max={24}
          step={0.5}
          format={(v) => `${v}px`}
          onChange={(letterSpacing) => set({ letterSpacing: letterSpacing || undefined })}
        />
      </div>

      <div className={panel.group}>
        <h3 className={panel.groupTitle}>Legibility</h3>
        {/* Text over footage needs its own contrast; these three are the honest
            ways to get it, and each is rendered identically in the export. */}
        <button
          className={panel.action}
          data-on={!!overlay.stroke}
          onClick={() =>
            set({ stroke: overlay.stroke ? undefined : { color: '#000000', width: 6 } })
          }
        >
          {overlay.stroke ? 'Remove outline' : 'Add outline'}
        </button>
        {overlay.stroke && (
          <Slider
            label="Outline"
            value={overlay.stroke.width}
            min={1}
            max={24}
            step={1}
            format={(v) => `${v}px`}
            onChange={(width) => set({ stroke: { ...overlay.stroke!, width } })}
          />
        )}
        <button
          className={panel.action}
          data-on={!!overlay.shadow}
          onClick={() =>
            set({
              shadow: overlay.shadow
                ? undefined
                : { color: '#000000', blur: 10, dx: 0, dy: 3, opacity: 0.6 },
            })
          }
        >
          {overlay.shadow ? 'Remove shadow' : 'Add shadow'}
        </button>
        <button
          className={panel.action}
          data-on={!!overlay.box}
          onClick={() =>
            set({
              box: overlay.box ? undefined : { color: '#000000', opacity: 0.5, padding: 18 },
            })
          }
        >
          {overlay.box ? 'Remove plate' : 'Add plate'}
        </button>
      </div>

      <div className={panel.group}>
        <h3 className={panel.groupTitle}>Placement</h3>
        <Slider
          label="Across"
          value={overlay.x}
          min={0}
          max={1}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(x) => set({ x })}
        />
        <Slider
          label="Down"
          value={overlay.y}
          min={0}
          max={1}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(y) => set({ y })}
        />
        <Slider
          label="Opacity"
          value={overlay.opacity ?? 1}
          min={0.05}
          max={1}
          step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(opacity) => set({ opacity })}
        />
      </div>

      <div className={panel.group}>
        <h3 className={panel.groupTitle}>Timing</h3>
        <div className={panel.pair}>
          <div className={panel.field}>
            <span className={panel.fieldLabel}>In</span>
            <span className={`${panel.fieldValue} w-data`}>{overlay.start.toFixed(2)}s</span>
          </div>
          <div className={panel.field}>
            <span className={panel.fieldLabel}>Out</span>
            <span className={`${panel.fieldValue} w-data`}>{overlay.end.toFixed(2)}s</span>
          </div>
        </div>
        <button
          className={panel.action}
          onClick={() => set({ start: time, end: time + span })}
          title="Move this caption so it begins at the playhead, keeping its length"
        >
          <Icon name="duration" size={14} />
          Start at playhead
        </button>
        <button
          className={panel.action}
          data-on={overlay.animation === 'fade'}
          onClick={() => set({ animation: overlay.animation === 'fade' ? 'none' : 'fade' })}
        >
          {overlay.animation === 'fade' ? 'Fading in and out' : 'Fade in and out'}
        </button>
      </div>

      <div className={panel.group}>
        <h3 className={panel.groupTitle}>Caption</h3>
        <button
          className={panel.action}
          onClick={() => apply((p) => duplicateOverlay(p, overlay.id))}
        >
          <Icon name="duplicate" size={14} />
          Duplicate
        </button>
        <button
          className={`${panel.action} ${panel.danger}`}
          onClick={() => {
            apply((p) => removeOverlay(p, overlay.id));
            select(null);
          }}
        >
          <Icon name="trash" size={14} />
          Delete
        </button>
        <button
          className={`${panel.action} ${panel.danger}`}
          onClick={() => {
            apply((p) => rippleDeleteOverlay(p, overlay.id));
            select(null);
          }}
          title="Delete and pull later captions on this layer back by its length"
        >
          <Icon name="split" size={14} />
          Ripple delete
        </button>
      </div>
    </div>
  );
}
