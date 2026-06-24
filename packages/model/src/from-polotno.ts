import { createElement, createId, createPage } from './factory';
import type {
  Background,
  Document,
  Element,
  NewElement,
  Page,
  ShapeKind,
  TextAlign,
} from './types';

/**
 * Adapter for Polotno's store JSON so consumers can reuse existing templates.
 * Polotno's schema maps ~1:1 onto the Orbit model. This is intentionally a
 * lossy, versioned adapter — never the internal format.
 *
 * Polotno shape (abridged):
 *   { width, height, pages: [{ background, children: [
 *       { type:'text'|'image'|'svg'|'figure'|'line', x, y, width, height,
 *         rotation, opacity, ... }
 *   ] }] }
 */

interface PolotnoChild {
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  visible?: boolean;
  locked?: boolean;
  // text
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number | string;
  fill?: string;
  align?: string;
  // image / svg
  src?: string;
  // figure (shape)
  subType?: string;
  // line
  points?: number[];
  stroke?: string;
  strokeWidth?: number;
  [key: string]: unknown;
}

interface PolotnoPage {
  background?: string;
  width?: number;
  height?: number;
  children?: PolotnoChild[];
}

interface PolotnoJSON {
  width?: number;
  height?: number;
  pages?: PolotnoPage[];
}

function toWeight(w: number | string | undefined): number {
  if (typeof w === 'number') return w;
  if (w === 'bold') return 700;
  return 400;
}

function mapChild(child: PolotnoChild): NewElement | null {
  const base = {
    x: child.x ?? 0,
    y: child.y ?? 0,
    width: child.width ?? 100,
    height: child.height ?? 100,
    rotation: child.rotation ?? 0,
    opacity: child.opacity ?? 1,
    visible: child.visible ?? true,
    locked: child.locked ?? false,
  };

  switch (child.type) {
    case 'text':
      return {
        type: 'text',
        ...base,
        text: child.text ?? '',
        fontFamily: child.fontFamily ?? 'Inter',
        fontSize: child.fontSize ?? 36,
        fontWeight: toWeight(child.fontWeight),
        fill: child.fill ?? '#000000',
        align: (child.align as TextAlign) ?? 'left',
      };
    case 'image':
      return {
        type: 'image',
        ...base,
        src: child.src ?? '',
        naturalWidth: child.width ?? 100,
        naturalHeight: child.height ?? 100,
      };
    case 'svg':
      return { type: 'svg', ...base, src: child.src ?? '' };
    case 'figure':
      return {
        type: 'shape',
        ...base,
        shape: (child.subType as ShapeKind) ?? 'rect',
        fill: child.fill ?? '#cccccc',
        stroke: child.stroke ?? 'transparent',
        strokeWidth: child.strokeWidth ?? 0,
      };
    case 'line':
      return {
        type: 'line',
        ...base,
        points: child.points ?? [0, 0, base.width, 0],
        stroke: child.stroke ?? '#000000',
        strokeWidth: child.strokeWidth ?? 2,
      };
    default:
      return null;
  }
}

export function fromPolotnoJSON(json: PolotnoJSON): Document {
  const width = json.width ?? 1080;
  const height = json.height ?? 1080;

  const pages: Page[] = (json.pages ?? []).map((p) => {
    const children: Element[] = (p.children ?? [])
      .map(mapChild)
      .filter(Boolean)
      .map((partial) => createElement(partial as NewElement));

    const background: Background = p.background
      ? { type: 'solid', color: p.background }
      : { type: 'solid', color: '#ffffff' };

    return createPage({
      width: p.width ?? width,
      height: p.height ?? height,
      background,
      children,
    });
  });

  return {
    id: createId('doc'),
    schemaVersion: 2,
    width,
    height,
    unit: 'px',
    pages: pages.length > 0 ? pages : [createPage({ width, height })],
    fonts: [],
  };
}
