import { useEffect, useRef } from 'react';
import type Konva from 'konva';
import { Workspace } from '@orbit/render';
import type { OrbitStore } from '@orbit/model';
import type { ProviderMap } from '@orbit/providers';
import { EditorProvider, useStore, useTheme } from './context';
import type { ThemeMode } from './context';
import { TopBar } from './components/TopBar';
import { SidePanel } from './components/SidePanel';
import { ContextToolbar } from './components/ContextToolbar';
import { SizeBackgroundBar } from './components/SizeBackgroundBar';
import { SelectionActions } from './components/SelectionActions';
import { ZoomControl } from './components/ZoomControl';
import { PagesPanel } from './components/PagesPanel';
import { DEFAULT_SECTIONS, type SectionDef } from './sections';
import './styles/editor.css';

export interface OrbitEditorProps {
  store?: OrbitStore;
  providers?: ProviderMap;
  sections?: SectionDef[];
  /**
   * Controlled theme — pass this and the host owns it. The editor then ignores
   * its own `localStorage` preference, which otherwise outlives `defaultTheme`
   * and leaves a light editor sitting inside a dark application.
   */
  theme?: ThemeMode;
  onThemeChange?: (theme: ThemeMode) => void;
  /** Initial theme when uncontrolled. Loses to a stored preference. */
  defaultTheme?: ThemeMode;
}

/**
 * The editor's keyboard map. Exported (via `index.ts`) so a host that composes
 * its own shell out of `Workspace` + the section panels does not lose undo,
 * duplicate, group, select-all and delete.
 */
export function useEditorShortcuts() {
  const store = useStore();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const sel = store.state.selection;
      if (mod && key === 'z') { e.preventDefault(); e.shiftKey ? store.redo() : store.undo(); }
      else if (mod && key === 'y') { e.preventDefault(); store.redo(); }
      else if (mod && key === 'd') { e.preventDefault(); if (sel[0]) store.duplicateElement(sel[0]); }
      else if (mod && key === 'g') { e.preventDefault(); if (e.shiftKey) { if (sel[0]) store.ungroup(sel[0]); } else if (sel.length >= 2) store.group([...sel]); }
      else if (mod && key === 'a') { e.preventDefault(); store.selectAll(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (sel.length) { e.preventDefault(); store.transaction(() => [...sel].forEach((id) => store.removeElement(id))); }
      } else if (e.key === 'Escape') store.deselect();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [store]);
}

function EditorShell({ sections }: { sections: SectionDef[] }) {
  useEditorShortcuts();
  const store = useStore();
  const { theme } = useTheme();
  const stageRef = useRef<Konva.Stage | null>(null);
  return (
    <div className="orbit" data-theme={theme}>
      <TopBar stageRef={stageRef} />
      <div className="o-body">
        <SidePanel sections={sections} />
        <div className="o-canvas-wrap">
          <Workspace store={store} stageApiRef={stageRef} backdrop="transparent" />
          <SizeBackgroundBar />
          <ContextToolbar />
          <SelectionActions />
          <PagesPanel />
          <ZoomControl stageRef={stageRef} />
        </div>
      </div>
    </div>
  );
}

export function OrbitEditor({
  store,
  providers,
  sections = DEFAULT_SECTIONS,
  theme,
  onThemeChange,
  defaultTheme,
}: OrbitEditorProps) {
  return (
    <EditorProvider
      store={store}
      providers={providers}
      theme={theme}
      onThemeChange={onThemeChange}
      defaultTheme={defaultTheme}
    >
      <EditorShell sections={sections} />
    </EditorProvider>
  );
}
