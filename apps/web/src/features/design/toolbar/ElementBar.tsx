'use client';

import { useEffect, useState } from 'react';
import { useProviders, useSelectedElement, useStore } from '@layera-labs/editor';
import type { FontItem } from '@layera-labs/providers';
import { ColourPicker } from '@/brand/Colour';
import {
  BarButton,
  BarMenu,
  MenuItem,
  NumField,
  PropertyBar,
  MenuSearch,
  Segmented,
  Sep,
  SliderRow,
  barStyles as styles,
} from './controls';
import { DEFAULT_STROKE, visibleStroke } from './strokeColour';

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

      {isText && (
        <BarMenu label="Line height and spacing" text="Spacing" icon="lineHeight">
          <div className={styles.group}>
            <SliderRow
              label="Line height"
              value={Number(el.lineHeight ?? 1.2)}
              min={0.7}
              max={3}
              step={0.05}
              format={(v) => v.toFixed(2)}
              onChange={(lineHeight) => set({ lineHeight })}
            />
            <SliderRow
              label="Letter spacing"
              value={Number(el.letterSpacing ?? 0)}
              min={-20}
              max={80}
              step={1}
              format={(v) => `${Math.round(v)}px`}
              onChange={(letterSpacing) => set({ letterSpacing })}
            />
          </div>
        </BarMenu>
      )}

      <Sep />

      {/* Geometry lives in a menu rather than four permanent fields — it is
          precise work you reach for, not something you read at a glance, and
          four number boxes would push everything else off a narrow canvas. */}
      <BarMenu label="Size and position" text="Size" icon="resize">
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

      <BarMenu label="Opacity and blending" text="Opacity" icon="opacity">
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

      <BarMenu label="Shadow" text="Shadow" icon="effects">
        <ShadowMenu element={element} set={set} />
      </BarMenu>

      {element.type !== 'group' && (
        <BarMenu label="Outline and corners" text="Edges" icon="fill">
          <EdgesMenu element={element} set={set} />
        </BarMenu>
      )}

      {element.type === 'image' && (
        <BarMenu label="Crop" text="Crop" icon="resize">
          <CropMenu element={element} set={set} />
        </BarMenu>
      )}

      {/*
        One Arrange menu with WORDS, not two bare glyphs. A chevron and a
        stack-of-plates icon said nothing about z-order — they read as "collapse"
        and "database". Four labelled items cost one click and are unambiguous.
      */}
      <BarMenu label="Arrange" text="Arrange" icon="arrange">
        {(close) => (
          <div className={styles.menu}>
            <MenuItem onClick={() => { store.bringToFront(element.id); close(); }}>
              Bring to front
            </MenuItem>
            <MenuItem onClick={() => { store.bringForward(element.id); close(); }}>
              Bring forward
            </MenuItem>
            <MenuItem onClick={() => { store.sendBackward(element.id); close(); }}>
              Send backward
            </MenuItem>
            <MenuItem onClick={() => { store.sendToBack(element.id); close(); }}>
              Send to back
            </MenuItem>
          </div>
        )}
      </BarMenu>

      <Sep />

      <BarButton icon="duplicate" label="Duplicate" onClick={() => store.duplicateElement(element.id)} />
      <BarButton icon="trash" label="Delete" danger onClick={() => store.removeElement(element.id)} />
    </PropertyBar>
  );
}

/* --------------------------------------------------------------- styling --- */

/** What a shadow starts as: readable, and clearly a shadow rather than a halo. */
const NEW_SHADOW = { color: '#000000', blur: 12, opacity: 0.35, offsetX: 0, offsetY: 6 };


type Element = NonNullable<ReturnType<typeof useSelectedElement>>;
type Setter = (patch: Record<string, unknown>) => void;

/**
 * The shadow.
 *
 * It is in the model, drawn by the Konva canvas AND written by `svg-export`,
 * and had no control — so a document could carry a shadow (from a template, or
 * another client) that the editor could neither show you nor let you remove.
 *
 * A shadow is stored as an OBJECT whose presence means "enabled", so switching
 * it off deletes the field rather than writing zeroes: a zeroed shadow still
 * makes the exporter emit a `<filter>` and Konva take its shadow path, for a
 * result indistinguishable from none but not free.
 *
 * The offset is a real direction, not a blur that radiates on all sides. That
 * is a deliberate default — an even bloom around every edge is the reflex, and
 * a shadow cast from one light source is the considered version.
 *
 * **Shadow and Edges are two menus rather than one.** Together they overflowed
 * the popover's 520px, and while it does scroll, the last group's heading came
 * to rest exactly on the cut — which reads as broken rather than as scrollable.
 * Two menus also match the granularity of the rest of the bar, where Size,
 * Opacity and Arrange are each one concern.
 */
