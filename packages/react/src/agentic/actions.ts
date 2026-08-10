import type { OrbitEngine } from '@layera-labs/orbit-core';
import type { AgenticCanvasAction, Layer } from '@layera-labs/orbit-shared';
import {
  addLayerAndSelect,
  createBackgroundLayer,
  createCenteredTextLayer,
  createImageLayer,
  createShapeLayer,
  createVideoLayer,
} from '../utils/layerPlacement';

const NAMED_COLORS: Record<string, string> = {
  black: '#1a1a1a',
  blue: '#2563eb',
  green: '#16a34a',
  orange: '#ea580c',
  pink: '#db2777',
  purple: '#7c3aed',
  red: '#dc2626',
  white: '#ffffff',
  yellow: '#ca8a04',
};

function getTargetLayer(engine: OrbitEngine, layerId?: string): Layer | null {
  const id = layerId ?? engine.getSelectedLayers()[0];
  return id ? engine.scene.getLayer(id) ?? null : null;
}

function updateLayerContent(engine: OrbitEngine, layer: Layer, contentUpdates: Record<string, unknown>): void {
  engine.updateLayer(layer.id, {
    content: {
      ...(layer.content as unknown as Record<string, unknown>),
      ...contentUpdates,
    } as unknown as Layer['content'],
  });
  engine.selectLayer(layer.id);
}

function compactLayerUpdates(action: Extract<AgenticCanvasAction, { type: 'moveResizeLayer' }>): Partial<Layer> {
  const updates: Partial<Layer> = {};
  if (typeof action.x === 'number') updates.x = action.x;
  if (typeof action.y === 'number') updates.y = action.y;
  if (typeof action.width === 'number') updates.width = action.width;
  if (typeof action.height === 'number') updates.height = action.height;
  if (typeof action.rotation === 'number') updates.rotation = action.rotation;
  return updates;
}

export function executeAgenticActions(
  engine: OrbitEngine | null,
  actions: AgenticCanvasAction[]
): string[] {
  if (!engine) return [];
  const touchedIds: string[] = [];

  for (const action of actions) {
    switch (action.type) {
      case 'addText': {
        const id = addLayerAndSelect(engine, createCenteredTextLayer(engine, action));
        if (id) touchedIds.push(id);
        break;
      }
      case 'updateText': {
        const layer = getTargetLayer(engine, action.layerId);
        if (!layer || layer.type !== 'text') break;
        updateLayerContent(engine, layer, {
          ...(action.text !== undefined ? { text: action.text } : {}),
          ...(action.fontSize !== undefined ? { fontSize: action.fontSize } : {}),
          ...(action.fontWeight !== undefined ? { fontWeight: action.fontWeight } : {}),
          ...(action.fontFamily !== undefined ? { fontFamily: action.fontFamily } : {}),
          ...(action.color !== undefined ? { color: action.color } : {}),
        });
        touchedIds.push(layer.id);
        break;
      }
      case 'addImage': {
        const id = addLayerAndSelect(
          engine,
          createImageLayer(engine, action.src, action.width ?? 800, action.height ?? 600, undefined, action.name ?? 'AI Image')
        );
        if (id) touchedIds.push(id);
        break;
      }
      case 'addVideo': {
        const id = addLayerAndSelect(
          engine,
          createVideoLayer(engine, action.src, action.width ?? 1280, action.height ?? 720, action.duration ?? 10, undefined, action.name ?? 'AI Video')
        );
        if (id) touchedIds.push(id);
        break;
      }
      case 'addShape': {
        const id = addLayerAndSelect(engine, createShapeLayer(engine, action));
        if (id) touchedIds.push(id);
        break;
      }
      case 'addBackgroundLayer': {
        const id = addLayerAndSelect(
          engine,
          createBackgroundLayer(engine, action.value, action.name ?? 'Background'),
          { sendToBack: true }
        );
        if (id) touchedIds.push(id);
        break;
      }
      case 'updateLayerStyle': {
        const layer = getTargetLayer(engine, action.layerId);
        if (!layer) break;
        const updates: Partial<Layer> = {};
        if (typeof action.opacity === 'number') updates.opacity = action.opacity;
        if (action.blendMode) updates.blendMode = action.blendMode;

        if (layer.type === 'text') {
          updates.content = {
            ...(layer.content as unknown as Record<string, unknown>),
            ...(action.color !== undefined ? { color: action.color } : {}),
            ...(action.fontSize !== undefined ? { fontSize: action.fontSize } : {}),
            ...(action.fontWeight !== undefined ? { fontWeight: action.fontWeight } : {}),
            ...(action.fontFamily !== undefined ? { fontFamily: action.fontFamily } : {}),
          } as unknown as Layer['content'];
        } else if (layer.type === 'shape') {
          updates.content = {
            ...(layer.content as unknown as Record<string, unknown>),
            ...(action.fill !== undefined ? { fill: action.fill } : {}),
            ...(action.stroke !== undefined ? { stroke: action.stroke } : {}),
            ...(action.strokeWidth !== undefined ? { strokeWidth: action.strokeWidth } : {}),
          } as unknown as Layer['content'];
        }

        engine.updateLayer(layer.id, updates);
        engine.selectLayer(layer.id);
        touchedIds.push(layer.id);
        break;
      }
      case 'moveResizeLayer': {
        const layer = getTargetLayer(engine, action.layerId);
        if (!layer) break;
        engine.updateLayer(layer.id, compactLayerUpdates(action));
        engine.selectLayer(layer.id);
        touchedIds.push(layer.id);
        break;
      }
      case 'deleteLayer': {
        const layer = getTargetLayer(engine, action.layerId);
        if (!layer) break;
        engine.removeLayer(layer.id);
        touchedIds.push(layer.id);
        break;
      }
      default:
        break;
    }
  }

  if (touchedIds.length > 0) {
    engine.selectLayer(touchedIds[touchedIds.length - 1]);
  }

  return touchedIds;
}

