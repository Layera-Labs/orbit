import type { CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { useEditorState, useStore } from '../context';
import { Icon } from './Icon';
import { Popover } from './Popover';

const ALIGN: { label: string; edge: Parameters<ReturnType<typeof useStore>['alignToPage']>[1]; icon: 'alignLeft' | 'alignCenter' | 'alignRight' }[] = [
  { label: 'Left', edge: 'left', icon: 'alignLeft' },
  { label: 'Center horizontally', edge: 'center-h', icon: 'alignCenter' },
  { label: 'Right', edge: 'right', icon: 'alignRight' },
  { label: 'Top', edge: 'top', icon: 'alignLeft' },
  { label: 'Center vertically', edge: 'center-v', icon: 'alignCenter' },
  { label: 'Bottom', edge: 'bottom', icon: 'alignRight' },
];

const DISTRIBUTE: { label: string; axis: Parameters<ReturnType<typeof useStore>['distribute']>[1]; icon: 'distributeH' | 'distributeV' }[] = [
  { label: 'Distribute horizontally', axis: 'horizontal', icon: 'distributeH' },
  { label: 'Distribute vertically', axis: 'vertical', icon: 'distributeV' },
];

const GROUP_LABEL: CSSProperties = {
  fontSize: 11,
  color: 'var(--o-text-faint)',
  padding: '4px 10px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

export function SelectionActions() {
  const store = useStore();
  const state = useEditorState();
  const sel = state.selection as string[];
  if (sel.length === 0) return null;

  const boxes = sel.map((id) => store.getElement(id)).filter(Boolean) as { x: number; y: number; width: number; height: number }[];
  if (boxes.length === 0) return null;

  const minX = Math.min(...boxes.map((b) => b.x));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const minY = Math.min(...boxes.map((b) => b.y));
  const { zoom, x: panX, y: panY } = state.viewport;

  const left = panX + ((minX + maxX) / 2) * zoom;
  const top = Math.max(6, panY + minY * zoom - 48);

  const id = sel[0];
  const locked = store.getElement(id)?.locked;
  // Ungroup applies to a lone group, not to a multi-selection that happens to
  // contain one — `ungroup` takes a single id and would silently ignore the rest.
  const isGroup = sel.length === 1 && store.getElement(id)?.type === 'group';

  return (
    <motion.div className="o-sel-actions" style={{ left, top }} onMouseDown={(e) => e.stopPropagation()} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.14 }}>
      <button title="Duplicate" onClick={() => sel.forEach((s) => store.duplicateElement(s))}>
        <Icon name="copy" size={16} />
      </button>
      <button title={locked ? 'Unlock' : 'Lock'} onClick={() => sel.forEach((s) => store.updateElement(s, { locked: !locked }))}>
        <Icon name={locked ? 'lock' : 'unlock'} size={16} />
      </button>
      <button title="Delete" onClick={() => store.transaction(() => sel.forEach((s) => store.removeElement(s)))}>
        <Icon name="trash" size={16} />
      </button>
      <div className="o-ctx-sep" />
      <div className="o-sel-more" style={{ position: 'relative' }}>
        <Popover className="o-sel-trigger" trigger={<Icon name="dots" size={16} />} title="More">
          {(close) => (
            <div className="o-sel-menu" style={{ position: 'static', boxShadow: 'none', border: 'none', padding: 0, minWidth: 0 }}>
              <div style={GROUP_LABEL}>Align to page</div>
              {ALIGN.map((a) => (
                <button key={`page-${a.edge}`} onClick={() => { store.alignToPage(sel, a.edge); close(); }}>
                  <Icon name={a.icon} size={15} /> {a.label}
                </button>
              ))}
              {sel.length >= 2 && (
                <>
                  <div style={GROUP_LABEL}>Align selected</div>
                  {ALIGN.map((a) => (
                    <button key={`sel-${a.edge}`} onClick={() => { store.alignSelection(sel, a.edge); close(); }}>
                      <Icon name={a.icon} size={15} /> {a.label}
                    </button>
                  ))}
                </>
              )}
              {sel.length >= 3 && (
                <>
                  <div style={GROUP_LABEL}>Distribute</div>
                  {DISTRIBUTE.map((d) => (
                    <button key={d.axis} onClick={() => { store.distribute(sel, d.axis); close(); }}>
                      <Icon name={d.icon} size={15} /> {d.label}
                    </button>
                  ))}
                </>
              )}
              {/*
                Grouping. `group` and `ungroup` have been on the store since it
                was written and nothing anywhere called them, so a document
                could hold a group (from a template, or another client) that the
                editor could show but never take apart.

                Each is offered only when it can actually do something: grouping
                needs two elements, ungrouping needs the selection to BE a
                group. An item that appears and then no-ops is worse than one
                that is absent.
              */}
              {(sel.length >= 2 || isGroup) && <div style={GROUP_LABEL}>Group</div>}
              {sel.length >= 2 && (
                <button onClick={() => { store.group(sel); close(); }}>
                  <Icon name="group" size={15} /> Group these
                </button>
              )}
              {isGroup && (
                <button onClick={() => { store.ungroup(id); close(); }}>
                  <Icon name="group" size={15} /> Ungroup
                </button>
              )}
            </div>
          )}
        </Popover>
      </div>
    </motion.div>
  );
}
