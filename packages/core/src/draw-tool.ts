/**
 * DrawController - Raster drawing overlay for brush/highlighter tools
 * Uses a separate canvas layered on top of the renderer canvas
 */

export interface DrawOptions {
  strokeWidth: number;
  color: string;
  opacity: number;
  mode: 'brush' | 'highlighter';
  pressureSensitive: boolean;
}

export class DrawController {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private container: HTMLElement | null = null;
  private isDrawing = false;
  private lastX = 0;
  private lastY = 0;
  private options: DrawOptions = {
    strokeWidth: 4,
    color: '#3b82f6',
    opacity: 1,
    mode: 'brush',
    pressureSensitive: true,
  };
  private onCompleteCallback: ((dataUrl: string) => void) | null = null;

  init(container: HTMLElement): void {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '10';
    container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d');
    this.resize(container.clientWidth, container.clientHeight);
  }

  destroy(): void {
    if (this.canvas && this.container) {
      this.container.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.container = null;
  }

  resize(width: number, height: number): void {
    if (!this.canvas) return;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  setOptions(options: Partial<DrawOptions>): void {
    this.options = { ...this.options, ...options };
  }

  getOptions(): DrawOptions {
    return { ...this.options };
  }

  activate(): void {
    if (!this.canvas) return;
    this.canvas.style.pointerEvents = 'auto';
    this.canvas.style.cursor = 'crosshair';
    this.attachEvents();
  }

  deactivate(): void {
    if (!this.canvas) return;
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.cursor = 'default';
    this.detachEvents();
  }

  clear(): void {
    if (!this.ctx || !this.canvas) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  onComplete(callback: (dataUrl: string) => void): void {
    this.onCompleteCallback = callback;
  }

  private attachEvents(): void {
    if (!this.canvas) return;
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointerleave', this.handlePointerUp);
  }

  private detachEvents(): void {
    if (!this.canvas) return;
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointerleave', this.handlePointerUp);
  }

  private getPressureWidth(e: PointerEvent): number {
    if (!this.options.pressureSensitive || e.pointerType === 'mouse') {
      return this.options.strokeWidth;
    }
    // Pressure: 0.0 (hover) to 1.0 (max). Minimum 0.2 so light touches still draw.
    const pressure = e.pressure || 0.5;
    return this.options.strokeWidth * (0.2 + pressure * 0.8);
  }

  private handlePointerDown = (e: PointerEvent): void => {
    if (!this.ctx || !this.canvas) return;
    this.isDrawing = true;
    const rect = this.canvas.getBoundingClientRect();
    this.lastX = e.clientX - rect.left;
    this.lastY = e.clientY - rect.top;

    this.ctx.globalAlpha = this.options.opacity;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = this.options.color;

    if (this.options.mode === 'highlighter') {
      this.ctx.globalCompositeOperation = 'multiply';
    } else {
      this.ctx.globalCompositeOperation = 'source-over';
    }

    this.ctx.lineWidth = this.getPressureWidth(e);
    this.ctx.beginPath();
    this.ctx.moveTo(this.lastX, this.lastY);
    this.ctx.lineTo(this.lastX, this.lastY);
    this.ctx.stroke();
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (!this.isDrawing || !this.ctx || !this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    this.ctx.lineWidth = this.getPressureWidth(e);
    this.ctx.beginPath();
    this.ctx.moveTo(this.lastX, this.lastY);
    this.ctx.lineTo(x, y);
    this.ctx.stroke();

    this.lastX = x;
    this.lastY = y;
  };

  private handlePointerUp = (): void => {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    if (this.onCompleteCallback && this.canvas) {
      const dataUrl = this.canvas.toDataURL('image/png');
      this.onCompleteCallback(dataUrl);
    }
  };
}
