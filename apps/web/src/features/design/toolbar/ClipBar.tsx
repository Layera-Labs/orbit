'use client';

import {
  MAX_VOLUME,
  fadesOf,
  maxFadeFor,
  resolveAnim,
  snapAngle,
  withFades,
  withVolume,
} from '@orbit/video/browser';
import type {
  AudioTrackClip,
  BlendMode,
  ElementAnim,
  SlideEdge,
  TextOverlay,
  VideoProject,
  VisualTrackClip,
  VolumePoint,
} from '@orbit/video/browser';
import { ColourPicker } from '@/brand/Colour';
import {
  duplicateClip,
  duplicateOverlay,
  patchClip,
  removeClip,
  removeOverlay,
  rippleDeleteClip,
  rippleDeleteOverlay,
  setClipRect,
  setClipTransform,
  setElementAnim,
  splitAt,
  updateOverlay,
  useVideo,
} from '@/store/videoStore';
import {
  BarButton,
  BarMenu,
  MenuItem,
  NumField,
  PropertyBar,
  Segmented,
  Sep,
  SliderRow,
  barStyles as styles,
} from './controls';

const BLENDS: BlendMode[] = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'difference',
  'add',
];

const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 4];

const ALIGNS = [
  { id: 'left' as const, icon: 'alignLeft' as const, label: 'Align left' },
  { id: 'center' as const, icon: 'alignCenter' as const, label: 'Align centre' },
  { id: 'right' as const, icon: 'alignRight' as const, label: 'Align right' },
];

/**
 * The selected clip's properties, in the same bar the still surface uses.
 *
 * Timing stays READ-ONLY here on purpose: a clip's start and length are set by
 * dragging it and its handles on the timeline, which is both the faster gesture
 * and the one that snaps. Duplicating that as numeric fields would give two
 * places to do the same edit, only one of which respects the snapping.
 */
