/**
 * Viewport Controller - Manages zoom percentage for CSS scaling
 * Pan is handled natively by browser scroll (overflow-auto on container)
 */

export interface ViewportState {
  zoom: number; // percentage, e.g. 100 = actual size
}

export class ViewportController {
  private state: ViewportState = {
    zoom: 100,
  };

  private minZoom = 5;
  private maxZoom = 500;
  private zoomStep = 5;
  private listeners: Set<(state: ViewportState) => void> = new Set();

  getState(): ViewportState {
    return { ...this.state };
  }

  setZoom(percent: number): void {
    this.state.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, Math.round(percent)));
    this.emit();
  }

  zoomIn(step = this.zoomStep): void {
    this.setZoom(this.state.zoom + step);
  }

  zoomOut(step = this.zoomStep): void {
    this.setZoom(this.state.zoom - step);
  }

  /** Calculate fit percentage without applying it */
  calculateFit(canvasWidth: number, canvasHeight: number, containerWidth: number, containerHeight: number, padding = 32): number {
    const cw = containerWidth - padding * 2;
    const ch = containerHeight - padding * 2;
    if (cw <= 0 || ch <= 0) return 100;
    const raw = Math.min(cw / canvasWidth, ch / canvasHeight) * 0.98;
    const scale = Math.min(1, raw); // never zoom in past 100%
    return Math.max(this.minZoom, Math.min(this.maxZoom, Math.round(scale * 100)));
  }

  zoomToFit(canvasWidth: number, canvasHeight: number, containerWidth: number, containerHeight: number, padding = 32): void {
    this.setZoom(this.calculateFit(canvasWidth, canvasHeight, containerWidth, containerHeight, padding));
  }

  resetZoom(): void {
    this.state.zoom = 100;
    this.emit();
  }

  subscribe(listener: (state: ViewportState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }
}
