'use client';

import { useState } from 'react';
import { Icon } from '@/brand/Icon';
import { SwatchGrid } from '@/brand/Colour';
import { addMedia } from '@/db/media';
import { mediaSrc, type MediaRow } from '@/db/schema';
import { addOverlayClip, useVideo } from '@/store/videoStore';
import { MediaPanel } from './MediaPanel';
import styles from './Panels.module.css';

const SIZE = 512;
const SECONDS = 4;

/**
 * Marks, drawn here rather than pulled from a pack.
 *
 * They are the same construction as the app's own icon set — a FRAME or a RULE
 * plus a solid disc where a value is read — so a sticker looks like it belongs
 * to this product instead of like an emoji sheet dropped in to fill a panel.
 * Each is a `d`/shape list rendered into one 24-unit box.
 */
const MARKS: { id: string; label: string; body: string }[] = [
  {
    id: 'disc',
    label: 'Disc',
    body: '<circle cx="12" cy="12" r="7" fill="COLOR"/>',
  },
  {
    id: 'ring',
    label: 'Ring',
    body: '<circle cx="12" cy="12" r="8" fill="none" stroke="COLOR" stroke-width="2"/>',
  },
  {
    id: 'reading',
    label: 'Reading',
    body:
      '<circle cx="12" cy="12" r="3.4" fill="COLOR"/>' +
      '<path d="M12 1.5 V5 M12 19 V22.5 M1.5 12 H5 M19 12 H22.5" stroke="COLOR" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: 'frame',
    label: 'Frame',
    body:
      '<rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="COLOR" stroke-width="2"/>',
  },
  {
    id: 'brackets',
    label: 'Brackets',
    body:
      '<path d="M8 3 H3 V21 H8 M16 3 H21 V21 H16" fill="none" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  {
    id: 'arrow',
    label: 'Arrow',
    body:
      // Up-and-out, not the stock horizontal CTA arrow.
      '<path d="M6 18 L18 6 M9 6 H18 V15" fill="none" stroke="COLOR" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  {
    id: 'rule',
    label: 'Graduation',
    body:
      '<path d="M2 12 H22" stroke="COLOR" stroke-width="1.8" stroke-linecap="round"/>' +
      '<path d="M6 12 V7 M12 12 V5.5 M18 12 V7" stroke="COLOR" stroke-width="1.8" stroke-linecap="round"/>' +
      '<circle cx="12" cy="17" r="2.4" fill="COLOR"/>',
  },
  {
    id: 'crosshair',
    label: 'Crosshair',
    body:
      '<circle cx="12" cy="12" r="8" fill="none" stroke="COLOR" stroke-width="1.8"/>' +
      '<path d="M12 2 V8 M12 16 V22 M2 12 H8 M16 12 H22" stroke="COLOR" stroke-width="1.8" stroke-linecap="round"/>',
  },
];

/** Three tones off the palette, not a colour wheel. */
const TONES = [
  { id: 'chalk', label: 'Chalk', value: '#f4f1ec' },
  { id: 'ink', label: 'Ink', value: '#100f0e' },
  { id: 'clay', label: 'Clay', value: '#c4553d' },
];

const svgFor = (body: string, colour: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${SIZE}" height="${SIZE}">${body.replaceAll(
    'COLOR',
    colour,
  )}</svg>`;

/**
 * Rasterize before storing.
 *
 * The mark is authored as SVG, but the export hands the file to ffmpeg, which
 * cannot read SVG — so the thing we persist has to be a PNG. Doing it here means
 * what the preview draws and what the export overlays are the same pixels.
 */
async function rasterize(svg: string): Promise<Blob | null> {
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  return new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'));
}

export function StickersPanel({ time }: { time: number }) {
  const apply = useVideo((s) => s.apply);
  const [tone, setTone] = useState(TONES[0]);
  const [busy, setBusy] = useState<string | null>(null);

  const place = (src: string, ratio: number) =>
    apply((p) => {
      // A square-ish mark at a quarter width, top-left, clear of the edge. Its
      // rect is normalized, so it means the same thing at any output size.
      const w = 0.26;
      const h = Math.min(0.9, (w * p.width) / p.height / ratio);
      return addOverlayClip(p, {
        type: 'image',
        src,
        start: Math.round(time * 100) / 100,
        duration: SECONDS,
        rect: { x: 0.08, y: 0.08, w, h },
        note: 'Sticker',
      });
    });

  const addMark = async (mark: (typeof MARKS)[number]) => {
    setBusy(mark.id);
    try {
      const blob = await rasterize(svgFor(mark.body, tone.value));
      if (!blob) return;
      const { src } = await addMedia({
        blob,
        name: `${mark.label} (${tone.label})`,
        origin: 'stock',
        mime: 'image/png',
        width: SIZE,
        height: SIZE,
      });
      place(src, 1);
    } finally {
      setBusy(null);
    }
  };

  const addImage = (row: MediaRow) =>
    place(mediaSrc(row.id), row.width && row.height ? row.width / row.height : 1);

  return (
    <div className={styles.stack}>
      <div className={styles.group}>
        <h3 className={styles.groupTitle}>Tone</h3>
        <SwatchGrid
          label="Tone"
          colours={TONES.map((t) => t.value)}
          value={tone.value}
          onChange={(value) => setTone(TONES.find((t) => t.value === value) ?? TONES[0])}
        />
      </div>

      <div className={styles.group}>
        <h3 className={styles.groupTitle}>Marks</h3>
        <div className={styles.presets}>
          {MARKS.map((mark) => (
            <button
              key={mark.id}
              className={styles.preset}
              disabled={busy === mark.id}
              onClick={() => void addMark(mark)}
              title={mark.label}
            >
              {/*
                The preview is drawn in `currentColor`, NOT in the chosen tone.
                Painting it in the tone meant the mark took the same colour as
                the surface it sits on — chalk on a light panel was invisible,
                and ink on the dark theme was too. The tone is shown by the
                swatches above; this shows the SHAPE, which is what is being
                picked here. No tile behind it either.
              */}
              <span
                className={styles.markPreview}
                dangerouslySetInnerHTML={{
                  __html: `<svg viewBox="0 0 24 24" width="24" height="24">${mark.body.replaceAll(
                    'COLOR',
                    'currentColor',
                  )}</svg>`,
                }}
              />
              {mark.label}
            </button>
          ))}
        </div>
        <p className={styles.note}>
          Placed over the picture on an overlay track, four seconds long. Position and size
          it in the inspector, or drag its ends on the timeline.
        </p>
      </div>

      <div className={styles.group}>
        <h3 className={styles.groupTitle}>Your images</h3>
        {/* Stills only. Footage over footage is a picture-in-picture and
            belongs in the Video panel, not here. */}
        <MediaPanel
          filter="image"
          allowUpload={false}
          empty="Upload an image and it can be placed over the picture as a sticker."
          onInsert={addImage}
        />
      </div>

      <p className={styles.note}>
        <Icon name="duration" size={12} /> Marks are rasterized when added, so the exported
        file shows exactly what the preview does.
      </p>
    </div>
  );
}