function extractRequestedText(prompt: string): string | null {
  const quoted = prompt.match(/["']([^"']+)["']/);
  if (quoted?.[1]) return quoted[1];
  const afterText = prompt.match(/(?:add|write|create)\s+(?:a\s+)?(?:heading|text|caption)\s*(?:that\s+says|saying|with)?\s*:?\s*(.+)$/i);
  return afterText?.[1]?.trim() || null;
}

function extractColor(prompt: string): string | null {
  const hex = prompt.match(/#[0-9a-f]{3,8}\b/i);
  if (hex) return hex[0];
  const lower = prompt.toLowerCase();
  for (const [name, value] of Object.entries(NAMED_COLORS)) {
    if (lower.includes(name)) return value;
  }
  return null;
}

export function createFallbackActionsFromPrompt(
  prompt: string,
  selectedLayerIds: string[] = []
): AgenticCanvasAction[] {
  const lower = prompt.toLowerCase();
  const color = extractColor(prompt);
  const actions: AgenticCanvasAction[] = [];

  if (lower.includes('background') && color) {
    actions.push({ type: 'addBackgroundLayer', value: color });
    return actions;
  }

  if (selectedLayerIds.length > 0 && color && /\b(change|make|set|update)\b/.test(lower)) {
    actions.push({ type: 'updateLayerStyle', layerId: selectedLayerIds[0], fill: color, color });
    return actions;
  }

  const shape = lower.match(/\b(rectangle|square|circle|triangle|star|polygon|line|arrow)\b/)?.[1];
  if (shape) {
    const normalizedShape = shape === 'square'
      ? 'rectangle'
      : (shape as NonNullable<Extract<AgenticCanvasAction, { type: 'addShape' }>['shape']>);
    actions.push({
      type: 'addShape',
      shape: normalizedShape,
      fill: color ?? '#2563eb',
    });
    return actions;
  }

  if (/\b(text|heading|caption|write)\b/.test(lower)) {
    actions.push({
      type: 'addText',
      text: extractRequestedText(prompt) ?? 'New text',
      color: color ?? '#1a1a1a',
      fontSize: lower.includes('heading') ? 44 : 30,
      fontWeight: lower.includes('heading') ? 700 : 400,
    });
  }

  return actions;
}
