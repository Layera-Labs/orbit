/**
 * HistoryPanel - Visual undo/redo history list
 */
import * as React from 'react';
import { useEffect, useState } from 'react';
import type { OrbitEngine } from '@layera-labs/core';

interface HistoryPanelProps {
  engine: OrbitEngine | null;
}

interface HistoryEntry {
  id: string;
  label: string;
  timestamp: number;
  index: number;
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({ engine }) => {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  useEffect(() => {
    if (!engine) return;

    const unsubscribe = engine.history.subscribe(() => {
      const history = engine.history.getHistory();
      const all: HistoryEntry[] = [];
      let idx = 0;
      history.past.forEach((label) => {
        all.push({ id: `${idx}`, label: label || 'Action', timestamp: Date.now(), index: idx });
        idx++;
      });
      setCurrentIndex(history.past.length - 1);
      setEntries(all);
    });

    return () => unsubscribe();
  }, [engine]);

  const jumpTo = (targetIndex: number) => {
    if (!engine) return;
    const diff = targetIndex - currentIndex;
    if (diff > 0) {
      for (let i = 0; i < diff; i++) engine.redo();
    } else if (diff < 0) {
      for (let i = 0; i < Math.abs(diff); i++) engine.undo();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-orbit-md py-orbit-sm text-xs font-medium text-orbit-text-secondary uppercase tracking-wider border-b border-orbit-border">
        History
      </div>
      <div className="flex-1 overflow-auto py-1">
        {entries.length === 0 && (
          <div className="px-orbit-md py-orbit-sm text-xs text-orbit-text-tertiary">
            No history yet
          </div>
        )}
        {entries.map((entry, i) => (
          <button
            key={entry.id}
            onClick={() => jumpTo(i)}
            className={`
              flex w-full items-center gap-2 px-orbit-md py-orbit-sm text-left text-xs transition-colors
              ${i === currentIndex ? 'bg-orbit-selected text-orbit-text' : 'text-orbit-text-secondary hover:bg-orbit-hover'}
            `}
          >
            <span className="text-[10px] opacity-50 w-4">{i + 1}</span>
            <span className="truncate">{entry.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
