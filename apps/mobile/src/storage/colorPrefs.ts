/** Recently created custom colours, shared by every editor colour picker. */
import { File, Paths } from 'expo-file-system';

const MAX_CUSTOM_COLORS = 10;

function colorsFile(): File {
  return new File(Paths.document, 'custom-colors.json');
}

export function loadCustomColors(): string[] {
  try {
    const file = colorsFile();
    if (!file.exists) return [];
    const data = JSON.parse(file.textSync()) as unknown;
    return Array.isArray(data) ? data.filter((value): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)).slice(0, MAX_CUSTOM_COLORS) : [];
  } catch {
    return [];
  }
}

export function addCustomColor(color: string): string[] {
  const normalized = color.toLowerCase();
  const next = [normalized, ...loadCustomColors().filter((value) => value.toLowerCase() !== normalized)].slice(0, MAX_CUSTOM_COLORS);
  try {
    colorsFile().write(JSON.stringify(next));
  } catch {
    // Best-effort preference persistence.
  }
  return next;
}
