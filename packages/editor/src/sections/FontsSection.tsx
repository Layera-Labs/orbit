import { useEffect, useState } from 'react';
import type { FontItem } from '@orbit/providers';
import { useEditorState, useProviders, useStore } from '../context';
import { Icon } from '../components/Icon';
import { defineSection } from './types';

function Panel() {
  const providers = useProviders();
  const store = useStore();
  const state = useEditorState();
  const provider = providers.get('fonts');
  const [items, setItems] = useState<FontItem[]>([]);
  const [query, setQuery] = useState('');

  const selectedId = state.selection[0] as string | undefined;
  const selected = selectedId ? store.getElement(selectedId) : null;
  const isText = selected?.type === 'text';

  useEffect(() => {
    if (!provider) return;
    provider.list({ query }).then(async (list) => {
      setItems(list);
      list.slice(0, 16).forEach((f) => void provider.load(f.family, f.weights));
    });
  }, [provider, query]);

  const apply = async (f: FontItem) => {
    await provider?.load(f.family, f.weights);
    if (isText && selectedId) store.updateElement(selectedId, { fontFamily: f.family });
  };

  return (
    <div>
      {!isText && <div className="o-hint" style={{ marginTop: 0, marginBottom: 10 }}>Select a text element to apply a font.</div>}
      <div className="o-search">
        <Icon name="search" size={16} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search fonts…" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((f) => (
          <button key={f.family} onClick={() => apply(f)}
            style={{ textAlign: 'left', padding: '12px 14px', border: '1px solid var(--o-border)', borderRadius: 'var(--o-radius-sm)', background: 'var(--o-surface)', cursor: 'pointer', fontFamily: `"${f.family}", sans-serif`, fontSize: 18, color: 'var(--o-text)' }}>
            {f.family}
          </button>
        ))}
      </div>
    </div>
  );
}

export const FontsSection = defineSection({
  id: 'fonts', label: 'Fonts', icon: '', Panel,
  visible: ({ hasProvider }) => hasProvider('fonts'),
});
