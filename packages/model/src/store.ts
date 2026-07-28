import { proxy, snapshot, subscribe } from 'valtio/vanilla';
import { createElement, createId, createPage } from './factory';
import type {
  CanvasAction,
  Document,
  EditorEvent,
  EditorState,
  Element,
  GroupElement,
  ID,
  NewElement,
  Page,
} from './types';

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function plain<T>(value: T): T {
  // Strip Valtio proxy wrapping into a plain, frozen-free clone.
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface CreateStoreOptions {
  id?: string;
  width?: number;
  height?: number;
  pages?: Page[];
}

interface ElementLocation {
  element: Element;
  siblings: Element[];
  index: number;
  page: Page;
}

export class OrbitStore {
  /** The reactive proxy. UI binds with `useSnapshot(store.state)`. */
  readonly state: EditorState;

  private undoStack: Document[] = [];
  private redoStack: Document[] = [];
  private txnDepth = 0;
  private txnBefore: Document | null = null;
  private listeners = new Map<EditorEvent, Set<(s: EditorState) => void>>();

  constructor(options: CreateStoreOptions = {}) {
    const width = options.width ?? 1080;
    const height = options.height ?? 1080;
    const pages =
      options.pages && options.pages.length > 0
        ? options.pages
        : [createPage({ width, height })];

    const doc: Document = {
      id: options.id ?? createId('doc'),
      schemaVersion: 2,
      width,
      height,
      unit: 'px',
      pages,
      fonts: [],
    };

    this.state = proxy<EditorState>({
      doc,
      activePageId: pages[0].id,
      selection: [],
      viewport: { zoom: 1, x: 0, y: 0 },
    });
  }

  // ---- Reactive subscriptions -------------------------------------------

  /** Low-level Valtio subscription to any state change. */
  subscribe(cb: () => void): () => void {
    return subscribe(this.state, cb);
  }

  /** Imperative event API for SDK consumers. */
  on(event: EditorEvent, cb: (s: EditorState) => void): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(cb);
    this.listeners.set(event, set);
    return () => set.delete(cb);
  }

  private emit(event: EditorEvent): void {
    this.listeners.get(event)?.forEach((cb) => cb(this.state));
  }

  // ---- History ----------------------------------------------------------

  /** Coalesce many mutations into a single undo step. */
  transaction<T>(fn: () => T): T {
    this.begin();
    try {
      return fn();
    } finally {
      this.end();
    }
  }

  private begin(): void {
    if (this.txnDepth === 0) {
      this.txnBefore = plain(this.state.doc);
    }
    this.txnDepth++;
  }

  private end(): void {
    this.txnDepth--;
    if (this.txnDepth === 0 && this.txnBefore) {
      const after = plain(this.state.doc);
      if (JSON.stringify(after) !== JSON.stringify(this.txnBefore)) {
        this.undoStack.push(this.txnBefore);
        this.redoStack = [];
        this.emit('historyChange');
        this.emit('change');
      }
      this.txnBefore = null;
    }
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(plain(this.state.doc));
    this.applyDoc(prev);
    this.emit('historyChange');
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(plain(this.state.doc));
    this.applyDoc(next);
    this.emit('historyChange');
  }

  private applyDoc(doc: Document): void {
    this.state.doc = clone(doc);
    if (!this.state.doc.pages.some((p) => p.id === this.state.activePageId)) {
      this.state.activePageId = this.state.doc.pages[0]?.id ?? '';
    }
    const ids = new Set<ID>();
    this.eachElement(this.state.doc, (el) => ids.add(el.id));
    this.state.selection = this.state.selection.filter((id) => ids.has(id));
    this.emit('change');
    this.emit('pageChange');
  }

  // ---- Lookups ----------------------------------------------------------

  get activePage(): Page {
    const page = this.state.doc.pages.find(
      (p) => p.id === this.state.activePageId,
    );
    return page ?? this.state.doc.pages[0];
  }

  private eachElement(doc: Document, fn: (el: Element) => void): void {
    const walk = (els: Element[]) => {
      for (const el of els) {
        fn(el);
        if (el.type === 'group') walk(el.children);
      }
    };
    doc.pages.forEach((p) => walk(p.children));
  }

  /** Locate an element (searching into groups) along with its sibling array. */
  private locate(id: ID): ElementLocation | null {
    for (const page of this.state.doc.pages) {
      const found = this.locateIn(page.children, id, page);
      if (found) return found;
    }
    return null;
  }

  private locateIn(
    siblings: Element[],
    id: ID,
    page: Page,
  ): ElementLocation | null {
    for (let i = 0; i < siblings.length; i++) {
      const el = siblings[i];
      if (el.id === id) return { element: el, siblings, index: i, page };
      if (el.type === 'group') {
        const nested = this.locateIn(el.children, id, page);
        if (nested) return nested;
      }
    }
    return null;
  }

  getElement(id: ID): Element | null {
    return this.locate(id)?.element ?? null;
  }

  // ---- Pages ------------------------------------------------------------

  addPage(partial: Partial<Page> = {}): ID {
    return this.transaction(() => {
      const page = createPage({
        width: partial.width ?? this.state.doc.width,
        height: partial.height ?? this.state.doc.height,
        ...partial,
      });
      this.state.doc.pages.push(page);
      this.state.activePageId = page.id;
      this.emit('pageChange');
      return page.id;
    });
  }

  deletePage(id: ID): void {
    this.transaction(() => {
      const idx = this.state.doc.pages.findIndex((p) => p.id === id);
      if (idx === -1 || this.state.doc.pages.length <= 1) return;
      this.state.doc.pages.splice(idx, 1);
      if (this.state.activePageId === id) {
        this.state.activePageId = this.state.doc.pages[Math.max(0, idx - 1)].id;
      }
      this.emit('pageChange');
    });
  }

  duplicatePage(id: ID): ID | null {
    return this.transaction(() => {
      const idx = this.state.doc.pages.findIndex((p) => p.id === id);
      if (idx === -1) return null;
      const copy = clone(plain(this.state.doc.pages[idx]));
      copy.id = createId('page');
      this.reassignIds(copy.children);
      this.state.doc.pages.splice(idx + 1, 0, copy);
      this.state.activePageId = copy.id;
      this.emit('pageChange');
      return copy.id;
    });
  }

  /** Give a page a title, or clear it by passing an empty string. */
  renamePage(id: ID, name: string): void {
    this.transaction(() => {
      const page = this.state.doc.pages.find((p) => p.id === id);
      if (!page) return;
      const next = name.trim();
      if (next) page.name = next;
      else delete page.name;
      this.emit('pageChange');
    });
  }

  setActivePage(id: ID): void {
    if (this.state.doc.pages.some((p) => p.id === id)) {
      this.state.activePageId = id;
      this.state.selection = [];
      this.emit('pageChange');
    }
  }

  reorderPages(ids: ID[]): void {
    this.transaction(() => {
      const byId = new Map(this.state.doc.pages.map((p) => [p.id, p]));
      const next = ids.map((id) => byId.get(id)).filter(Boolean) as Page[];
      if (next.length === this.state.doc.pages.length) {
        this.state.doc.pages = next;
        this.emit('pageChange');
      }
    });
  }

  setBackground(
    background: Page['background'],
    pageId: ID = this.state.activePageId,
  ): void {
    this.transaction(() => {
      const page = this.state.doc.pages.find((p) => p.id === pageId);
      if (page) page.background = background;
    });
  }

  resizePage(
    width: number,
    height: number,
    pageId: ID = this.state.activePageId,
  ): void {
    this.transaction(() => {
      const page = this.state.doc.pages.find((p) => p.id === pageId);
      if (!page) return;
      page.width = width;
      page.height = height;
      this.state.doc.width = width;
      this.state.doc.height = height;
    });
  }

  private reassignIds(els: Element[]): void {
    for (const el of els) {
      el.id = createId(el.type);
      if (el.type === 'group') this.reassignIds(el.children);
    }
  }

  // ---- Elements ---------------------------------------------------------

  addElement(partial: NewElement, pageId: ID = this.state.activePageId): ID {
    return this.transaction(() => {
      const page = this.state.doc.pages.find((p) => p.id === pageId);
      if (!page) throw new Error(`Page not found: ${pageId}`);
      const el = createElement(partial);
      page.children.push(el);
      this.state.selection = [el.id];
      return el.id;
    });
  }

  updateElement(id: ID, patch: Partial<Element>): void {
    this.transaction(() => {
      const loc = this.locate(id);
      if (!loc) return;
      Object.assign(loc.element, patch);
    });
  }

  removeElement(id: ID): void {
    this.transaction(() => {
      const loc = this.locate(id);
      if (!loc) return;
      loc.siblings.splice(loc.index, 1);
      this.state.selection = this.state.selection.filter((s) => s !== id);
    });
  }

  moveElement(id: ID, toIndex: number): void {
    this.transaction(() => {
      const loc = this.locate(id);
      if (!loc) return;
      const { siblings, index } = loc;
      const [el] = siblings.splice(index, 1);
      const clamped = Math.max(0, Math.min(toIndex, siblings.length));
      siblings.splice(clamped, 0, el);
    });
  }

  bringToFront(id: ID): void {
    const loc = this.locate(id);
    if (loc) this.moveElement(id, loc.siblings.length - 1);
  }

  sendToBack(id: ID): void {
    this.moveElement(id, 0);
  }

  bringForward(id: ID): void {
    const loc = this.locate(id);
    if (loc) this.moveElement(id, loc.index + 1);
  }

  sendBackward(id: ID): void {
    const loc = this.locate(id);
    if (loc) this.moveElement(id, loc.index - 1);
  }

  /** Group the current selection (siblings on the active page) into one group. */
  group(ids: ID[] = this.state.selection): ID | null {
    return this.transaction(() => {
      if (ids.length < 2) return null;
      const page = this.activePage;
      const members = ids
        .map((id) => page.children.find((c) => c.id === id))
        .filter(Boolean) as Element[];
      if (members.length !== ids.length) return null; // must be top-level siblings

      const minX = Math.min(...members.map((m) => m.x));
      const minY = Math.min(...members.map((m) => m.y));
      const maxX = Math.max(...members.map((m) => m.x + m.width));
      const maxY = Math.max(...members.map((m) => m.y + m.height));

      const group: GroupElement = {
        ...createElement({ type: 'group' }),
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        children: members.map((m) => ({ ...m, x: m.x - minX, y: m.y - minY })),
      } as GroupElement;

      const firstIndex = Math.min(
        ...members.map((m) => page.children.indexOf(m)),
      );
      page.children = page.children.filter((c) => !ids.includes(c.id));
      page.children.splice(firstIndex, 0, group);
      this.state.selection = [group.id];
      return group.id;
    });
  }

  ungroup(id: ID): ID[] {
    return this.transaction(() => {
      const loc = this.locate(id);
      if (!loc || loc.element.type !== 'group') return [];
      const group = loc.element;
      const restored = group.children.map((c) => ({
        ...c,
        x: c.x + group.x,
        y: c.y + group.y,
      }));
      loc.siblings.splice(loc.index, 1, ...restored);
      const ids = restored.map((c) => c.id);
      this.state.selection = ids;
      return ids;
    });
  }

  duplicateElement(id: ID, offset = 24): ID | null {
    return this.transaction(() => {
      const loc = this.locate(id);
      if (!loc) return null;
      const copy = clone(plain(loc.element));
      this.reassignIds([copy]);
      copy.x += offset;
      copy.y += offset;
      loc.siblings.splice(loc.index + 1, 0, copy);
      this.state.selection = [copy.id];
      return copy.id;
    });
  }

  /** Align elements to the page edges/center. */
  alignToPage(
    ids: ID[],
    edge: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom',
  ): void {
    this.transaction(() => {
      const page = this.activePage;
      for (const id of ids) {
        const el = this.getElement(id);
        if (!el) continue;
        switch (edge) {
          case 'left': this.updateElement(id, { x: 0 }); break;
          case 'center-h': this.updateElement(id, { x: (page.width - el.width) / 2 }); break;
          case 'right': this.updateElement(id, { x: page.width - el.width }); break;
          case 'top': this.updateElement(id, { y: 0 }); break;
          case 'center-v': this.updateElement(id, { y: (page.height - el.height) / 2 }); break;
          case 'bottom': this.updateElement(id, { y: page.height - el.height }); break;
        }
      }
    });
  }

  /** Align selected elements to one another's bounding box. */
  alignSelection(
    ids: ID[],
    edge: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom',
  ): void {
    this.transaction(() => {
      const els = ids.map((id) => this.getElement(id)).filter(Boolean) as Element[];
      if (els.length < 2) return;
      const minX = Math.min(...els.map((e) => e.x));
      const maxX = Math.max(...els.map((e) => e.x + e.width));
      const minY = Math.min(...els.map((e) => e.y));
      const maxY = Math.max(...els.map((e) => e.y + e.height));
      for (const el of els) {
        switch (edge) {
          case 'left': this.updateElement(el.id, { x: minX }); break;
          case 'center-h': this.updateElement(el.id, { x: (minX + maxX) / 2 - el.width / 2 }); break;
          case 'right': this.updateElement(el.id, { x: maxX - el.width }); break;
          case 'top': this.updateElement(el.id, { y: minY }); break;
          case 'center-v': this.updateElement(el.id, { y: (minY + maxY) / 2 - el.height / 2 }); break;
          case 'bottom': this.updateElement(el.id, { y: maxY - el.height }); break;
        }
      }
    });
  }

  /** Evenly distribute spacing among 3+ selected elements. */
  distribute(ids: ID[], axis: 'horizontal' | 'vertical'): void {
    this.transaction(() => {
      const els = (ids.map((id) => this.getElement(id)).filter(Boolean) as Element[]).slice();
      if (els.length < 3) return;
      const key = axis === 'horizontal' ? 'x' : 'y';
      const sizeKey = axis === 'horizontal' ? 'width' : 'height';
      els.sort((a, b) => a[key] - b[key]);
      const first = els[0];
      const last = els[els.length - 1];
      const totalSize = els.reduce((s, e) => s + e[sizeKey], 0);
      const span = last[key] + last[sizeKey] - first[key];
      const gap = (span - totalSize) / (els.length - 1);
      let cursor = first[key];
      for (const el of els) {
        this.updateElement(el.id, { [key]: cursor } as Partial<Element>);
        cursor += el[sizeKey] + gap;
      }
    });
  }

  // ---- Selection --------------------------------------------------------

  select(ids: ID[], additive = false): void {
    this.state.selection = additive
      ? Array.from(new Set([...this.state.selection, ...ids]))
      : ids;
    this.emit('selectionChange');
  }

  deselect(): void {
    this.state.selection = [];
    this.emit('selectionChange');
  }

  selectAll(): void {
    this.state.selection = this.activePage.children.map((c) => c.id);
    this.emit('selectionChange');
  }

  isSelected(id: ID): boolean {
    return this.state.selection.includes(id);
  }

  // ---- Agentic / actions ------------------------------------------------

  /** Apply one or more declarative canvas actions atomically (undoable). */
  applyAction(action: CanvasAction | CanvasAction[]): void {
    const actions = Array.isArray(action) ? action : [action];
    this.transaction(() => {
      for (const a of actions) {
        switch (a.op) {
          case 'addElement':
            this.addElement(a.element, a.pageId);
            break;
          case 'updateElement':
            this.updateElement(a.id, a.patch);
            break;
          case 'removeElement':
            this.removeElement(a.id);
            break;
          case 'duplicateElement':
            this.duplicateElement(a.id);
            break;
          case 'setBackground':
            this.setBackground(a.background, a.pageId);
            break;
          case 'resizePage':
            this.resizePage(a.width, a.height, a.pageId);
            break;
          case 'select':
            this.select(a.ids);
            break;
          case 'addPage':
            this.addPage(a.page);
            break;
        }
      }
    });
  }

  // ---- Serialization ----------------------------------------------------

  /** Export the document as plain JSON (a template IS this shape). */
  toJSON(): Document {
    return plain(this.state.doc);
  }

  /** Replace the document. Resets history and selection. */
  loadJSON(doc: Document): void {
    const next = clone(doc);
    if (!next.pages || next.pages.length === 0) {
      next.pages = [createPage({ width: next.width, height: next.height })];
    }
    this.undoStack = [];
    this.redoStack = [];
    this.state.doc = next;
    this.state.activePageId = next.pages[0].id;
    this.state.selection = [];
    this.emit('historyChange');
    this.emit('change');
    this.emit('pageChange');
  }

  // ---- Viewport ---------------------------------------------------------

  setViewport(patch: Partial<EditorState['viewport']>): void {
    Object.assign(this.state.viewport, patch);
  }
}

export function createStore(options?: CreateStoreOptions): OrbitStore {
  return new OrbitStore(options);
}

export { snapshot };
