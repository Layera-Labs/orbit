import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useProviders } from '../context';
import type { SectionDef } from '../sections/types';
import { Icon, type IconName } from './Icon';

const ICONS: Record<string, IconName> = {
  templates: 'template',
  elements: 'shapes',
  text: 'text',
  photos: 'image',
  backgrounds: 'palette',
  fonts: 'font',
  layers: 'layers',
  uploads: 'upload',
};

const SUBTITLES: Record<string, string> = {
  photos: 'Powered by your provider',
  templates: 'Ready-made designs',
  fonts: 'Click to apply to text',
};

export function SidePanel({ sections }: { sections: SectionDef[] }) {
  const providers = useProviders();
  const hasProvider = (kind: string) => providers.has(kind as never);
  const visibleSections = sections.filter((s) => (s.visible ? s.visible({ hasProvider }) : true));

  const [activeId, setActiveId] = useState<string | null>(visibleSections[0]?.id ?? null);
  const active = visibleSections.find((s) => s.id === activeId) ?? null;

  return (
    <>
      <div className="o-rail">
        {visibleSections.map((s) => (
          <motion.button
            key={s.id}
            className="o-rail-item"
            data-active={s.id === activeId ? 'true' : 'false'}
            onClick={() => setActiveId(s.id === activeId ? null : s.id)}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 500, damping: 28 }}
          >
            <Icon name={ICONS[s.id] ?? 'shapes'} size={20} />
            {s.label}
          </motion.button>
        ))}
      </div>
      <AnimatePresence mode="popLayout">
        {active && (
          <motion.div
            key={active.id}
            className="o-drawer"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ type: 'spring', stiffness: 480, damping: 36, mass: 0.7 }}
          >
            <div className="o-drawer-head">
              <div>
                <div className="o-drawer-title">{active.label}</div>
                {SUBTITLES[active.id] && <div className="o-drawer-sub">{SUBTITLES[active.id]}</div>}
              </div>
              <button className="o-icon-btn" onClick={() => setActiveId(null)} title="Close">
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="o-drawer-body">
              <active.Panel />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
