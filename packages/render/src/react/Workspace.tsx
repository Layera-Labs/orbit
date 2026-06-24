import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type Konva from 'konva';
import { Group, Layer, Rect, Stage } from 'react-konva';
import { useSnapshot } from 'valtio';
import type { ID, OrbitStore } from '@orbit/model';
import { ElementNode } from './ElementNode';
import { SelectionTransformer } from './SelectionTransformer';
import { SmartGuides } from './SmartGuides';
import { NodeRegistry, WorkspaceContext } from './context';
import { backgroundFill } from './background';
import type { Guide } from '../types';

export interface WorkspaceProps {
  store: OrbitStore;
  /** Background color behind the page(s). */
  backdrop?: string;
  className?: string;
  style?: React.CSSProperties;
  /** Receives the live Konva stage (for export, hit-testing, etc.). */
  stageApiRef?: React.MutableRefObject<Konva.Stage | null>;
}

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 8;

export function Workspace({ store, backdrop = '#f3f4f6', className, style, stageApiRef }: WorkspaceProps) {
  const registry = useMemo(() => new NodeRegistry(), []);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);

  useEffect(() => {
    if (stageApiRef) stageApiRef.current = stageRef.current;
  });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [guides, setGuides] = useState<Guide[]>([]);
  const [editing, setEditing] = useState<{ id: ID } | null>(null);
  const fitKeyRef = useRef('');

  const snap = useSnapshot(store.state);
  const page = useMemo(
    () => snap.doc.pages.find((p) => p.id === snap.activePageId) ?? snap.doc.pages[0],
    [snap.doc.pages, snap.activePageId],
  );
  const zoom = snap.viewport.zoom;

  // Track container size.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () =>
      setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit the active page to the viewport — re-fit whenever the page (or its
  // size) changes, so switching/adding a page always shows one page centered.
  useEffect(() => {
    if (size.width === 0 || !page) return;
    const key = `${page.id}:${page.width}x${page.height}`;
    if (fitKeyRef.current === key) return;
    fitKeyRef.current = key;
    const margin = 0.88;
    const fit = Math.min(
      (size.width / page.width) * margin,
      (size.height / page.height) * margin,
    );
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fit));
    store.setViewport({
      zoom: z,
      x: (size.width - page.width * z) / 2,
      y: (size.height - page.height * z) / 2,
    });
  }, [size, page, store]);

  const beginTextEdit = useCallback((id: ID) => setEditing({ id }), []);

  const ctx = useMemo(
    () => ({ store, registry, setGuides, beginTextEdit }),
    [store, registry, beginTextEdit],
  );

  // Wheel: zoom to cursor.
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const old = store.state.viewport.zoom;
      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const factor = 1.08;
      const next = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, direction > 0 ? old * factor : old / factor),
      );
      const mousePoint = {
        x: (pointer.x - store.state.viewport.x) / old,
        y: (pointer.y - store.state.viewport.y) / old,
      };
      store.setViewport({
        zoom: next,
        x: pointer.x - mousePoint.x * next,
        y: pointer.y - mousePoint.y * next,
      });
    },
    [store],
  );

  // Marquee selection on empty area.
  const marquee = useRef<{ x: number; y: number } | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<null | {
    x: number;
    y: number;
    width: number;
    height: number;
  }>(null);

  const handleStageMouseDown = (
    e: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    if (e.target !== e.target.getStage()) return; // clicked an element
    const stage = stageRef.current;
    const pos = stage?.getRelativePointerPosition();
    if (!pos) return;
    marquee.current = { x: pos.x, y: pos.y };
    setMarqueeRect({ x: pos.x, y: pos.y, width: 0, height: 0 });
  };

  const handleStageMouseMove = () => {
    if (!marquee.current) return;
    const stage = stageRef.current;
    const pos = stage?.getRelativePointerPosition();
    if (!pos) return;
    const start = marquee.current;
    setMarqueeRect({
      x: Math.min(start.x, pos.x),
      y: Math.min(start.y, pos.y),
      width: Math.abs(pos.x - start.x),
      height: Math.abs(pos.y - start.y),
    });
  };

  const handleStageMouseUp = () => {
    if (!marquee.current) return;
    const rect = marqueeRect;
    marquee.current = null;
    setMarqueeRect(null);
    if (!rect || (rect.width < 4 && rect.height < 4)) {
      store.deselect();
      return;
    }
    const hits = store.activePage.children
      .filter(
        (c) =>
          c.x < rect.x + rect.width &&
          c.x + c.width > rect.x &&
          c.y < rect.y + rect.height &&
          c.y + c.height > rect.y,
      )
      .map((c) => c.id);
    store.select(hits);
  };

  if (!page) return null;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', ...style }}
    >
      <WorkspaceContext.Provider value={ctx}>
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          scaleX={zoom}
          scaleY={zoom}
          x={snap.viewport.x}
          y={snap.viewport.y}
          onWheel={handleWheel}
          onMouseDown={handleStageMouseDown}
          onTouchStart={handleStageMouseDown}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
          style={{ background: backdrop }}
        >
          <Layer>
            {/* page surface + shadow */}
            <Rect
              x={0}
              y={0}
              width={page.width}
              height={page.height}
              {...backgroundFill(page.background, page.width, page.height)}
              shadowColor="#000000"
              shadowOpacity={0.12}
              shadowBlur={16 / zoom}
              shadowOffsetY={2 / zoom}
              listening={false}
            />
            <Group
              clipX={0}
              clipY={0}
              clipWidth={page.width}
              clipHeight={page.height}
            >
              {page.children.map((child) => (
                <ElementNode key={child.id} id={child.id} />
              ))}
            </Group>
          </Layer>
          <Layer>
            <SmartGuides guides={guides} zoom={zoom} />
            <SelectionTransformer />
            {marqueeRect && (
              <Rect
                {...marqueeRect}
                fill="rgba(16,185,129,0.14)"
                stroke="#10b981"
                strokeWidth={1 / zoom}
                listening={false}
              />
            )}
          </Layer>
        </Stage>
        {editing && (
          <TextOverlayEditor
            store={store}
            id={editing.id}
            stage={stageRef.current}
            container={containerRef.current}
            onClose={() => setEditing(null)}
          />
        )}
      </WorkspaceContext.Provider>
    </div>
  );
}

