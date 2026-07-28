import { memo, useEffect, useRef } from 'react';
import type Konva from 'konva';
import {
  Arrow,
  Ellipse,
  Group,
  Image as KonvaImage,
  Line,
  Rect,
  RegularPolygon,
  Star,
  Text,
} from 'react-konva';
import { useSnapshot } from 'valtio';
import type { Element, GroupElement, ID } from '@orbit/model';
import { computeSnap } from '../snapping';
import type { Box } from '../types';
import { useWorkspace } from './context';
import { useImage } from './useImage';

interface ElementNodeProps {
  id: ID;
  /** When true this node is inside a group and must not be independently draggable. */
  nested?: boolean;
}

function konvaFontStyle(weight: number, style?: string): string {
  const parts: string[] = [];
  if (style === 'italic') parts.push('italic');
  if (weight >= 600) parts.push('bold');
  return parts.join(' ') || 'normal';
}

function shadowProps(el: Element): Record<string, unknown> {
  const s = el.shadow;
  if (!s) return {};
  return {
    shadowColor: s.color,
    shadowBlur: s.blur,
    shadowOpacity: s.opacity,
    shadowOffsetX: s.offsetX,
    shadowOffsetY: s.offsetY,
    shadowEnabled: true,
  };
}

function ElementNodeImpl({ id, nested = false }: ElementNodeProps) {
  const { store, registry, setGuides, beginTextEdit } = useWorkspace();
  const proxyEl = store.getElement(id);
  const nodeRef = useRef<Konva.Group>(null);

  // Subscribe to *this element only* — moving a sibling won't re-render us.
  const el = useSnapshot(proxyEl ?? ({} as Element)) as Element;

  useEffect(() => {
    if (nodeRef.current) registry.register(id, nodeRef.current);
    return () => registry.unregister(id);
  }, [id, registry]);

  if (!proxyEl || !el.type || el.visible === false) return null;

  const handleSelect = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (nested) return;
    e.cancelBubble = true;
    const additive = e.evt.shiftKey || e.evt.metaKey;
    if (additive) {
      store.select([id], true);
    } else if (!store.isSelected(id)) {
      store.select([id]);
    }
  };

  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target;
    const page = store.activePage;
    const peers: Box[] = page.children
      .filter((c) => c.id !== id && c.visible !== false)
      .map((c) => ({ x: c.x, y: c.y, width: c.width, height: c.height }));
    const moving: Box = {
      x: node.x(),
      y: node.y(),
      width: el.width,
      height: el.height,
    };
    const snap = computeSnap(moving, peers, {
      threshold: 6,
      page: { width: page.width, height: page.height },
    });
    node.position({ x: snap.x, y: snap.y });
    setGuides(snap.guides);
  };

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target;
    setGuides([]);
    store.updateElement(id, { x: node.x(), y: node.y() });
  };

  const handleTransformEnd = () => {
    const node = nodeRef.current;
    if (!node) return;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    const patch: Partial<Element> = {
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
      width: Math.max(4, el.width * scaleX),
      height: Math.max(4, el.height * scaleY),
    };
    if (el.type === 'text') {
      (patch as Partial<Element> & { fontSize: number }).fontSize = Math.max(
        4,
        (el as Extract<Element, { type: 'text' }>).fontSize * scaleY,
      );
    }
    store.updateElement(id, patch);
  };

  const groupProps: Konva.NodeConfig & Record<string, unknown> = {
    id,
    name: 'orbit-element',
    x: el.x,
    y: el.y,
    rotation: el.rotation,
    opacity: el.opacity,
    draggable: !nested && !el.locked,
    listening: !el.locked,
    onMouseDown: handleSelect,
    onTap: handleSelect,
    onDragMove: handleDragMove,
    onDragEnd: handleDragEnd,
    onTransformEnd: handleTransformEnd,
  };

  return (
    <Group ref={nodeRef} {...groupProps}>
      <ElementContent
        el={el}
        onTextDblClick={() => beginTextEdit(id)}
      />
    </Group>
  );
}

/**
 * Memoized: the node manages its own Valtio subscription, so re-renders of the
 * parent Workspace (viewport pan/zoom, smart-guide updates during a drag) must
 * not cascade into re-rendering every element. Props are just `{ id, nested }`.
 */
