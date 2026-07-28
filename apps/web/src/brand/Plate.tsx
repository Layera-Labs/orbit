/**
 * The Plate — Orbit Web's signature artifact.
 *
 * An engraved measuring instrument: nested tilted ellipses, a graduated limb of
 * tick marks, a hairline crosshair, and one solid disc riding the outer path
 * past a fixed index mark. It is drawn, not decorated — every tick is computed
 * on the ellipse normal rather than eyeballed, and there is no glow, no gradient
 * and no container behind it.
 *
 * Deliberately NOT the mobile app's OrbitMark (planet + ring + orbiting dot).
 * Same brand, different instrument.
 *
 * Motion: `running` rotates the graduated limb so its ticks pass the fixed index
 * mark — a reading being taken. It is off by default, the resting state is the
 * complete artwork, and nothing is ever hidden behind an animation, so a page
 * that never animates still renders the whole thing.
 */
import type { CSSProperties } from 'react';

export interface PlateProps {
  size?: number;
  /** 'full' draws the whole graduated limb; 'mark' is the nav-scale reduction. */
  detail?: 'full' | 'mark';
  /** Rotate the limb past the index mark, for work in progress. */
  running?: boolean;
  /** Tint the disc + index with the live colour (a job is running, a clip is selected). */
  live?: boolean;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

const C = 100; // centre of the 200×200 viewBox — everything is measured from here
const TILT = -21; // degrees; the tilt that makes it read as a plate seen at an angle

/**
 * Quantize to 3 decimals — finer than any display can resolve at these sizes.
 *
 * Not cosmetic. `Math.sin`/`Math.cos` are implementation-defined, and Node and
 * the browser disagree in the last bit at some angles (55.832704406993635 vs
 * 55.83270440699364). Emitted raw, those become server/client attribute
 * mismatches and React warns on every tick. Rounding makes the markup identical
 * on both sides — and a good deal smaller.
 */
const q = (n: number) => Math.round(n * 1000) / 1000;

/** A point on the ellipse at angle `a` (degrees). */
function onEllipse(a: number, rx: number, ry: number) {
  const t = (a * Math.PI) / 180;
  return { x: q(C + rx * Math.cos(t)), y: q(C + ry * Math.sin(t)) };
}

/**
 * A radial tick at angle `a`, drawn along the ellipse NORMAL rather than a plain
 * radius — on a non-circular ellipse those differ, and radial ticks visibly
 * splay at the flanks. This is the detail that makes it read as engraved.
 */
function tick(a: number, rx: number, ry: number, len: number) {
  const t = (a * Math.PI) / 180;
  const px = Math.cos(t) / rx;
  const py = Math.sin(t) / ry;
  const m = Math.hypot(px, py) || 1;
  const nx = px / m;
  const ny = py / m;
  const bx = C + rx * Math.cos(t);
  const by = C + ry * Math.sin(t);
  return { x1: q(bx), y1: q(by), x2: q(bx + nx * len), y2: q(by + ny * len) };
}

export function Plate({
  size = 200,
  detail = 'full',
  running = false,
  live = false,
  className,
  style,
  title,
}: PlateProps) {
  const RX = 86;
  const RY = 51;
  const full = detail === 'full';
  // 5° graduations at full detail; every 6th (30°) is a long mark.
  const step = full ? 5 : 15;
  const angles: number[] = [];
  for (let a = 0; a < 360; a += step) angles.push(a);

  const discAngle = -58;
  const disc = onEllipse(discAngle, RX, RY);
  const accent = live ? 'var(--w-live)' : 'currentColor';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      className={className}
      style={style}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      fill="none"
    >
      <g transform={`rotate(${TILT} ${C} ${C})`}>
        {/* Graduated limb. Rotating this group — and only this group — sweeps
            the ticks past the index mark that sits outside it. */}
        <g
          style={
            running
              ? { animation: 'plate-sweep 14s linear infinite', transformOrigin: '100px 100px' }
              : undefined
          }
        >
          <ellipse
            cx={C}
            cy={C}
            rx={RX}
            ry={RY}
            stroke="currentColor"
            strokeOpacity={0.42}
            strokeWidth={0.9}
          />
          {angles.map((a) => {
            const long = a % 30 === 0;
            const t = tick(a, RX, RY, long ? 7 : 3.5);
            return (
              <line
                key={a}
                x1={t.x1}
                y1={t.y1}
                x2={t.x2}
                y2={t.y2}
                stroke="currentColor"
                strokeOpacity={long ? 0.62 : 0.3}
                strokeWidth={long ? 1.1 : 0.75}
                strokeLinecap="round"
              />
            );
          })}
          {/* The disc rides the limb, so it travels with the graduations. */}
          <circle cx={disc.x} cy={disc.y} r={full ? 5 : 6.5} fill={accent} />
        </g>

        {/* Inner races. Two, not five — restraint is what keeps it an instrument
            rather than a mandala. */}
        <ellipse
          cx={C}
          cy={C}
          rx={q(RX * 0.66)}
          ry={q(RY * 0.66)}
          stroke="currentColor"
          strokeOpacity={0.24}
          strokeWidth={0.75}
        />
        {full && (
          <ellipse
            cx={C}
            cy={C}
            rx={q(RX * 0.34)}
            ry={q(RY * 0.34)}
            stroke="currentColor"
            strokeOpacity={0.16}
            strokeWidth={0.75}
          />
        )}

        {/* Crosshair: four short rules that stop well clear of the centre, the
            way a real reticle does. Not a full-width cross. */}
        {full && (
          <g stroke="currentColor" strokeOpacity={0.3} strokeWidth={0.75} strokeLinecap="round">
            <line x1={C - RX - 6} y1={C} x2={q(C - RX * 0.78)} y2={C} />
            <line x1={q(C + RX * 0.78)} y1={C} x2={C + RX + 6} y2={C} />
            <line x1={C} y1={C - RY - 6} x2={C} y2={q(C - RY * 0.78)} />
            <line x1={C} y1={q(C + RY * 0.78)} x2={C} y2={C + RY + 6} />
          </g>
        )}
      </g>

      {/* Index mark — the fixed reference the graduations are read against. It
          sits OUTSIDE the tilted group so it never moves. */}
      <g stroke={accent} strokeWidth={1.4} strokeLinecap="round" opacity={live ? 1 : 0.55}>
        <line x1={C} y1={8} x2={C} y2={20} />
      </g>

      {/* Centre. A small solid point, dead on 100,100 by construction. */}
      <circle cx={C} cy={C} r={1.6} fill="currentColor" fillOpacity={0.55} />
    </svg>
  );
}
