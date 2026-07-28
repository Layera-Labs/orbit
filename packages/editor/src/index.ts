export { OrbitEditor } from './OrbitEditor';
export type { OrbitEditorProps } from './OrbitEditor';
export {
  EditorProvider,
  useEditor,
  useStore,
  useProviders,
  useEditorState,
  useSelectedElement,
  useHistory,
  useTheme,
} from './context';
export type { ThemeMode } from './context';
export {
  defineSection,
  DEFAULT_SECTIONS,
  CORE_SECTIONS,
  TemplatesSection,
  ElementsSection,
  TextSection,
  PhotosSection,
  BackgroundsSection,
  FontsSection,
  LayersSection,
} from './sections';
export type { SectionDef } from './sections';
export { SidePanel } from './components/SidePanel';
export { PagesPanel } from './components/PagesPanel';
export { SizeBackgroundBar } from './components/SizeBackgroundBar';
export { SelectionActions } from './components/SelectionActions';
export { ExportMenu } from './components/ExportMenu';
export { Popover, SliderRow } from './components/Popover';
/**
 * Exported so a host that builds its own shell keeps the editor's keyboard
 * behaviour. Copying it into the host instead would silently diverge the first
 * time a shortcut is added here.
 */
export { useEditorShortcuts } from './OrbitEditor';
export { TopBar } from './components/TopBar';
export { ContextToolbar } from './components/ContextToolbar';
export { ZoomControl } from './components/ZoomControl';
export { ThemeToggle } from './components/ThemeToggle';
export { Icon } from './components/Icon';
export type { IconName } from './components/Icon';

// Re-export the model + providers surface so SDK consumers need one import.
export * from '@orbit/model';
export * from '@orbit/providers';
