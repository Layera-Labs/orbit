'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  FILTER_PRESETS,
  previewableTransitions,
  resolveTransitions,
  type CanvasFrame,
  type TextOverlay,
  type TransitionType,
  type VideoProject,
  type VisualTrackClip,
} from '@layera-labs/video/browser';
import { serverCapabilities } from '@/net/capabilities';
import { Icon } from '@/brand/Icon';
import { ColourRow, SwatchGrid } from '@/brand/Colour';
import { cutoutIsSupported, gradeIsExact } from '@layera-labs/video/preview';
import { newId } from '@/db/idb';
import {
  addOverlay,
  nextOverlayLayer,
  patchClip,
  setFrame,
  setTransition,
  useVideo,
  overlayLabel,
} from '@/store/videoStore';
import { CaptionsSection } from './Captions';
import { TransitionTile } from './TransitionTile';
import styles from './Panels.module.css';

/* ---------------------------------------------------------------- effects --- */

/** The two backdrops people actually shoot against, plus a free picker. */
const KEY_COLOURS = [
  { label: 'Green', value: '#00d400' },
  { label: 'Blue', value: '#0047bb' },
];

export const MOTIONS = ['none', 'zoomIn', 'zoomOut', 'panLeft', 'panRight', 'kenBurns'] as const;

const MOTION_LABEL: Record<string, string> = {
  none: 'None',
  zoomIn: 'Push in',
  zoomOut: 'Pull out',
  panLeft: 'Pan left',
  panRight: 'Pan right',
  kenBurns: 'Ken Burns',
};

