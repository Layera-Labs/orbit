import { useRef, useState } from 'react';
import { useEditorState, useStore } from '../context';
import { Icon, type IconName } from '../components/Icon';
import { defineSection } from './types';

const typeIcon: Record<string, IconName> = {
  text: 'text', image: 'image', svg: 'shapes', shape: 'shapes',
  line: 'shapes', group: 'group', video: 'image', audio: 'palette',
};

/** How far the pointer travels before a press becomes a drag rather than a click. */
const DRAG_SLOP = 4;

function Panel() {
  const store = useStore();
  const state = useEditorState();
  const page = state.doc.pages.find((p) => p.id === state.activePageId) ?? state.doc.pages[0];
  const selection = state.selection as string[];
  /*
   * Displayed top-to-bottom as the canvas stacks them: the LAST child paints on
   * top, so it belongs at the top of this list. Every index below is a position
   * in this reversed view, and only `commit` converts back.
   */
  const rows = [...page.children].reverse();

  const canGroup = selection.length >= 2;
  const selectedIsGroup = selection.length === 1 && store.getElement(selection[0])?.type === 'group';

  /* `drag.to` is an INSERTION SLOT, 0..rows.length — the gap the row would land
     in, not the row it is over. */
  const [drag, setDrag] = useState<{ id: string; from: number; to: number } | null>(null);
  const pending = useRef<{ id: string; from: number; y: number } | null>(null);
  const rowEls = useRef<(HTMLDivElement | null)[]>([]);

  /** The gap nearest the pointer: before the first row whose midpoint it is above. */
  function slotAt(clientY: number): number {
    const els = rowEls.current;
    for (let i = 0; i < rows.length; i += 1) {
      const el = els[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return i;
    }
    return rows.length;
  }

  function commit(d: { id: string; from: number; to: number }) {
    /*
     * `to` counts gaps in the list AS IT STANDS, so a downward move has to lose
     * the slot the row itself is occupying. Then back out of the display
     * reversal: an element shown at display index `i` sits at `n - 1 - i` in
     * the array, and `moveElement` inserts into the array with the row already
     * removed — which is the same length, since it puts it straight back.
     */
    const dIdx = d.to > d.from ? d.to - 1 : d.to;
    if (dIdx === d.from) return;
    store.moveElement(d.id, page.children.length - 1 - dIdx);
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button className="o-ctl" data-active="false" style={{ flex: 1, border: '1px solid var(--o-border)', opacity: canGroup ? 1 : 0.4 }} disabled={!canGroup} onClick={() => store.group(selection)}>
          <Icon name="group" size={15} /> Group
        </button>
        <button className="o-ctl" style={{ flex: 1, border: '1px solid var(--o-border)', opacity: selectedIsGroup ? 1 : 0.4 }} disabled={!selectedIsGroup} onClick={() => store.ungroup(selection[0])}>
          Ungroup
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rows.map((el, i) => (
          <div
            key={el.id}
            ref={(node) => { rowEls.current[i] = node; }}
            className="o-layer"
            data-active={selection.includes(el.id) ? 'true' : 'false'}
            data-dragging={drag?.id === el.id ? 'true' : undefined}
            data-drop={drag && drag.id !== el.id ? (drag.to === i ? 'above' : drag.to === i + 1 ? 'below' : undefined) : undefined}
            tabIndex={0}
            aria-grabbed={drag?.id === el.id ? true : undefined}
            onClick={(e) => {
              // A press that turned into a drag is not also a click.
              if (drag) return;
              store.select([el.id], e.shiftKey || e.metaKey);
            }}
            onKeyDown={(e) => {
              // The same reorder without a pointer. Alt, so the arrows still
              // belong to the list itself.
              if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
              e.preventDefault();
              if (e.key === 'ArrowUp') store.bringForward(el.id);
              else store.sendBackward(el.id);
            }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              pending.current = { id: el.id, from: i, y: e.clientY };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const p = pending.current;
              if (!p) return;
              if (!drag && Math.abs(e.clientY - p.y) < DRAG_SLOP) return;
              setDrag({ id: p.id, from: p.from, to: slotAt(e.clientY) });
            }}
            onPointerUp={() => {
              pending.current = null;
              if (drag) commit(drag);
              // Cleared after the click handler has read it, on the next tick.
              setTimeout(() => setDrag(null), 0);
            }}
            onPointerCancel={() => { pending.current = null; setDrag(null); }}
          >
            {/*
              The type mark doubles as the grip. It is already the leftmost
              thing in the row, so it needs no extra control beside it — and
              giving it `touch-action: none` is what lets a touch drag start
              here while a touch anywhere else still scrolls the panel.
            */}
            <span className="o-layer-grip" aria-hidden="true"><Icon name={typeIcon[el.type] ?? 'shapes'} size={15} /></span>
            <span className="o-layer-name" style={{ color: el.visible === false ? 'var(--o-text-faint)' : 'var(--o-text)' }}>{el.name || el.type}</span>
            <button className="o-icon-btn" title="Visibility" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); store.updateElement(el.id, { visible: !(el.visible !== false) }); }}>
              <Icon name={el.visible === false ? 'eyeOff' : 'eye'} size={15} />
            </button>
            <button className="o-icon-btn" title="Lock" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); store.updateElement(el.id, { locked: !el.locked }); }}>
              <Icon name={el.locked ? 'lock' : 'unlock'} size={15} />
            </button>
            <button className="o-icon-btn" title="Delete" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); store.removeElement(el.id); }}>
              <Icon name="trash" size={15} />
            </button>
          </div>
        ))}
        {rows.length === 0 && <div className="o-hint" style={{ textAlign: 'center', padding: 16 }}>No layers yet.</div>}
      </div>
    </div>
  );
}

export const LayersSection = defineSection({ id: 'layers', label: 'Layers', icon: '', Panel });
