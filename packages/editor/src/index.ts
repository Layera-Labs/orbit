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
} from './context';
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
export { TopBar } from './components/TopBar';
export { ContextToolbar } from './components/ContextToolbar';
export { ZoomControl } from './components/ZoomControl';
export { ThemeToggle } from './components/ThemeToggle';
export { Icon } from './components/Icon';
export type { IconName } from './components/Icon';

// Re-export the model + providers surface so SDK consumers need one import.
export * from '@orbit/model';
export * from '@orbit/providers';