export function EffectsPanel({ clip }: { clip: VisualTrackClip | null }) {
  const apply = useVideo((s) => s.apply);
  // Before the early return — these are hooks.
  const approximate = useGradeIsApproximate();
  const keyable = useCutoutIsSupported();

  if (!clip)
    return (
      <p className={styles.empty}>
        Select a clip on the timeline to grade it, soften it or give it a camera move.
      </p>
    );

  const preset = clip.filter?.preset ?? 'none';

  return (
    <div className={styles.stack}>
      <div className={styles.group}>
        <h3 className={styles.groupTitle}>Grade</h3>
        <div className={styles.presets}>
          {Object.keys(FILTER_PRESETS).map((key) => (
            <button
              key={key}
              className={styles.preset}
              data-on={preset === key}
              aria-pressed={preset === key}
              onClick={() =>
                apply((p) =>
                  patchClip(p, clip.id, {
                    filter: key === 'none' ? undefined : { preset: key },
                  }),
                )
              }
            >
              <span className={styles.presetSwatch} style={swatchFor(key)} />
              {key}
            </button>
          ))}
        </div>
        {approximate && (
          <p className={styles.note}>
            <Icon name="duration" size={12} /> This browser can&rsquo;t run the exact grade,
            so brightness and warmth preview approximately. The exported file is exact.
          </p>
        )}
      </div>

      <div className={styles.group}>
        <h3 className={styles.groupTitle}>Softness</h3>
        <Slider
          label="Blur"
          value={clip.blur ?? 0}
          min={0}
          max={1}
          step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => apply((p) => patchClip(p, clip.id, { blur: v || undefined }))}
        />
      </div>

      {/*
        Chroma key. Shipped now for the same reason the two below were: the
        preview genuinely keys, in a fragment shader running ffmpeg's own
        `colorkey` arithmetic. It stays hidden entirely where WebGL is missing —
        an effect the preview cannot show is worse than no control at all.
      */}
      {keyable && (
        <div className={styles.group}>
          <h3 className={styles.groupTitle}>Cut out a colour</h3>
          {clip.cutout ? (
            <>
              <SwatchGrid
                label="Key colour"
                colours={KEY_COLOURS.map((k) => k.value)}
                value={clip.cutout.color}
                onChange={(colour) =>
                  apply((p) => patchClip(p, clip.id, { cutout: { ...clip.cutout!, color: colour } }))
                }
              />
              {/* A swatch on a labelled row, not a full-width bar. The value IS
                  a colour, so it is allowed to be saturated — but a slab of key
                  green running the width of the panel would be the loudest thing
                  on screen, and it is a picker, not the subject. */}
              <ColourRow
                label="Exact colour"
                value={clip.cutout.color}
                onChange={(colour) =>
                  apply((p) => patchClip(p, clip.id, { cutout: { ...clip.cutout!, color: colour } }))
                }
              />
              <Slider
                label="Range"
                value={clip.cutout.similarity ?? 0.3}
                min={0.01}
                max={1}
                step={0.01}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(similarity) =>
                  apply((p) => patchClip(p, clip.id, { cutout: { ...clip.cutout!, similarity } }))
                }
              />
              <Slider
                label="Edge"
                value={clip.cutout.smoothness ?? 0.1}
                min={0}
                max={1}
                step={0.01}
                format={(v) => (v === 0 ? 'hard' : `${Math.round(v * 100)}%`)}
                onChange={(smoothness) =>
                  apply((p) => patchClip(p, clip.id, { cutout: { ...clip.cutout!, smoothness } }))
                }
              />
              <button
                className={`${styles.action} ${styles.danger}`}
                onClick={() => apply((p) => patchClip(p, clip.id, { cutout: undefined }))}
              >
                <Icon name="trash" size={14} />
                Remove key
              </button>
            </>
          ) : (
            <>
              <button
                className={styles.action}
                onClick={() =>
                  apply((p) =>
                    patchClip(p, clip.id, {
                      cutout: { color: '#00d400', similarity: 0.3, smoothness: 0.1 },
                    }),
                  )
                }
              >
                <Icon name="effects" size={14} />
                Key out a colour
              </button>
              <p className={styles.note}>
                Makes one colour transparent so the track beneath shows through — a green
                screen, or a flat backdrop.
              </p>
            </>
          )}
        </div>
      )}

      {/*
        Shipped only because the canvas actually draws both now — `compose.ts`
        resamples the region through the SAME `regionBoxPx`/`mosaicStepPx` the
        filtergraph uses. Before that they existed in the model and the export
        only, and offering them here would have been a control the preview
        silently ignored.
      */}
      <div className={styles.group}>
        <h3 className={styles.groupTitle}>Obscure a spot</h3>
        {clip.mosaic ? (
          <>
            <div className={`${styles.presets} ${styles.presetsPair}`}>
              {(['mosaic', 'hexagon', 'triangle', 'blur'] as const).map((pattern) => (
                <button
                  key={pattern}
                  className={styles.preset}
                  data-on={clip.mosaic!.pattern === pattern}
                  aria-pressed={clip.mosaic!.pattern === pattern}
                  onClick={() =>
                    apply((p) => patchClip(p, clip.id, { mosaic: { ...clip.mosaic!, pattern } }))
                  }
                >
                  {pattern}
                </button>
              ))}
            </div>
            <div className={`${styles.presets} ${styles.presetsPair}`}>
              {REGION_SHAPES.map((shape) => (
                <button
                  key={shape}
                  className={styles.preset}
                  data-on={clip.mosaic!.shape === shape}
                  aria-pressed={clip.mosaic!.shape === shape}
                  onClick={() =>
                    apply((p) => patchClip(p, clip.id, { mosaic: { ...clip.mosaic!, shape } }))
                  }
                >
                  {shape}
                </button>
              ))}
            </div>
            <RegionControls
              region={clip.mosaic}
              onChange={(patch) =>
                apply((p) => patchClip(p, clip.id, { mosaic: { ...clip.mosaic!, ...patch } }))
              }
            />
            <Slider
              label="Strength"
              value={clip.mosaic.amount}
              min={0}
              max={1}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(amount) =>
                apply((p) => patchClip(p, clip.id, { mosaic: { ...clip.mosaic!, amount } }))
              }
            />
            <button
              className={`${styles.action} ${styles.danger}`}
              onClick={() => apply((p) => patchClip(p, clip.id, { mosaic: undefined }))}
            >
              Remove
            </button>
          </>
        ) : (
          <button
            className={styles.action}
            onClick={() =>
              apply((p) =>
                patchClip(p, clip.id, {
                  mosaic: {
                    shape: 'rounded',
                    cx: 0.5,
                    cy: 0.4,
                    rx: 0.16,
                    ry: 0.1,
                    opacity: 1,
                    pattern: 'mosaic',
                    amount: 0.45,
                  },
                }),
              )
            }
          >
            <Icon name="elements" size={14} />
            Add a mosaic
          </button>
        )}
      </div>

      <div className={styles.group}>
        <h3 className={styles.groupTitle}>Magnify a spot</h3>
        {clip.magnifier ? (
          <>
            <div className={`${styles.presets} ${styles.presetsPair}`}>
              {REGION_SHAPES.map((shape) => (
                <button
                  key={shape}
                  className={styles.preset}
                  data-on={clip.magnifier!.shape === shape}
                  aria-pressed={clip.magnifier!.shape === shape}
                  onClick={() =>
                    apply((p) =>
                      patchClip(p, clip.id, { magnifier: { ...clip.magnifier!, shape } }),
                    )
                  }
                >
                  {shape}
                </button>
              ))}
            </div>
            <RegionControls
              region={clip.magnifier}
              onChange={(patch) =>
                apply((p) =>
                  patchClip(p, clip.id, { magnifier: { ...clip.magnifier!, ...patch } }),
                )
              }
            />
            <Slider
              label="Zoom"
              value={clip.magnifier.zoom}
              min={1}
              max={4}
              step={0.1}
              format={(v) => `${v.toFixed(1)}×`}
              onChange={(zoom) =>
                apply((p) => patchClip(p, clip.id, { magnifier: { ...clip.magnifier!, zoom } }))
              }
            />
            <Slider
              label="Rim"
              value={clip.magnifier.borderWidth}
              min={0}
              max={0.05}
              step={0.002}
              format={(v) => (v < 0.002 ? 'none' : `${(v * 100).toFixed(1)}%`)}
              onChange={(borderWidth) =>
                apply((p) =>
                  patchClip(p, clip.id, { magnifier: { ...clip.magnifier!, borderWidth } }),
                )
              }
            />
            <button
              className={`${styles.action} ${styles.danger}`}
              onClick={() => apply((p) => patchClip(p, clip.id, { magnifier: undefined }))}
            >
              Remove
            </button>
          </>
        ) : (
          <button
            className={styles.action}
            onClick={() =>
              apply((p) =>
                patchClip(p, clip.id, {
                  magnifier: {
                    shape: 'circle',
                    cx: 0.5,
                    cy: 0.4,
                    rx: 0.14,
                    ry: 0.08,
                    opacity: 1,
                    zoom: 2,
                    borderWidth: 0.006,
                    borderColor: '#f4f1ec',
                  },
                }),
              )
            }
          >
            <Icon name="zoomIn" size={14} />
            Add a lens
          </button>
        )}
      </div>

      <div className={styles.group}>
        <h3 className={styles.groupTitle}>Camera move</h3>
        <select
          className={styles.select}
          value={clip.motion?.type ?? 'none'}
          onChange={(e) =>
            apply((p) =>
              patchClip(p, clip.id, {
                motion:
                  e.target.value === 'none'
                    ? undefined
                    : { type: e.target.value as 'zoomIn', intensity: clip.motion?.intensity ?? 0.6 },
              }),
            )
          }
        >
          {MOTIONS.map((m) => (
            <option key={m} value={m}>
              {MOTION_LABEL[m]}
            </option>
          ))}
        </select>
        {clip.motion && (
          <Slider
            label="Intensity"
            value={clip.motion.intensity ?? 0.6}
            min={0.1}
            max={1}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) =>
              apply((p) =>
                patchClip(p, clip.id, { motion: { ...clip.motion!, intensity: v } }),
              )
            }
          />
        )}
      </div>
    </div>
  );
}

