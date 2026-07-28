/**
 * A graduated rule — the bench the stations sit on.
 *
 * Not a bare hairline used as ornament: it carries real graduations with round
 * caps, in the same measuring language as the Plate's limb.
 *
 * Deliberately NO viewBox. With one, `preserveAspectRatio="none"` would stretch
 * the tick spacing with the viewport, so the graduations would mean different
 * things at different widths. Without it, user units are CSS pixels and the
 * pattern repeats every 14px at any size — which is what a real scale does.
 */
export function GraduatedRule({ className }: { className?: string }) {
  return (
    <svg className={className} width="100%" height="12" aria-hidden="true" focusable="false">
      <defs>
        <pattern id="orbit-grad" width="14" height="12" patternUnits="userSpaceOnUse">
          <line
            x1="0.5"
            y1="4.5"
            x2="0.5"
            y2="10.5"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
          />
        </pattern>
      </defs>
      <line
        x1="0"
        y1="1.5"
        x2="100%"
        y2="1.5"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <rect x="0" y="0" width="100%" height="12" fill="url(#orbit-grad)" opacity="0.6" />
    </svg>
  );
}
