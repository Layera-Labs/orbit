'use client';

/**
 * The page's one claim, demonstrated rather than asserted.
 *
 * Orbit defines every effect once and draws it twice — canvas in the browser,
 * ffmpeg on the server — and its test suite parses the real filtergraph to
 * check the two agree. A landing page could say that over a screenshot. This
 * runs it: the left of the wipe is `public/hero/export.png`, a frame pulled out
 * of an MP4 that ffmpeg actually encoded (see `scripts/gen-hero-frame.mjs`);
 * the right is the SAME project drawn live, in your browser, by the same
 * `frameStateAt` + `renderFrame` the editor's preview uses. The number
 * underneath is measured from those two pixel buffers on load.
 *
 * ## The exported frame is the fallback, deliberately
 *
 * The `<img>` is in the markup and visible before any of this runs. If the
 * script fails, if canvas is unavailable, if a reveal never fires — the reader
 * still sees a real frame of real output. Nothing here is gated on JavaScript
 * completing, because a hero that renders empty is worse than a hero that
 * renders static.
 *
 * ## About the numbers, and where they came from
 *
 * The headline is the share of the frame within 2/255, because that is the
 * figure the engine's own tests assert and so the one a reader can hold us to.
 *
 * The max is shown beside it rather than buried, and it is large — measured at
 * 94/255 on this frame. Sampling explains it exactly: every flat interior
 * (background, the rectangle's fill, the ellipse's fill) differs by 1, and the
 * single worst pixel sits ON the ellipse's 3px stroke, with its neighbours two
 * pixels away back at 1. The disagreement is one pixel wide and lives entirely
 * on antialiased edges.
 *
 * The cause is NOT chroma subsampling, which was the first guess and was wrong:
 * a near-white stroke on a near-black ground is a luma edge, and 4:2:0 does not
 * subsample luma. It is that the two paths rasterise the same SVG with
 * different rasterisers — resvg on the server, the browser's own in preview —
 * and that H.264 rings at a hard edge. Both are real and neither is the shared
 * effect maths this page is about, which is why the split is worth stating
 * rather than smoothing over.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { frameStateAt } from '@layera-labs/orbit-video/browser';
import { MediaPool, renderFrame } from '@layera-labs/orbit-video/preview';
import type { VideoProject } from '@layera-labs/orbit-video/types';
import project from '../hero/project.json';
import styles from './DualRender.module.css';

/** Must match `AT_SEC` in scripts/gen-hero-frame.mjs. */
const AT_SEC = 1;
const EXPORT_SRC = '/hero/export.png';

type Measured = { max: number; median: number; within2: number };

/** Decode one SVG string into something the compositor can draw. */
function decodeSVG(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('svg decode failed'));
    // A data URI rather than a blob URL: no object to revoke, and nothing to
    // leak if this component unmounts mid-decode.
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/**
 * Largest and median per-channel difference between two RGBA buffers.
 *
 * Alpha is skipped — the export is opaque by construction and comparing it
 * would only ever add zeros, dragging the median down and flattering the
 * result.
 */
function compare(a: Uint8ClampedArray, b: Uint8ClampedArray): Measured {
  // A 256-bucket histogram rather than an array of ~2.7M diffs: the median is
  // wanted, sorting that many numbers is not, and every value is already a
  // small integer.
  const hist = new Uint32Array(256);
  let max = 0;
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(a[i + c] - b[i + c]);
      hist[d]++;
      n++;
      if (d > max) max = d;
    }
  }
  let seen = 0;
  let median = 0;
  for (let d = 0; d < 256; d++) {
    seen += hist[d];
    if (seen >= n / 2) {
      median = d;
      break;
    }
  }
  // The engine's tests assert ≤2/255, so that is the bucket worth reporting.
  const within2 = (hist[0] + hist[1] + hist[2]) / n;
  return { max, median, within2 };
}