export function ClipBar({
  clip,
  project,
  time,
  onOpenEffects,
}: {
  clip: VisualTrackClip | AudioTrackClip;
  project: VideoProject;
  time: number;
  onOpenEffects(): void;
}) {
  const apply = useVideo((s) => s.apply);
  const select = useVideo((s) => s.select);
  const visual = 'type' in clip;
  const end = clip.start + clip.duration;
  // `splitAt` walks visual tracks only, so offering it on audio would be a
  // button that quietly does nothing.
  const canSplit = visual && time > clip.start + 0.1 && time < end - 0.1;
  const patch = (p: Partial<VisualTrackClip>) => apply((proj) => patchClip(proj, clip.id, p));
  const drop = () => {
    select(null);
  };

  return (
    <PropertyBar label="Clip properties">
      <BarMenu label="Timing" icon="duration" value={`${clip.duration.toFixed(2)}s`}>
        <div className={styles.group}>
          <p className={styles.groupTitle}>Timing</p>
          {/* Read-only rows, not menu items — see `.readout`. Timing is set by
              dragging on the timeline, which is the gesture that snaps. */}
          <div>
            <Readout label="Start" value={`${clip.start.toFixed(2)}s`} />
            <Readout label="End" value={`${end.toFixed(2)}s`} />
            <Readout label="Source in" value={`${(clip.trimIn ?? 0).toFixed(2)}s`} />
          </div>
          <p className={styles.empty}>
            Drag the clip and its ends on the timeline to change these — that is the gesture
            that snaps.
          </p>
        </div>
      </BarMenu>

      {visual && (
        <>
          <BarMenu label="Speed" icon="play" value={`${clip.speed ?? 1}×`}>
            <div className={styles.menu}>
              {SPEEDS.map((s) => (
                <MenuItem
                  key={s}
                  on={(clip.speed ?? 1) === s}
                  onClick={() => patch({ speed: s === 1 ? undefined : s })}
                >
                  {s}×
                </MenuItem>
              ))}
            </div>
          </BarMenu>

          <BarButton icon="effects" label="Grade and effects" text="Effects" onClick={onOpenEffects} />

          <BarMenu label="Opacity and blending" text="Opacity" icon="opacity">
            <div className={styles.group}>
              <SliderRow
                label="Opacity"
                value={clip.opacity ?? 1}
                min={0.05}
                max={1}
                step={0.05}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(opacity) => patch({ opacity })}
              />
              <p className={styles.groupTitle}>Blend</p>
              <div className={styles.menu}>
                {BLENDS.map((b) => (
                  <MenuItem
                    key={b}
                    on={(clip.blend ?? 'normal') === b}
                    onClick={() => patch({ blend: b === 'normal' ? undefined : b })}
                  >
                    {b}
                  </MenuItem>
                ))}
              </div>
            </div>
          </BarMenu>

          <BarMenu label="Placement" text="Placement" icon="panel">
            <PlacementMenu clip={clip} />
          </BarMenu>

          <BarMenu label="Rotate and crop" text="Transform" icon="rotate">
            <TransformMenu clip={clip} />
          </BarMenu>

          <AnimationMenu element={clip} blended={!!clip.blend && clip.blend !== 'normal'} />
        </>
      )}

      {visual && clip.type === 'video' && (
        <BarMenu label="Sound" text="Sound" icon={clip.muted ? 'mute' : 'sound'}>
          <div className={styles.group}>
            <LevelAndFades clip={clip} />
            <div className={styles.menu}>
              {/* Mute is a FLAG, never `volume: 0`. Writing the level to zero
                  loses whatever the clip was set to, so unmuting cannot put it
                  back and silently returns it to 100%. */}
              <MenuItem
                on={clip.muted}
                onClick={() => patch({ muted: clip.muted ? undefined : true })}
              >
                Mute
              </MenuItem>
            </div>
            {(project.tracks ?? []).filter((t) => t.kind === 'visual').length > 1 && (
              <p className={styles.empty}>
                Only the base track&rsquo;s own audio reaches the export; overlay clips are
                composited silently.
              </p>
            )}
          </div>
        </BarMenu>
      )}

      {!visual && (
        <BarMenu label="Level and fades" icon="sound" value={`${Math.round((clip.volume ?? 1) * 100)}%`}>
          <div className={styles.group}>
            <LevelAndFades clip={clip} />
          </div>
        </BarMenu>
      )}

      <Sep />

      {canSplit && (
        <BarButton icon="split" label="Split at playhead" onClick={() => apply((p) => splitAt(p, clip.id, time))} />
      )}
      <BarButton
        icon="duplicate"
        label="Duplicate"
        onClick={() => apply((p) => duplicateClip(p, clip.id))}
      />
      <BarButton
        icon="trash"
        label="Delete"
        danger
        onClick={() => {
          apply((p) => removeClip(p, clip.id));
          drop();
        }}
      />
      <BarMenu label="More" text="More" icon="more">
        {(close) => (
          <div className={styles.menu}>
            {/* Ripple delete closes the hole and shifts everything after it on
                THIS track only. It is separated from plain delete because it
                moves clips the user did not select. */}
            <MenuItem
              onClick={() => {
                apply((p) => rippleDeleteClip(p, clip.id));
                drop();
                close();
              }}
            >
              Ripple delete
            </MenuItem>
          </div>
        )}
      </BarMenu>
    </PropertyBar>
  );
}

/* ------------------------------------------------------------- animation --- */

/**
 * How an element enters and leaves.
 *
 * **There is no scale option, and that is deliberate.** ffmpeg cannot animate
 * scale per frame, so a "pop" entrance would play here and be absent from the
 * exported file. This editor already refuses transitions it cannot reproduce
 * rather than shipping them as approximations; an option that lies is worse
 * than one that is missing.
 *
 * **Slide is refused on a blended element**, with the reason shown rather than
 * a control that silently does nothing. The export composites a blended clip at
 * a fixed origin — its blend crops the base region under a box whose size
 * cannot vary per frame — so nothing could move it, and a preview that slid it
 * anyway would look better than the file.
 */
const SLIDE_EDGES: { edge: SlideEdge; label: string }[] = [
  { edge: 'left', label: 'From the left' },
  { edge: 'right', label: 'From the right' },
  { edge: 'up', label: 'From above' },
  { edge: 'down', label: 'From below' },
];

/** The edge names read as a source on the way in and a destination on the way out. */
const OUT_LABEL: Record<SlideEdge, string> = {
  left: 'Out to the left',
  right: 'Out to the right',
  up: 'Out upwards',
  down: 'Out downwards',
};

