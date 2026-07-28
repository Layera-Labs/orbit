'use client';

import type {
  AudioTrackClip,
  BlendMode,
  VideoProject,
  VisualTrackClip,
} from '@orbit/video/browser';
import { Icon } from '@/brand/Icon';
import {
  duplicateClip,
  patchClip,
  removeClip,
  rippleDeleteClip,
  setClipRect,
  splitAt,
  useVideo,
} from '@/store/videoStore';
import { Slider, useGradeIsApproximate } from '../panels/MotionPanels';
import panel from '../panels/Panels.module.css';

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

/**
 * The selected clip's precise controls.
 *
 * Deliberately NOT a second copy of the Effects panel. Effects is the browsable
 * gallery you pick a look from; this is where you read and set exact values —
 * timing, speed, layer, sound. Nothing appears in both places doing the same
 * job, which is the whole reason the floating context toolbar was dropped.
 */
export function ClipInspector({
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
  const approximate = useGradeIsApproximate();
  const visual = 'type' in clip;
  const end = clip.start + clip.duration;
  // `splitAt` walks visual tracks only, so offering it on audio would be a
  // button that quietly does nothing.
  const canSplit = visual && time > clip.start + 0.1 && time < end - 0.1;

  const patch = (p: Partial<VisualTrackClip>) =>
    apply((proj) => patchClip(proj, clip.id, p));

  return (
    <div className={panel.stack}>
      <div className={panel.group}>
        <h3 className={panel.groupTitle}>Timing</h3>
        <div className={panel.pair}>
          <Readout label="Start" value={`${clip.start.toFixed(2)}s`} />
          <Readout label="End" value={`${end.toFixed(2)}s`} />
        </div>
        <div className={panel.pair}>
          <Readout label="Length" value={`${clip.duration.toFixed(2)}s`} />
          <Readout label="Source in" value={`${(clip.trimIn ?? 0).toFixed(2)}s`} />
        </div>
      </div>

      {visual && (
        <>
          <div className={panel.group}>
            <h3 className={panel.groupTitle}>Speed</h3>
            <div className={panel.presets}>
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  className={panel.preset}
                  data-on={(clip.speed ?? 1) === s}
                  onClick={() => patch({ speed: s === 1 ? undefined : s })}
                >
                  {s}×
                </button>
              ))}
            </div>
            <p className={panel.note}>
              Constant per clip. Speed ramps are not offered because ffmpeg cannot ramp
              audio tempo smoothly, so the export could not match what you saw.
            </p>
          </div>

          <div className={panel.group}>
            <h3 className={panel.groupTitle}>Layer</h3>
            <Slider
              label="Opacity"
              value={clip.opacity ?? 1}
              min={0.05}
              max={1}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => patch({ opacity: v })}
            />
            <select
              className={panel.select}
              value={clip.blend ?? 'normal'}
              onChange={(e) =>
                patch({
                  blend: e.target.value === 'normal' ? undefined : (e.target.value as BlendMode),
                })
              }
              aria-label="Blend mode"
            >
              {BLENDS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div className={panel.group}>
            <h3 className={panel.groupTitle}>Look</h3>
            <div className={panel.fieldRow}>
              <span className={panel.fieldLabel}>Grade</span>
              <span className={`${panel.fieldValue} w-data`}>
                {clip.filter?.preset ?? 'none'}
              </span>
            </div>
            <button className={panel.action} onClick={onOpenEffects}>
              <Icon name="effects" size={14} />
              Open effects
            </button>
            {approximate && (
              <p className={panel.note}>
                This browser can&rsquo;t run the exact grade, so it previews approximately.
              </p>
            )}
          </div>

          {clip.type === 'video' && (
            <div className={panel.group}>
              <h3 className={panel.groupTitle}>Sound</h3>
              <Slider
                label="Volume"
                value={clip.volume ?? 1}
                min={0}
                max={1}
                step={0.05}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => patch({ volume: v })}
              />
              <button
                className={panel.action}
                data-on={clip.muted}
                onClick={() => patch({ muted: clip.muted ? undefined : true })}
              >
                <Icon name={clip.muted ? 'mute' : 'sound'} size={14} />
                {clip.muted ? 'Unmute' : 'Mute'}
              </button>
              {(project.tracks ?? []).filter((t) => t.kind === 'visual').length > 1 && (
                <p className={panel.note}>
                  Only the base track&rsquo;s own audio reaches the export; overlay clips are
                  composited silently.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {visual && (
        <div className={panel.group}>
          <h3 className={panel.groupTitle}>Placement</h3>
          {/* A clip with no rect fills the frame. Giving it one is what makes a
              picture-in-picture, a corner logo or a sticker — and because the
              rect is normalized, `frameStateAt` and the ffmpeg overlay filter
              read the very same numbers. */}
          {clip.rect ? (
            <>
              <Slider
                label="Across"
                value={clip.rect.x}
                min={0}
                max={1 - clip.rect.w}
                step={0.005}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(x) => apply((p) => setClipRect(p, clip.id, { ...clip.rect!, x }))}
              />
              <Slider
                label="Down"
                value={clip.rect.y}
                min={0}
                max={1 - clip.rect.h}
                step={0.005}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(y) => apply((p) => setClipRect(p, clip.id, { ...clip.rect!, y }))}
              />
              <Slider
                label="Size"
                value={clip.rect.w}
                min={0.05}
                max={1}
                step={0.01}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(w) =>
                  apply((p) => {
                    // Keep the aspect the clip already has, and keep it on screen.
                    const ratio = clip.rect!.h / clip.rect!.w;
                    const h = Math.min(1, w * ratio);
                    return setClipRect(p, clip.id, {
                      x: Math.min(clip.rect!.x, 1 - w),
                      y: Math.min(clip.rect!.y, 1 - h),
                      w,
                      h,
                    });
                  })
                }
              />
              <button
                className={panel.action}
                onClick={() => apply((p) => patchClip(p, clip.id, { rect: undefined }))}
              >
                Fill the frame
              </button>
            </>
          ) : (
            <button
              className={panel.action}
              onClick={() =>
                apply((p) =>
                  setClipRect(p, clip.id, { x: 0.06, y: 0.06, w: 0.34, h: 0.34 * (16 / 9) }),
                )
              }
            >
              <Icon name="duplicate" size={14} />
              Make it a picture-in-picture
            </button>
          )}
        </div>
      )}

      <div className={panel.group}>
        <h3 className={panel.groupTitle}>Clip</h3>
        {visual && (
          <button
            className={panel.action}
            disabled={!canSplit}
            onClick={() => apply((p) => splitAt(p, clip.id, time))}
            title={canSplit ? undefined : 'Move the playhead inside this clip to split it'}
          >
            <Icon name="split" size={14} />
            Split at playhead
          </button>
        )}
        <button
          className={panel.action}
          onClick={() => apply((p) => duplicateClip(p, clip.id))}
        >
          <Icon name="duplicate" size={14} />
          Duplicate
        </button>
        <button
          className={`${panel.action} ${panel.danger}`}
          onClick={() => {
            apply((p) => removeClip(p, clip.id));
            select(null);
          }}
        >
          <Icon name="trash" size={14} />
          Delete
        </button>
        {/*
          Two deletes, because they are genuinely different edits. Plain delete
          leaves the hole — right when other tracks are timed against what
          follows. Ripple delete closes it, and ONLY on this clip's own track, so
          captions and music stay where they were put.
        */}
        <button
          className={`${panel.action} ${panel.danger}`}
          onClick={() => {
            apply((p) => rippleDeleteClip(p, clip.id));
            select(null);
          }}
          title="Delete and pull everything later on this track back by its length"
        >
          <Icon name="split" size={14} />
          Ripple delete
        </button>
      </div>
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className={panel.field}>
      <span className={panel.fieldLabel}>{label}</span>
      <span className={`${panel.fieldValue} w-data`}>{value}</span>
    </div>
  );
}
