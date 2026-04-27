/**
 * Unique ID generator
 */
let counter = 0;

export function generateId(prefix = 'orbit'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}_${counter}`;
}

export function generateLayerId(): string {
  return generateId('layer');
}

export function generateAssetId(): string {
  return generateId('asset');
}