const animKey = (a: ElementAnim | undefined) =>
  !a || a.type === 'none' ? 'none' : a.type === 'fade' ? 'fade' : `slide-${a.edge ?? 'left'}`;

export function AnimationMenu({
  element,
  blended,
}: {
  element: { id: string; animateIn?: ElementAnim; animateOut?: ElementAnim; animation?: 'none' | 'fade' };
  /** Blended clips cannot slide — see the note above. */
  blended?: boolean;
}) {
  const apply = useVideo((s) => s.apply);
  // `resolveAnim` folds the legacy `animation: 'fade'` field in, so a document
  // written before the pair existed reads back as the fade it renders.
  const pair = resolveAnim(element);
  const duration = pair.in?.duration ?? pair.out?.duration ?? 0.5;
  const on = !!pair.in || !!pair.out;

  const write = (next: { in?: ElementAnim; out?: ElementAnim }) =>
    apply((p) =>
      setElementAnim(
        p,
        element.id,
        'in' in next ? next.in : pair.in,
        'out' in next ? next.out : pair.out,
      ),
    );

  const side = (which: 'in' | 'out') => {
    const current = which === 'in' ? pair.in : pair.out;
    const put = (a: ElementAnim | undefined) => write(which === 'in' ? { in: a } : { out: a });
    return (
      <div className={styles.group}>
        <p className={styles.groupTitle}>{which === 'in' ? 'Entrance' : 'Exit'}</p>
        <div className={styles.menu}>
          <MenuItem on={animKey(current) === 'none'} onClick={() => put(undefined)}>
            None
          </MenuItem>
          <MenuItem
            on={animKey(current) === 'fade'}
            onClick={() => put({ type: 'fade', duration })}
          >
            Fade
          </MenuItem>
          {!blended &&
            SLIDE_EDGES.map(({ edge, label }) => (
              <MenuItem
                key={edge}
                on={animKey(current) === `slide-${edge}`}
                onClick={() => put({ type: 'slide', duration, edge })}
              >
                {which === 'in' ? label : OUT_LABEL[edge]}
              </MenuItem>
            ))}
        </div>
      </div>
    );
  };

  return (
    <BarMenu label="Entrance and exit" text="Animate" icon="transition" wide>
      <div className={styles.group}>
        {side('in')}
        {side('out')}
        {on && (
          <SliderRow
            label="Length"
            value={duration}
            min={0.1}
            max={2}
            step={0.05}
            format={(v) => `${v.toFixed(2)}s`}
            onChange={(d) =>
              write({
                in: pair.in ? { ...pair.in, duration: d } : undefined,
                out: pair.out ? { ...pair.out, duration: d } : undefined,
              })
            }
          />
        )}
        {blended && (
          <p className={styles.empty}>
            A blended element cannot slide: the export composites it at a fixed origin, so a
            slide would play here and not in the file. Fade works.
          </p>
        )}
        {on && (
          <p className={styles.empty}>
            Both ends share one length, and each is clamped to half the element&rsquo;s own
            window so an entrance and an exit cannot overlap.
          </p>
        )}
      </div>
    </BarMenu>
  );
}

/** A value the user can read here but only change on the timeline. */
function Readout({ label, value }: { label: string; value: string }) {
  return (
    <p className={styles.readout}>
      <span>{label}</span>
      <span className={`${styles.readoutValue} w-data`}>{value}</span>
    </p>
  );
}

/* ----------------------------------------------------------------- audio --- */

/**
 * A clip's level, and its fades, written through ONE function.
 *
 * The rule that makes this necessary: **a `volumeCurve` overrides `volume`**
 * rather than scaling it — every renderer reads the curve INSTEAD of the number
 * when one is present. So a volume control that writes `volume` alone moves
 * something nothing reads the moment the clip carries a fade: the slider says
 * 200%, the export comes back at the plateau, and nothing anywhere explains it.
 * `withVolume` is the single writer, and it moves a recognised fade's plateau,
 * SCALES a hand-drawn curve (flattening someone's envelope to obey a slider
 * would destroy work in order to honour it), and drops a curve that is silent
 * throughout.
 *
 * The ceiling is `MAX_VOLUME`, shared with the export and with mobile. It is
 * above 1 deliberately: quiet source material needs real gain, ffmpeg's
 * `volume` multiplies and lets the result hard-clip, and that is the honest
 * behaviour of a gain control.
 */
