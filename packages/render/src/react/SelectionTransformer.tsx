import { useEffect, useRef } from 'react';
import type Konva from 'konva';
import { Transformer } from 'react-konva';
import { useSnapshot } from 'valtio';
import type { Element } from '@layera-labs/orbit-model';
import { useWorkspace } from './context';

/** A signature of the selected elements' geometry, so the transformer can
 *  re-sync when size/position changes programmatically (crop, number input). */
function geometryKey(
  pages: ReadonlyArray<{ children: ReadonlyArray<Element> }>,
  ids: string[],
): string {
  const parts: string[] = [];
  const walk = (els: ReadonlyArray<Element>) => {
    for (const e of els) {
      if (ids.includes(e.id)) parts.push(`${e.id}:${e.x}:${e.y}:${e.width}:${e.height}:${e.rotation}`);
      if (e.type === 'group') walk(e.children);
    }
  };
  pages.forEach((p) => walk(p.children));
  return parts.join('|');
}

export function SelectionTransformer() {
  const { store, registry, chrome } = useWorkspace();
  const snap = useSnapshot(store.state);
  const trRef = useRef<Konva.Transformer>(null);

  const selection = snap.selection as string[];
  const geomKey = geometryKey(snap.doc.pages as never, selection);

  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    // Retry across a few frames: a freshly-added element (e.g. an async-loading
    // image) may not have registered its node yet on the first frame.
    let raf = 0;
    let tries = 0;
    const attach = () => {
      const nodes = registry.getMany(selection);
      if (nodes.length >= selection.length || tries >= 12) {
        tr.nodes(nodes);
        tr.forceUpdate(); // resync box after programmatic size/crop changes
        tr.getLayer()?.batchDraw();
        return;
      }
      tries += 1;
      raf = requestAnimationFrame(attach);
    };
    raf = requestAnimationFrame(attach);
    return () => cancelAnimationFrame(raf);
  }, [selection, registry, snap.activePageId, geomKey]);

  return (
    <Transformer
      ref={trRef}
      rotateEnabled
      ignoreStroke
      anchorSize={9}
      anchorCornerRadius={2}
      borderStroke={chrome.accent}
      anchorStroke={chrome.accentStrong}
      anchorFill={chrome.onAccent}
      boundBoxFunc={(oldBox, newBox) =>
        newBox.width < 5 || newBox.height < 5 ? oldBox : newBox
      }
    />
  );
}
