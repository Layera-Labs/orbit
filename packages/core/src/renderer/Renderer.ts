/**
 * Abstract renderer interface
 * Allows swapping Fabric.js for custom WebGL later
 */

export interface Renderer {
  init(container: HTMLElement, width: number, height: number): void;
  destroy(): void;
  render(scene: unknown): void;
  resize(width: number, height: number): void;
  export(format: string, options?: unknown): Promise<Blob>;
}
