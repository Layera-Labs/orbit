'use client';

import {
  FILTER_PRESETS,
  type TextOverlay,
  type VideoProject,
  type VisualTrackClip,
} from '@orbit/video/browser';
import { Icon } from '@/brand/Icon';
import { newId } from '@/db/idb';
import { addOverlay, nextOverlayLayer, patchClip, useVideo } from '@/store/videoStore';
import styles from './Panels.module.css';

/* ---------------------------------------------------------------- effects --- */

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
        {isTemperaturePreset(preset) && (
          <p className={styles.note}>
            <Icon name="duration" size={12} /> Warmth previews approximately here; the
            exported file is exact.
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
 * Cut and Fade, and nothing else — deliberately.
 *
 * `TransitionType` also has dissolve, slide, wipe and zoom, but
 * `buildMultiTrackArgs` collapses every non-cut type to a fade through black,
 * and `frameStateAt` reproduces that collapse so the preview can never be better
 * than the export. Offering "Slide" here would name something neither surface
 * does. It applies only to the base visual track, for the same reason.
 */
export function TransitionsPanel({ clip }: { clip: VisualTrackClip | null }) {
  const apply = useVideo((s) => s.apply);

  if (!clip)
    return (
      <p className={styles.empty}>
        Select a clip on the base track, or click the marker between two clips, to set how
        it comes in.
      </p>
    );

  const current = clip.transitionIn;
  const isFade = !!current && current.type !== 'cut';

  return (
    <div className={styles.stack}>
      <div className={styles.group}>
        <h3 className={styles.groupTitle}>Coming in</h3>
        <div className={styles.presets}>
          <button
            className={styles.preset}
            data-on={!isFade}
            onClick={() => apply((p) => patchClip(p, clip.id, { transitionIn: undefined }))}
          >
            <span className={styles.presetSwatch} />
            Cut
          </button>
          <button
            className={styles.preset}
            data-on={isFade}
            onClick={() =>
              apply((p) =>
                patchClip(p, clip.id, {
                  transitionIn: { type: 'fade', duration: current?.duration ?? 0.5 },
                }),
              )
            }
          >
            <span
              className={styles.presetSwatch}
              style={{ background: 'linear-gradient(90deg, #100f0e, #4a4640)' }}
            />
            Fade
          </button>
        </div>
      </div>

      {isFade && (
        <div className={styles.group}>
          <h3 className={styles.groupTitle}>Length</h3>
          <div className={styles.presets}>
            {FADE_LENGTHS.map((d) => (
              <button
                key={d}
                className={styles.preset}
                data-on={Math.abs((current?.duration ?? 0) - d) < 0.01}
                onClick={() =>
                  apply((p) =>
                    patchClip(p, clip.id, { transitionIn: { type: 'fade', duration: d } }),
                  )
                }
              >
                {d}s
              </button>
            ))}
          </div>
        </div>
      )}

      <p className={styles.note}>
        Transitions apply to the base track only, and render as a fade in both the preview
        and the exported file.
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
                {o.text || 'Text'}
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
        <h3 className={styles.groupTitle}>Frame</h3>
        <div className={styles.presets}>
          {SIZES.map((s) => (
            <button
              key={s.label}
              className={styles.preset}
              data-on={project.width === s.w && project.height === s.h}
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
        <div className={styles.presets}>
          {BACKDROPS.map((colour) => (
            <button
              key={colour}
              className={styles.preset}
              data-on={background?.type === 'color' && background.color === colour}
              onClick={() =>
                apply((p) => ({ ...p, background: { type: 'color', color: colour } }))
              }
              aria-label={colour}
            >
              <span className={styles.presetSwatch} style={{ background: colour }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

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

export function isTemperaturePreset(preset: string): boolean {
  const p = FILTER_PRESETS[preset];
  return !!p && p.temperature !== 0;
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
