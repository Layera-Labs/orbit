/**
 * PathEditor - Node editing for vector paths
 * Parses SVG path data, creates draggable node handles
 */

import * as fabric from 'fabric';

export interface PathNode {
  x: number;
  y: number;
  command: string; // 'M' or 'L'
  index: number;
}

export class PathEditor {
  private canvas: any = null;
  private pathObject: fabric.Path | null = null;
  private nodeHandles: fabric.Circle[] = [];
  private isEditing = false;
  private onChangeCallback: ((pathData: string) => void) | null = null;
  private selectedHandle: fabric.Circle | null = null;

  setCanvas(canvas: any): void {
    this.canvas = canvas;
  }

  startEditing(pathObject: fabric.Path): void {
    if (!this.canvas || !pathObject) return;
    this.stopEditing();
    this.pathObject = pathObject;
    this.isEditing = true;
    this.createNodeHandles();
  }

  stopEditing(): void {
    if (!this.canvas) return;
    for (const handle of this.nodeHandles) {
      this.canvas.remove(handle);
    }
    this.nodeHandles = [];
    this.pathObject = null;
    this.isEditing = false;
    this.selectedHandle = null;
  }

  isActive(): boolean {
    return this.isEditing;
  }

  onChange(callback: (pathData: string) => void): void {
    this.onChangeCallback = callback;
  }

  private createNodeHandles(): void {
    if (!this.canvas || !this.pathObject) return;
    const nodes = this.parsePathData(this.pathObject.path);

    for (const node of nodes) {
      const handle = new fabric.Circle({
        left: node.x - 5,
        top: node.y - 5,
        radius: 5,
        fill: '#3b82f6',
        stroke: '#ffffff',
        strokeWidth: 2,
        selectable: true,
        hasControls: false,
        hasBorders: false,
        originX: 'center',
        originY: 'center',
        data: { nodeIndex: node.index },
      });

      handle.on('moving', () => {
        this.updatePathFromHandles();
      });

      handle.on('modified', () => {
        this.updatePathFromHandles();
        if (this.onChangeCallback) {
          this.onChangeCallback(this.buildPathData());
        }
      });

      handle.on('selected', () => {
        this.selectedHandle = handle;
      });

      this.canvas.add(handle);
      this.nodeHandles.push(handle);
    }

    this.canvas.requestRenderAll();
  }

  private updatePathFromHandles(): void {
    if (!this.pathObject || this.nodeHandles.length === 0) return;

    const newPath: any[] = [];
    for (let i = 0; i < this.nodeHandles.length; i++) {
      const handle = this.nodeHandles[i];
      const cmd = i === 0 ? 'M' : 'L';
      newPath.push([cmd, handle.left, handle.top]);
    }

    this.pathObject.set({ path: newPath });
    this.pathObject.setCoords();
  }

  private buildPathData(): string {
    if (this.nodeHandles.length === 0) return '';
    let d = '';
    for (let i = 0; i < this.nodeHandles.length; i++) {
      const h = this.nodeHandles[i];
      d += i === 0 ? `M ${h.left} ${h.top}` : ` L ${h.left} ${h.top}`;
    }
    return d;
  }

  private parsePathData(path: any[]): PathNode[] {
    const nodes: PathNode[] = [];
    if (!Array.isArray(path)) return nodes;

    for (let i = 0; i < path.length; i++) {
      const seg = path[i];
      if (!Array.isArray(seg)) continue;
      const cmd = seg[0];
      if (cmd === 'M' || cmd === 'L') {
        nodes.push({
          x: seg[1] || 0,
          y: seg[2] || 0,
          command: cmd,
          index: i,
        });
      }
    }
    return nodes;
  }

  addNodeAt(x: number, y: number): void {
    if (!this.canvas || !this.pathObject) return;

    // Find closest segment and insert point
    const handle = new fabric.Circle({
      left: x,
      top: y,
      radius: 5,
      fill: '#3b82f6',
      stroke: '#ffffff',
      strokeWidth: 2,
      selectable: true,
      hasControls: false,
      hasBorders: false,
      originX: 'center',
      originY: 'center',
    });

    handle.on('moving', () => {
      this.updatePathFromHandles();
    });

    handle.on('modified', () => {
      this.updatePathFromHandles();
      if (this.onChangeCallback) {
        this.onChangeCallback(this.buildPathData());
      }
    });

    handle.on('selected', () => {
      this.selectedHandle = handle;
    });

    this.canvas.add(handle);
    this.nodeHandles.push(handle);
    this.updatePathFromHandles();

    if (this.onChangeCallback) {
      this.onChangeCallback(this.buildPathData());
    }
  }

  removeSelectedNode(): void {
    if (!this.canvas || this.nodeHandles.length <= 2) return;

    if (this.selectedHandle) {
      const selectedIndex = this.nodeHandles.indexOf(this.selectedHandle);
      if (selectedIndex >= 0) {
        this.canvas.remove(this.selectedHandle);
        this.nodeHandles.splice(selectedIndex, 1);
        this.selectedHandle = null;
        this.updatePathFromHandles();

        if (this.onChangeCallback) {
          this.onChangeCallback(this.buildPathData());
        }
      }
    }
  }
}
