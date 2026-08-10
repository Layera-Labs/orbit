import { useEffect, useRef, useState } from 'react';
import type { Photo } from '@layera-labs/orbit-providers';
import { useProviders, useStore } from '../context';
import { Icon } from '../components/Icon';
import { defineSection } from './types';

function Panel() {
  const providers = useProviders();
  const store = useStore();
  const provider = providers.get('photos');
  const [query, setQuery] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!provider) return;
    setLoading(true);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        setPhotos(await provider.search(query, { perPage: 24 }));
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(debounce.current);
  }, [query, provider]);

  const addPhoto = (p: Photo) => {
    const page = store.activePage;
    const maxW = page.width * 0.7;
    const ratio = p.height / p.width || 1;
    const w = Math.min(maxW, p.width);
    const h = w * ratio;
    store.addElement({
      type: 'image', src: p.src, naturalWidth: p.width, naturalHeight: p.height,
      width: Math.round(w), height: Math.round(h),
      x: Math.round((page.width - w) / 2), y: Math.round((page.height - h) / 2),
      assetRef: { provider: provider!.id, id: p.id },
    });
  };

  /*
   * With no photo provider registered the effect never runs, so the field sat
   * there searching nothing, forever, with no results and no explanation. Say
   * so instead — and do not render a search box that cannot search.
   */
  if (!provider) {
    return (
      <div className="o-hint" style={{ padding: 16, textAlign: 'center', lineHeight: 1.5 }}>
        No photo provider is registered, so there is nothing to search. Pass one to the
        editor’s <code>providers</code> to turn this panel on.
      </div>
    );
  }

  return (
    <div>
      <div className="o-search">
        <Icon name="search" size={16} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search photos…" />
      </div>
      {loading && <div className="o-hint">Searching…</div>}
      {!loading && photos.length === 0 && (
        <div className="o-hint" style={{ padding: 16, textAlign: 'center' }}>
          {query ? `Nothing matched “${query}”.` : 'No photos came back.'}
        </div>
      )}
      <div className="o-grid-2">
        {photos.map((p) => (
          <div key={p.id} className="o-thumb" style={{ aspectRatio: '1' }} onClick={() => addPhoto(p)}>
            <img src={p.thumbnail} alt={p.alt ?? ''} style={{ height: '100%', objectFit: 'cover' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export const PhotosSection = defineSection({
  id: 'photos', label: 'Photos', icon: '', Panel,
  visible: ({ hasProvider }) => hasProvider('photos'),
});
