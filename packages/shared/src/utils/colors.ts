/**
 * Color utilities
 */

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function hexToRgba(hex: string): RGBA {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  const a = clean.length === 8 ? ((bigint >> 24) & 255) / 255 : 1;
  return { r, g, b, a };
}

export function rgbaToHex({ r, g, b, a }: RGBA): string {
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  if (a < 1) {
    return `#${toHex(Math.round(a * 255))}${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function rgbaToString({ r, g, b, a }: RGBA): string {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function interpolateColor(color1: string, color2: string, t: number): string {
  const c1 = hexToRgba(color1);
  const c2 = hexToRgba(color2);
  return rgbaToHex({
    r: Math.round(c1.r + (c2.r - c1.r) * t),
    g: Math.round(c1.g + (c2.g - c1.g) * t),
    b: Math.round(c1.b + (c2.b - c1.b) * t),
    a: c1.a + (c2.a - c1.a) * t,
  });
}

export function isValidHex(color: string): boolean {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{8}|[A-Fa-f0-9]{3}|[A-Fa-f0-9]{4})$/.test(color);
}

export function getContrastColor(backgroundColor: string): string {
  const { r, g, b } = hexToRgba(backgroundColor);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}