/** Inline text editor: an absolutely-positioned textarea over the canvas. */
function TextOverlayEditor({
  store,
  id,
  stage,
  onClose,
}: {
  store: OrbitStore;
  id: ID;
  stage: Konva.Stage | null;
  container: HTMLDivElement | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const el = store.getElement(id);
  const node = stage?.findOne(`#${id}`);

  useLayoutEffect(() => {
    const ta = ref.current;
    if (!ta || !node || !el || el.type !== 'text') return;
    const abs = node.absolutePosition();
    const zoom = store.state.viewport.zoom;
    ta.style.left = `${abs.x}px`;
    ta.style.top = `${abs.y}px`;
    ta.style.width = `${el.width * zoom}px`;
    ta.style.height = `${el.height * zoom}px`;
    ta.style.fontSize = `${el.fontSize * zoom}px`;
    ta.style.fontFamily = el.fontFamily;
    ta.style.color = el.fill;
    ta.style.lineHeight = String(el.lineHeight ?? 1.2);
    ta.style.textAlign = el.align;
    ta.value = el.text;
    ta.focus();
    ta.select();
  }, [node, el, store]);

  if (!el || el.type !== 'text') return null;

  const commit = () => {
    const value = ref.current?.value ?? '';
    store.updateElement(id, { text: value });
    onClose();
  };

  return (
    <textarea
      ref={ref}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit();
      }}
      style={{
        position: 'absolute',
        margin: 0,
        padding: 0,
        border: '1px solid #10b981',
        outline: 'none',
        resize: 'none',
        overflow: 'hidden',
        background: 'transparent',
        boxSizing: 'border-box',
        transformOrigin: 'top left',
      }}
    />
  );
}
