import { createContext, useContext } from 'react';
import type Konva from 'konva';
import type { OrbitStore, ID } from '@layera-labs/orbit-model';
import type { Guide } from '../types';

/** Registry mapping element id -> live Konva node, used by the Transformer. */
export class NodeRegistry {
  private nodes = new Map<ID, Konva.Node>();

  register(id: ID, node: Konva.Node): void {
    this.nodes.set(id, node);
  }

  unregister(id: ID): void {
    this.nodes.delete(id);
  }

  get(id: ID): Konva.Node | undefined {
    return this.nodes.get(id);
  }

  getMany(ids: ID[]): Konva.Node[] {
    return ids.map((id) => this.nodes.get(id)).filter(Boolean) as Konva.Node[];
  }
}

/**
 * Colours for the editing chrome Konva paints onto the canvas.
 *
 * Konva draws to a bitmap and cannot read CSS custom properties, so selection
 * handles, the marquee and the text-edit outline used to be hardcoded hex. In a
 * re-skinned host that left Orbit-green furniture sitting inside someone else's
 * palette — the one part of the editor a theme could not reach. `Workspace`
 * resolves these from the `--o-*` variables in scope and republishes them here.
 */
export interface WorkspaceChrome {
  /** Selection border. */
  accent: string;
  /** Transformer anchor stroke. */
  accentStrong: string;
  /** Anchor fill, and the inline text-edit caret surface. */
  onAccent: string;
  /** Marquee stroke and its translucent fill. */
  marquee: string;
  marqueeFill: string;
  /** Placeholder block for media with no renderer yet. */
  mediaPlaceholder: string;
}

/** The values used before this was themeable; also the fallback. */
export const DEFAULT_CHROME: WorkspaceChrome = {
  accent: '#34d399',
  accentStrong: '#10b981',
  onAccent: '#ffffff',
  marquee: '#10b981',
  marqueeFill: 'rgba(16,185,129,0.14)',
  mediaPlaceholder: '#1f2937',
};

export interface WorkspaceContextValue {
  store: OrbitStore;
  registry: NodeRegistry;
  /** Live smart-guides shown during a drag (cleared on drag end). */
  setGuides: (guides: Guide[]) => void;
  /** Enter inline text-edit mode for a text element. */
  beginTextEdit: (id: ID) => void;
  /** Canvas-painted chrome, resolved from CSS variables. */
  chrome: WorkspaceChrome;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used within <Workspace>');
  }
  return ctx;
}
