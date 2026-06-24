import { useEditorState, useStore } from '../context';
import { Icon, type IconName } from '../components/Icon';
import { defineSection } from './types';

const typeIcon: Record<string, IconName> = {
  text: 'text', image: 'image', svg: 'shapes', shape: 'shapes',
  line: 'shapes', group: 'group', video: 'image', audio: 'palette',
};

function Panel() {
  const store = useStore();
  const state = useEditorState();
  const page = state.doc.pages.find((p) => p.id === state.activePageId) ?? state.doc.pages[0];
  const selection = state.selection as string[];
  const rows = [...page.children].reverse();

  const canGroup = selection.length >= 2;
  const selectedIsGroup = selection.length === 1 && store.getElement(selection[0])?.type === 'group';

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
        {rows.map((el) => (
          <div key={el.id} className="o-layer" data-active={selection.includes(el.id) ? 'true' : 'false'} onClick={(e) => store.select([el.id], e.shiftKey || e.metaKey)}>
            <span style={{ color: 'var(--o-text-muted)', display: 'flex' }}><Icon name={typeIcon[el.type] ?? 'shapes'} size={15} /></span>
            <span className="o-layer-name" style={{ color: el.visible === false ? 'var(--o-text-faint)' : 'var(--o-text)' }}>{el.name || el.type}</span>
            <button className="o-icon-btn" title="Visibility" onClick={(e) => { e.stopPropagation(); store.updateElement(el.id, { visible: !(el.visible !== false) }); }}>
              <Icon name={el.visible === false ? 'eyeOff' : 'eye'} size={15} />
            </button>
            <button className="o-icon-btn" title="Lock" onClick={(e) => { e.stopPropagation(); store.updateElement(el.id, { locked: !el.locked }); }}>
              <Icon name={el.locked ? 'lock' : 'unlock'} size={15} />
            </button>
            <button className="o-icon-btn" title="Delete" onClick={(e) => { e.stopPropagation(); store.removeElement(el.id); }}>
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
