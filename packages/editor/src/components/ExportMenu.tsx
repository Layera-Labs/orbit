import { useState, type MutableRefObject } from 'react';
import type Konva from 'konva';
import { dataURLToBlob, exportPageToSVG, exportStageToDataURL, svgStringToBlob } from '@orbit/render';
import { useStore } from '../context';
import { Icon } from './Icon';

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportMenu({ stageRef }: { stageRef: MutableRefObject<Konva.Stage | null> }) {
  const store = useStore();
  const [open, setOpen] = useState(false);

  const raster = async (format: 'png' | 'jpeg') => {
    const stage = stageRef.current;
    if (!stage) return;
    store.deselect();
    // wait a frame so the transformer clears before capture
    await new Promise((r) => requestAnimationFrame(r));
    const page = store.activePage;
    const vp = store.state.viewport;
    const dataURL = exportStageToDataURL(stage, {
      pageWidth: page.width,
      pageHeight: page.height,
      zoom: vp.zoom,
      panX: vp.x,
      panY: vp.y,
      format,
      scale: 2,
      background: format === 'jpeg' ? '#ffffff' : undefined,
    });
    download(dataURLToBlob(dataURL), `orbit-design.${format === 'jpeg' ? 'jpg' : 'png'}`);
    setOpen(false);
  };

  const pdf = async () => {
    const stage = stageRef.current;
    if (!stage) return;
    store.deselect();
    await new Promise((r) => requestAnimationFrame(r));
    const page = store.activePage;
    const vp = store.state.viewport;
    const dataURL = exportStageToDataURL(stage, {
      pageWidth: page.width,
      pageHeight: page.height,
      zoom: vp.zoom,
      panX: vp.x,
      panY: vp.y,
      format: 'jpeg',
      scale: 2,
    });
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({
      orientation: page.width >= page.height ? 'landscape' : 'portrait',
      unit: 'px',
      format: [page.width, page.height],
    });
    doc.addImage(dataURL, 'JPEG', 0, 0, page.width, page.height);
    download(doc.output('blob'), 'orbit-design.pdf');
    setOpen(false);
  };

  const svg = () => {
    const markup = exportPageToSVG(store.activePage);
    download(svgStringToBlob(markup), 'orbit-design.svg');
    setOpen(false);
  };

  const json = () => {
    const blob = new Blob([JSON.stringify(store.toJSON(), null, 2)], {
      type: 'application/json',
    });
    download(blob, 'orbit-design.json');
    setOpen(false);
  };

  return (
    <div style={{ position: 'relative' }}>
      <button className="o-btn-primary" onClick={() => setOpen((o) => !o)}>
        <Icon name="export" size={16} /> Export
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 55 }} onClick={() => setOpen(false)} />
          <div className="o-menu">
            <button onClick={() => raster('png')}><Icon name="image" size={16} /> PNG image</button>
            <button onClick={() => raster('jpeg')}><Icon name="image" size={16} /> JPG image</button>
            <button onClick={svg}><Icon name="code" size={16} /> SVG (.svg)</button>
            <button onClick={pdf}><Icon name="export" size={16} /> PDF document</button>
            <button onClick={json}><Icon name="template" size={16} /> JSON (.json)</button>
          </div>
        </>
      )}
    </div>
  );
}
