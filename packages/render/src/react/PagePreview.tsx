import {
  Arrow,
  Ellipse,
  Group,
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  RegularPolygon,
  Stage,
  Star,
  Text,
} from 'react-konva';
import type { Element, Page } from '@layera-labs/orbit-model';
import { backgroundFill } from './background';
import { useImage } from './useImage';

function fontStyle(weight: number, style?: string): string {
  const parts: string[] = [];
  if (style === 'italic') parts.push('italic');
  if (weight >= 600) parts.push('bold');
  return parts.join(' ') || 'normal';
}

/** Read-only render of a single element (no interaction / context). */
function StaticContent({ el }: { el: Element }) {
  const [image] = useImage(
    el.type === 'image' || el.type === 'svg' ? el.src : undefined,
  );
  switch (el.type) {
    case 'text':
      return (
        <Text
          width={el.width}
          height={el.height}
          text={el.text}
          fontSize={el.fontSize}
          fontFamily={el.fontFamily}
          fontStyle={fontStyle(el.fontWeight, el.fontStyle)}
          textDecoration={el.underline ? 'underline' : ''}
          fill={el.fill}
          align={el.align}
          lineHeight={el.lineHeight ?? 1.2}
          listening={false}
        />
      );
    case 'image':
    case 'svg':
      return <KonvaImage image={image} width={el.width} height={el.height} cornerRadius={(el as Extract<Element, { type: 'image' }>).cornerRadius ?? 0} listening={false} />;
    case 'shape': {
      const w = el.width;
      const h = el.height;
      const common = { fill: el.fill, stroke: el.stroke, strokeWidth: el.strokeWidth, listening: false };
      switch (el.shape) {
        case 'ellipse':
          return <Ellipse x={w / 2} y={h / 2} radiusX={w / 2} radiusY={h / 2} {...common} />;
        case 'triangle':
          return <Line points={[w / 2, 0, w, h, 0, h]} closed {...common} />;
        case 'star':
          return <Star x={w / 2} y={h / 2} numPoints={el.points ?? 5} innerRadius={Math.min(w, h) / 4} outerRadius={Math.min(w, h) / 2} {...common} />;
        case 'polygon':
          return <RegularPolygon x={w / 2} y={h / 2} sides={el.points ?? 6} radius={Math.min(w, h) / 2} {...common} />;
        default:
          return <Rect width={w} height={h} cornerRadius={el.cornerRadius ?? 0} {...common} />;
      }
    }
    case 'line':
      return el.arrow ? (
        <Arrow points={el.points} stroke={el.stroke} fill={el.stroke} strokeWidth={el.strokeWidth} listening={false} />
      ) : (
        <Line points={el.points} stroke={el.stroke} strokeWidth={el.strokeWidth} dash={el.dash} listening={false} />
      );
    case 'group':
      return (
        <>
          {el.children.map((c) => (
            <StaticElement key={c.id} el={c} />
          ))}
        </>
      );
    default:
      return null;
  }
}

function StaticElement({ el }: { el: Element }) {
  if (el.visible === false) return null;
  return (
    <Group x={el.x} y={el.y} rotation={el.rotation} opacity={el.opacity} listening={false}>
      <StaticContent el={el} />
    </Group>
  );
}

/** A non-interactive, scaled-down preview of a page (for thumbnails). */
export function PagePreview({ page, width }: { page: Page; width: number }) {
  const scale = width / page.width;
  const height = page.height * scale;
  return (
    <Stage
      width={Math.round(width)}
      height={Math.round(height)}
      scaleX={scale}
      scaleY={scale}
      listening={false}
      style={{ display: 'block', pointerEvents: 'none' }}
    >
      <Layer listening={false}>
        <Rect
          width={page.width}
          height={page.height}
          {...backgroundFill(page.background, page.width, page.height)}
          listening={false}
        />
        {page.children.map((el) => (
          <StaticElement key={el.id} el={el} />
        ))}
      </Layer>
    </Stage>
  );
}
