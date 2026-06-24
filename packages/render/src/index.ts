export * from './types';
export { computeSnap } from './snapping';
export type { SnapResult, SnapOptions } from './snapping';
export { exportStageToDataURL, dataURLToBlob } from './export';
export type { RasterExportOptions } from './export';
export { exportPageToSVG, svgStringToBlob } from './svg-export';
export type { SvgExportOptions } from './svg-export';

// React / Konva rendering layer
export { Workspace } from './react/Workspace';
export type { WorkspaceProps } from './react/Workspace';
export { PagePreview } from './react/PagePreview';
export { ElementNode } from './react/ElementNode';
export { SelectionTransformer } from './react/SelectionTransformer';
export { SmartGuides } from './react/SmartGuides';
export { useImage } from './react/useImage';
export {
  NodeRegistry,
  WorkspaceContext,
  useWorkspace,
} from './react/context';
export type { WorkspaceContextValue } from './react/context';
