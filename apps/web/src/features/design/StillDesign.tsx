'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type Konva from 'konva';
import {
  EditorProvider,
  ElementsSection,
  LayersSection,
  PhotosSection,
  TextSection,
  useEditorShortcuts,
  useEditorState,
  useHistory,
  useSelectedElement,
  useStore,
  type OrbitStore,
} from '@orbit/editor';
import {
  GoogleFontProvider,
  PicsumPhotoProvider,
  PresetBackgroundProvider,
} from '@orbit/providers';
import { createStore, type Document as OrbitDocument } from '@orbit/model';
import { saveProject } from '@/db/projects';
import { useTheme } from '@/store/themeStore';
import { mediaSrc, type MediaRow, type ProjectRow } from '@/db/schema';
import { useDesign } from '@/store/designStore';
import { DesignBar } from './DesignBar';
import { DesignFrame, ToolPanel } from './Frame';
import { ToolRail } from './ToolRail';
import { ElementBar } from './toolbar/ElementBar';
import { CanvasGuides } from './CanvasGuides';
import { PageBar } from './PageBar';
import { AiPanel } from './panels/AiPanel';
import { MediaPanel } from './panels/MediaPanel';
import { StillDesignPanel } from './panels/StillPanels';
import styles from './Design.module.css';

const SAVE_DEBOUNCE_MS = 700;

/**
 * Konva touches `window` at import time and the editor provider reads
 * `localStorage`/`matchMedia` during state init — which runs during the SSR
 * render, not in an effect — so the canvas cannot be server-rendered.
 */
const Workspace = dynamic(() => import('@orbit/render').then((m) => m.Workspace), {
  ssr: false,
});
const SelectionActions = dynamic(
  () => import('@orbit/editor').then((m) => m.SelectionActions),
  { ssr: false },
);
const ZoomControl = dynamic(() => import('@orbit/editor').then((m) => m.ZoomControl), {
  ssr: false,
});
const PagesPanel = dynamic(() => import('@orbit/editor').then((m) => m.PagesPanel), {
  ssr: false,
});

export function StillDesign({
  row,
  onRename,
}: {
  row: ProjectRow;
  onRename(name: string): void;
}) {
  const theme = useTheme();
  const store = useMemo(() => {
    const s = createStore({ width: 1080, height: 1080 });
    s.loadJSON(row.data as OrbitDocument);
    s.deselect();
    return s;
  }, [row.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const providers = useMemo(
    () => ({
      photos: new PicsumPhotoProvider(),
      backgrounds: new PresetBackgroundProvider(),
      fonts: new GoogleFontProvider(),
    }),
    [],
  );

  // `OrbitEditorProps` has no onChange — `store.on('change')` is the documented
  // seam, and it fires once per committed transaction.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = store.on('change', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void saveProject({ id: row.id, kind: 'image', name: row.name, data: store.toJSON() });
      }, SAVE_DEBOUNCE_MS);
    });
    return () => {
      clearTimeout(timer);
      off?.();
    };
  }, [store, row.id, row.name]);

  return (
    <EditorProvider store={store} providers={providers} theme={theme}>
      {/* `.orbit` scopes the SDK's ~30 custom properties AND its `.o-*` class
          rules, both of which the reused section panels and the Konva selection
          chrome depend on. `orbitEmbedded` undoes its `position: absolute`. */}
      {/* `data-theme` follows the app, not a constant. Konva paints the
          selection chrome from the resolved `--o-*` values and re-reads on a
          `data-theme` mutation on an ancestor, so this attribute is also what
          makes the on-canvas handles change colour with the theme. */}
      <div className="orbit orbitEmbedded" data-theme={theme}>
        <StillShell row={row} store={store} onRename={onRename} />
      </div>
    </EditorProvider>
  );
}

function StillShell({
  row,
  store,
  onRename,
}: {
  row: ProjectRow;
  store: OrbitStore;
  onRename(name: string): void;
}) {
  useEditorShortcuts();
  const state = useEditorState();
  const history = useHistory();
  const element = useSelectedElement();
  const stageRef = useRef<Konva.Stage | null>(null);
  const tool = useDesign((s) => s.tool);
  const setTool = useDesign((s) => s.setTool);

  const page = state.doc.pages.find((p) => p.id === state.activePageId) ?? state.doc.pages[0];

  const insertMedia = useCallback(
    (media: MediaRow) => {
      if (media.mime.startsWith('audio/')) return;
      const ratio = media.width && media.height ? media.width / media.height : 1;
      // Fit inside the page rather than filling it — an inserted asset you have
      // to shrink before you can see its handles is worse than one you enlarge.
      const w = Math.min(page.width * 0.8, page.height * 0.8 * ratio);
      const h = w / ratio;
      store.addElement({
        type: 'image',
        src: mediaSrc(media.id),
        x: Math.round((page.width - w) / 2),
        y: Math.round((page.height - h) / 2),
        width: Math.round(w),
        height: Math.round(h),
        naturalWidth: media.width ?? Math.round(w),
        naturalHeight: media.height ?? Math.round(h),
      });
    },
    [store, page],
  );

  const panelBody = () => {
    switch (tool) {
      case 'design':
        return <StillDesignPanel />;
      case 'elements':
        return <ElementsSection.Panel />;
      case 'text':
        return <TextSection.Panel />;
      case 'photos':
        return <PhotosSection.Panel />;
      case 'layers':
        return <LayersSection.Panel />;
      case 'uploads':
        return (
          <MediaPanel
            filter="visual"
            accept="image/*"
            empty="Nothing uploaded yet. Images you add here stay in this browser."
            onInsert={insertMedia}
          />
        );
      case 'ai':
        return <AiPanel filter="visual" onInsert={insertMedia} />;
      default:
        return null;
    }
  };

  const label =
    tool === 'ai' ? 'Generate' : tool ? tool[0].toUpperCase() + tool.slice(1) : '';

  return (
    <DesignFrame
      bar={
        <DesignBar
          project={row}
          meta={`${page.width} × ${page.height}`}
          history={history}
          onRename={onRename}
        >
          <ExportButton stageRef={stageRef} />
        </DesignBar>
      }
      rail={<ToolRail kind="image" />}
      panel={
        tool ? (
          <ToolPanel title={label} onClose={() => setTool(null)}>
            {panelBody()}
          </ToolPanel>
        ) : null
      }
      canvas={
        <div className="o-canvas-wrap">
          <Workspace store={store} stageApiRef={stageRef} backdrop="transparent" />
          {/* The property bar is the element UI; `SelectionActions` stays because
              it is a different job — a few quick actions pinned to the object's
              own box, not a second copy of its properties. */}
          <ElementBar />
          <SelectionActions />
          <CanvasGuides />
          <ZoomControl stageRef={stageRef} />
        </div>
      }
      strip={<PageBar />}
    />
  );
}

/**
 * The SDK's own export menu, dropped into our bar.
 *
 * Loaded lazily because its PDF path pulls in jsPDF, which most sessions never
 * touch. While it loads the button is genuinely DISABLED rather than a live-
 * looking span that swallows a click — a control that looks ready and does
 * nothing is worse than one that admits it isn't.
 */
const ExportButton = dynamic(() => import('@orbit/editor').then((m) => m.ExportMenu), {
  ssr: false,
  loading: () => (
    <button className={styles.primary} disabled>
      Export
    </button>
  ),
});
