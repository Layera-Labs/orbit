import { useEffect, useState } from 'react';
import type { TemplateSummary } from '@orbit/providers';
import { useProviders, useStore } from '../context';
import { defineSection } from './types';

function Panel() {
  const providers = useProviders();
  const store = useStore();
  const provider = providers.get('templates');
  const [items, setItems] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!provider) return;
    setLoading(true);
    provider.list().then(setItems).finally(() => setLoading(false));
  }, [provider]);

  const apply = async (id: string) => {
    if (!provider) return;
    store.loadJSON(await provider.getDocument(id));
  };

  return (
    <div>
      {loading && <div className="o-hint">Loading…</div>}
      <div className="o-grid-2">
        {items.map((t) => (
          <div key={t.id} className="o-thumb" title={t.name} onClick={() => apply(t.id)}>
            <img src={t.thumbnail} alt={t.name} style={{ aspectRatio: `${t.width} / ${t.height}`, objectFit: 'cover' }} />
            <div style={{ fontSize: 11, padding: '6px 8px', color: 'var(--o-text-muted)' }}>{t.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const TemplatesSection = defineSection({
  id: 'templates', label: 'Templates', icon: '', Panel,
  visible: ({ hasProvider }) => hasProvider('templates'),
});
