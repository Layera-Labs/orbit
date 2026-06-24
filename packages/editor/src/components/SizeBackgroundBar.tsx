import { useState } from 'react';
import { motion } from 'framer-motion';
import { useEditorState, useStore } from '../context';
import { Icon } from './Icon';
import { Popover } from './Popover';

const PRESETS: { label: string; w: number; h: number }[] = [
  { label: 'Instagram square', w: 1080, h: 1080 },
  { label: 'Instagram portrait', w: 1080, h: 1350 },
  { label: 'Story / Reels', w: 1080, h: 1920 },
  { label: 'X / Twitter post', w: 1200, h: 675 },
  { label: 'LinkedIn share', w: 1200, h: 627 },
  { label: 'YouTube thumbnail', w: 1280, h: 720 },
  { label: 'HD', w: 1920, h: 1080 },
  { label: 'Print A4 @300dpi', w: 2480, h: 3508 },
];

const SOLIDS = ['#ffffff', '#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8', '#1a1a1f', '#0f172a', '#1e40af', '#2563eb', '#16a34a', '#eab308', '#f97316', '#ef4444', '#d946ef', '#8b5cf6', '#6051f6', '#0ea5e9', '#14b8a6'];
const GRADIENTS = [
  'linear-gradient(135deg, #ff9a9e 0%, #fad0c4 100%)',
  'linear-gradient(135deg, #2193b0 0%, #6dd5ed 100%)',
  'linear-gradient(135deg, #232526 0%, #414345 100%)',
  'linear-gradient(135deg, #8e2de2 0%, #4a00e0 100%)',
  'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
  'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
];

export function SizeBackgroundBar() {
  const store = useStore();
  const state = useEditorState();
  const [tab, setTab] = useState<'solid' | 'gradient'>('solid');
  const page = state.doc.pages.find((p) => p.id === state.activePageId) ?? state.doc.pages[0];
  if (state.selection.length > 0) return null;
  const bgColor = page.background.type === 'solid' ? page.background.color : '#ffffff';

  return (
    <motion.div className="o-sizebar" onMouseDown={(e) => e.stopPropagation()} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
      <Popover className="o-ctl" title="Artboard size" trigger={<><Icon name="resize" size={16} /> {page.width}×{page.height}</>}>
        {(close) => (
          <div style={{ width: 240 }}>
            <div className="o-pop-head" style={{ marginBottom: 10 }}><span>Custom size</span></div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input className="o-num" style={{ flex: 1 }} type="number" value={page.width} onChange={(e) => store.resizePage(Number(e.target.value) || page.width, page.height)} />
              <span style={{ alignSelf: 'center', color: 'var(--o-text-faint)' }}>×</span>
              <input className="o-num" style={{ flex: 1 }} type="number" value={page.height} onChange={(e) => store.resizePage(page.width, Number(e.target.value) || page.height)} />
            </div>
            <div className="o-size-list">
              {PRESETS.map((p) => {
                const active = p.w === page.width && p.h === page.height;
                return (
                  <button key={p.label} data-active={active ? 'true' : 'false'} onClick={() => { store.resizePage(p.w, p.h); close(); }}>
                    <span>{p.label} ({p.w}×{p.h})</span>
                    {active && <span className="o-tag">CURRENT</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Popover>
      <div className="o-ctx-sep" />
      <Popover className="o-ctl" title="Background" align="right" trigger={<><span style={{ width: 16, height: 16, borderRadius: '50%', border: '1px solid var(--o-border-strong)', background: page.background.type === 'gradient' ? page.background.css : bgColor }} /> Background</>}>
        {() => (
          <div style={{ width: 280 }}>
            <div className="o-pop-tabs">
              <button className="o-pop-tab" data-active={tab === 'solid' ? 'true' : 'false'} onClick={() => setTab('solid')}>Solid</button>
              <button className="o-pop-tab" data-active={tab === 'gradient' ? 'true' : 'false'} onClick={() => setTab('gradient')}>Gradient</button>
            </div>
            {tab === 'solid' ? (
              <>
                <div className="o-pop-swatches">
                  {SOLIDS.map((c) => (
                    <button key={c} className="o-pop-swatch" data-active={bgColor === c ? 'true' : 'false'} style={{ background: c }} onClick={() => store.setBackground({ type: 'solid', color: c })} />
                  ))}
                </div>
                <div className="o-hex">
                  <input className="o-swatch" type="color" value={bgColor} onChange={(e) => store.setBackground({ type: 'solid', color: e.target.value })} />
                  <input value={bgColor} onChange={(e) => store.setBackground({ type: 'solid', color: e.target.value })} />
                </div>
              </>
            ) : (
              <div className="o-pop-swatches" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {GRADIENTS.map((g) => (
                  <button key={g} className="o-pop-swatch" style={{ borderRadius: 10, background: g }} onClick={() => store.setBackground({ type: 'gradient', css: g })} />
                ))}
              </div>
            )}
          </div>
        )}
      </Popover>
    </motion.div>
  );
}
