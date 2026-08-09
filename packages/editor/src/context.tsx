import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useSnapshot } from 'valtio';
import { createStore, type OrbitStore } from '@layera-labs/model';
import { ProviderRegistry, type ProviderMap } from '@layera-labs/providers';

export type ThemeMode = 'dark' | 'light';

interface EditorContextValue {
  store: OrbitStore;
  providers: ProviderRegistry;
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  toggleTheme: () => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

const THEME_KEY = 'orbit-theme';

function initialTheme(defaultTheme?: ThemeMode): ThemeMode {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  }
  if (defaultTheme) return defaultTheme;
  if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark'; // hero look
}

export function EditorProvider({
  store,
  providers,
  theme: controlled,
  onThemeChange,
  defaultTheme,
  children,
}: {
  store?: OrbitStore;
  providers?: ProviderMap;
  /**
   * Controlled theme. When supplied, the host owns the value: `localStorage` is
   * neither read nor written, and the editor always matches its surroundings.
   *
   * Without this the stored preference wins over `defaultTheme` forever, so a
   * user who once toggled the editor to light gets a light editor embedded in a
   * dark application and no way to reconcile them — which is what happens to any
   * host that re-skins the editor to its own palette.
   */
  theme?: ThemeMode;
  onThemeChange?: (theme: ThemeMode) => void;
  defaultTheme?: ThemeMode;
  children: ReactNode;
}) {
  const base = useMemo(
    () => ({
      store: store ?? createStore(),
      providers: new ProviderRegistry(providers),
    }),
    [store, providers],
  );

  const [uncontrolled, setThemeState] = useState<ThemeMode>(() => initialTheme(defaultTheme));
  const isControlled = controlled != null;
  const theme = isControlled ? controlled : uncontrolled;

  const setTheme = useCallback(
    (t: ThemeMode) => {
      onThemeChange?.(t);
      if (isControlled) return;
      setThemeState(t);
      try {
        localStorage.setItem(THEME_KEY, t);
      } catch {
        /* ignore */
      }
    },
    [isControlled, onThemeChange],
  );

  const toggleTheme = useCallback(
    () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    [setTheme, theme],
  );

  const value = useMemo<EditorContextValue>(
    () => ({ ...base, theme, setTheme, toggleTheme }),
    [base, theme, setTheme, toggleTheme],
  );
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useTheme() {
  const { theme, setTheme, toggleTheme } = useEditor();
  return { theme, setTheme, toggleTheme };
}

export function useEditor(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor must be used within <EditorProvider>');
  return ctx;
}

export function useStore(): OrbitStore {
  return useEditor().store;
}

export function useProviders(): ProviderRegistry {
  return useEditor().providers;
}

/** Reactive snapshot of the editor state. */
export function useEditorState() {
  const store = useStore();
  return useSnapshot(store.state);
}

/** The currently selected element (single selection), reactive. */
export function useSelectedElement() {
  const store = useStore();
  const snap = useSnapshot(store.state);
  const id = snap.selection[0];
  return id ? store.getElement(id) : null;
}

/** History state that updates on undo/redo stack changes. */
export function useHistory() {
  const store = useStore();
  const [, force] = useState(0);
  useEffect(() => store.on('historyChange', () => force((n) => n + 1)), [store]);
  return {
    canUndo: store.canUndo,
    canRedo: store.canRedo,
    undo: () => store.undo(),
    redo: () => store.redo(),
  };
}