function LevelAndFades({ clip }: { clip: VisualTrackClip | AudioTrackClip }) {
  const apply = useVideo((s) => s.apply);
  const fades = fadesOf(clip);
  const cap = maxFadeFor(clip.duration);
  const write = (patch: { volume: number; volumeCurve?: VolumePoint[] }) =>
    apply((p) => patchClip(p, clip.id, patch as Partial<VisualTrackClip>));

  return (
    <>
      <SliderRow
        label="Volume"
        value={Math.min(MAX_VOLUME, fades?.volume ?? clip.volume ?? 1)}
        min={0}
        max={MAX_VOLUME}
        step={0.05}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(volume) => write(withVolume(clip, volume))}
      />
      {fades ? (
        <>
          <SliderRow
            label="Fade in"
            value={Math.min(cap, fades.fadeIn)}
            min={0}
            max={cap}
            step={0.05}
            format={(v) => (v > 0 ? `${v.toFixed(2)}s` : 'None')}
            onChange={(fadeIn) => write(withFades(clip.duration, { ...fades, fadeIn }))}
          />
          <SliderRow
            label="Fade out"
            value={Math.min(cap, fades.fadeOut)}
            min={0}
            max={cap}
            step={0.05}
            format={(v) => (v > 0 ? `${v.toFixed(2)}s` : 'None')}
            onChange={(fadeOut) => write(withFades(clip.duration, { ...fades, fadeOut }))}
          />
          <p className={styles.empty}>
            Each fade can run to half the clip, so the two can never cross. Above 100% the
            gain multiplies and loud material will clip — it is a tool for quiet audio.
          </p>
        </>
      ) : (
        /*
         * A curve this UI did not author. Saying so beats offering fade sliders
         * that would silently replace someone's duck or ramp with a plateau.
         */
        <p className={styles.empty}>
          This clip carries a custom volume curve, so the fade controls are hidden rather
          than offered — using them would replace the shape you drew. Volume still works: it
          scales the whole curve and keeps its shape.
        </p>
      )}
    </>
  );
}

/* ------------------------------------------------------------- transform --- */

const FULL_CROP = { x: 0, y: 0, w: 1, h: 1 };

/**
 * Rotation and crop.
 *
 * The pipeline is decode → **crop** → grade → cover-fit into `rect` → effects →
 * **rotate** → composite, and both ends of that are exposed here.
 *
 * **Rotation turns about the centre of the clip's own box**, clockwise, and the
 * box GROWS to hold the turned picture rather than the corners being shaved —
 * so a rotated full-frame clip shows the backdrop in the corners, which is what
 * the export does too.
 *
 * **Crop is expressed against the SOURCE, not the frame.** It has to be: the
 * export's arg builder never probes the media, so a crop in destination pixels
 * could not be resolved without a decode the renderer does not do. The edges
 * here are therefore "how much of the original picture to cut away", and the
 * clip re-fills its box afterwards — cropping never leaves a gap.
 */
