import type { ComponentType, ReactNode } from 'react';

/** A pluggable side-panel section (Polotno-style). */
export interface SectionDef {
  id: string;
  label: string;
  icon: ReactNode;
  Panel: ComponentType;
  /**
   * Optional guard: return false to hide the section (e.g. when its required
   * provider is not configured). Receives the provider registry.
   */
  visible?: (ctx: { hasProvider: (kind: string) => boolean }) => boolean;
}

export function defineSection(def: SectionDef): SectionDef {
  return def;
}
