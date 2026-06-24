import type {
  Background,
  Element,
  ElementType,
  ID,
  NewElement,
  Page,
} from './types';

/** Stable id generator — uses crypto.randomUUID where available. */
export function createId(prefix = 'el'): ID {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${uuid}`;
}

const DEFAULT_BASE = {
  name: '',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  blendMode: 'normal' as const,
};

/** Per-type defaults merged under the caller's partial. */
const TYPE_DEFAULTS: Record<ElementType, Record<string, unknown>> = {
  text: {
    text: 'Text',
    fontFamily: 'Inter',
    fontSize: 36,
    fontWeight: 400,
    fontStyle: 'normal',
    fill: '#111111',
    align: 'left',
    width: 200,
    height: 48,
    name: 'Text',
  },
  image: {
    src: '',
    naturalWidth: 100,
    naturalHeight: 100,
    name: 'Image',
  },
  svg: { src: '', keepRatio: true, name: 'Graphic' },
  shape: {
    shape: 'rect',
    fill: '#4f46e5',
    stroke: 'transparent',
    strokeWidth: 0,
    name: 'Shape',
  },
  line: {
    points: [0, 0, 100, 0],
    stroke: '#111111',
    strokeWidth: 2,
    height: 2,
    name: 'Line',
  },
  group: { children: [], name: 'Group' },
  video: { src: '', duration: 0, muted: false, name: 'Video' },
  audio: { src: '', duration: 0, name: 'Audio' },
  qr: {
    value: 'https://orbit.design',
    fgColor: '#000000',
    bgColor: '#ffffff',
    width: 240,
    height: 240,
    name: 'QR Code',
  },
};

/** Build a fully-formed element from a partial (only `type` is required). */
export function createElement(partial: NewElement): Element {
  const { type } = partial;
  const el = {
    ...DEFAULT_BASE,
    ...TYPE_DEFAULTS[type],
    ...partial,
    id: partial.id ?? createId(type),
  } as Element;
  return el;
}

export function createPage(partial: Partial<Page> = {}): Page {
  return {
    id: partial.id ?? createId('page'),
    width: partial.width ?? 1080,
    height: partial.height ?? 1080,
    background: partial.background ?? ({ type: 'solid', color: '#ffffff' } as Background),
    children: partial.children ?? [],
    duration: partial.duration,
  };
}