function TransformMenu({ clip }: { clip: VisualTrackClip }) {
  const apply = useVideo((s) => s.apply);
  const rotation = clip.rotation ?? 0;
  const crop = clip.crop ?? FULL_CROP;
  const set = (patch: Parameters<typeof setClipTransform>[2]) =>
    apply((p) => setClipTransform(p, clip.id, patch));

  // Each edge is an inset. Right and bottom are derived, because `SourceRect`
  // stores an origin and a size and the user is thinking in edges.
  const edge = (
    label: string,
    value: number,
    max: number,
    write: (v: number) => Parameters<typeof setClipTransform>[2],
  ) => (
    <SliderRow
      label={label}
      value={value}
      min={0}
      max={max}
      step={0.005}
      format={(v) => `${Math.round(v * 100)}%`}
      onChange={(v) => set(write(v))}
    />
  );

  return (
    <div className={styles.group}>
      <p className={styles.groupTitle}>Rotate</p>
      {/* `normalizeRotation` wraps into (-180, 180], so the stored value is
          already in the slider's own range and needs no folding here. */}
      <SliderRow
        label="Angle"
        value={rotation}
        min={-180}
        max={180}
        step={1}
        format={(v) => `${Math.round(v)}°`}
        onChange={(deg) => set({ rotation: snapAngle(deg) })}
      />
      <div className={styles.menu}>
        <MenuItem onClick={() => set({ rotation: rotation + 90 })}>Turn 90° right</MenuItem>
        <MenuItem onClick={() => set({ rotation: rotation - 90 })}>Turn 90° left</MenuItem>
        {rotation !== 0 && <MenuItem onClick={() => set({ rotation: 0 })}>Straighten</MenuItem>}
      </div>

      <p className={styles.groupTitle}>Crop</p>
      {edge('From the left', crop.x, Math.max(0, crop.x + crop.w - 0.05), (x) => ({
        crop: { ...crop, x, w: crop.x + crop.w - x },
      }))}
      {edge('From the right', 1 - (crop.x + crop.w), Math.max(0, 1 - crop.x - 0.05), (v) => ({
        crop: { ...crop, w: 1 - v - crop.x },
      }))}
      {edge('From the top', crop.y, Math.max(0, crop.y + crop.h - 0.05), (y) => ({
        crop: { ...crop, y, h: crop.y + crop.h - y },
      }))}
      {edge('From the bottom', 1 - (crop.y + crop.h), Math.max(0, 1 - crop.y - 0.05), (v) => ({
        crop: { ...crop, h: 1 - v - crop.y },
      }))}
      {clip.crop && (
        <div className={styles.menu}>
          <MenuItem onClick={() => set({ crop: FULL_CROP })}>Use the whole picture</MenuItem>
        </div>
      )}
      <p className={styles.empty}>
        Crop cuts the source, then what is left re-fills the clip&rsquo;s box. The angle snaps
        to the nearest 15° as you pass it.
      </p>
    </div>
  );
}

function PlacementMenu({ clip }: { clip: VisualTrackClip }) {
  const apply = useVideo((s) => s.apply);
  const rect = clip.rect;

  if (!rect)
    return (
      <div className={styles.group}>
        <p className={styles.empty}>This clip fills the frame.</p>
        <div className={styles.menu}>
          <MenuItem
            onClick={() =>
              apply((p) => setClipRect(p, clip.id, { x: 0.08, y: 0.08, w: 0.4, h: 0.4 }))
            }
          >
            Make it a picture-in-picture
          </MenuItem>
        </div>
      </div>
    );

  return (
    <div className={styles.group}>
      <SliderRow
        label="Across"
        value={rect.x}
        min={0}
        max={Math.max(0, 1 - rect.w)}
        step={0.005}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(x) => apply((p) => setClipRect(p, clip.id, { ...rect, x }))}
      />
      <SliderRow
        label="Down"
        value={rect.y}
        min={0}
        max={Math.max(0, 1 - rect.h)}
        step={0.005}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(y) => apply((p) => setClipRect(p, clip.id, { ...rect, y }))}
      />
      <SliderRow
        label="Size"
        value={rect.w}
        min={0.05}
        max={1}
        step={0.01}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(w) =>
          apply((p) => {
            // Hold the aspect it already has, and keep it on screen.
            const ratio = rect.h / rect.w;
            const h = Math.min(1, w * ratio);
            return setClipRect(p, clip.id, {
              w,
              h,
              x: Math.min(rect.x, 1 - w),
              y: Math.min(rect.y, 1 - h),
            });
          })
        }
      />
      <div className={styles.menu}>
        {/* `setClipRect` clamps and cannot express "no rect", so clearing it
            goes through `patchClip` — a clip with no rect fills the frame. */}
        <MenuItem onClick={() => apply((p) => patchClip(p, clip.id, { rect: undefined }))}>
          Fill the frame
        </MenuItem>
      </div>
    </div>
  );
}

/**
 * Where a caption breaks its lines.
 *
 * `maxWidth` is stored in output pixels, because that is what `fontSize` and
 * `letterSpacing` are and what the measurement is done in — but nobody thinks
 * about a caption in pixels of a 3840-wide master, so it is shown and driven as
 * a share of the frame.
 *
 * Off DELETES the field rather than storing the frame width. The two are not
 * the same: a stored width is a promise that the caption breaks there forever,
 * so a project later re-rendered at another size would reflow, and the SVG the
 * exporter emits stops being byte-identical to the one it emitted before this
 * control existed. Absent means absent.
 */
