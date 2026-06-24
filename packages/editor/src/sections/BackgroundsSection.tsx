import { useEffect, useState } from 'react';
import type { BackgroundItem } from '@orbit/providers';
import { useProviders, useStore } from '../context';
import { defineSection } from './types';

function Panel() {
  const providers = useProviders();
  const store = useStore();
  const provider = providers.get('backgrounds');
  const [items, setItems] = useState<BackgroundItem[]>([]);

  useEffect(() => {
    if (!provider) return;
    provider.list().then(setItems);
  }, [provider]);

  const apply = (item: BackgroundItem) => {
    if (item.type === 'gradient') store.setBackground({ type: 'gradient', css: item.value });
    else if (item.type === 'image') store.setBackground({ type: 'image', src: item.value });
    else store.setBackground({ type: 'solid', color: item.value });
  };

  const solids = items.filter((i) => i.type === 'solid');
  const gradients = items.filter((i) => i.type === 'gradient');

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text-muted)', margin: '4px 0 8px' }}>Solid</div>
      <div className="o-grid-3">
        {solids.map((item) => (
          <button key={item.id} onClick={() => apply(item)} title={item.value}
            style={{ aspectRatio: '1', borderRadius: 'var(--o-radius-sm)', border: '1px solid var(--o-border)', cursor: 'pointer', background: item.value }} />
        ))}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text-muted)', margin: '16px 0 8px' }}>Gradient</div>
      <div className="o-grid-3">
        {gradients.map((item) => (
          <button key={item.id} onClick={() => apply(item)} title={item.value}
            style={{ aspectRatio: '1', borderRadius: 'var(--o-radius-sm)', border: '1px solid var(--o-border)', cursor: 'pointer', background: item.thumbnail ?? item.value }} />
        ))}
      </div>
    </div>
  );
}

export const BackgroundsSection = defineSection({
  id: 'backgrounds', label: 'Background', icon: '', Panel,
  visible: ({ hasProvider }) => hasProvider('backgrounds'),
});
