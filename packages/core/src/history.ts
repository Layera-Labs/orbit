/**
 * Command History - Undo/Redo system using Command pattern
 */

export interface Command {
  execute(): void;
  undo(): void;
  redo(): void;
  label: string;
}

export class CommandHistory {
  private past: Command[] = [];
  private future: Command[] = [];
  private listeners: Set<(canUndo: boolean, canRedo: boolean) => void> = new Set();

  execute(command: Command): void {
    command.execute();
    this.past.push(command);
    this.future = []; // Clear redo stack
    this.emit();
  }

  undo(): boolean {
    if (this.past.length === 0) return false;
    const command = this.past.pop()!;
    command.undo();
    this.future.push(command);
    this.emit();
    return true;
  }

  redo(): boolean {
    if (this.future.length === 0) return false;
    const command = this.future.pop()!;
    command.redo();
    this.past.push(command);
    this.emit();
    return true;
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  clear(): void {
    this.past = [];
    this.future = [];
    this.emit();
  }

  getHistory(): { past: string[]; future: string[] } {
    return {
      past: this.past.map((c) => c.label),
      future: this.future.map((c) => c.label),
    };
  }

  subscribe(listener: (canUndo: boolean, canRedo: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener(this.canUndo(), this.canRedo()));
  }
}