function WrapWidth({
  overlay,
  projectWidth,
  set,
}: {
  overlay: TextOverlay;
  projectWidth: number;
  set: (patch: Partial<TextOverlay>) => void;
}) {
  const on = (overlay.maxWidth ?? 0) > 0;
  return (
    <>
      <p className={styles.groupTitle}>Line breaks</p>
      <div className={styles.menu}>
        <MenuItem on={!on} onClick={() => set({ maxWidth: undefined })}>
          Only where I type a new line
        </MenuItem>
        <MenuItem on={on} onClick={() => set({ maxWidth: Math.round(projectWidth * 0.8) })}>
          Wrap to a width
        </MenuItem>
      </div>
      {on && (
        <SliderRow
          label="Wrap at"
          value={Math.min(1, overlay.maxWidth! / projectWidth)}
          min={0.1}
          max={1}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}% of the frame`}
          onChange={(v) => set({ maxWidth: Math.round(v * projectWidth) })}
        />
      )}
    </>
  );
}

/** A caption's properties. Every field maps to something `overlayToSVG` renders. */
export function OverlayBar({ overlay }: { overlay: TextOverlay }) {
  const apply = useVideo((s) => s.apply);
  const select = useVideo((s) => s.select);
  const projectWidth = useVideo((s) => s.project?.width ?? 1920);
  const set = (patch: Partial<TextOverlay>) => apply((p) => updateOverlay(p, overlay.id, patch));

  return (
    <PropertyBar label="Text properties">
      <BarMenu label="Words" icon="text" value={overlay.text.slice(0, 14) || 'Text'} wide>
        <div className={styles.group}>
          <p className={styles.groupTitle}>Words</p>
          <textarea
            className={styles.textArea}
            value={overlay.text}
            aria-label="Text"
            onChange={(e) => set({ text: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <WrapWidth overlay={overlay} projectWidth={projectWidth} set={set} />
        </div>
      </BarMenu>

      <NumField
        label="Font size"
        value={overlay.fontSize}
        min={8}
        max={400}
        onChange={(fontSize) => set({ fontSize })}
      />

      <ColourPicker value={overlay.color} label="Text colour" onChange={(color) => set({ color })} />

      <Sep />

      <Segmented
        label="Alignment"
        options={ALIGNS}
        value={overlay.align ?? 'center'}
        onChange={(align) => set({ align })}
      />

      {/* A caption is never blended, so slide is always available here. */}
      <AnimationMenu element={overlay} />

      <BarMenu label="Placement and timing" text="Placement" icon="sliders">
        <div className={styles.group}>
          <SliderRow
            label="Across"
            value={overlay.x}
            min={0}
            max={1}
            step={0.005}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(x) => set({ x })}
          />
          <SliderRow
            label="Down"
            value={overlay.y}
            min={0}
            max={1}
            step={0.005}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(y) => set({ y })}
          />
          <SliderRow
            label="Opacity"
            value={overlay.opacity ?? 1}
            min={0.05}
            max={1}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(opacity) => set({ opacity })}
          />
          <p className={styles.empty}>
            On screen {overlay.start.toFixed(2)}s – {overlay.end.toFixed(2)}s. Drag its ends on
            the timeline to retime it.
          </p>
        </div>
      </BarMenu>

      <Sep />

      <BarButton
        icon="duplicate"
        label="Duplicate"
        onClick={() => apply((p) => duplicateOverlay(p, overlay.id))}
      />
      <BarButton
        icon="trash"
        label="Delete"
        danger
        onClick={() => {
          apply((p) => removeOverlay(p, overlay.id));
          select(null);
        }}
      />
      <BarMenu label="More" text="More" icon="more">
        {(close) => (
          <div className={styles.menu}>
            <MenuItem
              onClick={() => {
                apply((p) => rippleDeleteOverlay(p, overlay.id));
                select(null);
                close();
              }}
            >
              Ripple delete
            </MenuItem>
          </div>
        )}
      </BarMenu>
    </PropertyBar>
  );
}
