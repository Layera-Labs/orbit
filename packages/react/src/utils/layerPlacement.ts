import type { OrbitEngine } from '@orbit/core';
import type { Layer, ShapeContent } from '@orbit/shared';

const FALLBACK_CANVAS_SIZE = 1080;

export interface SceneDimensions {
  width: number;
  height: number;
}

export interface LayerPoint {
  x: number;
  y: number;
}

export interface LayerSize {
  width: number;
  height: number;
}

export function getSceneDimensions(engine: OrbitEngine | null): SceneDimensions {
  const scene = engine?.scene.getState();
  return {
    width: scene?.width ?? FALLBACK_CANVAS_SIZE,
    height: scene?.height ?? FALLBACK_CANVAS_SIZE,
  };
}

export function getCenteredLayerPosition(
  engine: OrbitEngine | null,
  width: number,
  height: number
): LayerPoint {
  const scene = getSceneDimensions(engine);
  return {
    x: Math.max(0, (scene.width - width) / 2),
    y: Math.max(0, (scene.height - height) / 2),
  };
}

export function fitLayerSizeToScene(
  engine: OrbitEngine | null,
  width: number,
  height: number,
  maxSceneRatio = 0.72
): LayerSize {
  const scene = getSceneDimensions(engine);
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const scale = Math.min(
    1,
    (scene.width * maxSceneRatio) / safeWidth,
    (scene.height * maxSceneRatio) / safeHeight
  );

  return {
    width: Math.round(safeWidth * scale),
    height: Math.round(safeHeight * scale),
  };
}

function baseLayer(props: Pick<Layer, 'type' | 'name' | 'x' | 'y' | 'width' | 'height' | 'content'>): Omit<Layer, 'id'> {
  return {
    ...props,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    visible: true,
    locked: false,
    blendMode: 'normal',
    effects: [],
  };
}

export interface TextLayerPreset {
  text: string;
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  color?: string;
  width?: number;
  height?: number;
  name?: string;
}

export function createCenteredTextLayer(
  engine: OrbitEngine | null,
  preset: TextLayerPreset
): Omit<Layer, 'id'> {
  const fontSize = preset.fontSize ?? 32;
  const text = preset.text || 'Text';
  const width = preset.width ?? Math.max(220, Math.min(720, text.length * fontSize * 0.55));
  const height = preset.height ?? Math.max(fontSize * 1.5, 44);
  const position = getCenteredLayerPosition(engine, width, height);

  return baseLayer({
    type: 'text',
    name: preset.name ?? text.slice(0, 24) ?? 'Text',
    x: position.x,
    y: position.y,
    width,
    height,
    content: {
      type: 'text',
      text,
      fontFamily: preset.fontFamily ?? 'Inter',
      fontSize,
      fontWeight: preset.fontWeight ?? 400,
      color: preset.color ?? '#1a1a1a',
      alignment: 'left',
    },
  });
}

export function createImageLayer(
  engine: OrbitEngine | null,
  src: string,
  naturalWidth: number,
  naturalHeight: number,
  position?: Partial<LayerPoint>,
  name = 'Image'
): Omit<Layer, 'id'> {
  const size = fitLayerSizeToScene(engine, naturalWidth, naturalHeight);
  const centered = getCenteredLayerPosition(engine, size.width, size.height);

  return baseLayer({
    type: 'image',
    name,
    x: position?.x ?? centered.x,
    y: position?.y ?? centered.y,
    width: size.width,
    height: size.height,
    content: {
      type: 'image',
      src,
      naturalWidth,
      naturalHeight,
    },
  });
}

export function createVideoLayer(
  engine: OrbitEngine | null,
  src: string,
  naturalWidth: number,
  naturalHeight: number,
  duration: number,
  position?: Partial<LayerPoint>,
  name = 'Video'
): Omit<Layer, 'id'> {
  const size = fitLayerSizeToScene(engine, naturalWidth, naturalHeight);
  const centered = getCenteredLayerPosition(engine, size.width, size.height);

  return baseLayer({
    type: 'video',
    name,
    x: position?.x ?? centered.x,
    y: position?.y ?? centered.y,
    width: size.width,
    height: size.height,
    content: {
      type: 'video',
      src,
      duration,
      currentTime: 0,
      volume: 1,
      muted: false,
      loop: false,
      autoplay: false,
    },
  });
}

export interface ShapeLayerOptions {
  shape?: ShapeContent['shape'];
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  width?: number;
  height?: number;
  name?: string;
  position?: Partial<LayerPoint>;
}

export function createShapeLayer(
  engine: OrbitEngine | null,
  options: ShapeLayerOptions = {}
): Omit<Layer, 'id'> {
  const shape = options.shape ?? 'rectangle';
  const isLine = shape === 'line' || shape === 'arrow';
  const width = options.width ?? (isLine ? 180 : 140);
  const height = options.height ?? (isLine ? 4 : 140);
  const centered = getCenteredLayerPosition(engine, width, height);

  return baseLayer({
    type: 'shape',
    name: options.name ?? shape.charAt(0).toUpperCase() + shape.slice(1),
    x: options.position?.x ?? centered.x,
    y: options.position?.y ?? centered.y,
    width,
    height,
    content: {
      type: 'shape',
      shape,
      fill: options.fill ?? '#3b82f6',
      stroke: options.stroke ?? 'transparent',
      strokeWidth: options.strokeWidth ?? 0,
    },
  });
}

export function createBackgroundLayer(
  engine: OrbitEngine | null,
  fill: string,
  name = 'Background'
): Omit<Layer, 'id'> {
  const scene = getSceneDimensions(engine);

  return baseLayer({
    type: 'shape',
    name,
    x: 0,
    y: 0,
    width: scene.width,
    height: scene.height,
    content: {
      type: 'shape',
      shape: 'rectangle',
      fill,
      stroke: 'transparent',
      strokeWidth: 0,
    },
  });
}

export function addLayerAndSelect(
  engine: OrbitEngine | null,
  layer: Omit<Layer, 'id'>,
  options: { sendToBack?: boolean } = {}
): string | null {
  if (!engine) return null;
  const id = engine.addLayer(layer);
  if (options.sendToBack) {
    engine.sendToBack(id);
  }
  engine.selectLayer(id);
  return id;
}
