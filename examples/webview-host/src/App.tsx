import { useEffect, useMemo } from 'react';
import Konva from 'konva';
import { OrbitEditor } from '@orbit/editor';
import { createStore } from '@orbit/model';
import {
  DemoTemplateProvider,
  GoogleFontProvider,
  PicsumPhotoProvider,
  PresetBackgroundProvider,
} from '@orbit/providers';
import { exportPageToSVG, exportStageToDataURL } from '@orbit/render';
import { createHostBridge, createWebViewHostTransport } from '@orbit/react-native';

/**
 * The web build that runs INSIDE the React Native WebView. It mounts the v2
 * editor and attaches the host bridge so native code can drive and observe it.
 * Build with `vite build` (single-file output) and ship the HTML as an RN asset.
 */
export default function App() {
  const store = useMemo(() => createStore({ width: 1080, height: 1080 }), []);

  const providers = useMemo(
    () => ({
      templates: new DemoTemplateProvider(),
      photos: new PicsumPhotoProvider(),
      backgrounds: new PresetBackgroundProvider(),
      fonts: new GoogleFontProvider(),
    }),
    [],
  );

  useEffect(() => {
    return createHostBridge(store, createWebViewHostTransport(), {
      exporters: {
        svg: (s) => exportPageToSVG(s.activePage),
        raster: (format, opts) => {
          const stage = Konva.stages[0];
          if (!stage) throw new Error('No Konva stage available for raster export');
          const page = store.activePage;
          const vp = store.state.viewport;
          return exportStageToDataURL(stage, {
            pageWidth: page.width,
            pageHeight: page.height,
            zoom: vp.zoom,
            panX: vp.x,
            panY: vp.y,
            format,
            scale: opts?.scale ?? 2,
            quality: opts?.quality,
            background: opts?.background,
          });
        },
      },
    });
  }, [store]);

  return <OrbitEditor store={store} providers={providers} defaultTheme="light" />;
}
