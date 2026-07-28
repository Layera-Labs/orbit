'use client';

import { useSelectedElement, useStore } from '@orbit/editor';
import { Icon } from '@/brand/Icon';
import { Slider } from '../panels/MotionPanels';
import panel from '../panels/Panels.module.css';

const BLENDS = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'difference',
];

const ALIGNS = ['left', 'center', 'right'] as const;

/**
 * Properties of the selected canvas element.
 *
 * Built here rather than lifted from `ToolbarControls`: those are popover
 * triggers shaped for a floating pill, and a docked column wants plain rows you
 * can read all at once without opening anything.
 */
export function ElementInspector() {
  const store = useStore();
  const element = useSelectedElement();
  if (!element) return null;

  const set = (patch: Record<string, unknown>) => store.updateElement(element.id, patch);
  const el = element as Record<string, unknown> & typeof element;

  return (
    <div className={panel.stack}>
      <div className={panel.group}>
        <h3 className={panel.groupTitle}>Position</h3>
        <div className={panel.pair}>
          <NumberField label="X" value={element.x} onChange={(x) => set({ x })} />
          <NumberField label="Y" value={element.y} onChange={(y) => set({ y })} />
        </div>
        <div className={panel.pair}>
          <NumberField
            label="Width"
            value={element.width}
            min={1}
            onChange={(width) => set({ width })}
          />
          <NumberField
            label="Height"
            value={element.height}
            min={1}
            onChange={(height) => set({ height })}
          />
        </div>
        <Slider
          label="Rotation"
          value={element.rotation ?? 0}
          min={-180}
          max={180}
          step={1}
          format={(v) => `${Math.round(v)}°`}
          onChange={(rotation) => set({ rotation })}
        />
      </div>

      <div className={panel.group}>
        <h3 className={panel.groupTitle}>Layer</h3>
        <Slider
          label="Opacity"
          value={element.opacity ?? 1}
          min={0}
          max={1}
          step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(opacity) => set({ opacity })}
        />
        <select
          className={panel.select}
          value={(el.blendMode as string) ?? 'normal'}
          onChange={(e) => set({ blendMode: e.target.value })}
          aria-label="Blend mode"
        >
          {BLENDS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <div className={panel.pair}>
          <button className={panel.action} onClick={() => store.bringForward(element.id)}>
            Forward
          </button>
          <button className={panel.action} onClick={() => store.sendBackward(element.id)}>
            Back
          </button>
        </div>
      </div>

      {element.type === 'text' && (
        <div className={panel.group}>
          <h3 className={panel.groupTitle}>Text</h3>
          <textarea
            className={panel.prompt}
            style={{ minHeight: 64 }}
            value={(el.text as string) ?? ''}
            onChange={(e) => set({ text: e.target.value })}
            aria-label="Text content"
          />
          <div className={panel.pair}>
            <NumberField
              label="Size"
              value={(el.fontSize as number) ?? 36}
              min={4}
              onChange={(fontSize) => set({ fontSize })}
            />
            <ColourField
              label="Colour"
              value={(el.fill as string) ?? '#111111'}
              onChange={(fill) => set({ fill })}
            />
          </div>
          <div className={panel.presets}>
            {ALIGNS.map((a) => (
              <button
                key={a}
                className={panel.preset}
                data-on={(el.align as string) === a}
                onClick={() => set({ align: a })}
              >
                {a}
              </button>
            ))}
          </div>
          <button
            className={panel.action}
            data-on={(el.fontWeight as number) >= 600}
            onClick={() => set({ fontWeight: (el.fontWeight as number) >= 600 ? 400 : 700 })}
          >
            {(el.fontWeight as number) >= 600 ? 'Regular' : 'Bold'}
          </button>
        </div>
      )}

      {(element.type === 'shape' || element.type === 'line') && (
        <div className={panel.group}>
          <h3 className={panel.groupTitle}>Fill</h3>
          {element.type === 'shape' && (
            <ColourField
              label="Fill"
              value={(el.fill as string) ?? '#8a8580'}
              onChange={(fill) => set({ fill })}
            />
          )}
          <ColourField
            label="Stroke"
            value={(el.stroke as string) ?? '#111111'}
            onChange={(stroke) => set({ stroke })}
          />
          <NumberField
            label="Stroke width"
            value={(el.strokeWidth as number) ?? 0}
            min={0}
            onChange={(strokeWidth) => set({ strokeWidth })}
          />
        </div>
      )}

      <div className={panel.group}>
        <h3 className={panel.groupTitle}>Element</h3>
        <button className={panel.action} onClick={() => store.duplicateElement(element.id)}>
          <Icon name="duplicate" size={14} />
          Duplicate
        </button>
        <button
          className={panel.action}
          onClick={() => set({ locked: !element.locked })}
        >
          <Icon name="lock" size={14} />
          {element.locked ? 'Unlock' : 'Lock'}
        </button>
        <button
          className={`${panel.action} ${panel.danger}`}
          onClick={() => store.removeElement(element.id)}
        >
          <Icon name="trash" size={14} />
          Delete
        </button>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  onChange(v: number): void;
}) {
  return (
    <label className={panel.field}>
      <span className={panel.fieldLabel}>{label}</span>
      <input
        className={panel.input}
        type="number"
        value={Math.round(value * 100) / 100}
        min={min}
        onChange={(e) => {
          const next = Number(e.target.value);
          // An empty or half-typed field parses to NaN; writing that into the
          // document would blank the element on screen mid-keystroke.
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </label>
  );
}

function ColourField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange(v: string): void;
}) {
  return (
    <label className={panel.field}>
      <span className={panel.fieldLabel}>{label}</span>
      <input
        className={panel.input}
        type="color"
        value={value.startsWith('#') ? value : '#000000'}
        onChange={(e) => onChange(e.target.value)}
        style={{ height: 30, padding: 2 }}
      />
    </label>
  );
}
