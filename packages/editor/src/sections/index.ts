import { TemplatesSection } from './TemplatesSection';
import { ElementsSection } from './ElementsSection';
import { TextSection } from './TextSection';
import { PhotosSection } from './PhotosSection';
import { BackgroundsSection } from './BackgroundsSection';
import { FontsSection } from './FontsSection';
import { LayersSection } from './LayersSection';

export { defineSection } from './types';
export type { SectionDef } from './types';
export {
  TemplatesSection,
  ElementsSection,
  TextSection,
  PhotosSection,
  BackgroundsSection,
  FontsSection,
  LayersSection,
};

/** Built-in sections that work without any provider configuration. */
export const CORE_SECTIONS = [ElementsSection, TextSection, LayersSection];

/**
 * Default section set. Provider-backed sections (templates/photos/etc.)
 * auto-hide when their provider is not configured.
 */
export const DEFAULT_SECTIONS = [
  TemplatesSection,
  ElementsSection,
  TextSection,
  PhotosSection,
  BackgroundsSection,
  FontsSection,
  LayersSection,
];
