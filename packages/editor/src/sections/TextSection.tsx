import type { NewElement } from '@orbit/model';
import { useStore } from '../context';
import { defineSection } from './types';

const presets: { label: string; size: number; weight: number; make: () => NewElement }[] = [
  { label: 'Add a heading', size: 22, weight: 700, make: () => ({ type: 'text', text: 'Heading', fontSize: 72, fontWeight: 700, width: 600, height: 96 }) },
  { label: 'Add a subheading', size: 17, weight: 600, make: () => ({ type: 'text', text: 'Subheading', fontSize: 48, fontWeight: 600, width: 480, height: 64 }) },
  { label: 'Add body text', size: 14, weight: 400, make: () => ({ type: 'text', text: 'Body text', fontSize: 28, fontWeight: 400, width: 380, height: 40 }) },
];

function Panel() {
  const store = useStore();
  const add = (make: () => NewElement) => {
    const page = store.activePage;
    const p = make();
    store.addElement({ ...p, x: Math.round((page.width - (p.width ?? 100)) / 2), y: Math.round((page.height - (p.height ?? 100)) / 2) });
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {presets.map((p) => (
        <button
          key={p.label}
          className="o-tile"
          style={{ aspectRatio: 'auto', padding: '16px 14px', alignItems: 'flex-start', fontSize: p.size, fontWeight: p.weight, color: 'var(--o-text)' }}
          onClick={() => add(p.make)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

export const TextSection = defineSection({ id: 'text', label: 'Text', icon: '', Panel });
