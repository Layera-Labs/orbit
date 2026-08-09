import { useEffect, useState } from 'react';
import { useSnapshot } from 'valtio';
import type { Element, ID, OrbitStore, Shadow } from '@layera-labs/model';
import { useProviders } from '../context';
import { Icon } from './Icon';
import { Popover, SliderRow } from './Popover';

const DEFAULT_SHADOW: Shadow = { color: '#000000', blur: 14, opacity: 0.35, offsetX: 6, offsetY: 6 };
const FALLBACK_FONTS = ['Inter', 'Roboto', 'Poppins', 'Montserrat', 'Playfair Display', 'Lora', 'Oswald', 'Bebas Neue', 'Dancing Script', 'Pacifico'];

export function OpacityControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Popover className="o-ctl" title="Opacity" trigger={<><Icon name="opacity" size={16} /> {Math.round(value * 100)}%</>}>
      {() => (
        <SliderRow label="Opacity" value={value} display={`${Math.round(value * 100)}%`} min={0} max={1} step={0.01} onChange={onChange} />
      )}
    </Popover>
  );
}

export function CornerRadiusControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Popover className="o-ctl" title="Corner radius" trigger={<><Icon name="corner" size={16} /> {Math.round(value)}px</>}>
      {() => (
        <SliderRow label="Corner radius" value={value} display={`${Math.round(value)}px`} min={0} max={200} onChange={onChange} />
      )}
    </Popover>
  );
}

export function ShadowControl({ store, id }: { store: OrbitStore; id: ID }) {
  const el = useSnapshot(store.getElement(id)!) as Element;
  const sh = el.shadow;
  const set = (patch: Partial<Shadow>) =>
    store.updateElement(id, { shadow: { ...(el.shadow ?? DEFAULT_SHADOW), ...patch } });
  return (
    <Popover className="o-ctl" title="Shadow" align="right" trigger={<><Icon name="shadow" size={16} /> {sh ? `${Math.round(sh.blur)}px` : '—'}</>}>
      {() => {
        const cur = el.shadow ?? DEFAULT_SHADOW;
        return (
          <div style={{ minWidth: 240 }}>
            <div className="o-pop-head" style={{ marginBottom: 12 }}>
              <span>Shadow</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }} className="o-val">
                Color
                <input className="o-swatch" type="color" value={cur.color} onChange={(e) => set({ color: e.target.value })} />
              </span>
            </div>
            <SliderRow label="Blur" value={cur.blur} display={`${Math.round(cur.blur)}px`} min={0} max={80} onChange={(v) => set({ blur: v })} />
            <SliderRow label="Opacity" value={cur.opacity} display={`${Math.round(cur.opacity * 100)}%`} min={0} max={1} step={0.01} onChange={(v) => set({ opacity: v })} />
            <SliderRow label="Offset X" value={cur.offsetX} display={`${Math.round(cur.offsetX)}px`} min={-60} max={60} onChange={(v) => set({ offsetX: v })} />
            <SliderRow label="Offset Y" value={cur.offsetY} display={`${Math.round(cur.offsetY)}px`} min={-60} max={60} onChange={(v) => set({ offsetY: v })} />
            {sh && (
              <button className="o-ctl" style={{ width: '100%', marginTop: 6, border: '1px solid var(--o-border)' }} onClick={() => store.updateElement(id, { shadow: undefined })}>
                Remove shadow
              </button>
            )}
          </div>
        );
      }}
    </Popover>
  );
}

export function SpacingControl({ store, id }: { store: OrbitStore; id: ID }) {
  const el = useSnapshot(store.getElement(id)!) as Extract<Element, { type: 'text' }>;
  return (
    <Popover className="o-ctl" title="Spacing" trigger={<Icon name="spacing" size={17} />}>
      {() => (
        <div style={{ minWidth: 240 }}>
          <SliderRow label="Letter spacing" value={el.letterSpacing ?? 0} display={`${Math.round(el.letterSpacing ?? 0)}px`} min={-10} max={40} onChange={(v) => store.updateElement(id, { letterSpacing: v })} />
          <SliderRow label="Line spacing" value={el.lineHeight ?? 1.2} display={`${(el.lineHeight ?? 1.2).toFixed(2)}x`} min={0.7} max={3} step={0.01} onChange={(v) => store.updateElement(id, { lineHeight: v })} />
        </div>
      )}
    </Popover>
  );
}

const CROP_ASPECTS: [string, number | null][] = [
  ['Original', null],
  ['Square 1:1', 1],
  ['Landscape 4:3', 4 / 3],
  ['Portrait 3:4', 3 / 4],
  ['Wide 16:9', 16 / 9],
  ['Tall 9:16', 9 / 16],
];

export function CropControl({ store, id }: { store: OrbitStore; id: ID }) {
  const el = useSnapshot(store.getElement(id)!) as Extract<Element, { type: 'image' }>;
  const apply = (aspect: number | null) => {
    if (aspect === null) {
      store.updateElement(id, { crop: undefined });
      return;
    }
    const srcAR = (el.naturalWidth || 1) / (el.naturalHeight || 1);
    let cw = 1;
    let ch = 1;
    if (aspect > srcAR) ch = srcAR / aspect;
    else cw = aspect / srcAR;
    store.updateElement(id, {
      crop: { x: (1 - cw) / 2, y: (1 - ch) / 2, width: cw, height: ch },
      height: Math.round(el.width / aspect),
    });
  };
  return (
    <Popover className="o-ctl" title="Crop" trigger={<><Icon name="crop" size={16} /> Crop</>}>
      {(close) => (
        <div style={{ minWidth: 170 }}>
          <div className="o-pop-head" style={{ marginBottom: 8 }}><span>Crop to ratio</span></div>
          {CROP_ASPECTS.map(([label, a]) => (
            <button
              key={label}
              className="o-ctl"
              style={{ width: '100%', justifyContent: 'flex-start', height: 34 }}
              onClick={() => { apply(a); close(); }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}

export function FontControl({ store, id, family }: { store: OrbitStore; id: ID; family: string }) {
  const providers = useProviders();
  const [fonts, setFonts] = useState<string[]>(FALLBACK_FONTS);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const fp = providers.get('fonts');
    if (!fp) return;
    fp.list().then((list) => {
      setFonts(list.map((f) => f.family));
      list.slice(0, 16).forEach((f) => void fp.load(f.family, f.weights));
    });
  }, [providers]);

  const filtered = query ? fonts.filter((f) => f.toLowerCase().includes(query.toLowerCase())) : fonts;

  return (
    <Popover className="o-ctl" title="Font" trigger={<span style={{ fontFamily: `"${family}", sans-serif`, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis' }}>{family}</span>}>
      {(close) => (
        <div style={{ width: 260 }}>
          <div className="o-search" style={{ marginBottom: 8 }}>
            <Icon name="search" size={15} />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search fonts…" />
          </div>
          <div className="o-font-list">
            {filtered.slice(0, 120).map((f) => (
              <button
                key={f}
                className="o-font-item"
                style={{ fontFamily: `"${f}", sans-serif` }}
                onMouseEnter={() => providers.get('fonts')?.load(f)}
                onClick={() => {
                  providers.get('fonts')?.load(f);
                  store.updateElement(id, { fontFamily: f });
                  close();
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      )}
    </Popover>
  );
}
