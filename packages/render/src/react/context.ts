import { createContext, useContext } from 'react';
import type Konva from 'konva';
import type { OrbitStore, ID } from '@orbit/model';
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

export interface WorkspaceContextValue {
  store: OrbitStore;
  registry: NodeRegistry;
  /** Live smart-guides shown during a drag (cleared on drag end). */
  setGuides: (guides: Guide[]) => void;
  /** Enter inline text-edit mode for a text element. */
  beginTextEdit: (id: ID) => void;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used within <Workspace>');
  }
  return ctx;
}
