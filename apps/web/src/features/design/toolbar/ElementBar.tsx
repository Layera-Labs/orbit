'use client';

import { useEffect, useState } from 'react';
import { useProviders, useSelectedElement, useStore } from '@orbit/editor';
import type { FontItem } from '@orbit/providers';
import { ColourPicker } from '@/brand/Colour';
import {
  BarButton,
  BarMenu,
  MenuItem,
  NumField,
  PropertyBar,
  Segmented,
  Sep,
  SliderRow,
  barStyles as styles,
} from './controls';

const BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'difference'];

const ALIGNS = [
  { id: 'left' as const, icon: 'alignLeft' as const, label: 'Align left' },
  { id: 'center' as const, icon: 'alignCenter' as const, label: 'Align centre' },
  { id: 'right' as const, icon: 'alignRight' as const, label: 'Align right' },
];

/**
 * The selected element's properties.
 *
 * Only what applies to THIS element appears — a rectangle has no font, so it
 * shows no font control rather than a disabled one. The bar is the whole of the
 * element UI now; the right-hand inspector it replaces is gone, so anything that
 * used to live there has to be reachable here or in a menu off it.
 */
export function ElementBar() {
  const store = useStore();
  const element = useSelectedElement();
  if (!element) return null;

  const set = (patch: Record<string, unknown>) => store.updateElement(element.id, patch);
  const el = element as Record<string, unknown> & typeof element;
  const isText = element.type === 'text';

  return (
    <PropertyBar label={`${element.type} properties`}>
      {isText && <FontMenu value={String(el.fontFamily ?? '')} onChange={(f) => set({ fontFamily: f })} />}

      {isText && (
        <NumField
          label="Font size"
          value={Number(el.fontSize ?? 16)}
          min={1}
          max={800}
          onChange={(fontSize) => set({ fontSize })}
        />
      )}

      {/* Fill for a shape, ink for a text element — the same control, named for
          what it actually changes on this element. */}
      {'fill' in el && typeof el.fill === 'string' && (
        <ColourPicker
          value={el.fill}
          label={isText ? 'Text colour' : 'Fill'}
          onChange={(fill) => set({ fill })}
        />
      )}

      {isText && (
        <>
          <Sep />
          <Segmented
            label="Alignment"
            options={ALIGNS}
            value={(el.align as 'left' | 'center' | 'right') ?? 'left'}
            onChange={(align) => set({ align })}
          />
          <BarButton
            icon="bold"
            label="Bold"
            on={Number(el.fontWeight ?? 400) >= 600}
            onClick={() => set({ fontWeight: Number(el.fontWeight ?? 400) >= 600 ? 400 : 700 })}
          />
          <BarButton
            icon="italic"
            label="Italic"
            on={el.fontStyle === 'italic'}
            onClick={() => set({ fontStyle: el.fontStyle === 'italic' ? 'normal' : 'italic' })}
          />
        </>
      )}

      <Sep />

      {/* Geometry lives in a menu rather than four permanent fields — it is
          precise work you reach for, not something you read at a glance, and
          four number boxes would push everything else off a narrow canvas. */}
      <BarMenu label="Size and position" icon="sliders">
        <div className={styles.group}>
          <p className={styles.groupTitle}>Position</p>
          <div style={{ display: 'flex', gap: 4 }}>
            <NumField label="X" value={element.x} onChange={(x) => set({ x })} />
            <NumField label="Y" value={element.y} onChange={(y) => set({ y })} />
          </div>
          <p className={styles.groupTitle}>Size</p>
          <div style={{ display: 'flex', gap: 4 }}>
            <NumField label="Width" value={element.width} min={1} onChange={(width) => set({ width })} />
            <NumField label="Height" value={element.height} min={1} onChange={(height) => set({ height })} />
          </div>
          <SliderRow
            label="Rotation"
            value={element.rotation ?? 0}
            min={-180}
            max={180}
            step={1}
            format={(v) => `${Math.round(v)}°`}
            onChange={(rotation) => set({ rotation })}
          />
        </div>
      </BarMenu>

      <BarMenu label="Opacity and blending" icon="opacity">
        <div className={styles.group}>
          <SliderRow
            label="Opacity"
            value={element.opacity ?? 1}
            min={0.05}
            max={1}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(opacity) => set({ opacity })}
          />
          <p className={styles.groupTitle}>Blend</p>
          <div className={styles.menu}>
            {BLENDS.map((b) => (
              <MenuItem key={b} on={(el.blendMode ?? 'normal') === b} onClick={() => set({ blendMode: b })}>
                {b}
              </MenuItem>
            ))}
          </div>
        </div>
      </BarMenu>

      <Sep />

      <BarButton icon="chevronDown" label="Send back" onClick={() => store.sendBackward(element.id)} />
      <BarButton icon="layers" label="Bring forward" onClick={() => store.bringForward(element.id)} />
      <BarButton icon="duplicate" label="Duplicate" onClick={() => store.duplicateElement(element.id)} />
      <BarButton icon="trash" label="Delete" danger onClick={() => store.removeElement(element.id)} />
    </PropertyBar>
  );
}

/**
 * Font family, loaded before it is applied.
 *
 * `provider.load` injects the webfont and resolves once it is ready. Applying
 * the family first would set a name the browser cannot render yet, and Konva
 * rasterizes immediately — the canvas would fall back to a default face and then
 * silently not repaint when the real font arrived. So: load, then set.
 */
function FontMenu({ value, onChange }: { value: string; onChange(family: string): void }) {
  const providers = useProviders();
  const provider = providers.get('fonts');
  const [items, setItems] = useState<FontItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!provider) return;
    let live = true;
    void provider.list({}).then((list) => {
      if (!live) return;
      setItems(list);
      // Preload the first handful so the menu previews in the real faces.
      list.slice(0, 12).forEach((f) => void provider.load(f.family, f.weights));
    });
    return () => {
      live = false;
    };
  }, [provider]);

  if (!provider) return null;

  return (
    <BarMenu label="Font" icon="fontFamily" value={value || 'Font'}>
      {(close) => (
        <div className={styles.menu}>
          {items.length === 0 && <p className={styles.empty}>No fonts available.</p>}
          {items.map((f) => (
            <MenuItem
              key={f.family}
              on={value === f.family}
              style={{ fontFamily: `"${f.family}", var(--w-body)`, fontSize: 15 }}
              onClick={() => {
                setBusy(f.family);
                void provider.load(f.family, f.weights).then(() => {
                  onChange(f.family);
                  setBusy(null);
                  close();
                });
              }}
            >
              {busy === f.family ? `${f.family}…` : f.family}
            </MenuItem>
          ))}
        </div>
      )}
    </BarMenu>
  );
}
