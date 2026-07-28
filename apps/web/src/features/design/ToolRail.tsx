'use client';

import type { IconName } from '@/brand/Icon';
import { Icon } from '@/brand/Icon';
import type { ProjectKind } from '@/db/schema';
import { useDesign, type ToolId } from '@/store/designStore';
import styles from './Design.module.css';

export interface ToolSection {
  id: ToolId;
  label: string;
  icon: IconName;
  kinds: ProjectKind[];
  /** Draw a rule above this item to group the rail. */
  gapBefore?: boolean;
}

/**
 * The rail, in document order. A still and a video share most of it — what
 * differs is that motion adds the four sections that only mean something on a
 * timeline, and drops the two that only mean something on an artboard.
 */
export const SECTIONS: ToolSection[] = [
  { id: 'design', label: 'Design', icon: 'design', kinds: ['image', 'video'] },
  { id: 'elements', label: 'Elements', icon: 'elements', kinds: ['image'] },
  { id: 'video', label: 'Video', icon: 'video', kinds: ['video'] },
  { id: 'audio', label: 'Audio', icon: 'music', kinds: ['video'] },
  { id: 'text', label: 'Text', icon: 'text', kinds: ['image', 'video'] },
  // Both kinds, by different routes. A still uses the SDK's `PhotosSection`,
  // which writes an image ELEMENT through `OrbitStore`; a timeline has no store
  // to write to, so motion gets `StockPanel`, which imports the file locally and
  // appends it as a clip. Same shelf, two documents.
  { id: 'photos', label: 'Photos', icon: 'image', kinds: ['image', 'video'] },
  { id: 'stickers', label: 'Stickers', icon: 'elements', kinds: ['video'] },
  { id: 'uploads', label: 'Uploads', icon: 'folder', kinds: ['image', 'video'] },
  { id: 'effects', label: 'Effects', icon: 'effects', kinds: ['video'], gapBefore: true },
  { id: 'transitions', label: 'Transitions', icon: 'transition', kinds: ['video'] },
  { id: 'ai', label: 'Generate', icon: 'reading', kinds: ['image', 'video'], gapBefore: true },
  { id: 'layers', label: 'Layers', icon: 'layers', kinds: ['image'] },
];

export function sectionsFor(kind: ProjectKind): ToolSection[] {
  return SECTIONS.filter((s) => s.kinds.includes(kind));
}

export function ToolRail({ kind }: { kind: ProjectKind }) {
  const tool = useDesign((s) => s.tool);
  const toggleTool = useDesign((s) => s.toggleTool);
  const sections = sectionsFor(kind);

  return (
    <nav className={styles.railInner} aria-label="Tools">
      {sections.map((s, i) => (
        <div key={s.id} style={{ display: 'contents' }}>
          {/* Only a real group break, and never above the first item. */}
          {s.gapBefore && i > 0 && <span className={styles.railGap} aria-hidden="true" />}
          <button
            className={styles.railItem}
            data-active={tool === s.id}
            aria-pressed={tool === s.id}
            onClick={() => toggleTool(s.id)}
          >
            <Icon name={s.icon} size={21} />
            <span className={styles.railLabel}>{s.label}</span>
          </button>
        </div>
      ))}
    </nav>
  );
}
