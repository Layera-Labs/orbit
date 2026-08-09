import type { NewElement } from '@layera-labs/model';
import { useStore } from '../context';
import { defineSection } from './types';

const shapes: { label: string; preview: React.ReactNode; make: () => NewElement }[] = [
  { label: 'Rectangle', preview: <rect x="6" y="10" width="28" height="20" rx="3" />, make: () => ({ type: 'shape', shape: 'rect', width: 220, height: 150, fill: '#6051f6' }) },
  { label: 'Circle', preview: <circle cx="20" cy="20" r="13" />, make: () => ({ type: 'shape', shape: 'ellipse', width: 180, height: 180, fill: '#0ea5e9' }) },
  { label: 'Triangle', preview: <path d="M20 7 33 32H7z" />, make: () => ({ type: 'shape', shape: 'triangle', width: 190, height: 170, fill: '#f59e0b' }) },
  { label: 'Star', preview: <path d="m20 6 4 9 10 1-7.5 6.5L29 33l-9-5-9 5 2.5-10.5L6 16l10-1z" />, make: () => ({ type: 'shape', shape: 'star', width: 180, height: 180, fill: '#ec4899', points: 5 }) },
  { label: 'Polygon', preview: <path d="M20 6 33 13v14L20 34 7 27V13z" />, make: () => ({ type: 'shape', shape: 'polygon', width: 180, height: 180, fill: '#10b981', points: 6 }) },
  { label: 'Line', preview: <path d="M7 28 33 12" strokeWidth="3" />, make: () => ({ type: 'line', points: [0, 0, 220, 0], width: 220, height: 4, stroke: '#1a1a1f', strokeWidth: 4 }) },
];

function Panel() {
  const store = useStore();
  const add = (make: () => NewElement) => {
    const page = store.activePage;
    const p = make();
    store.addElement({ ...p, x: Math.round((page.width - (p.width ?? 100)) / 2), y: Math.round((page.height - (p.height ?? 100)) / 2) });
  };
  return (
    <div className="o-grid-2">
      {shapes.map((s) => (
        <button key={s.label} className="o-tile" onClick={() => add(s.make)}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="currentColor" stroke="currentColor" strokeLinejoin="round">
            {s.preview}
          </svg>
          {s.label}
        </button>
      ))}
    </div>
  );
}

export const ElementsSection = defineSection({ id: 'elements', label: 'Elements', icon: '', Panel });