function ShadowMenu({ element, set }: { element: Element; set: Setter }) {
  const el = element as Record<string, unknown> & Element;
  const shadow = el.shadow as typeof NEW_SHADOW | undefined;
  const patchShadow = (p: Partial<typeof NEW_SHADOW>) =>
    set({ shadow: { ...(shadow ?? NEW_SHADOW), ...p } });

  return (
    <div className={styles.group}>
      <p className={styles.groupTitle}>Shadow</p>
      <div className={styles.menu}>
        <MenuItem
          on={!!shadow}
          onClick={() => set({ shadow: shadow ? undefined : NEW_SHADOW })}
        >
          {shadow ? 'Remove the shadow' : 'Add a shadow'}
        </MenuItem>
      </div>
      {shadow && (
        <>
          <ColourPicker
            value={shadow.color}
            label="Shadow colour"
            onChange={(color) => patchShadow({ color })}
          />
          <SliderRow
            label="Softness"
            value={shadow.blur ?? 12}
            min={0}
            max={60}
            step={1}
            format={(v) => `${Math.round(v)}px`}
            onChange={(blur) => patchShadow({ blur })}
          />
          <SliderRow
            label="Strength"
            value={shadow.opacity ?? 0.35}
            min={0.05}
            max={1}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(opacity) => patchShadow({ opacity })}
          />
          <p className={styles.groupTitle}>Cast from</p>
          <div style={{ display: 'flex', gap: 4 }}>
            <NumField
              label="Shadow across"
              value={shadow.offsetX ?? 0}
              onChange={(offsetX) => patchShadow({ offsetX })}
            />
            <NumField
              label="Shadow down"
              value={shadow.offsetY ?? 6}
              onChange={(offsetY) => patchShadow({ offsetY })}
            />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The element's edges: an outline, and how sharp its corners are.
 *
 * Both are drawn by the Konva canvas and written by `svg-export`, and neither
 * had a control. Split from the shadow so neither popover has to scroll — see
 * `ShadowMenu`.
 */
function EdgesMenu({ element, set }: { element: Element; set: Setter }) {
  const el = element as Record<string, unknown> & Element;
  // Text takes a stroke too, but it is drawn round the glyphs rather than the
  // box; both are the same two fields, so the control is the same.
  const canOutline =
    element.type === 'image' || element.type === 'shape' || element.type === 'text';
  const canRound = element.type === 'image' || element.type === 'shape';

  return (
    <div className={styles.group}>
      {canOutline && (
        <>
          <p className={styles.groupTitle}>Outline</p>
          <SliderRow
            label="Thickness"
            value={Number(el.strokeWidth ?? 0)}
            min={0}
            max={40}
            step={1}
            format={(v) => (v > 0 ? `${Math.round(v)}px` : 'None')}
            onChange={(strokeWidth) =>
              // A width with no VISIBLE colour draws nothing, so the first drag
              // has to supply one — and dropping to zero clears both, so the
              // element goes back to carrying neither field.
              set(
                strokeWidth > 0
                  ? { strokeWidth, stroke: visibleStroke(el.stroke) ?? DEFAULT_STROKE }
                  : { strokeWidth: undefined, stroke: undefined },
              )
            }
          />
          {Number(el.strokeWidth ?? 0) > 0 && (
            <ColourPicker
              value={visibleStroke(el.stroke) ?? DEFAULT_STROKE}
              label="Outline colour"
              onChange={(stroke) => set({ stroke })}
            />
          )}
        </>
      )}

      {canRound && (
        <>
          <p className={styles.groupTitle}>Corners</p>
          <SliderRow
            label="Rounding"
            value={Number(el.cornerRadius ?? 0)}
            min={0}
            max={Math.round(Math.min(element.width, element.height) / 2)}
            step={1}
            format={(v) => (v > 0 ? `${Math.round(v)}px` : 'Square')}
            onChange={(cornerRadius) => set({ cornerRadius: cornerRadius || undefined })}
          />
        </>
      )}
    </div>
  );
}

/**
 * Crop, as four insets into the source image.
 *
 * `Crop` is FRACTIONS of the source (0..1), not pixels — which is what lets the
 * same crop survive the element being resized, and what both renderers already
 * read. The element's own box does not change, so cropping re-frames what is
 * inside it rather than shrinking it on the page.
 */
function CropMenu({ element, set }: { element: Element; set: Setter }) {
  const el = element as Record<string, unknown> & Element;
  const crop = (el.crop as { x: number; y: number; width: number; height: number } | undefined) ?? {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  };
  const write = (next: typeof crop) =>
    // Back to the whole picture means no `crop` key at all, so an image that has
    // never been cropped and one that has been reset are the same document.
    set({
      crop:
        next.x <= 0 && next.y <= 0 && next.width >= 1 && next.height >= 1 ? undefined : next,
    });

  const edge = (label: string, value: number, max: number, to: (v: number) => typeof crop) => (
    <SliderRow
      label={label}
      value={value}
      min={0}
      max={Math.max(0, max)}
      step={0.005}
      format={(v) => `${Math.round(v * 100)}%`}
      onChange={(v) => write(to(v))}
    />
  );

  return (
    <div className={styles.group}>
      {edge('From the left', crop.x, crop.x + crop.width - 0.05, (x) => ({
        ...crop,
        x,
        width: crop.x + crop.width - x,
      }))}
      {edge('From the right', 1 - (crop.x + crop.width), 1 - crop.x - 0.05, (v) => ({
        ...crop,
        width: 1 - v - crop.x,
      }))}
      {edge('From the top', crop.y, crop.y + crop.height - 0.05, (y) => ({
        ...crop,
        y,
        height: crop.y + crop.height - y,
      }))}
      {edge('From the bottom', 1 - (crop.y + crop.height), 1 - crop.y - 0.05, (v) => ({
        ...crop,
        height: 1 - v - crop.y,
      }))}
      {el.crop != null && (
        <div className={styles.menu}>
          <MenuItem onClick={() => set({ crop: undefined })}>Use the whole picture</MenuItem>
        </div>
      )}
      <p className={styles.empty}>
        The frame on the page stays where it is — cropping changes what sits inside it, not
        how much room it takes up.
      </p>
    </div>
  );
}

/**
 * Font family, searchable, and applied only once the face can actually render.
 */
function FontMenu({ value, onChange }: { value: string; onChange(family: string): void }) {
  const providers = useProviders();
  const provider = providers.get('fonts');
  const [items, setItems] = useState<FontItem[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!provider) return;
    let live = true;
    void provider.list({ query }).then((list) => {
      if (!live) return;
      setItems(list);
      // Preload so the menu previews in the real faces.
      list.slice(0, 12).forEach((f) => void provider.load(f.family, f.weights));
    });
    return () => {
      live = false;
    };
  }, [provider, query]);

  if (!provider) return null;

  /**
   * `GoogleFontProvider.load` short-circuits on any family it has already SEEN,
   * and this menu preloads its first dozen for the previews — so by the time one
   * is clicked, `load` resolves instantly while the stylesheet may still be in
   * flight. Konva measures text the moment the family changes, so it laid the
   * text out in the fallback face and only corrected on the next unrelated edit.
   * That is why applying a font appeared to take two steps.
   *
   * Awaiting `document.fonts.load` asks the browser about the REAL face rather
   * than trusting the provider's cache.
   */
  const apply = async (f: FontItem, close: () => void) => {
    setBusy(f.family);
    try {
      await provider.load(f.family, f.weights);
      if (typeof document !== 'undefined' && 'fonts' in document) {
        await Promise.all(
          (f.weights ?? [400]).map((w) =>
            document.fonts.load(`${w} 16px "${f.family}"`).catch(() => undefined),
          ),
        );
      }
      onChange(f.family);
    } finally {
      setBusy(null);
      close();
    }
  };

  return (
    <BarMenu label="Font" icon="fontFamily" value={value || 'Font'}>
      {(close) => (
        <div>
          <MenuSearch value={query} onChange={setQuery} placeholder="Search fonts" />
          <div className={styles.menu}>
            {items.length === 0 && <p className={styles.empty}>No fonts match that.</p>}
            {items.map((f) => (
              <MenuItem
                key={f.family}
                on={value === f.family}
                style={{ fontFamily: `"${f.family}", var(--w-body)`, fontSize: 15 }}
                onClick={() => void apply(f, close)}
              >
                {busy === f.family ? `${f.family}…` : f.family}
              </MenuItem>
            ))}
          </div>
        </div>
      )}
    </BarMenu>
  );
}
