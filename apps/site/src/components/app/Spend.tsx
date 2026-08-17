'use client';

/**
 * Credits spent per day.
 *
 * Hand-drawn SVG rather than a charting library: this is one series with no
 * zoom, no legend and no tooltip beyond a title, and pulling in a chart
 * runtime for it would cost more bytes on a portal page than the entire
 * screen.
 *
 * The care goes where it shows: an area fill under the line, a faint grid the
 * eye can measure against, and an emphasised endpoint — today is the value a
 * reader is actually looking for.
 *
 * Rendered server-safe (pure geometry, no measurement), so it has no layout
 * shift and nothing is gated on JavaScript beyond the data itself.
 */
import styles from './Spend.module.css';

const W = 720;
const H = 160;
const PAD = { top: 12, right: 8, bottom: 20, left: 8 };

export function Spend({
  days,
  loading,
}: {
  days: { day: string; credits: number }[];
  loading?: boolean;
}) {
  const max = Math.max(1, ...days.map((d) => d.credits));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const x = (i: number) =>
    PAD.left + (days.length <= 1 ? innerW / 2 : (i / (days.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;

  const line = days.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(d.credits).toFixed(1)}`).join(' ');
  const area = days.length
    ? `${line} L ${x(days.length - 1).toFixed(1)} ${PAD.top + innerH} L ${x(0).toFixed(1)} ${PAD.top + innerH} Z`
    : '';

  const last = days[days.length - 1];
  const empty = days.every((d) => d.credits === 0);

  return (
    <div className={styles.wrap}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={styles.svg}
        role="img"
        aria-label={
          empty
            ? 'No credits spent in this window.'
            : `Credits spent per day. Peak ${max}, most recent day ${last?.credits ?? 0}.`
        }
      >
        {/* Four gridlines, faint. Something to measure against, not a cage. */}
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(max * f)}
            y2={y(max * f)}
            className={styles.grid}
          />
        ))}

        {!empty && (
          <>
            <path d={area} className={styles.area} />
            <path d={line} className={styles.line} fill="none" />
            {/* The endpoint, emphasised: the house disc, where a value is read. */}
            <circle cx={x(days.length - 1)} cy={y(last?.credits ?? 0)} r={3.5} className={styles.tip} />
          </>
        )}

        {/* The scale, stated rather than left to an axis nobody reads. */}
        <text x={PAD.left} y={y(max) - 4} className={styles.tick}>
          {max.toLocaleString()}
        </text>
      </svg>

      {/*
        Under the chart, not inside it: dates in the SVG would either collide or
        need rotating, and three plain labels say the same thing.
      */}
      <div className={styles.axis} aria-hidden="true">
        <span>{label(days[0]?.day)}</span>
        <span>{label(days[Math.floor(days.length / 2)]?.day)}</span>
        <span>{label(last?.day)}</span>
      </div>

      {empty && !loading && (
        <p className={styles.none}>No credits spent in this window.</p>
      )}
    </div>
  );
}

function label(day?: string) {
  if (!day) return '';
  const d = new Date(`${day}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