export function DualRender() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(52);
  const [measured, setMeasured] = useState<Measured | null>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    let alive = true;
    const canvas = canvasRef.current;
    if (!canvas) return;

    void (async () => {
      const p = project as unknown as VideoProject;
      const ops = frameStateAt(p, AT_SEC);

      const svgImages = new Map<string, HTMLImageElement>();
      for (const op of ops) {
        if (!op.svg || svgImages.has(op.svg)) continue;
        try {
          svgImages.set(op.svg, await decodeSVG(op.svg));
        } catch {
          /* One undecodable plate should cost that plate, not the frame. */
        }
      }
      if (!alive) return;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      renderFrame(ctx, ops, {
        pool: new MediaPool(),
        resolved: {},
        svgImages,
        playing: false,
        filterOK: true,
      });
      setDrawn(true);

      /*
       * Measure against the exported frame. Decoded into its own canvas rather
       * than read from the <img>, because getImageData needs a canvas and the
       * two buffers have to be the same dimensions to subtract.
       */
      const img = imgRef.current;
      if (!img) return;
      if (!img.complete) await img.decode().catch(() => undefined);
      if (!alive || !img.naturalWidth) return;

      const ref = document.createElement('canvas');
      ref.width = canvas.width;
      ref.height = canvas.height;
      const rctx = ref.getContext('2d', { willReadFrequently: true });
      if (!rctx) return;
      rctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      try {
        const mine = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const theirs = rctx.getImageData(0, 0, canvas.width, canvas.height).data;
        if (alive) setMeasured(compare(mine, theirs));
      } catch {
        /* A tainted canvas would throw; the frame still stands without a number. */
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const setFromClientX = useCallback((clientX: number) => {
    const box = frameRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const pct = ((clientX - box.left) / box.width) * 100;
    setSplit(Math.min(100, Math.max(0, pct)));
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setFromClientX(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.buttons !== 1) return;
    setFromClientX(e.clientX);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 2;
    if (e.key === 'ArrowLeft') setSplit((s) => Math.max(0, s - step));
    else if (e.key === 'ArrowRight') setSplit((s) => Math.min(100, s + step));
    else if (e.key === 'Home') setSplit(0);
    else if (e.key === 'End') setSplit(100);
    else return;
    e.preventDefault();
  };

  return (
    <figure className={styles.wrap}>
      <div
        ref={frameRef}
        className={styles.frame}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
      >
        {/*
          The exported frame sits underneath and is plain markup — it is what
          the page shows before, and without, any script.
        */}
        <img
          ref={imgRef}
          src={EXPORT_SRC}
          alt="A frame exported by ffmpeg: a rotated clay rectangle overlapping a stroked ellipse on a warm gradient."
          className={styles.layer}
          width={1280}
          height={720}
        />
        {/* The live one, clipped to the right of the divider. */}
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          aria-hidden="true"
          className={`${styles.layer} ${styles.canvas}`}
          style={{
            clipPath: `inset(0 0 0 ${split}%)`,
            opacity: drawn ? 1 : 0,
          }}
        />

        <div className={styles.divider} style={{ left: `${split}%` }} aria-hidden="true" />

        <div
          className={styles.handle}
          style={{ left: `${split}%` }}
          role="slider"
          tabIndex={0}
          aria-label="Wipe between the ffmpeg export and the live browser render"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(split)}
          aria-valuetext={`${Math.round(split)}% browser render`}
          onKeyDown={onKeyDown}
        />

        <span className={`${styles.tag} ${styles.tagLeft}`}>ffmpeg · mp4</span>
        <span className={`${styles.tag} ${styles.tagRight}`}>browser · canvas</span>
      </div>

      <figcaption className={styles.caption}>
        <span className={styles.capLead}>
          One project, drawn twice. Drag the divider.
        </span>
        {measured ? (
          <span className={styles.readout}>
            <span className={styles.metric}>
              <b>{(measured.within2 * 100).toFixed(1)}%</b>
              <span>of the frame within 2/255</span>
            </span>
            <span className={styles.metric}>
              <b>{measured.median}</b>
              <span>/255 median</span>
            </span>
            <span className={styles.metric}>
              <b>{measured.max}</b>
              <span>/255 worst pixel</span>
            </span>
            <span className={styles.note}>
              Measured in your browser, just now. The disagreement is one pixel
              wide and sits on antialiased edges — two SVG rasterisers and a
              lossy codec, not the effect maths. Every flat interior differs
              by 1.
            </span>
          </span>
        ) : (
          /*
           * Never a spinner in the layout: the caption's first line is the real
           * content and stands alone. The number arrives beside it or does not.
           */
          <span className={styles.readout} aria-hidden="true" />
        )}
      </figcaption>
    </figure>
  );
}
