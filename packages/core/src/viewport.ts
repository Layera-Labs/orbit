/**
 * Viewport Controller - Manages zoom, pan, and canvas transform
 */

import { clamp } from '@orbit/shared';
import type { ViewportState } from '@orbit/shared';
export type { ViewportState };

export class ViewportController {
  private state: ViewportState = {
    zoom: 1,
    panX: 0,
    panY: 0,
    rotation: 0,
  };

  private minZoom = 0.1;
  private maxZoom = 5;
  private listeners: Set<(state: ViewportState) => void> = new Set();

  getState(): ViewportState {
    return { ...this.state };
  }

  setZoom(zoom: number, centerX?: number, centerY?: number): void {
    const oldZoom = this.state.zoom;
    const newZoom = clamp(zoom, this.minZoom, this.maxZoom);

    if (centerX !== undefined && centerY !== undefined) {
      // Zoom towards point
      const scale = newZoom / oldZoom;
      this.state.panX = centerX - (centerX - this.state.panX) * scale;
      this.state.panY = centerY - (centerY - this.state.panY) * scale;
    }

    this.state.zoom = newZoom;
    this.emit();
  }

  zoomIn(factor = 1.2): void {
    this.setZoom(this.state.zoom * factor);
  }

  zoomOut(factor = 1.2): void {
    this.setZoom(this.state.zoom / factor);
  }

  zoomToFit(canvasWidth: number, canvasHeight: number, containerWidth: number, containerHeight: number, minZoom = 0.35): void {
    const scaleX = containerWidth / canvasWidth;
    const scaleY = containerHeight / canvasHeight;
    const zoom = Math.min(scaleX, scaleY) * 0.9; // 90% fit with padding
    this.state.zoom = clamp(zoom, minZoom, this.maxZoom);
    this.state.panX = (containerWidth - canvasWidth * this.state.zoom) / 2;
    this.state.panY = (containerHeight - canvasHeight * this.state.zoom) / 2;
    this.emit();
  }

  centerCanvas(
    canvasWidth: number,
    canvasHeight: number,
    containerWidth: number,
    containerHeight: number,
    zoom = this.state.zoom
  ): void {
    this.state.zoom = clamp(zoom, this.minZoom, this.maxZoom);
    this.state.panX = (containerWidth - canvasWidth * this.state.zoom) / 2;
    this.state.panY = (containerHeight - canvasHeight * this.state.zoom) / 2;
    this.emit();
  }

  resetZoom(): void {
    this.state.zoom = 1;
    this.state.panX = 0;
    this.state.panY = 0;
    this.state.rotation = 0;
    this.emit();
  }

  pan(deltaX: number, deltaY: number): void {
    this.state.panX += deltaX;
    this.state.panY += deltaY;
    this.emit();
  }

  setPan(x: number, y: number): void {
    this.state.panX = x;
    this.state.panY = y;
    this.emit();
  }

  screenToCanvas(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: (screenX - this.state.panX) / this.state.zoom,
      y: (screenY - this.state.panY) / this.state.zoom,
    };
  }

  canvasToScreen(canvasX: number, canvasY: number): { x: number; y: number } {
    return {
      x: canvasX * this.state.zoom + this.state.panX,
      y: canvasY * this.state.zoom + this.state.panY,
    };
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