export const ElementNode = memo(ElementNodeImpl);

function ElementContent({
  el,
  onTextDblClick,
}: {
  el: Element;
  onTextDblClick: () => void;
}) {
  const [image] = useImage(
    el.type === 'image' || el.type === 'svg' ? el.src : undefined,
  );
  const { chrome } = useWorkspace();

  switch (el.type) {
    case 'text':
      return (
        <Text
          width={el.width}
          height={el.height}
          text={el.text}
          fontSize={el.fontSize}
          fontFamily={el.fontFamily}
          fontStyle={konvaFontStyle(el.fontWeight, el.fontStyle)}
          textDecoration={el.underline ? 'underline' : ''}
          fill={el.fill}
          align={el.align}
          lineHeight={el.lineHeight ?? 1.2}
          letterSpacing={el.letterSpacing ?? 0}
          stroke={el.stroke}
          strokeWidth={el.strokeWidth ?? 0}
          onDblClick={onTextDblClick}
          onDblTap={onTextDblClick}
          perfectDrawEnabled={false}
          {...shadowProps(el)}
        />
      );
    case 'image':
      return (
        <KonvaImage
          image={image}
          width={el.width}
          height={el.height}
          cornerRadius={el.cornerRadius ?? 0}
          stroke={el.stroke}
          strokeWidth={el.strokeWidth ?? 0}
          crop={
            el.crop && image
              ? {
                  x: el.crop.x * image.naturalWidth,
                  y: el.crop.y * image.naturalHeight,
                  width: el.crop.width * image.naturalWidth,
                  height: el.crop.height * image.naturalHeight,
                }
              : undefined
          }
          perfectDrawEnabled={false}
          {...shadowProps(el)}
        />
      );
    case 'svg':
      return (
        <KonvaImage image={image} width={el.width} height={el.height} perfectDrawEnabled={false} />
      );
    case 'shape':
      return <ShapeContent el={el} />;
    case 'line':
      return el.arrow ? (
        <Arrow
          points={el.points}
          stroke={el.stroke}
          fill={el.stroke}
          strokeWidth={el.strokeWidth}
          pointerLength={Math.max(8, el.strokeWidth * 3)}
          pointerWidth={Math.max(8, el.strokeWidth * 3)}
          perfectDrawEnabled={false}
          {...shadowProps(el)}
        />
      ) : (
        <Line
          points={el.points}
          stroke={el.stroke}
          strokeWidth={el.strokeWidth}
          dash={el.dash}
          lineCap="round"
          perfectDrawEnabled={false}
          {...shadowProps(el)}
        />
      );
    case 'group':
      return <GroupContent el={el} />;
    case 'video':
      return (
        <Rect
          width={el.width}
          height={el.height}
          fill={chrome.mediaPlaceholder}
          cornerRadius={4}
        />
      );
    case 'audio':
      return null;
    default:
      return null;
  }
}

function ShapeContent({ el }: { el: Extract<Element, { type: 'shape' }> }) {
  const w = el.width;
  const h = el.height;
  const common = {
    fill: el.fill,
    stroke: el.stroke,
    strokeWidth: el.strokeWidth,
    perfectDrawEnabled: false,
    ...shadowProps(el),
  };
  switch (el.shape) {
    case 'ellipse':
      return <Ellipse x={w / 2} y={h / 2} radiusX={w / 2} radiusY={h / 2} {...common} />;
    case 'triangle':
      return <Line points={[w / 2, 0, w, h, 0, h]} closed {...common} />;
    case 'star':
      return (
        <Star
          x={w / 2}
          y={h / 2}
          numPoints={el.points ?? 5}
          innerRadius={Math.min(w, h) / 4}
          outerRadius={Math.min(w, h) / 2}
          {...common}
        />
      );
    case 'polygon':
      return (
        <RegularPolygon
          x={w / 2}
          y={h / 2}
          sides={el.points ?? 6}
          radius={Math.min(w, h) / 2}
          {...common}
        />
      );
    case 'rect':
    default:
      return <Rect width={w} height={h} cornerRadius={el.cornerRadius ?? 0} {...common} />;
  }
}

function GroupContent({ el }: { el: GroupElement }) {
  return (
    <>
      {el.children.map((child) => (
        <ElementNode key={child.id} id={child.id} nested />
      ))}
    </>
  );
}
