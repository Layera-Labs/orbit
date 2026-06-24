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
import { createStore, type OrbitStore } from '@orbit/model';
import { ProviderRegistry, type ProviderMap } from '@orbit/providers';

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
  defaultTheme,
  children,
}: {
  store?: OrbitStore;
  providers?: ProviderMap;
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

  const [theme, setThemeState] = useState<ThemeMode>(() => initialTheme(defaultTheme));
  const setTheme = useCallback((t: ThemeMode) => {
    setThemeState(t);
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      /* ignore */
    }
  }, []);
  const toggleTheme = useCallback(
    () => setThemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    }),
    [],
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
