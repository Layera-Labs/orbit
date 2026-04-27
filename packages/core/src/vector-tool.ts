/**
 * VectorDrawTool - Freehand vector path drawing
 * Converts pointer strokes into editable fabric.Path objects
 */

import * as fabric from 'fabric';

export interface VectorDrawOptions {
  strokeWidth: number;
  color: string;
  opacity: number;
  simplifyTolerance: number; // Higher = simpler path
  pressureSensitive: boolean;
}

export class VectorDrawTool {
  private canvas: fabric.Canvas | null = null;
  private isDrawing = false;
  private points: { x: number; y: number; pressure?: number }[] = [];
  private options: VectorDrawOptions = {
    strokeWidth: 4,
    color: '#3b82f6',
    opacity: 1,
    simplifyTolerance: 2,
    pressureSensitive: true,
  };
  private onCompleteCallback: ((pathData: string) => void) | null = null;
  private tempPath: fabric.Path | null = null;

  setCanvas(canvas: any): void {
    this.canvas = canvas;
  }

  setOptions(options: Partial<VectorDrawOptions>): void {
    this.options = { ...this.options, ...options };
  }

  getOptions(): VectorDrawOptions {
    return { ...this.options };
  }

  activate(): void {
    if (!this.canvas) return;
    this.canvas.on('mouse:down', this.handleMouseDown);
    this.canvas.on('mouse:move', this.handleMouseMove);
    this.canvas.on('mouse:up', this.handleMouseUp);
    this.canvas.selection = false;
    this.canvas.getObjects().forEach((obj) => obj.set('selectable', false));
  }

  deactivate(): void {
    if (!this.canvas) return;
    this.canvas.off('mouse:down', this.handleMouseDown);
    this.canvas.off('mouse:move', this.handleMouseMove);
    this.canvas.off('mouse:up', this.handleMouseUp);
    this.canvas.selection = true;
    this.canvas.getObjects().forEach((obj) => obj.set('selectable', true));
    this.isDrawing = false;
    this.points = [];
    if (this.tempPath) {
      this.canvas.remove(this.tempPath);
      this.tempPath = null;
    }
  }

  onComplete(callback: (pathData: string) => void): void {
    this.onCompleteCallback = callback;
  }

  private getPressure(e: any): number | undefined {
    if (!this.options.pressureSensitive) return undefined;
    const native = e.e as PointerEvent | undefined;
    if (!native || native.pointerType === 'mouse') return undefined;
    return native.pressure || 0.5;
  }

  private handleMouseDown = (e: any): void => {
    if (!this.canvas) return;
    this.isDrawing = true;
    const pointer = this.canvas.getPointer(e.e);
    const pressure = this.getPressure(e);
    this.points = [{ x: pointer.x, y: pointer.y, pressure }];
  };

  private handleMouseMove = (e: any): void => {
    if (!this.isDrawing || !this.canvas) return;
    const pointer = this.canvas.getPointer(e.e);
    const pressure = this.getPressure(e);
    this.points.push({ x: pointer.x, y: pointer.y, pressure });

    // Remove previous temp path
    if (this.tempPath) {
      this.canvas.remove(this.tempPath);
    }

    // Create new temp path
    const pathData = this.pointsToPath(this.points);
    const avgPressure = this.computeAveragePressure();
    this.tempPath = new fabric.Path(pathData, {
      fill: '',
      stroke: this.options.color,
      strokeWidth: avgPressure ? this.options.strokeWidth * (0.2 + avgPressure * 0.8) : this.options.strokeWidth,
      opacity: this.options.opacity,
      selectable: false,
      evented: false,
    });
    this.canvas.add(this.tempPath);
    this.canvas.requestRenderAll();
  };

  private handleMouseUp = (): void => {
    if (!this.isDrawing || !this.canvas) return;
    this.isDrawing = false;

    // Remove temp path
    if (this.tempPath) {
      this.canvas.remove(this.tempPath);
      this.tempPath = null;
    }

    if (this.points.length < 2) {
      this.points = [];
      return;
    }

    // Adjust simplify tolerance based on average pressure (harder = less simplification)
    const avgPressure = this.computeAveragePressure();
    const tolerance = avgPressure
      ? this.options.simplifyTolerance * (1.5 - avgPressure * 0.5)
      : this.options.simplifyTolerance;

    // Simplify and create final path
    const simplified = this.simplifyPath(this.points, tolerance);
    const pathData = this.pointsToPath(simplified);

    if (this.onCompleteCallback) {
      this.onCompleteCallback(pathData);
    }

    this.points = [];
  };

  private computeAveragePressure(): number | undefined {
    const pressures = this.points.map((p) => p.pressure).filter((p): p is number => p !== undefined);
    if (pressures.length === 0) return undefined;
    return pressures.reduce((a, b) => a + b, 0) / pressures.length;
  }

  private pointsToPath(points: { x: number; y: number }[]): string {
    if (points.length === 0) return '';
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x} ${points[i].y}`;
    }
    return d;
  }

  /**
   * Simplify polyline using distance-based point reduction
   */
  private simplifyPath(
    points: { x: number; y: number }[],
    tolerance: number
  ): { x: number; y: number }[] {
    if (points.length <= 2) return points;

    const simplified: { x: number; y: number }[] = [points[0]];
    let lastKept = points[0];

    for (let i = 1; i < points.length - 1; i++) {
      const dist = Math.hypot(points[i].x - lastKept.x, points[i].y - lastKept.y);
      if (dist >= tolerance) {
        simplified.push(points[i]);
        lastKept = points[i];
      }
    }

    simplified.push(points[points.length - 1]);
    return simplified;
  }
}
