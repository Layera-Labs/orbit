import { useState } from 'react';
import { motion } from 'framer-motion';
import { PagePreview } from '@orbit/render';
import type { Page } from '@orbit/model';
import { useEditorState, useStore } from '../context';
import { Icon } from './Icon';

type Orient = 'horizontal' | 'vertical';

function loadOrient(): Orient {
  try {
    const v = localStorage.getItem('orbit-pages-orient');
    if (v === 'horizontal' || v === 'vertical') return v;
  } catch {
    /* ignore */
  }
  return 'horizontal';
}

function PageCard({
  page,
  index,
  active,
  orient,
  canDelete,
}: {
  page: Page;
  index: number;
  active: boolean;
  orient: Orient;
  canDelete: boolean;
}) {
  const store = useStore();
  const aspect = page.width / page.height;
  const previewW =
    orient === 'horizontal'
      ? Math.max(34, Math.min(110, 60 * aspect))
      : Math.min(116, 116);

  return (
    <div
      className="o-page-card"
      data-active={active ? 'true' : 'false'}
      onClick={() => store.setActivePage(page.id)}
      title={`Page ${index + 1}`}
    >
      <PagePreview page={page} width={previewW} />
      <span className="o-page-num">{index + 1}</span>
      <div className="o-page-card-actions">
        <button
          title="Duplicate"
          onClick={(e) => {
            e.stopPropagation();
            store.duplicatePage(page.id);
          }}
        >
          <Icon name="copy" size={12} />
        </button>
        {canDelete && (
          <button
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              store.deletePage(page.id);
            }}
          >
            <Icon name="trash" size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

export function PagesPanel() {
  const store = useStore();
  const state = useEditorState();
  const pages = state.doc.pages as unknown as Page[];
  const activeIdx = pages.findIndex((p) => p.id === state.activePageId);
  const [orient, setOrient] = useState<Orient>(loadOrient);

  const toggle = () => {
    setOrient((o) => {
      const next = o === 'horizontal' ? 'vertical' : 'horizontal';
      try {
        localStorage.setItem('orbit-pages-orient', next);
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <motion.div
      className="o-pages-strip"
      data-orient={orient}
      onMouseDown={(e) => e.stopPropagation()}
      initial={{ opacity: 0, y: orient === 'horizontal' ? 10 : 0, x: orient === 'vertical' ? 10 : 0 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      <button className="o-icon-btn o-pages-toggle" onClick={toggle} title="Toggle page layout">
        <Icon name={orient === 'horizontal' ? 'stripV' : 'stripH'} size={16} />
      </button>
      {pages.map((p, i) => (
        <PageCard
          key={p.id}
          page={p}
          index={i}
          active={p.id === state.activePageId}
          orient={orient}
          canDelete={pages.length > 1}
        />
      ))}
      <button className="o-page-add-btn" onClick={() => store.addPage()} title="Add page">
        <Icon name="plus" size={18} />
      </button>
      <span className="o-pages-count">
        {activeIdx + 1} / {pages.length}
      </span>
    </motion.div>
  );
}
