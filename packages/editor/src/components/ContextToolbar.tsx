import { motion } from 'framer-motion';
import { useSnapshot } from 'valtio';
import type { Element, ID, OrbitStore } from '@layera-labs/model';
import { useEditorState, useStore } from '../context';
import { Icon } from './Icon';
import {
  CornerRadiusControl,
  CropControl,
  FontControl,
  OpacityControl,
  ShadowControl,
  SpacingControl,
} from './ToolbarControls';

function Sep() {
  return <div className="o-ctx-sep" />;
}

function TextControls({ store, id }: { store: OrbitStore; id: ID }) {
  const el = useSnapshot(store.getElement(id)!) as Extract<Element, { type: 'text' }>;
  const up = (p: Partial<Element>) => store.updateElement(id, p);
  const aligns = ['left', 'center', 'right'] as const;
  const alignIcon = { left: 'alignLeft', center: 'alignCenter', right: 'alignRight' } as const;
  const next = aligns[(aligns.indexOf(el.align as 'left') + 1) % 3];
  return (
    <>
      <FontControl store={store} id={id} family={el.fontFamily} />
      <input className="o-num" type="number" value={Math.round(el.fontSize)} onChange={(e) => up({ fontSize: Math.max(4, Number(e.target.value)) })} />
      <SpacingControl store={store} id={id} />
      <input className="o-swatch" type="color" value={el.fill} onChange={(e) => up({ fill: e.target.value })} />
      <button className="o-ctl" title={`Align ${el.align}`} onClick={() => up({ align: next })}>
        <Icon name={alignIcon[el.align as 'left'] ?? 'alignLeft'} size={17} />
      </button>
      <Sep />
      <button className="o-ctl" data-active={el.fontWeight >= 600 ? 'true' : 'false'} title="Bold" onClick={() => up({ fontWeight: el.fontWeight >= 600 ? 400 : 700 })}>
        <Icon name="bold" size={17} />
      </button>
      <button className="o-ctl" data-active={el.fontStyle === 'italic' ? 'true' : 'false'} title="Italic" onClick={() => up({ fontStyle: el.fontStyle === 'italic' ? 'normal' : 'italic' })}>
        <Icon name="italic" size={17} />
      </button>
      <button className="o-ctl" data-active={el.underline ? 'true' : 'false'} title="Underline" onClick={() => up({ underline: !el.underline })}>
        <Icon name="underline" size={17} />
      </button>
      <Sep />
      <OpacityControl value={el.opacity} onChange={(v) => up({ opacity: v })} />
      <ShadowControl store={store} id={id} />
    </>
  );
}

function ShapeControls({ store, id }: { store: OrbitStore; id: ID }) {
  const el = useSnapshot(store.getElement(id)!) as Extract<Element, { type: 'shape' }>;
  const up = (p: Partial<Element>) => store.updateElement(id, p);
  return (
    <>
      <input className="o-swatch" type="color" title="Fill" value={el.fill} onChange={(e) => up({ fill: e.target.value })} />
      {el.shape === 'rect' && <CornerRadiusControl value={el.cornerRadius ?? 0} onChange={(v) => up({ cornerRadius: v })} />}
      <Sep />
      <input className="o-swatch" type="color" title="Stroke" value={el.stroke === 'transparent' ? '#000000' : el.stroke} onChange={(e) => up({ stroke: e.target.value })} />
      <input className="o-num" type="number" title="Stroke width" value={Math.round(el.strokeWidth)} onChange={(e) => up({ strokeWidth: Math.max(0, Number(e.target.value)) })} />
      <Sep />
      <OpacityControl value={el.opacity} onChange={(v) => up({ opacity: v })} />
      <ShadowControl store={store} id={id} />
    </>
  );
}

function ImageControls({ store, id }: { store: OrbitStore; id: ID }) {
  const el = useSnapshot(store.getElement(id)!) as Extract<Element, { type: 'image' }>;
  const up = (p: Partial<Element>) => store.updateElement(id, p);
  return (
    <>
      <CropControl store={store} id={id} />
      <Sep />
      <CornerRadiusControl value={el.cornerRadius ?? 0} onChange={(v) => up({ cornerRadius: v })} />
      <input
        className="o-swatch"
        type="color"
        title="Border color"
        value={el.stroke && el.stroke !== 'transparent' ? el.stroke : '#000000'}
        onChange={(e) => up({ stroke: e.target.value, strokeWidth: el.strokeWidth || 4 })}
      />
      <input
        className="o-num"
        type="number"
        title="Border width"
        value={Math.round(el.strokeWidth ?? 0)}
        onChange={(e) => up({ strokeWidth: Math.max(0, Number(e.target.value)) })}
      />
      <Sep />
      <OpacityControl value={el.opacity} onChange={(v) => up({ opacity: v })} />
      <ShadowControl store={store} id={id} />
    </>
  );
}

function LineControls({ store, id }: { store: OrbitStore; id: ID }) {
  const el = useSnapshot(store.getElement(id)!) as Extract<Element, { type: 'line' }>;
  const up = (p: Partial<Element>) => store.updateElement(id, p);
  return (
    <>
      <input className="o-swatch" type="color" title="Color" value={el.stroke} onChange={(e) => up({ stroke: e.target.value })} />
      <input className="o-num" type="number" title="Width" value={Math.round(el.strokeWidth)} onChange={(e) => up({ strokeWidth: Math.max(1, Number(e.target.value)) })} />
      <button className="o-ctl" data-active={el.arrow ? 'true' : 'false'} title="Arrow" onClick={() => up({ arrow: !el.arrow })}>
        <Icon name="arrow" size={17} />
      </button>
      <Sep />
      <OpacityControl value={el.opacity} onChange={(v) => up({ opacity: v })} />
    </>
  );
}

function GenericControls({ store, id }: { store: OrbitStore; id: ID }) {
  const el = useSnapshot(store.getElement(id)!) as Element;
  return <OpacityControl value={el.opacity} onChange={(v) => store.updateElement(id, { opacity: v })} />;
}

export function ContextToolbar() {
  const store = useStore();
  const state = useEditorState();
  const id = state.selection[0] as ID | undefined;
  const el = id ? store.getElement(id) : null;
  if (!el) return null;

  let controls: React.ReactNode;
  switch (el.type) {
    case 'text': controls = <TextControls store={store} id={el.id} />; break;
    case 'shape': controls = <ShapeControls store={store} id={el.id} />; break;
    case 'image': controls = <ImageControls store={store} id={el.id} />; break;
    case 'line': controls = <LineControls store={store} id={el.id} />; break;
    default: controls = <GenericControls store={store} id={el.id} />;
  }

  return (
    <motion.div
      className="o-ctx"
      onMouseDown={(e) => e.stopPropagation()}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      {controls}
    </motion.div>
  );
}
