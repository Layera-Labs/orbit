'use client';

import type {
  AudioTrackClip,
  BlendMode,
  TextOverlay,
  VideoProject,
  VisualTrackClip,
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
          <div className={styles.menu}>
            <MenuItem onClick={() => undefined}>Start · {clip.start.toFixed(2)}s</MenuItem>
            <MenuItem onClick={() => undefined}>End · {end.toFixed(2)}s</MenuItem>
            <MenuItem onClick={() => undefined}>
              Source in · {(clip.trimIn ?? 0).toFixed(2)}s
            </MenuItem>
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
        </>
      )}

      {visual && clip.type === 'video' && (
        <BarMenu label="Sound" text="Sound" icon={clip.muted ? 'mute' : 'sound'}>
          <div className={styles.group}>
            <SliderRow
              label="Volume"
              value={clip.volume ?? 1}
              min={0}
              max={1}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(volume) => patch({ volume })}
            />
            <div className={styles.menu}>
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
        <BarMenu label="Volume" icon="sound" value={`${Math.round((clip.volume ?? 1) * 100)}%`}>
          <SliderRow
            label="Volume"
            value={clip.volume ?? 1}
            min={0}
            max={1}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(volume) => apply((p) => patchClip(p, clip.id, { volume }))}
          />
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

/** A caption's properties. Every field maps to something `overlayToSVG` renders. */
export function OverlayBar({ overlay }: { overlay: TextOverlay }) {
  const apply = useVideo((s) => s.apply);
  const select = useVideo((s) => s.select);
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