const REGION_SHAPES = ['rectangle', 'rounded', 'circle', 'diamond'] as const;

/** Where a local effect sits and how big it is, in normalized clip space. */
function RegionControls({
  region,
  onChange,
}: {
  region: { cx: number; cy: number; rx: number; ry: number };
  onChange(patch: Partial<{ cx: number; cy: number; rx: number; ry: number }>): void;
}) {
  return (
    <>
      <Slider
        label="Across"
        value={region.cx}
        min={0}
        max={1}
        step={0.01}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(cx) => onChange({ cx })}
      />
      <Slider
        label="Down"
        value={region.cy}
        min={0}
        max={1}
        step={0.01}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(cy) => onChange({ cy })}
      />
      <Slider
        label="Width"
        value={region.rx}
        min={0.02}
        max={0.5}
        step={0.01}
        format={(v) => `${Math.round(v * 200)}%`}
        onChange={(rx) => onChange({ rx })}
      />
      <Slider
        label="Height"
        value={region.ry}
        min={0.02}
        max={0.5}
        step={0.01}
        format={(v) => `${Math.round(v * 200)}%`}
        onChange={(ry) => onChange({ ry })}
      />
    </>
  );
}

/* ------------------------------------------------------------ transitions --- */

const FADE_LENGTHS = [0.25, 0.5, 1, 1.5];

