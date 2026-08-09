import type { ID, OrbitStore } from '@layera-labs/model';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** A smart-guide line drawn during drag/resize. */
export interface Guide {
  /** 'x' => vertical line at this x; 'y' => horizontal line at this y. */
  axis: 'x' | 'y';
  position: number;
  start: number;
  end: number;
}

export interface ExportOptions {
  format?: 'png' | 'jpeg';
  pixelRatio?: number;
  quality?: number;
  pageId?: ID;
}

/**
 * Renderer abstraction boundary. The UI talks to the model and to this
 * interface — never to Konva directly — so a future WebGL/web3 renderer can
 * implement the same surface without touching the model or UI.
 */
export interface OrbitRenderer {
  mount(container: HTMLElement, store: OrbitStore): void;
  unmount(): void;
  toDataURL(options?: ExportOptions): Promise<string>;
  toBlob(options?: ExportOptions): Promise<Blob>;
  hitTest(point: Point): ID | null;
  getNodeBox(id: ID): Box | null;
}
