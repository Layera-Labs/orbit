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
 * Migration adapter from the legacy @layera-labs/orbit-core SceneGraph shape to the new
 * Document model, so designs saved by the old editor survive the cutover.
 *
 * The legacy shape is described structurally (not imported) to keep the model
 * decoupled from the old packages.
 */

interface LegacyLayer {
  id?: string;
  type?: string;
  name?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  opacity?: number;
  visible?: boolean;
  locked?: boolean;
  content?: Record<string, unknown>;
}

interface LegacySceneGraph {
  root?: LegacyLayer[];
  background?: { type?: string; value?: string };
  width?: number;
  height?: number;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' ? v : fallback;
}

function mapLayer(layer: LegacyLayer): NewElement | null {
  const c = layer.content ?? {};
  const sx = layer.scaleX ?? 1;
  const sy = layer.scaleY ?? 1;
  const base = {
    id: layer.id ?? createId(layer.type ?? 'el'),
    name: layer.name,
    x: num(layer.x),
    y: num(layer.y),
    // bake legacy scale into width/height (new model has no per-element scale)
    width: num(layer.width, 100) * sx,
    height: num(layer.height, 100) * sy,
    rotation: num(layer.rotation),
    opacity: layer.opacity ?? 1,
    visible: layer.visible ?? true,
    locked: layer.locked ?? false,
  };

  switch (layer.type) {
    case 'text':
      return {
        type: 'text',
        ...base,
        text: str(c.text, str(c.content)),
        fontFamily: str(c.fontFamily, 'Inter'),
        fontSize: num(c.fontSize, 36),
        fontWeight: num(c.fontWeight, 400),
        fill: str(c.fill ?? c.color, '#000000'),
        align: (str(c.align, 'left') as TextAlign),
      };
    case 'image':
      return {
        type: 'image',
        ...base,
        src: str(c.src),
        naturalWidth: num(c.naturalWidth, base.width),
        naturalHeight: num(c.naturalHeight, base.height),
      };
    case 'shape':
      return {
        type: 'shape',
        ...base,
        shape: (str(c.shape, 'rect') as ShapeKind),
        fill: str(c.fill, '#cccccc'),
        stroke: str(c.stroke, 'transparent'),
        strokeWidth: num(c.strokeWidth, 0),
      };
    case 'group': {
      const children = Array.isArray(c.children)
        ? (c.children as LegacyLayer[]).map(mapLayer).filter(Boolean).map((p) => createElement(p as NewElement))
        : [];
      return { type: 'group', ...base, children } as NewElement;
    }
    case 'video':
      return { type: 'video', ...base, src: str(c.src), duration: num(c.duration) };
    case 'audio':
      return { type: 'audio', ...base, src: str(c.src), duration: num(c.duration) };
    default:
      return null;
  }
}

export function migrateSceneGraphToDocument(scene: LegacySceneGraph): Document {
  const width = num(scene.width, 1080);
  const height = num(scene.height, 1080);

  const children: Element[] = (scene.root ?? [])
    .map(mapLayer)
    .filter(Boolean)
    .map((p) => createElement(p as NewElement));

  const bg = scene.background;
  let background: Background = { type: 'solid', color: '#ffffff' };
  if (bg?.value) {
    if (bg.type === 'gradient') background = { type: 'gradient', css: bg.value };
    else if (bg.type === 'pattern') background = { type: 'pattern', patternId: bg.value };
    else background = { type: 'solid', color: bg.value };
  }

  const page: Page = createPage({ width, height, background, children });

  return {
    id: createId('doc'),
    schemaVersion: 2,
    width,
    height,
    unit: 'px',
    pages: [page],
    fonts: [],
  };
}