/**
 * The transitions BOTH previews render, which is not all the export renders.
 *
 * `previewableTransitions()` reads the same tables `xfadeStateAt` reads, so
 * this list grows the moment a family lands in the renderer and not a commit
 * before. The alternative — a hand-kept list of the ones that work — is exactly
 * how a picker ends up promising a wipe while the canvas shows a cut.
 */
export function TransitionsPanel({ clip }: { clip: VisualTrackClip | null }) {
  const apply = useVideo((s) => s.apply);
  const project = useVideo((s) => s.project);
  /*
   * ...and only what THIS render server's ffmpeg can parse. A transition token
   * is a property of the build: `cover*`/`reveal*` — Push and Reveal — arrived
   * in ffmpeg 6.1, and an older one does not render them wrongly, it refuses
   * to build the filtergraph and takes the export with it. Unknown subtracts
   * nothing (see `capabilities.ts`), so a dev machine with no service running
   * still shows the full picker.
   *
   * Probed BEFORE the `!clip` early return, or this would be a conditional
   * hook.
   */
  const [tokens, setTokens] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    void serverCapabilities().then((caps) => {
      if (alive) setTokens(caps.transitions);
    });
    return () => {
      alive = false;
    };
  }, []);
  const families = useMemo(() => previewableTransitions(tokens), [tokens]);

  if (!clip)
    return (
      <p className={styles.empty}>
        Select a clip on the base track, or click the marker between two clips, to set how
        it comes in.
      </p>
    );

  const current = clip.transitionIn;
  const type: TransitionType = current?.type ?? 'cut';
  const duration = current?.duration ?? 0.5;

  /*
   * Why this boundary is not doing what was asked, in the resolver's own words.
   * A blended clip's export branch reads the canvas accumulated under it and an
   * xfade run has no such canvas, so the boundary collapses to a crossfade —
   * which under overlap costs nothing, but the picker should say so rather than
   * let someone pick a wipe four times.
   */
  const main = project?.tracks?.find((t) => t.kind === 'visual');
  const downgraded =
    main && main.kind === 'visual'
      ? resolveTransitions(main.clips).boundaries.find((b) => b.nextId === clip.id)
          ?.downgraded
      : undefined;

  const set = (t: TransitionType, d = duration) =>
    apply((p) =>
      setTransition(p, clip.id, t === 'cut' ? undefined : { type: t, duration: d }),
    );

  return (
    <div className={styles.stack}>
      {families.map((f) => (
        <div key={f.key} className={styles.group}>
          <h3 className={styles.groupTitle}>{f.label}</h3>
          <div
            className={`${styles.presets} ${
              f.variants.length === 2 ? styles.presetsPair : ''
            }`}
          >
            {f.variants.map((v) => (
              <button
                key={v.type}
                className={styles.preset}
                data-on={type === v.type}
                aria-pressed={type === v.type}
                title={v.label}
                onClick={() => set(v.type)}
              >
                <TransitionTile type={v.type} />
                {v.dir ?? v.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      {type !== 'cut' && (
        <div className={styles.group}>
          <h3 className={styles.groupTitle}>Length</h3>
          <div className={styles.presets}>
            {FADE_LENGTHS.map((d) => (
              <button
                key={d}
                className={styles.preset}
                data-on={Math.abs(duration - d) < 0.01}
                aria-pressed={Math.abs(duration - d) < 0.01}
                onClick={() => set(type, d)}
              >
                {d}s
              </button>
            ))}
          </div>
        </div>
      )}

      {downgraded === 'blend' && (
        <p className={styles.note}>
          This clip uses a blend mode, so its transition renders as a crossfade in both
          the preview and the file.
        </p>
      )}

      <p className={styles.note}>
        Transitions apply to the base track only. One overlaps the two clips, so adding it
        makes the base track shorter — music and captions stay where they are.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ text --- */

const TEXT_PRESETS: {
  label: string;
  fontSize: number;
  bold: boolean;
  y: number;
  stroke?: TextOverlay['stroke'];
  box?: TextOverlay['box'];
}[] = [
  { label: 'Title', fontSize: 96, bold: true, y: 0.46 },
  { label: 'Subtitle', fontSize: 56, bold: false, y: 0.56 },
  {
    label: 'Subtitle plate',
    fontSize: 44,
    bold: false,
    y: 0.86,
    box: { color: '#000000', opacity: 0.5, padding: 18 },
  },
  {
    label: 'Caption',
    fontSize: 44,
    bold: true,
    y: 0.86,
    stroke: { color: '#000000', width: 6 },
  },
];

const TEXT_SECONDS = 4;

export function MotionTextPanel({
  project,
  time,
  selection,
  onSelect,
}: {
  project: VideoProject;
  time: number;
  selection: string | null;
  onSelect(id: string): void;
}) {
  const apply = useVideo((s) => s.apply);
  const overlays = [...(project.overlays ?? [])].sort((a, b) => a.start - b.start);

  const add = (preset: (typeof TEXT_PRESETS)[number]) =>
    apply((p) =>
      addOverlay(p, {
        id: newId('txt'),
        type: 'text',
        text: preset.label,
        start: r2(time),
        end: r2(time + TEXT_SECONDS),
        x: 0.5,
        y: preset.y,
        fontSize: preset.fontSize,
        color: '#ffffff',
        align: 'center',
        bold: preset.bold,
        stroke: preset.stroke,
        box: preset.box,
        // A new caption gets its own lane, so it never lands on top of one that
        // is already there and steals its clicks.
        layer: nextOverlayLayer(p),
      }),
    );

  return (
    <div className={styles.stack}>
      <div className={styles.group}>
        <h3 className={styles.groupTitle}>Add</h3>
        <p className={styles.note}>
          Added at the playhead, {TEXT_SECONDS} seconds long. Drag its ends on the timeline
          to re-time it.
        </p>
        {TEXT_PRESETS.map((preset) => (
          <button key={preset.label} className={styles.action} onClick={() => add(preset)}>
            <Icon name="text" size={14} />
            {preset.label}
          </button>
        ))}
      </div>

      <CaptionsSection project={project} selection={selection} />

      {overlays.length > 0 && (
        <div className={styles.group}>
          <h3 className={styles.groupTitle}>In this project</h3>
          {/* A list, because a short caption at low zoom is a sliver on the
              timeline and hunting for it is not editing. */}
          {overlays.map((o) => (
            <button
              key={o.id}
              className={styles.action}
              data-on={selection === o.id}
              // `current`, not `pressed`: this is which caption is selected,
              // not a control that has been switched on.
              aria-current={selection === o.id}
              onClick={() => onSelect(o.id)}
              style={{ justifyContent: 'space-between' }}
            >
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {overlayLabel(o)}
              </span>
              <span className={`${styles.cost} w-data`}>{o.start.toFixed(1)}s</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/* ---------------------------------------------------------------- design --- */

const SIZES = [
  { label: 'Story', w: 1080, h: 1920 },
  { label: 'Square', w: 1080, h: 1080 },
  { label: 'Wide', w: 1920, h: 1080 },
  { label: 'Portrait', w: 1080, h: 1350 },
  { label: 'Cinema', w: 1920, h: 816 },
  { label: '4K wide', w: 3840, h: 2160 },
];

const BACKDROPS = ['#000000', '#100f0e', '#211f1d', '#f4f1ec', '#6f8f63', '#c4553d'];

export function MotionDesignPanel({ project }: { project: VideoProject }) {
  const apply = useVideo((s) => s.apply);
  const background = project.background;

  return (
    <div className={styles.stack}>
      <div className={styles.group}>
        {/* "Size", not "Frame" — the mat below is the Frame, and two groups
            wearing one name in a single panel is the one thing a legend may
            not do. The still panel says Size for the same reason. */}
        <h3 className={styles.groupTitle}>Size</h3>
        <div className={styles.presets}>
          {SIZES.map((s) => (
            <button
              key={s.label}
              className={styles.preset}
              data-on={project.width === s.w && project.height === s.h}
              aria-pressed={project.width === s.w && project.height === s.h}
              onClick={() => apply((p) => ({ ...p, width: s.w, height: s.h }))}
            >
              <span
                className={styles.presetSwatch}
                style={{
                  // A real proportional preview of the frame, not a generic tile.
                  width: `${Math.min(100, (s.w / s.h) * 46)}%`,
                  height: 34,
                  margin: '0 auto',
                }}
              />
              {s.label}
            </button>
          ))}
        </div>
        <p className={`${styles.note} w-data`}>
          {project.width} × {project.height} · {project.fps ?? 30} fps
        </p>
      </div>

      <div className={styles.group}>
        <h3 className={styles.groupTitle}>Backdrop</h3>
        <SwatchGrid
          label="Backdrop"
          colours={BACKDROPS}
          value={background?.type === 'color' ? background.color : undefined}
          onChange={(colour) =>
            apply((p) => ({ ...p, background: { type: 'color', color: colour } }))
          }
        />
        {/* The video model stores a gradient as `{from, to, angle}` rather than
            a CSS string, so the picker's CSS is parsed back apart here. Same
            control, two storage shapes. */}
        <ColourRow
          label="Custom"
          value={background?.type === 'color' ? background.color : '#000000'}
          onChange={(colour) =>
            apply((p) => ({ ...p, background: { type: 'color', color: colour } }))
          }
          gradient={{
            value:
              background?.type === 'gradient'
                ? `linear-gradient(${background.angle ?? 180}deg, ${background.from}, ${background.to})`
                : null,
            onChange: (css) => {
              const angle = Number(/(-?\d+(?:\.\d+)?)deg/.exec(css)?.[1] ?? 180);
              const stops = [...css.matchAll(/#[0-9a-fA-F]{3,8}/g)].map((m) => m[0]);
              if (stops.length < 2) return;
              apply((p) => ({
                ...p,
                background: { type: 'gradient', from: stops[0], to: stops[stops.length - 1], angle },
              }));
            },
          }}
        />
      </div>

      <FrameGroup project={project} />
    </div>
  );
}

/** A mat that starts visible without yet eating into the picture. */
const DEFAULT_FRAME_WIDTH = 0.03;

/**
 * The mat around the picture.
 *
 * One rectangle with a rounded-rect hole punched through it, filled even-odd —
 * the same shape all three renderers already draw. Everything here is a
 * FRACTION of `min(W, H)` rather than a pixel count, which is what lets a frame
 * authored at 1080p survive an export at 4K.
 *
 * Two things are worth saying in the UI rather than leaving to be discovered.
 *
 * **Switching it on seeds the colour from the background.** The band has to
 * start as something, and matching what is already behind the picture makes the
 * first frame read as "the corners got rounded" instead of "a coloured border
 * appeared out of nowhere". The renderers know nothing about this; it is a
 * default chosen once, here.
 *
 * **Opacity below 1 shows the picture through the corner wedges too**, because
 * the band and the wedges are one path and no renderer can separate them.
 * Saying so costs a line; finding out costs an export.
 */
function FrameGroup({ project }: { project: VideoProject }) {
  const apply = useVideo((s) => s.apply);
  const frame = project.frame;
  const bgColour = project.background?.type === 'color' ? project.background.color : '#000000';

  const patch = (next: Partial<CanvasFrame>) =>
    apply((p) => setFrame(p, { ...(p.frame ?? { color: bgColour, width: DEFAULT_FRAME_WIDTH }), ...next }));

  return (
    <div className={styles.group}>
      <h3 className={styles.groupTitle}>Frame</h3>
      <button
        className={styles.action}
        aria-pressed={!!frame}
        onClick={() =>
          apply((p) => setFrame(p, p.frame ? undefined : { color: bgColour, width: DEFAULT_FRAME_WIDTH }))
        }
      >
        {frame ? 'Remove the frame' : 'Add a frame'}
      </button>

      {frame && (
        <>
          <ColourRow label="Colour" value={frame.color} onChange={(color) => patch({ color })} />
          <Slider
            label="Thickness"
            value={frame.width}
            min={0}
            max={0.15}
            step={0.002}
            format={(v) => `${(v * 100).toFixed(1)}%`}
            onChange={(width) => patch({ width: round3(width) })}
          />
          <Slider
            label="Corner radius"
            value={frame.radius ?? 0}
            min={0}
            max={0.25}
            step={0.005}
            format={(v) => `${(v * 100).toFixed(1)}%`}
            onChange={(radius) => patch({ radius: round3(radius) })}
          />
          <Slider
            label="Opacity"
            value={frame.opacity ?? 1}
            min={0.1}
            max={1}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(opacity) => patch({ opacity: round3(opacity) })}
          />
          <p className={styles.note}>
            Thickness and radius are fractions of the short edge, so the frame holds its
            proportions at any export size. Below full opacity the picture shows through the
            corners as well as the band; they are one shape.
            {project.background?.type === 'image' &&
              ' On a photo backdrop the corners outside a rounded frame render black — a flat image cannot be carried into the frame itself.'}
          </p>
        </>
      )}
    </div>
  );
}

/** Slider steps land on float fuzz; three places is finer than any renderer reads. */
const round3 = (v: number) => Math.round(v * 1000) / 1000;

/* ---------------------------------------------------------------- shared --- */

export function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format(v: number): string;
  onChange(v: number): void;
}) {
  return (
    <div className={styles.field}>
      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>{label}</span>
        <span className={`${styles.fieldValue} w-data`}>{format(value)}</span>
      </div>
      <input
        className={styles.range}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
    </div>
  );
}

/**
 * True where this browser refuses `ctx.filter = 'url(#…)'`, so the grade falls
 * back to the CSS approximation and brightness (and temperature) drift.
 *
 * It replaces an `isTemperaturePreset` badge that claimed warmth was always
 * approximate. It no longer is — `temperatureGains` reproduces ffmpeg's Kelvin
 * shift exactly — so the honest warning is about the fallback, not the preset.
 *
 * Read in an effect rather than at render: the check needs a real canvas, and
 * answering `false` during SSR and `true` after hydration is a mismatch.
 */
export function useCutoutIsSupported(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => setOk(cutoutIsSupported()), []);
  return ok;
}

export function useGradeIsApproximate(): boolean {
  const [approx, setApprox] = useState(false);
  useEffect(() => setApprox(!gradeIsExact()), []);
  return approx;
}

/** A swatch that actually shows what the grade does, not a coloured box. */
function swatchFor(key: string): React.CSSProperties {
  const p = FILTER_PRESETS[key];
  if (!p) return {};
  const warmth = (p.temperature ?? 0) * 40;
  return {
    background: `linear-gradient(90deg,
      hsl(${30 - warmth} ${20 + (p.saturation ?? 1) * 18}% ${28 + (p.brightness ?? 0) * 60}%),
      hsl(${210 - warmth} ${10 + (p.saturation ?? 1) * 14}% ${52 + (p.brightness ?? 0) * 60}%))`,
    filter: `contrast(${p.contrast ?? 1})`,
  };
}
