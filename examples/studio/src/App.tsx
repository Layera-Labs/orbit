import { useMemo } from 'react';
import { OrbitEditor } from '@layera-labs/editor';
import { createStore } from '@layera-labs/model';
import {
  DemoTemplateProvider,
  GoogleFontProvider,
  PicsumPhotoProvider,
  PresetBackgroundProvider,
} from '@layera-labs/providers';

export default function App() {
  const store = useMemo(() => {
    const s = createStore({ width: 1080, height: 1080 });
    s.addElement({
      type: 'text',
      text: 'Page one',
      x: 90,
      y: 470,
      width: 900,
      height: 100,
      fontSize: 76,
      fontWeight: 600,
      fill: '#0a0a0a',
      align: 'center',
    });
    const p2 = s.addPage();
    s.addElement(
      { type: 'shape', shape: 'ellipse', x: 340, y: 340, width: 400, height: 400, fill: '#10b981' },
      p2,
    );
    s.setActivePage(s.state.doc.pages[0].id);
    s.deselect();
    (window as unknown as { __store: typeof s }).__store = s;
    return s;
  }, []);

  const providers = useMemo(
    () => ({
      templates: new DemoTemplateProvider(),
      photos: new PicsumPhotoProvider(),
      backgrounds: new PresetBackgroundProvider(),
      fonts: new GoogleFontProvider(),
    }),
    [],
  );

  return <OrbitEditor store={store} providers={providers} defaultTheme="light" />;
}
